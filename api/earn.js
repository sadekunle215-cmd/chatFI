// GET /api/earn?wallet=
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const { wallet } = req.query;
  try {
    const [tokensRes, posRes] = await Promise.all([
      fetch("https://api.jup.ag/lend/v1/earn/tokens"),
      wallet
        ? fetch(`https://api.jup.ag/lend/v1/earn/positions?users=${wallet}`)
        : Promise.resolve(null),
    ]);
    const tokens = await tokensRes.json();
    const positions = posRes ? await posRes.json() : null;
    return res.status(200).json({ tokens, positions });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
