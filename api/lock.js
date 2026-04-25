// pages/api/lock.js
// Jupiter Lock — verified against jup-lock-starter + fuzzing repo source
// Program: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
// Anchor 0.28+ → camelCase discriminators: sha256("global:createVestingEscrow")[0..8]
//
// Jupiter UI lock pattern (from lock.jup.ag):
//   cliff_unlock_amount = full amount  (all tokens unlock at cliff date)
//   amount_per_period   = 0            (no additional linear vesting)
//   number_of_period    = 1
//   frequency           = vesting duration in seconds
//   cliff_time          = vesting_start_time + cliff_seconds (MUST be >= vesting_start_time)
//
// Constraint from Rust source: cliff_time >= vesting_start_time, frequency != 0

import crypto from "crypto";

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

  const { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY,
          Transaction, TransactionInstruction, Keypair } = web3;
  const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
          createAssociatedTokenAccountIdempotentInstruction } = splToken;

  const SOLANA_RPC   = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  const LOCK_PROGRAM = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");
  const WSOL_MINT    = "So11111111111111111111111111111111111111112";

  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")], LOCK_PROGRAM
  );

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");

    // -----------------------------------------------------------------------
    // CREATE
    // Rust constraint: cliff_time >= vesting_start_time AND frequency != 0
    // -----------------------------------------------------------------------
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });
      if (!mint)   return res.status(400).json({ error: "Missing: mint" });
      if (mint === WSOL_MINT) return res.status(400).json({ error: "Native SOL cannot be locked. Use USDC or JUP instead." });

      const funderKey    = new PublicKey(funder);
      const recipientKey = (recipient && recipient.trim()) ? new PublicKey(recipient.trim()) : funderKey;
      const mintKey      = new PublicKey(mint);

      // Block Token-2022 — Jupiter Lock only supports the standard Token Program
      const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
      const mintInfo = await connection.getAccountInfo(mintKey);
      if (!mintInfo) return res.status(400).json({ error: "Mint account not found on-chain. Check the token address." });
      if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        return res.status(400).json({ error: "Token-2022 tokens are not supported by Jupiter Lock. Use a standard SPL token like USDC or JUP." });
      }

      const cliff      = Math.max(parseInt(cliffSecs)  || 0, 0);
      // frequency must be > 0, minimum 60 seconds
      const frequency  = Math.max(parseInt(vestingSecs) || 86400, 60);
      const amtBig     = BigInt(amount);
      const now        = BigInt(Math.floor(Date.now() / 1000));

      // cliff_time MUST be >= vesting_start_time
      const vestingStart = now;
      const cliffTime    = now + BigInt(cliff); // >= vestingStart always ✓

      const baseKp      = Keypair.generate();
      const [escrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), baseKp.publicKey.toBuffer()], LOCK_PROGRAM
      );
      const senderToken = await getAssociatedTokenAddress(mintKey, funderKey, false, TOKEN_PROGRAM_ID);
      const escrowToken = await getAssociatedTokenAddress(mintKey, escrowPDA,  true,  TOKEN_PROGRAM_ID);

      // Validate the sender actually holds this token before building the tx
      const senderTokenInfo = await connection.getAccountInfo(senderToken);
      if (!senderTokenInfo) {
        return res.status(400).json({ error: "No token account found for this mint in your wallet. Make sure you hold this token before locking it." });
      }

      // Encode instruction data: 8 disc + 6×u64 + 2×u8 = 58 bytes
      // Jupiter UI pattern: all tokens unlock at cliff (cliff_unlock_amount = full amount)
      const data = Buffer.alloc(58);
      let o = 0;
      disc("create_vesting_escrow").copy(data, o); o += 8;
      u64LE(data, vestingStart, o); o += 8; // vesting_start_time
      u64LE(data, cliffTime,    o); o += 8; // cliff_time (>= vesting_start_time)
      u64LE(data, frequency,    o); o += 8; // frequency (must be > 0)
      u64LE(data, amtBig,       o); o += 8; // cliff_unlock_amount = FULL amount
      u64LE(data, 0n,           o); o += 8; // amount_per_period = 0
      u64LE(data, 1n,           o); o += 8; // number_of_period = 1
      data.writeUInt8(0, o); o++;            // update_recipient_mode = 0
      data.writeUInt8(0, o);                 // cancel_mode = 0

      // Correct account order for CreateVestingEscrow (from jup-lock IDL):
      // base, escrow, escrow_token, sender, sender_token, recipient, mint,
      // token_program, associated_token_program, system_program, event_authority, program
      const keys = [
        { pubkey: baseKp.publicKey,            isSigner: true,  isWritable: false }, // base
        { pubkey: escrowPDA,                   isSigner: false, isWritable: true  }, // escrow
        { pubkey: escrowToken,                 isSigner: false, isWritable: true  }, // escrow_token
        { pubkey: funderKey,                   isSigner: true,  isWritable: true  }, // sender
        { pubkey: senderToken,                 isSigner: false, isWritable: true  }, // sender_token
        { pubkey: recipientKey,                isSigner: false, isWritable: false }, // recipient
        { pubkey: TOKEN_PROGRAM_ID,            isSigner: false, isWritable: false }, // token_program
        { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false }, // system_program
        { pubkey: eventAuthority,              isSigner: false, isWritable: false }, // event_authority
        { pubkey: LOCK_PROGRAM,                isSigner: false, isWritable: false }, // program
      ];

      const lockIx = new TransactionInstruction({ programId: LOCK_PROGRAM, keys, data });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = funderKey;
      // Pre-create escrow ATA with idempotent instruction (allows PDA owners)
      tx.add(createAssociatedTokenAccountIdempotentInstruction(
        funderKey, escrowToken, escrowPDA, mintKey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ));
      tx.add(lockIx);
      tx.partialSign(baseKp);

      const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
      return res.status(200).json({
        transaction: serialized, escrow: escrowPDA.toBase58(),
        baseKey: baseKp.publicKey.toBase58(), blockhash, lastValidBlockHeight,
        cliffDays: cliff / 86400, vestingDays: frequency / 86400,
        mint, amount, recipient: recipientKey.toBase58(),
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
      const acctInfo     = await connection.getAccountInfo(escrowKey);
      if (!acctInfo) return res.status(400).json({ error: "Escrow account not found" });

      const mintKey      = new PublicKey(acctInfo.data.slice(40, 72));
      const escrowATA    = await getAssociatedTokenAddress(mintKey, escrowKey,    true,  TOKEN_PROGRAM_ID);
      const recipientATA = await getAssociatedTokenAddress(mintKey, recipientKey, false, TOKEN_PROGRAM_ID);

      const claimData = Buffer.alloc(16);
      disc("claim").copy(claimData, 0);
      claimData.writeBigUInt64LE(BigInt("18446744073709551615"), 8);

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

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.add(createAssociatedTokenAccountIdempotentInstruction(
        recipientKey, recipientATA, recipientKey, mintKey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ));
      tx.add(new TransactionInstruction({ programId: LOCK_PROGRAM, keys, data: claimData }));
      tx.recentBlockhash = blockhash;
      tx.feePayer = recipientKey;

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
        const mint      = new PublicKey(buf.slice(o += 32, o += 32)).toBase58();
        const sender    = new PublicKey(buf.slice(o,       o += 32)).toBase58();
        const recipient = new PublicKey(buf.slice(o,       o += 32)).toBase58();

        const startTime       = Number(buf.readBigUInt64LE(o)); o += 8;
        const frequency       = Number(buf.readBigUInt64LE(o)); o += 8;
        const cliffUnlockAmt  = Number(buf.readBigUInt64LE(o)); o += 8;
        const amountPerPeriod = Number(buf.readBigUInt64LE(o)); o += 8;
        const numberOfPeriod  = Number(buf.readBigUInt64LE(o)); o += 8;
        const totalClaimed    = Number(buf.readBigUInt64LE(o)); o += 8;
        const cliffTime       = Number(buf.readBigUInt64LE(o));

        const cliffEnd     = startTime + cliffTime;
        const totalRaw     = cliffUnlockAmt + amountPerPeriod * numberOfPeriod;
        const claimableRaw = now >= cliffEnd ? Math.max(totalRaw - totalClaimed, 0) : 0;

        accounts.push({
          pubkey: key, mint, sender, recipient,
          cliffEnd, startTime, totalRaw, totalClaimed, claimableRaw,
          claimable: claimableRaw > 0,
          vestedPercent: totalRaw > 0 ? ((totalRaw - totalClaimed) / totalRaw * 100).toFixed(1) : "0",
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
