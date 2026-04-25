// api/lock.js
// Jupiter Lock transactions — raw instruction encoding, no Anchor dependency

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
          ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } = splToken;

  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: "Missing action" });

  const SOLANA_RPC   = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  const LOCK_PROGRAM = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");

  function writeU64(buf, val, offset) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(val), 0);
    b.copy(buf, offset);
    return offset + 8;
  }

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");

    function deriveEscrow(base) {
      return PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), base.toBuffer()],
        LOCK_PROGRAM
      );
    }

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });
      if (!mint)   return res.status(400).json({ error: "Missing: mint" });

      const funderKey    = new PublicKey(funder);
      const recipientKey = recipient?.trim() ? new PublicKey(recipient.trim()) : funderKey;
      const mintKey      = new PublicKey(mint);

      const cliff     = Math.max(parseInt(cliffSecs)  || 0, 0);
      const vesting   = Math.max(parseInt(vestingSecs) || 86400, 1);
      const periods   = Math.max(Math.floor(vesting / 86400), 1);
      const amtBig    = BigInt(amount);
      const perPeriod = amtBig / BigInt(periods);

      const now          = BigInt(Math.floor(Date.now() / 1000));
      const vestingStart = now + BigInt(cliff);

      const baseKeypair = Keypair.generate();
      const [escrowPDA] = deriveEscrow(baseKeypair.publicKey);

      const senderToken = await getAssociatedTokenAddress(mintKey, funderKey, false, TOKEN_PROGRAM_ID);
      const escrowToken = await getAssociatedTokenAddress(mintKey, escrowPDA, true,  TOKEN_PROGRAM_ID);

      const discriminator = Buffer.from([141, 40, 104, 40, 169, 59, 59, 29]);
      const params = Buffer.alloc(8 * 6 + 1);
      let off = 0;
      off = writeU64(params, vestingStart,    off);
      off = writeU64(params, BigInt(cliff),   off);
      off = writeU64(params, BigInt(86400),   off);
      off = writeU64(params, BigInt(0),       off);
      off = writeU64(params, perPeriod,       off);
      off = writeU64(params, BigInt(periods), off);
      params.writeUInt8(0, off);
      const data = Buffer.concat([discriminator, params]);

      const keys = [
        { pubkey: baseKeypair.publicKey,   isSigner: true,  isWritable: false },
        { pubkey: escrowPDA,               isSigner: false, isWritable: true  },
        { pubkey: escrowToken,             isSigner: false, isWritable: true  },
        { pubkey: funderKey,               isSigner: true,  isWritable: true  },
        { pubkey: senderToken,             isSigner: false, isWritable: true  },
        { pubkey: recipientKey,            isSigner: false, isWritable: false },
        { pubkey: mintKey,                 isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY,      isSigner: false, isWritable: false },
      ];

      const lockIx = new TransactionInstruction({ programId: LOCK_PROGRAM, keys, data });
      const createEscrowAtaIx = createAssociatedTokenAccountInstruction(
        funderKey, escrowToken, escrowPDA, mintKey,
        TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.add(createEscrowAtaIx, lockIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = funderKey;
      tx.partialSign(baseKeypair);

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({
        transaction:         serialized,
        escrow:              escrowPDA.toBase58(),
        blockhash,
        lastValidBlockHeight,
        mint,
        amount,
        recipient:           recipientKey.toBase58(),
      });
    }

    // ── CLAIM ─────────────────────────────────────────────────────────────────
    if (action === "claim") {
      const { escrow, recipient } = req.body;
      if (!escrow)    return res.status(400).json({ error: "Missing: escrow" });
      if (!recipient) return res.status(400).json({ error: "Missing: recipient" });

      const recipientKey = new PublicKey(recipient);
      const escrowKey    = new PublicKey(escrow);

      const acctInfo = await connection.getAccountInfo(escrowKey);
      if (!acctInfo) throw new Error("Escrow account not found on-chain");
      const mintKey = new PublicKey(acctInfo.data.slice(40, 72));

      const escrowToken    = await getAssociatedTokenAddress(mintKey, escrowKey,    true,  TOKEN_PROGRAM_ID);
      const recipientToken = await getAssociatedTokenAddress(mintKey, recipientKey, false, TOKEN_PROGRAM_ID);

      const discriminator = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]);
      const maxAmount = Buffer.alloc(8);
      maxAmount.writeBigUInt64LE(BigInt("18446744073709551615"), 0);
      const data = Buffer.concat([discriminator, maxAmount]);

      const keys = [
        { pubkey: escrowKey,               isSigner: false, isWritable: true  },
        { pubkey: escrowToken,             isSigner: false, isWritable: true  },
        { pubkey: recipientKey,            isSigner: true,  isWritable: false },
        { pubkey: recipientToken,          isSigner: false, isWritable: true  },
        { pubkey: mintKey,                 isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];

      const claimIx = new TransactionInstruction({ programId: LOCK_PROGRAM, keys, data });
      const createRecipientAtaIx = createAssociatedTokenAccountInstruction(
        recipientKey, recipientToken, recipientKey, mintKey,
        TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      try { tx.add(createRecipientAtaIx); } catch (_) {}
      tx.add(claimIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = recipientKey;

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({ transaction: serialized, blockhash, lastValidBlockHeight });
    }

    // ── ACCOUNTS ──────────────────────────────────────────────────────────────
    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      const walletPk = new PublicKey(wallet);
      const [asSender, asRecipient] = await Promise.all([
        connection.getProgramAccounts(LOCK_PROGRAM, { filters: [
          { dataSize: 281 },
          { memcmp: { offset: 72, bytes: walletPk.toBase58() } }
        ]}).catch(() => []),
        connection.getProgramAccounts(LOCK_PROGRAM, { filters: [
          { dataSize: 281 },
          { memcmp: { offset: 104, bytes: walletPk.toBase58() } }
        ]}).catch(() => []),
      ]);

      const seen = new Set();
      const accounts = [];
      for (const item of [...asSender, ...asRecipient]) {
        const key = item.pubkey.toBase58();
        if (!seen.has(key)) {
          seen.add(key);
          accounts.push({ pubkey: key, data: item.account.data });
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
