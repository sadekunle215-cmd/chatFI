// pages/api/lock.js
// Requires: npm install @meteora-ag/met-lock-sdk @solana/web3.js @solana/spl-token bn.js
export default async function handler(req, res) {
  // Always return JSON — never let Next.js return an HTML error page
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let LockClient, Connection, PublicKey, Keypair, Transaction, BN, getAssociatedTokenAddressSync;

  try {
    ({ LockClient }           = await import("@meteora-ag/met-lock-sdk"));
    ({ Connection, PublicKey, Keypair, Transaction } = await import("@solana/web3.js"));
    ({ default: BN }          = await import("bn.js"));
    ({ getAssociatedTokenAddressSync } = await import("@solana/spl-token"));
  } catch (importErr) {
    return res.status(500).json({
      error: `SDK not installed. Run: npm install @meteora-ag/met-lock-sdk @solana/web3.js @solana/spl-token bn.js — ${importErr.message}`,
    });
  }

  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: "Missing action" });

  const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");
    const client     = new LockClient(connection, "confirmed");

    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!mint)   return res.status(400).json({ error: "Missing: mint" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });

      const WSOL_MINT = "So11111111111111111111111111111111111111112";
      const resolvedMint = mint === "SOL" ? WSOL_MINT : mint;

      const now            = Math.floor(Date.now() / 1000);
      const cliffSecsInt   = Math.max(parseInt(cliffSecs)  || 0, 0);
      const vestingSecsInt = Math.max(parseInt(vestingSecs) || 86400, 1);
      const amountBN       = new BN(String(amount));

      const frequency         = new BN(1);
      const numberOfPeriod    = new BN(vestingSecsInt);
      const amountPerPeriod   = amountBN.divn(vestingSecsInt);
      const cliffUnlockAmount = amountBN.sub(amountPerPeriod.muln(vestingSecsInt));

      const base = Keypair.generate();

      // Derive escrow PDA and its token account explicitly to avoid
      // "Reached maximum depth for account resolution: escrowToken" error
      const LOCK_PROGRAM_ID = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");
      const [escrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), base.publicKey.toBuffer()],
        LOCK_PROGRAM_ID
      );
      const escrowToken = getAssociatedTokenAddressSync(
        new PublicKey(resolvedMint),
        escrowPDA,
        true // allowOwnerOffCurve — required since escrowPDA is a PDA
      );

      const tx = await client.createVestingEscrowV2({
        base:                base.publicKey,
        sender:              new PublicKey(funder),
        isSenderMultiSig:    false,
        payer:               new PublicKey(funder),
        tokenMint:           new PublicKey(resolvedMint),
        escrowToken,
        vestingStartTime:    new BN(now),
        cliffTime:           new BN(now + cliffSecsInt),
        frequency,
        cliffUnlockAmount,
        amountPerPeriod,
        numberOfPeriod,
        recipient:           new PublicKey(recipient || funder),
        updateRecipientMode: 0,
        cancelMode:          0,
      });

      tx.partialSign(base);

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({ transaction: serialized, baseKey: base.publicKey.toBase58() });
    }

    if (action === "claim") {
      const { escrow, recipient } = req.body;
      if (!escrow)    return res.status(400).json({ error: "Missing: escrow" });
      if (!recipient) return res.status(400).json({ error: "Missing: recipient" });

      const tx = await client.claimV2({
        escrow:    new PublicKey(escrow),
        recipient: new PublicKey(recipient),
        payer:     new PublicKey(recipient),
      });

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({ transaction: serialized });
    }

    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      const LOCK_PROGRAM = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");
      const [asSender, asRecipient] = await Promise.all([
        connection.getProgramAccounts(LOCK_PROGRAM, { filters: [{ memcmp: { offset: 8,  bytes: wallet } }] }),
        connection.getProgramAccounts(LOCK_PROGRAM, { filters: [{ memcmp: { offset: 40, bytes: wallet } }] }),
      ]);

      const seen = new Set();
      const unique = [...asSender, ...asRecipient].filter(a => {
        const k = a.pubkey.toBase58(); if (seen.has(k)) return false; seen.add(k); return true;
      });

      return res.status(200).json({
        accounts: unique.map(a => ({ pubkey: a.pubkey.toBase58(), lockId: a.pubkey.toBase58() })),
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error("[api/lock]", err);
    return res.status(500).json({ error: err?.message || "Lock API internal error" });
  }
}
