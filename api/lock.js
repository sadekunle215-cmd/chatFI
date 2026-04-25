// pages/api/lock.js
// Jupiter Lock — NO @coral-xyz/anchor dependency
// Pure @solana/web3.js + @solana/spl-token + Node.js crypto
// Program: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn

import crypto from "crypto";

// Compute Anchor instruction discriminator: sha256("global:<name>")[0..8]
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

  const { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY,
          Transaction, TransactionInstruction, Keypair } = web3;
  const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
          createAssociatedTokenAccountInstruction } = splToken;

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

    // ─────────────────────────────────────────────────────────────────────
    // CREATE — build createVestingEscrow ix without Anchor
    // ─────────────────────────────────────────────────────────────────────
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });
      if (!mint)   return res.status(400).json({ error: "Missing: mint" });

      const funderKey    = new PublicKey(funder);
      const recipientKey = recipient?.trim() ? new PublicKey(recipient.trim()) : funderKey;
      const mintKey      = new PublicKey(mint);

      const cliff   = Math.max(parseInt(cliffSecs)  || 0, 0);
      const vesting = Math.max(parseInt(vestingSecs) || 86400, 1);
      const periods = Math.max(Math.floor(vesting / 86400), 1);
      const amtBig  = BigInt(amount);
      const perPeriod = amtBig / BigInt(periods);
      // remainder goes into cliffUnlockAmount so total is exact
      const remainder = amtBig - (perPeriod * BigInt(periods));

      const now = BigInt(Math.floor(Date.now() / 1000));

      // Unique base keypair for this lock
      const baseKeypair = Keypair.generate();
      const [escrowPDA] = deriveEscrow(baseKeypair.publicKey);

      const senderToken = await getAssociatedTokenAddress(mintKey, funderKey,  false, TOKEN_PROGRAM_ID);
      const escrowToken = await getAssociatedTokenAddress(mintKey, escrowPDA,  true,  TOKEN_PROGRAM_ID);

      // ── Encode instruction data ──────────────────────────────────────────
      // Layout: 8 discriminator + 7×u64 (56 bytes) + 1×u8 = 65 bytes
      // Fields: vestingStartTime, cliffTime, frequency, cliffUnlockAmount,
      //         amountPerPeriod, numberOfPeriod, updateRecipientMode
      const CREATE_DISC = disc("createVestingEscrow");
      const params = Buffer.alloc(57); // 8 + 48 + 1
      let off = 0;

      // discriminator (8 bytes)
      CREATE_DISC.copy(params, off); off += 8;

      // vestingStartTime: when vesting begins (absolute unix ts)
      writeU64LE(params, now, off); off += 8;
      // cliffTime: cliff duration in seconds (relative to vestingStartTime)
      writeU64LE(params, BigInt(cliff), off); off += 8;
      // frequency: unlock interval in seconds
      writeU64LE(params, BigInt(86400), off); off += 8;
      // cliffUnlockAmount: tokens unlocked at cliff (put remainder here)
      writeU64LE(params, remainder, off); off += 8;
      // amountPerPeriod: tokens unlocked each period
      writeU64LE(params, perPeriod, off); off += 8;
      // numberOfPeriod: total unlock periods
      writeU64LE(params, BigInt(periods), off); off += 8;
      // updateRecipientMode: 0 = recipient cannot change themselves
      params.writeUInt8(0, off);

      const keys = [
        { pubkey: baseKeypair.publicKey, isSigner: true,  isWritable: false },
        { pubkey: escrowPDA,             isSigner: false, isWritable: true  },
        { pubkey: escrowToken,           isSigner: false, isWritable: true  },
        { pubkey: funderKey,             isSigner: true,  isWritable: true  },
        { pubkey: senderToken,           isSigner: false, isWritable: true  },
        { pubkey: recipientKey,          isSigner: false, isWritable: false },
        { pubkey: mintKey,               isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY,    isSigner: false, isWritable: false },
      ];

      const createIx = new TransactionInstruction({
        programId: LOCK_PROGRAM,
        keys,
        data: params,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.add(createIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = funderKey;

      // base keypair must co-sign (server-side partial sign)
      tx.partialSign(baseKeypair);

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({
        transaction:         serialized,
        escrow:              escrowPDA.toBase58(),
        baseKey:             baseKeypair.publicKey.toBase58(),
        blockhash,
        lastValidBlockHeight,
        cliffDays:           cliff   / 86400,
        vestingDays:         vesting / 86400,
        mint,
        amount,
        recipient:           recipientKey.toBase58(),
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // CLAIM — build claim ix without Anchor (same as doClaimLock client-side)
    // ─────────────────────────────────────────────────────────────────────
    if (action === "claim") {
      const { escrow, recipient } = req.body;
      if (!escrow)    return res.status(400).json({ error: "Missing: escrow" });
      if (!recipient) return res.status(400).json({ error: "Missing: recipient" });

      const recipientKey = new PublicKey(recipient);
      const escrowKey    = new PublicKey(escrow);

      // Fetch escrow account — mint is at offset 40 (8 disc + 32 base)
      const acctInfo = await connection.getAccountInfo(escrowKey);
      if (!acctInfo) return res.status(400).json({ error: "Escrow account not found" });
      const mintKey = new PublicKey(acctInfo.data.slice(40, 72));

      const escrowATA    = await getAssociatedTokenAddress(mintKey, escrowKey,    true,  TOKEN_PROGRAM_ID);
      const recipientATA = await getAssociatedTokenAddress(mintKey, recipientKey, false, TOKEN_PROGRAM_ID);

      // claim discriminator = sha256("global:claim")[0..8]
      const CLAIM_DISC = disc("claim");
      const maxAmount  = Buffer.alloc(8);
      maxAmount.writeBigUInt64LE(BigInt("18446744073709551615"), 0); // u64::MAX
      const data = Buffer.concat([CLAIM_DISC, maxAmount]);

      const keys = [
        { pubkey: escrowKey,             isSigner: false, isWritable: true  },
        { pubkey: escrowATA,             isSigner: false, isWritable: true  },
        { pubkey: recipientKey,          isSigner: true,  isWritable: false },
        { pubkey: recipientATA,          isSigner: false, isWritable: true  },
        { pubkey: mintKey,               isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];

      const claimIx = new TransactionInstruction({ programId: LOCK_PROGRAM, keys, data });

      // Create recipient ATA ix (no-op if already exists — handled client-side)
      const createAtaIx = createAssociatedTokenAccountInstruction(
        recipientKey, recipientATA, recipientKey, mintKey,
        TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.add(createAtaIx);
      tx.add(claimIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = recipientKey;

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({ transaction: serialized, blockhash, lastValidBlockHeight });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ACCOUNTS — fetch on-chain escrows for a wallet
    // ─────────────────────────────────────────────────────────────────────
    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      const walletPk = new PublicKey(wallet);

      // VestingEscrow: 8 disc + 32 base + 32 mint + 32 sender + 32 recipient = 200 bytes total
      // sender offset: 72, recipient offset: 104
      const [asSender, asRecipient] = await Promise.all([
        connection.getProgramAccounts(LOCK_PROGRAM, {
          filters: [
            { dataSize: 200 },
            { memcmp: { offset: 72, bytes: walletPk.toBase58() } },
          ],
        }).catch(() => []),
        connection.getProgramAccounts(LOCK_PROGRAM, {
          filters: [
            { dataSize: 200 },
            { memcmp: { offset: 104, bytes: walletPk.toBase58() } },
          ],
        }).catch(() => []),
      ]);

      const seen = new Set();
      const accounts = [];
      for (const item of [...asSender, ...asRecipient]) {
        const key = item.pubkey.toBase58();
        if (!seen.has(key)) {
          seen.add(key);
          // Decode binary account data
          const buf = Buffer.from(item.account.data);
          let off = 8; // skip discriminator
          const base      = new PublicKey(buf.slice(off, off += 32)).toBase58();
          const mint      = new PublicKey(buf.slice(off, off += 32)).toBase58();
          const sender    = new PublicKey(buf.slice(off, off += 32)).toBase58();
          const recipient = new PublicKey(buf.slice(off, off += 32)).toBase58();
          const startTime       = Number(buf.readBigUInt64LE(off)); off += 8;
          const frequency       = Number(buf.readBigUInt64LE(off)); off += 8;
          const cliffUnlockAmt  = Number(buf.readBigUInt64LE(off)); off += 8;
          const amountPerPeriod = Number(buf.readBigUInt64LE(off)); off += 8;
          const numberOfPeriod  = Number(buf.readBigUInt64LE(off)); off += 8;
          const totalClaimed    = Number(buf.readBigUInt64LE(off)); off += 8;
          const cliffTime       = Number(buf.readBigUInt64LE(off));

          const now      = Math.floor(Date.now() / 1000);
          const cliffEnd = startTime + cliffTime;
          const elapsed  = Math.max(now - cliffEnd, 0);
          const periodsElapsed = frequency > 0 ? Math.floor(elapsed / frequency) : 0;
          const totalVested = Math.min(
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
            claimable: claimableRaw > 0 && now >= cliffEnd,
            vestedPercent: totalRaw > 0 ? ((totalVested / totalRaw) * 100).toFixed(1) : "0",
          });
        }
      }

      return res.status(200).json({ accounts });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error("[api/lock]", err);
    return res.status(500).json({ error: err?.message || "Lock API error" });
  }
}
