// GET /api/token-info?symbol= or ?mint=
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const { mint, symbol } = req.query;
  try {
    let id = mint;
    if (!id && symbol) {
      const s = await fetch(`https://api.jup.ag/tokens/v1/search?query=${encodeURIComponent(symbol)}&limit=1`);
      const sd = await s.json();
      id = sd?.[0]?.address || sd?.tokens?.[0]?.address;
    }
    if (!id) return res.status(404).json({ error: "Token not found" });
    const [infoRes, priceRes] = await Promise.all([
      fetch(`https://api.jup.ag/tokens/v1/token/${id}`),
      fetch(`https://api.jup.ag/price/v3?ids=${id}`),
    ]);
    const info = await infoRes.json();
    const priceData = await priceRes.json();
    const price = priceData?.[id]?.usdPrice || priceData?.data?.[id]?.price;
    return res.status(200).json({ ...info, price });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
