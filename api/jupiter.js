// api/jupiter.js — Vercel Serverless Proxy
// Injects Jupiter API key. Strips user IP headers so requests appear from Vercel's US server.

// Extend Vercel function timeout — portfolio/positions can take 5-15s aggregating 200+ protocols.
// Hobby plan max is 60s. Pro plan allows up to 300s if needed.
export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, method = "GET", body, triggerJwt } = req.body;

  if (!url) return res.status(400).json({ error: "Missing url" });

  const API_KEY    = process.env.JUPITER_API_KEY || "";
  const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

  // Resolve special RPC placeholder
  const targetUrl = url === "SOLANA_RPC" ? SOLANA_RPC : url;

  // Only send clean headers — no user IP, no country hints.
  // This ensures Jupiter sees Vercel's US server IP, not the user's Nigerian IP.
  const headers = {
    "Content-Type": "application/json",
    ...(API_KEY    ? { "x-api-key": API_KEY }              : {}),
    ...(triggerJwt ? { "Authorization": `Bearer ${triggerJwt}` } : {}),
  };

  // Per-endpoint timeout — portfolio/positions needs more time than price/swap calls
  const isPortfolio = targetUrl.includes("/portfolio/v1/positions");
  const timeoutMs   = isPortfolio ? 55_000 : 20_000;
  const controller  = new AbortController();
  const timer       = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
      signal: controller.signal,
    };

    if (body && method.toUpperCase() !== "GET") {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timer);

    // Safe parse: some endpoints (e.g. Lock API) return empty body or HTML on error.
    // response.json() would throw "Unexpected end of JSON input" in those cases.
    const text = await response.text();
    let data;
    try {
      data = text.trim() ? JSON.parse(text) : {};
    } catch {
      data = { error: `Non-JSON response (${response.status}): ${text.slice(0, 200)}` };
    }
    return res.status(response.status).json(data);

  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err?.name === "AbortError";
    console.error("[api/jupiter] error:", isTimeout ? `Timeout after ${timeoutMs}ms — ${targetUrl}` : err);
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? `Jupiter API timed out after ${timeoutMs / 1000}s` : (err?.message || "Proxy error"),
    });
  }
}
