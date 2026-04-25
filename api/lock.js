// pages/api/lock.js
// Jupiter Lock — raw instruction encoding, verified against official Rust CLI source
// Program: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
// Anchor version: 0.28+ (camelCase discriminators)
// Account order: verified from process_initialize_lock_escrow_from_file.rs

import crypto from "crypto";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

// Anchor 0.28+: discriminator = sha256("global:" + camelCaseName)[0..8]
function disc(name) {
  return crypto.createHash("sha256").update("global:" + name).digest().slice(0, 8);
}

function u64LE(buf, val, off) {
  buf.writeBigUInt64LE(typeof val === "bigint" ? val : BigInt(val), off);
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: "Missing action" });

  let web3, splToken;
  try {
    web3     = await import("@solana/web3.js");
    splToken = await import("@solana/spl-token");
  } catch (e) {
    return res.status(500).json({ error: `SDK missing: ${e.message}` });
  }

  const { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, Keypair } = web3;
  const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
          createAssociatedTokenAccountInstruction, createSyncNativeInstruction } = splToken;

  const SOLANA_RPC   = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  const LOCK_PROGRAM = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");

  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")], LOCK_PROGRAM
  );

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");

    // -----------------------------------------------------------------------
    // CREATE
    // Verified account order from CreateVestingEscrowCtx in Rust source:
    //   base, escrow, escrow_token, recipient, sender, sender_token,
    //   event_authority, program, token_program, system_program
    //
    // Params (CreateVestingEscrowParameters, borsh serialized):
    //   vesting_start_time u64, cliff_time u64, frequency u64,
    //   cliff_unlock_amount u64, amount_per_period u64, number_of_period u64,
    //   update_recipient_mode u8, cancel_mode u8
    //   = 48 + 2 = 50 bytes params, 8 disc = 58 bytes total
    // -----------------------------------------------------------------------
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });
      if (!mint)   return res.status(400).json({ error: "Missing: mint" });

      const funderKey    = new PublicKey(funder);
      const recipientKey = (recipient && recipient.trim()) ? new PublicKey(recipient.trim()) : funderKey;
      const mintKey      = new PublicKey(mint);
      const isWsol       = mint === WSOL_MINT;

      const cliff   = Math.max(parseInt(cliffSecs)  || 0, 0);
      const vesting = Math.max(parseInt(vestingSecs) || 86400, 86400);
      const amtBig  = BigInt(amount);
      const now     = BigInt(Math.floor(Date.now() / 1000));

      const vestingStart = now;
      const cliffTime    = now + BigInt(cliff);   // absolute timestamp
      const frequency    = BigInt(vesting);
      const numPeriods   = 1n;
      const perPeriod    = amtBig;

      const baseKp      = Keypair.generate();
      const [escrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), baseKp.publicKey.toBuffer()], LOCK_PROGRAM
      );
      const senderToken = await getAssociatedTokenAddress(mintKey, funderKey,  false, TOKEN_PROGRAM_ID);
      const escrowToken = await getAssociatedTokenAddress(mintKey, escrowPDA,  true,  TOKEN_PROGRAM_ID);

      // Encode: 8 disc + 6×u64 + 2×u8 = 58 bytes
      const data = Buffer.alloc(58);
      let o = 0;
      disc("createVestingEscrow").copy(data, o); o += 8;
      u64LE(data, vestingStart, o); o += 8;
      u64LE(data, cliffTime,    o); o += 8;
      u64LE(data, frequency,    o); o += 8;
      u64LE(data, 0n,           o); o += 8; // cliff_unlock_amount
      u64LE(data, perPeriod,    o); o += 8;
      u64LE(data, numPeriods,   o); o += 8;
      data.writeUInt8(0, o); o++;           // update_recipient_mode
      data.writeUInt8(0, o);                // cancel_mode

      const keys = [
        { pubkey: baseKp.publicKey,        isSigner: true,  isWritable: false }, // base
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

      const lockIx = new TransactionInstruction({ programId: LOCK_PROGRAM, keys, data });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer        = funderKey;

      // NOTE: Do NOT pre-create the escrow ATA here.
      // The lock program creates it internally via CPI (using Anchor's spl crate which
      // allows PDA owners). Pre-creating it with JS @solana/spl-token fails with
      // IllegalOwner because the JS library rejects PDA accounts as ATA owners.

      // wSOL: wrap native SOL into sender ATA first
      if (isWsol) {
        tx.add(createAssociatedTokenAccountInstruction(
          funderKey, senderToken, funderKey, mintKey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        ));
        tx.add(SystemProgram.transfer({ fromPubkey: funderKey, toPubkey: senderToken, lamports: Number(amtBig) }));
        tx.add(createSyncNativeInstruction(senderToken, TOKEN_PROGRAM_ID));
      }

      tx.add(lockIx);
      tx.partialSign(baseKp);

      const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
      return res.status(200).json({
        transaction: serialized, escrow: escrowPDA.toBase58(),
        baseKey: baseKp.publicKey.toBase58(), blockhash, lastValidBlockHeight,
        cliffDays: cliff / 86400, vestingDays: vesting / 86400,
        mint, amount, recipient: recipientKey.toBase58(), wrappedSol: isWsol,
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

      const mintKey      = new PublicKey(acctInfo.data.slice(40, 72));
      const escrowATA    = await getAssociatedTokenAddress(mintKey, escrowKey,    true,  TOKEN_PROGRAM_ID);
      const recipientATA = await getAssociatedTokenAddress(mintKey, recipientKey, false, TOKEN_PROGRAM_ID);

      const claimData = Buffer.alloc(16);
      disc("claim").copy(claimData, 0);
      claimData.writeBigUInt64LE(BigInt("18446744073709551615"), 8); // u64::MAX

      const keys = [
        { pubkey: escrowKey,               isSigner: false, isWritable: true  },
        { pubkey: escrowATA,               isSigner: false, isWritable: true  },
        { pubkey: recipientKey,            isSigner: true,  isWritable: false },
        { pubkey: recipientATA,            isSigner: false, isWritable: true  },
        { pubkey: mintKey,                 isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: eventAuthority,          isSigner: false, isWritable: false },
        { pubkey: LOCK_PROGRAM,            isSigner: false, isWritable: false },
      ];

      const claimIx = new TransactionInstruction({ programId: LOCK_PROGRAM, keys, data: claimData });
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.add(createAssociatedTokenAccountInstruction(
        recipientKey, recipientATA, recipientKey, mintKey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ));
      tx.add(claimIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = recipientKey;

      const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
      return res.status(200).json({ transaction: serialized, blockhash, lastValidBlockHeight });
    }

    // -----------------------------------------------------------------------
    // ACCOUNTS
    // -----------------------------------------------------------------------
    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      const walletPk = new PublicKey(wallet);
      const now      = Math.floor(Date.now() / 1000);

      const [asSender, asRecipient] = await Promise.all([
        connection.getProgramAccounts(LOCK_PROGRAM, {
          filters: [{ dataSize: 200 }, { memcmp: { offset: 72,  bytes: walletPk.toBase58() } }],
        }).catch(() => []),
        connection.getProgramAccounts(LOCK_PROGRAM, {
          filters: [{ dataSize: 200 }, { memcmp: { offset: 104, bytes: walletPk.toBase58() } }],
        }).catch(() => []),
      ]);

      const seen = new Set();
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
          pubkey: key, mint, sender, recipient, cliffEnd, startTime,
          totalRaw, totalClaimed, claimableRaw,
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
