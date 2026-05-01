// api/yield-vault.js
// Yield Vault CRUD — save, fetch, cancel vault configs in Firestore
// Uses Firebase Admin SDK (server-side only, never exposed to browser)

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Init Firebase Admin (once) ──────────────────────────────────────────────
function getDb() {
  if (!getApps().length) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY || "{}");
    } catch {
      throw new Error("FIREBASE_ADMIN_KEY env var is missing or invalid JSON");
    }
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let db;
  try {
    db = getDb();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const col = db.collection("yield_vaults");

  // ── GET /api/yield-vault?wallet=xxx ─────────────────────────────────────────
  // Returns all active vault configs for a wallet
  if (req.method === "GET") {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    try {
      const snap = await col
        .where("wallet", "==", wallet)
        .where("status", "==", "active")
        .get();
      const vaults = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ vaults });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST /api/yield-vault ───────────────────────────────────────────────────
  // Create a new vault config
  if (req.method === "POST") {
    const {
      wallet,            // user's wallet address
      earnPositionId,    // Jupiter Earn position identifier (assetMint)
      earnSymbol,        // e.g. "USDC"
      earnMint,          // underlying asset mint
      earnJlMint,        // jlToken mint (receipt token)
      depositedAmount,   // amount user originally deposited (for yield calc baseline)
      depositedValueUSD, // USD value at setup time (baseline for yield detection)
      thresholdUSD,      // trigger when yield >= this amount in USD
      targetTokenSymbol, // token to DCA into e.g. "SOL"
      targetTokenMint,   // mint of target token
      targetTokenDecimals,
    } = req.body;

    // Validate required fields
    if (!wallet || !earnMint || !thresholdUSD || !targetTokenMint) {
      return res.status(400).json({
        error: "Missing required fields: wallet, earnMint, thresholdUSD, targetTokenMint",
      });
    }

    // Check for existing active vault on same earn position
    const existing = await col
      .where("wallet", "==", wallet)
      .where("earnMint", "==", earnMint)
      .where("status", "==", "active")
      .get();

    if (!existing.empty) {
      // Update existing vault threshold/target instead of duplicating
      const docId = existing.docs[0].id;
      await col.doc(docId).update({
        thresholdUSD: parseFloat(thresholdUSD),
        targetTokenSymbol,
        targetTokenMint,
        targetTokenDecimals: targetTokenDecimals || 9,
        updatedAt: new Date().toISOString(),
      });
      return res.status(200).json({
        success: true,
        id: docId,
        action: "updated",
        message: `Yield Vault updated — will swap when yield reaches $${thresholdUSD}`,
      });
    }

    // Create new vault
    const doc = {
      wallet,
      earnPositionId: earnPositionId || earnMint,
      earnSymbol: earnSymbol || "Token",
      earnMint,
      earnJlMint: earnJlMint || null,
      depositedAmount: parseFloat(depositedAmount) || 0,
      depositedValueUSD: parseFloat(depositedValueUSD) || 0,
      thresholdUSD: parseFloat(thresholdUSD),
      targetTokenSymbol,
      targetTokenMint,
      targetTokenDecimals: targetTokenDecimals || 9,
      status: "active",            // active | paused | cancelled
      totalSwapped: 0,             // cumulative USD value swapped
      swapCount: 0,                // number of times triggered
      lastCheckedAt: null,
      lastTriggeredAt: null,
      lastTxSig: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await col.add(doc);
    return res.status(200).json({
      success: true,
      id: ref.id,
      action: "created",
      message: `Yield Vault active — will auto-swap when your ${earnSymbol || "Earn"} yield reaches $${thresholdUSD} into ${targetTokenSymbol}`,
    });
  }

  // ── DELETE /api/yield-vault?id=xxx&wallet=xxx ─────────────────────────────
  // Cancel a vault (soft delete — set status to cancelled)
  if (req.method === "DELETE") {
    const { id, wallet } = req.query;
    if (!id || !wallet) return res.status(400).json({ error: "id and wallet required" });
    try {
      const doc = col.doc(id);
      const snap = await doc.get();
      if (!snap.exists) return res.status(404).json({ error: "Vault not found" });
      if (snap.data().wallet !== wallet) return res.status(403).json({ error: "Forbidden" });
      await doc.update({
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return res.status(200).json({ success: true, message: "Yield Vault cancelled" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
