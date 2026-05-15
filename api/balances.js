// GET /api/balances?wallet=
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: "Missing wallet" });
  try {
    // Jupiter portfolio positions API
    const r = await fetch(`https://api.jup.ag/portfolio/v1/positions/${wallet}`);
    const data = await r.json();
    // Also get raw token balances
    const r2 = await fetch(`https://lite-api.jup.ag/ultra/v1/balances/${wallet}`);
    const data2 = await r2.json();
    return res.status(200).json({ portfolio: data, tokenBalances: data2?.tokenBalances || {} });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
