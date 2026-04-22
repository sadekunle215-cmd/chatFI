// api/jupiter.js — Vercel Serverless Proxy
// Injects Jupiter API key. Strips user IP headers so requests appear from Vercel's US server.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, method = "GET", body } = req.body;

  if (!url) return res.status(400).json({ error: "Missing url" });

  const API_KEY    = process.env.JUPITER_API_KEY || "";
  const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

  // Resolve special RPC placeholder
  const targetUrl = url === "SOLANA_RPC" ? SOLANA_RPC : url;

  // Only send clean headers — no user IP, no country hints.
  // This ensures Jupiter sees Vercel's US server IP, not the user's Nigerian IP.
  const headers = {
    "Content-Type": "application/json",
    ...(API_KEY ? { "x-api-key": API_KEY } : {}),
  };

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
