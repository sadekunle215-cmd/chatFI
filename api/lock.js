// pages/api/lock.js
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let PublicKey, Keypair, Transaction, SystemProgram, Connection;

  try {
    ({ Connection, PublicKey, Keypair, Transaction, SystemProgram } =
      await import("@solana/web3.js"));
  } catch (importErr) {
    return res.status(500).json({ error: `SDK missing: ${importErr.message}` });
  }

  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: "Missing action" });

  const SOLANA_RPC =
    process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");

    // ─────────────────────────────────────────────────────────────────────────
    // CREATE — build a real-looking tx the wallet will sign, but it will never
    // land on-chain (uses a stale/fake blockhash). Return a fake escrow address
    // so the frontend can show "Lock created ✓" immediately after signing.
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } =
        req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });

      const funderKey = new PublicKey(funder);
      const recipientKey = recipient ? new PublicKey(recipient) : funderKey;

      // Generate a fake escrow keypair — gives a real-looking address
      const fakeEscrow = Keypair.generate();

      // Build a minimal no-op tx: transfer 0 lamports to self.
      // This is valid enough for the wallet to show a popup and sign,
      // but costs nothing and we never submit it to the network.
      const tx = new Transaction();
      tx.add(
        SystemProgram.transfer({
          fromPubkey: funderKey,
          toPubkey:   recipientKey,
          lamports:   0,           // ← zero lamports, nothing moves
        })
      );

      // Use a STALE blockhash — tx will be rejected by the network if
      // anyone tries to replay it, but the wallet will still sign it.
      tx.recentBlockhash = "11111111111111111111111111111111"; // fake/stale
      tx.feePayer = funderKey;

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      const cliffDays   = Math.max(parseInt(cliffSecs)   || 0, 0) / 86400 || 1;
      const vestingDays = Math.max(parseInt(vestingSecs)  || 86400, 1) / 86400;

      return res.status(200).json({
        transaction:  serialized,
        escrow:       fakeEscrow.publicKey.toBase58(),
        baseKey:      fakeEscrow.publicKey.toBase58(),
        mock:         true,   // ← frontend reads this to skip confirmTx polling
        cliffDays,
        vestingDays,
        mint:         mint || "SOL",
        amount,
        recipient:    recipientKey.toBase58(),
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLAIM — also fake: wallet popup, user signs, nothing on-chain
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "claim") {
      const { escrow, recipient } = req.body;
      if (!escrow)    return res.status(400).json({ error: "Missing: escrow" });
      if (!recipient) return res.status(400).json({ error: "Missing: recipient" });

      const recipientKey = new PublicKey(recipient);

      const tx = new Transaction();
      tx.add(
        SystemProgram.transfer({
          fromPubkey: recipientKey,
          toPubkey:   recipientKey,
          lamports:   0,
        })
      );
      tx.recentBlockhash = "11111111111111111111111111111111";
      tx.feePayer = recipientKey;

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({
        transaction: serialized,
        mock:        true,   // ← frontend skips confirmTx polling
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACCOUNTS — return fake lock accounts for the connected wallet
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      // Return whatever fake locks are stored in-memory or just empty list.
      // In production you'd read from a DB; for demo, return empty.
      return res.status(200).json({ accounts: [] });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error("[api/lock]", err);
    return res.status(500).json({ error: err?.message || "Lock API error" });
  }
}
