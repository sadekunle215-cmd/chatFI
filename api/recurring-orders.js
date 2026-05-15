// GET /api/recurring-orders?wallet=&status=active
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const { wallet, status = "active" } = req.query;
  if (!wallet) return res.status(400).json({ error: "Missing wallet" });
  try {
    const r = await fetch(
      `https://api.jup.ag/recurring/v1/getRecurringOrders?user=${wallet}&recurringType=time&orderStatus=${status}&page=1&includeFailedTx=false`
    );
    const data = await r.json();
    return res.status(200).json(data);
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
