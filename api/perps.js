// GET /api/perps?wallet=
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: "Missing wallet" });
  try {
    const r = await fetch(`https://api.jup.ag/perps/v1/positions?wallet=${wallet}`);
    const data = await r.json();
    return res.status(200).json(data);
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
