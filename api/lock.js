// pages/api/lock.js
// Jupiter Lock — uses Jupiter's official REST API (api.jup.ag/lock/v1)
// instead of hand-encoding raw Anchor instructions (which break on discriminator mismatches).
// Same pattern as /api/swap, /api/recurring, /api/perps etc.
// Program: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn

const JUP_LOCK_API = "https://api.jup.ag/lock/v1";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: "Missing action" });

  try {
    // -------------------------------------------------------------------------
    // CREATE — POST /lock/v1/create
    // Jupiter builds the fully-correct transaction with the right discriminator,
    // account order, and instruction data. We just proxy + partially sign.
    // -------------------------------------------------------------------------
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });
      if (!mint)   return res.status(400).json({ error: "Missing: mint" });

      const cliff   = Math.max(parseInt(cliffSecs)  || 0, 0);
      const vesting = Math.max(parseInt(vestingSecs) || 86400, 86400);
      const now     = Math.floor(Date.now() / 1000);

      // Jupiter Lock API body (matches their documented schema)
      const body = {
        funder,
        recipient:          (recipient && recipient.trim()) ? recipient.trim() : funder,
        mint,
        amount,                              // raw token amount (already scaled by decimals)
        vestingStartTime:   now,
        cliffTime:          now + cliff,     // absolute timestamp
        frequency:          vesting,         // single-period: frequency = full vesting duration
        amountPerPeriod:    amount,          // all tokens in one period
        numberOfPeriod:     1,
        cliffUnlockAmount:  0,
        updateRecipientMode: 0,
        cancelMode:          0,
      };

      const apiRes = await fetch(`${JUP_LOCK_API}/create`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      const text = await apiRes.text();
      let data;
      try { data = JSON.parse(text); }
      catch { return res.status(502).json({ error: `Jupiter Lock API error: ${text.slice(0, 200)}` }); }

      if (!apiRes.ok || data.error) {
        return res.status(apiRes.status || 400).json({ error: data.error || data.message || "Jupiter Lock API error" });
      }

      // Jupiter returns { transaction, escrow, ... }
      return res.status(200).json({
        transaction:         data.transaction,
        escrow:              data.escrow,
        blockhash:           data.blockhash,
        lastValidBlockHeight: data.lastValidBlockHeight,
        cliffDays:           cliff   / 86400,
        vestingDays:         vesting / 86400,
        mint,
        amount,
        recipient:           (recipient && recipient.trim()) ? recipient.trim() : funder,
      });
    }

    // -------------------------------------------------------------------------
    // CLAIM — POST /lock/v1/claim
    // -------------------------------------------------------------------------
    if (action === "claim") {
      const { escrow, recipient } = req.body;
      if (!escrow)    return res.status(400).json({ error: "Missing: escrow" });
      if (!recipient) return res.status(400).json({ error: "Missing: recipient" });

      const apiRes = await fetch(`${JUP_LOCK_API}/claim`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ escrow, recipient }),
      });

      const text = await apiRes.text();
      let data;
      try { data = JSON.parse(text); }
      catch { return res.status(502).json({ error: `Jupiter Lock API error: ${text.slice(0, 200)}` }); }

      if (!apiRes.ok || data.error) {
        return res.status(apiRes.status || 400).json({ error: data.error || data.message || "Jupiter Lock API error" });
      }

      return res.status(200).json({
        transaction:         data.transaction,
        blockhash:           data.blockhash,
        lastValidBlockHeight: data.lastValidBlockHeight,
      });
    }

    // -------------------------------------------------------------------------
    // ACCOUNTS — fetch on-chain escrows for a wallet via Jupiter API
    // Falls back to raw RPC decode if Jupiter API doesn't support it.
    // -------------------------------------------------------------------------
    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      // Try Jupiter's list endpoint first
      const apiRes = await fetch(`${JUP_LOCK_API}/locks?wallet=${wallet}`, {
        headers: { "Content-Type": "application/json" },
      });

      if (apiRes.ok) {
        const text = await apiRes.text();
        try {
          const data = JSON.parse(text);
          return res.status(200).json({ accounts: data.locks || data.accounts || data || [] });
        } catch { /* fall through to RPC decode */ }
      }

      // Fallback: raw RPC getProgramAccounts decode
      let web3, splToken;
      try {
        web3     = await import("@solana/web3.js");
      } catch (e) {
        return res.status(500).json({ error: `SDK missing: ${e.message}` });
      }

      const { Connection, PublicKey } = web3;
      const SOLANA_RPC   = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
      const LOCK_PROGRAM = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");
      const connection   = new Connection(SOLANA_RPC, "confirmed");
      const walletPk     = new PublicKey(wallet);
      const now          = Math.floor(Date.now() / 1000);

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
          pubkey: key,
          mint, sender, recipient,
          cliffEnd, startTime,
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
