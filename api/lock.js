// pages/api/lock.js
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let web3, metLock;

  try {
    web3    = await import("@solana/web3.js");
    metLock = await import("@meteora-ag/met-lock-sdk");
  } catch (importErr) {
    return res.status(500).json({ error: `SDK missing: ${importErr.message}` });
  }

  const { Connection, PublicKey } = web3;
  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: "Missing action" });

  const SOLANA_RPC =
    process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");

    // ─────────────────────────────────────────────────────────────────────────
    // CREATE — build a real Jupiter Lock vesting escrow tx via met-lock-sdk
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });
      if (!mint)   return res.status(400).json({ error: "Missing: mint" });

      const funderKey    = new PublicKey(funder);
      const recipientKey = recipient ? new PublicKey(recipient) : funderKey;
      const mintKey      = new PublicKey(mint);

      const cliff   = Math.max(parseInt(cliffSecs)  || 0, 0);
      const vesting = Math.max(parseInt(vestingSecs) || 86400, 1);
      const periods = Math.max(Math.floor(vesting / 86400), 1);

      const LockerClient = metLock.LockerClient || metLock.default?.LockerClient;
      if (!LockerClient) throw new Error("met-lock-sdk: LockerClient not found in exports");

      const client = new LockerClient(connection);

      // createVestingEscrow returns { transaction, escrow } — real on-chain tx
      const { transaction, escrow } = await client.createVestingEscrow({
        funder:              funderKey,
        recipient:           recipientKey,
        mint:                mintKey,
        totalDepositAmount:  BigInt(amount),
        vestingStartTime:    BigInt(Math.floor(Date.now() / 1000) + cliff),
        cliffTime:           BigInt(cliff),
        frequency:           BigInt(86400),
        cliffUnlockAmount:   BigInt(0),
        amountPerPeriod:     BigInt(Math.floor(Number(amount) / periods)),
        numberOfPeriod:      BigInt(periods),
        updateRecipientMode: 0,
      });

      // Real blockhash so the tx actually lands on-chain
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer        = funderKey;

      const serialized = Buffer.from(
        transaction.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({
        transaction:         serialized,
        escrow:              escrow.toBase58(),
        baseKey:             escrow.toBase58(),
        blockhash,
        lastValidBlockHeight,
        cliffDays:           cliff   / 86400,
        vestingDays:         vesting / 86400,
        mint,
        amount,
        recipient:           recipientKey.toBase58(),
        // NOTE: no mock:true — frontend must confirm on-chain
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLAIM — build a real claim tx for vested tokens
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "claim") {
      const { escrow, recipient } = req.body;
      if (!escrow)    return res.status(400).json({ error: "Missing: escrow" });
      if (!recipient) return res.status(400).json({ error: "Missing: recipient" });

      const recipientKey = new PublicKey(recipient);
      const escrowKey    = new PublicKey(escrow);

      const LockerClient = metLock.LockerClient || metLock.default?.LockerClient;
      if (!LockerClient) throw new Error("met-lock-sdk: LockerClient not found in exports");

      const client = new LockerClient(connection);

      const { transaction } = await client.claimVestedTokens({
        escrow:    escrowKey,
        recipient: recipientKey,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer        = recipientKey;

      const serialized = Buffer.from(
        transaction.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({
        transaction: serialized,
        blockhash,
        lastValidBlockHeight,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACCOUNTS — fetch real on-chain escrow accounts for the wallet
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      const LockerClient = metLock.LockerClient || metLock.default?.LockerClient;
      if (!LockerClient) throw new Error("met-lock-sdk: LockerClient not found in exports");

      const client   = new LockerClient(connection);
      const walletPk = new PublicKey(wallet);

      const [asCreator, asRecipient] = await Promise.all([
        client.getEscrowsByCreator(walletPk).catch(() => []),
        client.getEscrowsByRecipient(walletPk).catch(() => []),
      ]);

      const seen = new Set();
      const accounts = [];
      for (const item of [...asCreator, ...asRecipient]) {
        const key = item.publicKey?.toBase58?.() || item.pubkey;
        if (!seen.has(key)) {
          seen.add(key);
          accounts.push({ pubkey: key, data: item.account || item.data || {} });
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
