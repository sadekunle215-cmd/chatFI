// pages/api/lock.js
// Jupiter Lock — pure @solana/web3.js + @solana/spl-token, no Anchor dependency
// Program: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
//
// FIX HISTORY:
//  v3 — correct account order (matches Rust CreateVestingEscrowCtx exactly),
//       added missing cancel_mode u8 (params 58 bytes not 57),
//       create escrow ATA as separate pre-instruction (matches Rust CLI pattern),
//       event_authority + LOCK_PROGRAM appended to BOTH create and claim keys.

import crypto from "crypto";

const WSOL_MINT_STR = "So11111111111111111111111111111111111111112";

// Anchor instruction discriminator: sha256("global:<name>")[0..8]
function disc(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

function writeU64LE(buf, value, offset) {
  const big = typeof value === "bigint" ? value : BigInt(value);
  buf.writeBigUInt64LE(big, offset);
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let web3, splToken;
  try {
    web3     = await import("@solana/web3.js");
    splToken = await import("@solana/spl-token");
  } catch (e) {
    return res.status(500).json({ error: `SDK missing: ${e.message}` });
  }

  const {
    Connection, PublicKey, SystemProgram, Transaction,
    TransactionInstruction, Keypair,
  } = web3;

  const {
    getAssociatedTokenAddress,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    createSyncNativeInstruction,
  } = splToken;

  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: "Missing action" });

  const SOLANA_RPC   = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  const LOCK_PROGRAM = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");

  // Anchor event authority PDA — required by ALL Jupiter Lock instructions.
  // Omitting causes Custom error: 101 (InstructionFallbackNotFound).
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    LOCK_PROGRAM
  );

  function deriveEscrow(base) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), base.toBuffer()],
      LOCK_PROGRAM
    );
  }

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");

    // -------------------------------------------------------------------------
    // CREATE
    // -------------------------------------------------------------------------
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });
      if (!mint)   return res.status(400).json({ error: "Missing: mint" });

      const funderKey    = new PublicKey(funder);
      const recipientKey = recipient && recipient.trim() ? new PublicKey(recipient.trim()) : funderKey;
      const mintKey      = new PublicKey(mint);
      const isWsol       = mint === WSOL_MINT_STR;

      const cliff   = Math.max(parseInt(cliffSecs)  || 0, 0);
      const vesting = Math.max(parseInt(vestingSecs) || 86400, 86400);
      const amtBig  = BigInt(amount);
      const now     = BigInt(Math.floor(Date.now() / 1000));

      // Single-period vesting: all tokens unlock at vestingStart + cliff + vesting
      const cliffTime  = now + BigInt(cliff);  // absolute timestamp
      const frequency  = BigInt(vesting);       // one period = full duration
      const perPeriod  = amtBig;                // all tokens in one period
      const numPeriods = 1n;

      const baseKeypair = Keypair.generate();
      const [escrowPDA] = deriveEscrow(baseKeypair.publicKey);

      const senderToken = await getAssociatedTokenAddress(mintKey, funderKey, false, TOKEN_PROGRAM_ID);
      const escrowToken = await getAssociatedTokenAddress(mintKey, escrowPDA,  true, TOKEN_PROGRAM_ID);

      // ── Encode instruction data ──────────────────────────────────────────────
      // Rust CreateVestingEscrowParameters fields (in order):
      //   vesting_start_time   : u64  — 8 bytes
      //   cliff_time           : u64  — 8 bytes  (absolute timestamp)
      //   frequency            : u64  — 8 bytes
      //   cliff_unlock_amount  : u64  — 8 bytes
      //   amount_per_period    : u64  — 8 bytes
      //   number_of_period     : u64  — 8 bytes
      //   update_recipient_mode: u8   — 1 byte
      //   cancel_mode          : u8   — 1 byte  ← WAS MISSING (caused error 101)
      // Total: 8 disc + 48 + 2 = 58 bytes
      const CREATE_DISC = disc("createVestingEscrow");
      const params = Buffer.alloc(58);
      let off = 0;
      CREATE_DISC.copy(params, off); off += 8;
      writeU64LE(params, now,        off); off += 8;
      writeU64LE(params, cliffTime,  off); off += 8;
      writeU64LE(params, frequency,  off); off += 8;
      writeU64LE(params, 0n,         off); off += 8; // cliff_unlock_amount = 0
      writeU64LE(params, perPeriod,  off); off += 8;
      writeU64LE(params, numPeriods, off); off += 8;
      params.writeUInt8(0, off); off += 1;            // update_recipient_mode = 0
      params.writeUInt8(0, off);                      // cancel_mode = 0

      // ── Account keys — matches Rust CreateVestingEscrowCtx exactly ───────────
      // Rust order: base, escrow, escrow_token, recipient, sender, sender_token,
      //             event_authority, program, token_program, system_program
      //
      // Previous version had: wrong position for recipient/sender, and incorrectly
      // included mint, RENT, ASSOCIATED_TOKEN_PROGRAM_ID which are NOT in the ctx.
      const lockKeys = [
        { pubkey: baseKeypair.publicKey,   isSigner: true,  isWritable: false }, // base
        { pubkey: escrowPDA,               isSigner: false, isWritable: true  }, // escrow
        { pubkey: escrowToken,             isSigner: false, isWritable: true  }, // escrow_token
        { pubkey: recipientKey,            isSigner: false, isWritable: false }, // recipient
        { pubkey: funderKey,               isSigner: true,  isWritable: true  }, // sender
        { pubkey: senderToken,             isSigner: false, isWritable: true  }, // sender_token
        { pubkey: eventAuthority,          isSigner: false, isWritable: false }, // event_authority
        { pubkey: LOCK_PROGRAM,            isSigner: false, isWritable: false }, // program
        { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false }, // token_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ];

      const lockIx = new TransactionInstruction({
        programId: LOCK_PROGRAM,
        keys:      lockKeys,
        data:      params,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer        = funderKey;

      // Pre-create the escrow token ATA (separate ix, matches Rust CLI pattern)
      tx.add(createAssociatedTokenAccountInstruction(
        funderKey, escrowToken, escrowPDA, mintKey,
        TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ));

      // For wSOL: wrap native SOL into sender's wSOL ATA first
      if (isWsol) {
        tx.add(createAssociatedTokenAccountInstruction(
          funderKey, senderToken, funderKey, mintKey,
          TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        ));
        tx.add(SystemProgram.transfer({
          fromPubkey: funderKey,
          toPubkey:   senderToken,
          lamports:   Number(amtBig),
        }));
        tx.add(createSyncNativeInstruction(senderToken, TOKEN_PROGRAM_ID));
      }

      tx.add(lockIx);
      tx.partialSign(baseKeypair); // base keypair must co-sign

      const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");

      return res.status(200).json({
        transaction: serialized,
        escrow:      escrowPDA.toBase58(),
        baseKey:     baseKeypair.publicKey.toBase58(),
        blockhash,
        lastValidBlockHeight,
        cliffDays:   cliff   / 86400,
        vestingDays: vesting / 86400,
        mint,
        amount,
        recipient:   recipientKey.toBase58(),
        wrappedSol:  isWsol,
      });
    }

    // -------------------------------------------------------------------------
    // CLAIM
    // -------------------------------------------------------------------------
    if (action === "claim") {
      const { escrow, recipient } = req.body;
      if (!escrow)    return res.status(400).json({ error: "Missing: escrow" });
      if (!recipient) return res.status(400).json({ error: "Missing: recipient" });

      const recipientKey = new PublicKey(recipient);
      const escrowKey    = new PublicKey(escrow);

      const acctInfo = await connection.getAccountInfo(escrowKey);
      if (!acctInfo) return res.status(400).json({ error: "Escrow account not found" });

      // mint at offset 40: 8 disc + 32 base = 40
      const mintKey = new PublicKey(acctInfo.data.slice(40, 72));

      const escrowATA    = await getAssociatedTokenAddress(mintKey, escrowKey,    true,  TOKEN_PROGRAM_ID);
      const recipientATA = await getAssociatedTokenAddress(mintKey, recipientKey, false, TOKEN_PROGRAM_ID);

      const CLAIM_DISC = disc("claim");
      const maxAmt = Buffer.alloc(8);
      maxAmt.writeBigUInt64LE(BigInt("18446744073709551615"), 0); // u64::MAX = claim all
      const data = Buffer.concat([CLAIM_DISC, maxAmt]);

      const claimKeys = [
        { pubkey: escrowKey,               isSigner: false, isWritable: true  },
        { pubkey: escrowATA,               isSigner: false, isWritable: true  },
        { pubkey: recipientKey,            isSigner: true,  isWritable: false },
        { pubkey: recipientATA,            isSigner: false, isWritable: true  },
        { pubkey: mintKey,                 isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: eventAuthority,          isSigner: false, isWritable: false }, // required
        { pubkey: LOCK_PROGRAM,            isSigner: false, isWritable: false }, // required
      ];

      const claimIx = new TransactionInstruction({ programId: LOCK_PROGRAM, keys: claimKeys, data });

      // Create recipient ATA if it doesn't exist (no-op on-chain if already exists)
      const createAta = createAssociatedTokenAccountInstruction(
        recipientKey, recipientATA, recipientKey, mintKey,
        TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.add(createAta);
      tx.add(claimIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = recipientKey;

      const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
      return res.status(200).json({ transaction: serialized, blockhash, lastValidBlockHeight });
    }

    // -------------------------------------------------------------------------
    // ACCOUNTS — fetch + decode on-chain escrows for a wallet
    // -------------------------------------------------------------------------
    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      const walletPk = new PublicKey(wallet);
      const now      = Math.floor(Date.now() / 1000);

      // VestingEscrow on-chain size: 200 bytes. sender @ 72, recipient @ 104.
      const [asSender, asRecipient] = await Promise.all([
        connection.getProgramAccounts(LOCK_PROGRAM, {
          filters: [{ dataSize: 200 }, { memcmp: { offset: 72,  bytes: walletPk.toBase58() } }],
        }).catch(() => []),
        connection.getProgramAccounts(LOCK_PROGRAM, {
          filters: [{ dataSize: 200 }, { memcmp: { offset: 104, bytes: walletPk.toBase58() } }],
        }).catch(() => []),
      ]);

      const seen     = new Set();
      const accounts = [];

      for (const item of [...asSender, ...asRecipient]) {
        const key = item.pubkey.toBase58();
        if (seen.has(key)) continue;
        seen.add(key);

        const buf = Buffer.from(item.account.data);
        let o = 8;
        const base      = new PublicKey(buf.slice(o, o += 32)).toBase58();
        const mint      = new PublicKey(buf.slice(o, o += 32)).toBase58();
        const sender    = new PublicKey(buf.slice(o, o += 32)).toBase58();
        const recipient = new PublicKey(buf.slice(o, o += 32)).toBase58();

        const startTime       = Number(buf.readBigUInt64LE(o)); o += 8;
        const frequency       = Number(buf.readBigUInt64LE(o)); o += 8;
        const cliffUnlockAmt  = Number(buf.readBigUInt64LE(o)); o += 8;
        const amountPerPeriod = Number(buf.readBigUInt64LE(o)); o += 8;
        const numberOfPeriod  = Number(buf.readBigUInt64LE(o)); o += 8;
        const totalClaimed    = Number(buf.readBigUInt64LE(o)); o += 8;
        const cliffTime       = Number(buf.readBigUInt64LE(o));

        const cliffEnd       = startTime + cliffTime;
        const elapsed        = Math.max(now - cliffEnd, 0);
        const periodsElapsed = frequency > 0 ? Math.floor(elapsed / frequency) : 0;
        const totalVested    = Math.min(
          cliffUnlockAmt + amountPerPeriod * periodsElapsed,
          cliffUnlockAmt + amountPerPeriod * numberOfPeriod
        );
        const claimableRaw = Math.max(totalVested - totalClaimed, 0);
        const totalRaw     = cliffUnlockAmt + amountPerPeriod * numberOfPeriod;

        accounts.push({
          pubkey: key,
          mint, sender, recipient,
          cliffEnd, startTime,
          totalRaw,
          totalClaimed,
          claimableRaw,
          claimable:     claimableRaw > 0 && now >= cliffEnd,
          vestedPercent: totalRaw > 0 ? ((totalVested / totalRaw) * 100).toFixed(1) : "0",
        });
      }

      return res.status(200).json({ accounts });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error("[api/lock]", err);
    return res.status(500).json({ error: err?.message || "Lock API error" });
  }
}
