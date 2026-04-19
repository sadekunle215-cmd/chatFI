// api/jupiter.js — Vercel Serverless Proxy
// Injects Jupiter API key + forwards user IP so prediction markets aren't geo-blocked

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, method = "GET", body, forwardIp } = req.body;

  if (!url) return res.status(400).json({ error: "Missing url" });

  const API_KEY   = process.env.JUPITER_API_KEY || "";
  const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

  // Resolve special RPC placeholder
  const targetUrl = url === "SOLANA_RPC" ? SOLANA_RPC : url;

  const headers = {
    "Content-Type": "application/json",
    ...(API_KEY ? { "x-api-key": API_KEY } : {}),
  };

  // For prediction endpoints: forward user's real IP so Jupiter doesn't geo-block.
  // Vercel sets x-forwarded-for and cf-ipcountry from the user's actual request.
  if (forwardIp || (url && url.includes("/prediction/"))) {
    const userIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
                || req.headers["x-real-ip"]
                || "";
    const userCountry = req.headers["cf-ipcountry"] || "";

    if (userIp)      headers["x-forwarded-for"] = userIp;
    if (userCountry) headers["cf-ipcountry"]     = userCountry;
  }

  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
    };

    if (body && method.toUpperCase() !== "GET") {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    console.error("[api/jupiter] error:", err);
    return res.status(500).json({ error: err?.message || "Proxy error" });
  }
}
