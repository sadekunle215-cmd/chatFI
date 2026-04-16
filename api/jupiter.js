export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let { url, method = "GET", body } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing url" });

  // Frontend sends "SOLANA_RPC" as placeholder — swapped server-side so key stays secret
  if (url === "SOLANA_RPC") {
    url = process.env.HELIUS_RPC_URL || "https://rpc.ankr.com/solana";
  }

  const allowed = [
    "api.jup.ag",           // main API (swap, trigger, portfolio, predictions, tokens, price, earn)
    "lite-api.jup.ag",      // free-tier fallback
    "earn.jup.ag",          // Jupiter Earn / Lend vaults
    "lend.jup.ag",          // Jupiter Lend (alt domain)
    "api.mainnet-beta.solana.com",
    "rpc.ankr.com",
    "mainnet.helius-rpc.com",
    "solana-mainnet.g.alchemy.com",
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

    // Jupiter uses "Authorization: Bearer <key>" — NOT x-api-key
    if (process.env.JUPITER_API_KEY) {
      fetchOptions.headers["Authorization"] = `Bearer ${process.env.JUPITER_API_KEY}`;
    }

    if (method === "POST" && body !== undefined && body !== null) {
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
