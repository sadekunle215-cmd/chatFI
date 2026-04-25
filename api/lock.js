// pages/api/lock.js
// Jupiter Lock - NO @coral-xyz/anchor dependency
// Pure @solana/web3.js + @solana/spl-token + Node.js crypto
// Program: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn

import crypto from "crypto";

const WSOL_MINT_STR = "So11111111111111111111111111111111111111112";

// Anchor instruction discriminator: sha256("global:<name>")[0..8]
function disc(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

// Write a u64 as 8-byte little-endian into a Buffer
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
    Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY,
    Transaction, TransactionInstruction, Keypair,
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

  function deriveEscrow(base) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), base.toBuffer()],
      LOCK_PROGRAM
    );
  }

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");

    // -----------------------------------------------------------------------
    // CREATE
    // -----------------------------------------------------------------------
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
      const vesting = Math.max(parseInt(vestingSecs) || 86400, 1);
      const periods = Math.max(Math.floor(vesting / 86400), 1);
      const amtBig     = BigInt(amount);
      const perPeriod  = amtBig / BigInt(periods);
      const remainder  = amtBig - (perPeriod * BigInt(periods));
      const now        = BigInt(Math.floor(Date.now() / 1000));

      const baseKeypair = Keypair.generate();
      const [escrowPDA] = deriveEscrow(baseKeypair.publicKey);

      const senderToken = await getAssociatedTokenAddress(mintKey, funderKey, false, TOKEN_PROGRAM_ID);
      const escrowToken = await getAssociatedTokenAddress(mintKey, escrowPDA,  true, TOKEN_PROGRAM_ID);

      // Encode instruction: 8 disc + 6*u64 + u8 = 57 bytes
      const CREATE_DISC = disc("createVestingEscrow");
      const params = Buffer.alloc(57);
      let off = 0;
      CREATE_DISC.copy(params, off); off += 8;
      writeU64LE(params, now,                      off); off += 8; // vestingStartTime
      writeU64LE(params, now + BigInt(cliff),      off); off += 8; // cliffTime (absolute timestamp)
      writeU64LE(params, BigInt(86400),            off); off += 8; // frequency
      writeU64LE(params, 0n,                       off); off += 8; // cliffUnlockAmount = 0 (pure time-lock)
      writeU64LE(params, amtBig / BigInt(periods), off); off += 8; // amountPerPeriod
      writeU64LE(params, BigInt(periods),          off); off += 8; // numberOfPeriod
      params.writeUInt8(0, off);                          // updateRecipientMode

      const lockKeys = [
        { pubkey: baseKeypair.publicKey,    isSigner: true,  isWritable: false },
        { pubkey: escrowPDA,                isSigner: false, isWritable: true  },
        { pubkey: escrowToken,              isSigner: false, isWritable: true  },
        { pubkey: funderKey,                isSigner: true,  isWritable: true  },
        { pubkey: senderToken,              isSigner: false, isWritable: true  },
        { pubkey: recipientKey,             isSigner: false, isWritable: false },
        { pubkey: mintKey,                  isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,         isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY,       isSigner: false, isWritable: false },
      ];

      const lockIx = new TransactionInstruction({ programId: LOCK_PROGRAM, keys: lockKeys, data: params });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer        = funderKey;

      // For native SOL: wrap into wSOL ATA before locking
      if (isWsol) {
        const wsolAtaInfo = await connection.getAccountInfo(senderToken);
        if (!wsolAtaInfo) {
          // Create wSOL ATA if it doesn't exist
          tx.add(createAssociatedTokenAccountInstruction(
            funderKey, senderToken, funderKey, mintKey,
            TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
          ));
        }
        // Transfer native SOL into wSOL ATA then sync balance
        tx.add(SystemProgram.transfer({ fromPubkey: funderKey, toPubkey: senderToken, lamports: Number(amtBig) }));
        tx.add(createSyncNativeInstruction(senderToken, TOKEN_PROGRAM_ID));
      }

      tx.add(lockIx);
      tx.partialSign(baseKeypair); // base must co-sign

      const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");

      return res.status(200).json({
        transaction: serialized,
        escrow: escrowPDA.toBase58(),
        baseKey: baseKeypair.publicKey.toBase58(),
        blockhash,
        lastValidBlockHeight,
        cliffDays:  cliff   / 86400,
        vestingDays: vesting / 86400,
        mint,
        amount,
        recipient: recipientKey.toBase58(),
        wrappedSol: isWsol,
      });
    }

    // -----------------------------------------------------------------------
    // CLAIM
    // -----------------------------------------------------------------------
    if (action === "claim") {
      const { escrow, recipient } = req.body;
      if (!escrow)    return res.status(400).json({ error: "Missing: escrow" });
      if (!recipient) return res.status(400).json({ error: "Missing: recipient" });

      const recipientKey = new PublicKey(recipient);
      const escrowKey    = new PublicKey(escrow);

      const acctInfo = await connection.getAccountInfo(escrowKey);
      if (!acctInfo) return res.status(400).json({ error: "Escrow account not found" });

      // mint starts at offset 40: 8 disc + 32 base = 40
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
      ];

      const claimIx  = new TransactionInstruction({ programId: LOCK_PROGRAM, keys: claimKeys, data });
      const createAta = createAssociatedTokenAccountInstruction(
        recipientKey, recipientATA, recipientKey, mintKey,
        TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.add(createAta); // no-op on-chain if ATA already exists
      tx.add(claimIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = recipientKey;

      const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
      return res.status(200).json({ transaction: serialized, blockhash, lastValidBlockHeight });
    }

    // -----------------------------------------------------------------------
    // ACCOUNTS -- fetch + decode on-chain escrows for a wallet
    // -----------------------------------------------------------------------
    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      const walletPk = new PublicKey(wallet);
      const now      = Math.floor(Date.now() / 1000);

      // VestingEscrow layout: 200 bytes total
      // sender @ 72, recipient @ 104
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
