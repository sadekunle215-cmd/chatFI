// GET /api/trigger-orders?wallet=&state=active
// Proxies Jupiter Trigger v2 — no JWT needed for read
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const { wallet, state = "active" } = req.query;
  if (!wallet) return res.status(400).json({ error: "Missing wallet" });
  try {
    // Try v2 first (active/inactive)
    const r = await fetch(
      `https://api.jup.ag/trigger/v2/orders/history?state=${state}&limit=30&offset=0`,
      { headers: { "x-wallet": wallet } }
    );
    const data = await r.json();
    if (data?.orders) return res.status(200).json(data);
    // Fallback: v1
    const r2 = await fetch(
      `https://api.jup.ag/trigger/v1/getTriggerOrders?wallet=${wallet}&status=${state === "active" ? "open" : "completed"}`
    );
    const data2 = await r2.json();
    return res.status(200).json({ orders: data2?.orders || data2 || [] });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
