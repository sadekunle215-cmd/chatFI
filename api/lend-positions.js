// /api/lend-positions.js — Vercel serverless function
// Reads Jupiter Lend EARN positions (deposit/APY vaults) for a wallet.
// Uses REST API: GET https://api.jup.ag/lend/v1/earn/positions

const JUP_API_KEY = process.env.JUPITER_API_KEY || "";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { wallet } = req.query;
  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet query param" });
  }

  try {
    const url = `https://api.jup.ag/lend/v1/earn/positions?users=${encodeURIComponent(wallet)}`;
    const r = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(JUP_API_KEY ? { "x-api-key": JUP_API_KEY } : {}),
      },
    });

    if (!r.ok) {
      const text = await r.text();
      console.error("[/api/lend-positions] Jupiter API error:", r.status, text);
      return res.status(200).json({ positions: [], total: 0, wallet });
    }

    const data = await r.json();
    // data is an array of UserPosition objects, each with shares > "0" meaning an active deposit
    const positions = (Array.isArray(data) ? data : []).filter(p => p.shares && p.shares !== "0");

    const mapped = positions.map(p => ({
      symbol: p.token?.symbol || "?",
      mint: p.token?.assetAddress || p.token?.address,
      address: p.token?.address,
      decimals: p.token?.decimals || 6,
      shares: p.shares || "0",
      underlyingAssets: (Number(p.underlyingAssets || 0) / Math.pow(10, p.token?.decimals || 6)).toFixed(6),
      underlyingBalance: p.underlyingBalance || "0",
      logoUrl: p.token?.asset?.logo_url || "",
    }));

    return res.status(200).json({
      positions: mapped,
      total: mapped.length,
      wallet,
    });

  } catch (err) {
    console.error("[/api/lend-positions] error:", err);
    return res.status(200).json({
      positions: [],
      total: 0,
      wallet,
      error: err?.message || "Failed to fetch positions",
    });
  }
}
