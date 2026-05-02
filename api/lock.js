// api/lock.js — Jupiter Lock v1 proxy
// Handles two actions:
//   "accounts" → fetch all locks for a wallet (creator + recipient)
//   "create"   → build a lock transaction via Jupiter Lock API
//
// Drop this file into your /api folder alongside jupiter.js, send.js, etc.

const JUP_LOCK_API = "https://api.jup.ag/lock/v1";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, ...body } = req.body || {};

  try {
    // ── Action: fetch existing lock accounts for a wallet ─────────────────────
    if (action === "accounts") {
      const { wallet } = body;
      if (!wallet) return res.status(400).json({ error: "Missing wallet" });

      // Fetch both creator locks and recipient locks in parallel
      const [creatorRes, recipientRes] = await Promise.allSettled([
        fetch(`${JUP_LOCK_API}/locks?wallet=${wallet}`),
        fetch(`${JUP_LOCK_API}/locks?recipient=${wallet}`),
      ]);

      const accounts = [];

      for (const settled of [creatorRes, recipientRes]) {
        if (settled.status !== "fulfilled") continue;
        const r = settled.value;
        if (!r.ok) continue;
        const text = await r.text();
        if (!text) continue;
        try {
          const data = JSON.parse(text);
          const locks = data?.locks || data?.accounts || data || [];
          if (Array.isArray(locks)) accounts.push(...locks);
        } catch (_) {}
      }

      // Deduplicate by pubkey
      const seen = new Set();
      const unique = accounts.filter((a) => {
        const key = a.pubkey || a.id || a.address || JSON.stringify(a);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return res.status(200).json({ accounts: unique });
    }

    // ── Action: create a new lock (build transaction) ─────────────────────────
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = body;

      if (!funder || !mint || !amount) {
        return res.status(400).json({ error: "Missing required fields: funder, mint, amount" });
      }

      const payload = {
        funder,
        recipient: recipient || funder, // default recipient = funder (self-lock)
        mint,
        amount: String(amount),
        cliffSecs:   Number(cliffSecs)   || 0,
        vestingSecs: Number(vestingSecs) || 86400,
      };

      const jupRes = await fetch(`${JUP_LOCK_API}/create`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      const text = await jupRes.text();

      if (!text) {
        return res.status(502).json({
          error: `Jupiter Lock API returned empty response (HTTP ${jupRes.status})`,
        });
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        return res.status(502).json({
          error: `Jupiter Lock API returned invalid JSON: ${text.slice(0, 200)}`,
        });
      }

      if (!jupRes.ok) {
        return res.status(jupRes.status).json({
          error: data?.message || data?.error || `Jupiter Lock API error (${jupRes.status})`,
        });
      }

      // Jupiter returns: { transaction, escrow, blockhash, lastValidBlockHeight }
      return res.status(200).json(data);
    }

    // ── Unknown action ────────────────────────────────────────────────────────
    return res.status(400).json({ error: `Unknown action: "${action}"` });

  } catch (err) {
    console.error("[api/lock] Unhandled error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
