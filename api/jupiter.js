export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url, method = "GET", body } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing url" });

  // Only allow Jupiter + Solana RPC domains
  const allowed = [
    "api.jup.ag",
    "tokens.jup.ag",
    "quote-api.jup.ag",
    "api.mainnet-beta.solana.com",
    "rpc.ankr.com",
  ];
  let hostname;
  try { hostname = new URL(url).hostname; } catch {
    return res.status(400).json({ error: "Invalid url" });
  }
  if (!allowed.some(d => hostname === d || hostname.endsWith("." + d))) {
    return res.status(403).json({ error: "Domain not allowed: " + hostname });
  }

  try {
    const fetchOptions = {
      method,
      headers: { "Content-Type": "application/json" },
    };

    if (process.env.JUPITER_API_KEY) {
      fetchOptions.headers["x-api-key"] = process.env.JUPITER_API_KEY;
    }

    if (method === "POST" && body !== undefined && body !== null) {
      // body may arrive as object or string — always serialize as JSON string
      fetchOptions.body = typeof body === "object" ? JSON.stringify(body) : body;
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();

    let data;
    try { data = JSON.parse(text); }
    catch { data = { raw: text }; }

    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Proxy error" });
  }
}
