// api/yield-vault.js
// Yield Vault — CRUD + Cron Watcher merged into one file

export const config = { runtime: "nodejs" };
//
// Routes:
//   GET    /api/yield-vault?wallet=xxx          → fetch active vaults for wallet
//   POST   /api/yield-vault                     → create/update vault config
//   PATCH  /api/yield-vault                     → update threshold, target token, depositedAmount
//   DELETE /api/yield-vault?id=xxx&wallet=xxx   → cancel vault
//   GET    /api/yield-vault?cron=1              → watcher (called by Vercel cron)
//
// vercel.json crons entry:
//   { "path": "/api/yield-vault?cron=1", "schedule": "*/5 * * * *" }

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";

// ── Firebase Admin init ──────────────────────────────────────────────────────
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

// ── Delegate keypair (bot wallet that signs on behalf of users) ──────────────
function getDelegateKeypair() {
  const raw = process.env.DELEGATE_PRIVATE_KEY;
  if (!raw) throw new Error("DELEGATE_PRIVATE_KEY not set");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

const SOLANA_RPC =
  process.env.SOLANA_RPC ||
  process.env.HELIUS_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const JUP_EARN_API   = "https://api.jup.ag/lend/v1/earn";
const JUP_SWAP_ORDER = "https://api.jup.ag/swap/v2/order";
const JUP_SWAP_EXEC  = "https://api.jup.ag/swap/v2/execute";
const JUP_PRICE_API  = "https://api.jup.ag/price/v3";

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b64ToBytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToB64 = (bytes) => {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
};

// ── Fetch live Jupiter Earn position value ────────────────────────────────────
async function fetchEarnPositionValue(walletAddress, earnMint) {
  try {
    const res = await fetch(`${JUP_EARN_API}/positions?users=${walletAddress}`);
    if (!res.ok) throw new Error(`Earn API ${res.status}`);
    const data = await res.json();
    let positions = Array.isArray(data)
      ? data
      : data?.data || data?.positions ||
        Object.values(data || {}).flatMap((v) => (Array.isArray(v) ? v : []));
    const pos = positions.find(
      (p) =>
        p.assetMint === earnMint ||
        p.asset?.address === earnMint ||
        p.mint === earnMint ||
        p.token?.address === earnMint
    );
    if (!pos) return null;
    const dec = pos.token?.decimals ?? pos.asset?.decimals ?? pos.decimals ?? 6;
    // underlyingAssets = raw integer of user's balance in protocol (principal + interest)
    // underlyingBalance = wallet balance (NOT deposit) — ignore
    const ua = parseFloat(pos.underlyingAssets ?? 0);
    const currentAmount = ua > 0 ? ua / Math.pow(10, dec) : 0;
    return { currentAmount, decimals: dec, apy: pos.apy ?? pos.supplyApy ?? null, raw: pos };
  } catch (e) {
    console.error(`[YieldVault] fetchEarnPositionValue error:`, e.message);
    return null;
  }
}

// ── Fetch USD price for a mint ────────────────────────────────────────────────
async function fetchUSDPrice(mint) {
  try {
    const res = await fetch(`${JUP_PRICE_API}?ids=${mint}`);
    const data = await res.json();
    const info = data?.[mint];
    return info?.usdPrice ? parseFloat(info.usdPrice) : null;
  } catch { return null; }
}

// ── Withdraw yield from Jupiter Earn ─────────────────────────────────────────
async function withdrawYield(vault, yieldAmount, connection, delegateKp) {
  const res = await fetch(`${JUP_EARN_API}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: vault.wallet, mint: vault.earnMint, amount: yieldAmount.toString(), slippageBps: 50 }),
  });
  if (!res.ok) throw new Error(`Earn withdraw API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!data?.transaction) throw new Error(`No transaction in withdraw response`);
  const tx = VersionedTransaction.deserialize(b64ToBytes(data.transaction));
  tx.sign([delegateKp]);
  const rpcRes = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [bytesToB64(tx.serialize()), { encoding: "base64", skipPreflight: true }] }),
  });
  const rpcData = await rpcRes.json();
  const sig = rpcData?.result;
  if (!sig) throw new Error(rpcData?.error?.message || "Withdraw tx failed");
  await waitConfirmed(sig);
  return sig;
}

// ── Swap withdrawn yield into target token ────────────────────────────────────
async function swapYield(vault, yieldAmountRaw) {
  const { earnMint, targetTokenMint, wallet } = vault;
  const orderRes = await fetch(
    `${JUP_SWAP_ORDER}?inputMint=${earnMint}&outputMint=${targetTokenMint}&amount=${yieldAmountRaw}&taker=${wallet}&slippageBps=50`
  );
  if (!orderRes.ok) throw new Error(`Swap order API ${orderRes.status}: ${(await orderRes.text()).slice(0, 200)}`);
  const order = await orderRes.json();
  if (!order?.transaction) throw new Error(`No transaction in swap order`);
  const delegateKp = getDelegateKeypair();
  const tx = VersionedTransaction.deserialize(b64ToBytes(order.transaction));
  tx.sign([delegateKp]);
  const execRes = await fetch(JUP_SWAP_EXEC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedTransaction: bytesToB64(tx.serialize()), requestId: order.requestId }),
  });
  const execData = await execRes.json();
  if (execData?.error) throw new Error(JSON.stringify(execData.error));
  const sig = execData?.signature || execData?.txid;
  if (!sig) throw new Error("No signature from swap execute");
  await waitConfirmed(sig);
  return { sig, outAmount: execData?.outAmount };
}

// ── Wait for tx confirmation ──────────────────────────────────────────────────
async function waitConfirmed(sig, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2500);
    const res = await fetch(SOLANA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignatureStatuses", params: [[sig], { searchTransactionHistory: true }] }),
    });
    const data = await res.json();
    const status = data?.result?.value?.[0];
    if (status?.err) throw new Error("Tx failed on-chain: " + JSON.stringify(status.err));
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return;
  }
  throw new Error("Transaction confirmation timeout");
}

// ── Cron watcher logic ────────────────────────────────────────────────────────
async function runWatcher(req, res) {
  // Security: Vercel cron sends Authorization header with CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const log = [];
  const startTime = Date.now();

  try {
    const db = getDb();
    const delegateKp = getDelegateKeypair();
    const connection = new Connection(SOLANA_RPC, "confirmed");

    const snap = await db.collection("yield_vaults").where("status", "==", "active").get();
    if (snap.empty) return res.status(200).json({ message: "No active vaults", log });

    log.push(`Found ${snap.docs.length} active vault(s)`);

    for (const doc of snap.docs) {
      const vault = { id: doc.id, ...doc.data() };
      const vaultLog = [];

      try {
        await doc.ref.update({ lastCheckedAt: new Date().toISOString() });

        const position = await fetchEarnPositionValue(vault.wallet, vault.earnMint);
        if (!position) {
          await doc.ref.update({ status: "cancelled", cancelReason: "earn_position_closed", cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          vaultLog.push(`Auto-cancelled: earn position no longer found`);
          log.push(`[${vault.wallet.slice(0, 8)}] ${vaultLog.join(" | ")}`);
          continue;
        }

        const yieldAmount = Math.max(0, position.currentAmount - (vault.depositedAmount || 0));
        const priceUSD = await fetchUSDPrice(vault.earnMint);
        const yieldUSD = priceUSD ? yieldAmount * priceUSD : 0;

        vaultLog.push(`current=${position.currentAmount.toFixed(4)}, yield=${yieldAmount.toFixed(4)} (~$${yieldUSD.toFixed(2)}), threshold=$${vault.thresholdUSD}`);

        if (yieldUSD < vault.thresholdUSD) {
          vaultLog.push(`Below threshold — skipping`);
          log.push(`[${vault.wallet.slice(0, 8)}] ${vaultLog.join(" | ")}`);
          continue;
        }

        vaultLog.push(`THRESHOLD HIT — initiating withdraw + swap`);

        const withdrawSig = await withdrawYield(vault, yieldAmount, connection, delegateKp);
        vaultLog.push(`Withdraw OK: ${withdrawSig.slice(0, 20)}...`);
        await sleep(3000);

        const yieldAmountRaw = Math.floor(yieldAmount * Math.pow(10, position.decimals));
        const { sig: swapSig, outAmount } = await swapYield(vault, yieldAmountRaw);
        vaultLog.push(`Swap OK: ${swapSig.slice(0, 20)}...`);

        await doc.ref.update({
          swapCount: (vault.swapCount || 0) + 1,
          totalSwapped: (vault.totalSwapped || 0) + yieldUSD,
          lastTriggeredAt: new Date().toISOString(),
          lastTxSig: swapSig,
          lastWithdrawSig: withdrawSig,
          lastYieldUSD: yieldUSD,
          updatedAt: new Date().toISOString(),
        });

        await db.collection("yield_vault_notifications").add({
          wallet: vault.wallet,
          vaultId: vault.id,
          earnSymbol: vault.earnSymbol,
          targetTokenSymbol: vault.targetTokenSymbol,
          yieldUSD: yieldUSD.toFixed(2),
          withdrawSig,
          swapSig,
          outAmount: outAmount || null,
          read: false,
          createdAt: new Date().toISOString(),
        });

        vaultLog.push(`SUCCESS — $${yieldUSD.toFixed(2)} rotated into ${vault.targetTokenSymbol}`);
      } catch (vaultErr) {
        vaultLog.push(`ERROR: ${vaultErr.message}`);
        await doc.ref.update({ lastError: vaultErr.message, lastErrorAt: new Date().toISOString() }).catch(() => {});
      }

      log.push(`[${vault.wallet.slice(0, 8)}] ${vaultLog.join(" | ")}`);
      await sleep(500);
    }

    return res.status(200).json({ success: true, processed: snap.docs.length, elapsed: `${Date.now() - startTime}ms`, log });
  } catch (err) {
    console.error("[YieldVaultWatcher]", err);
    return res.status(500).json({ error: err.message, log });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Cron watcher — GET ?cron=1
  if (req.method === "GET" && req.query.cron === "1") {
    return runWatcher(req, res);
  }

  let db;
  try { db = getDb(); } catch (e) { return res.status(500).json({ error: e.message }); }

  const col = db.collection("yield_vaults");

  // GET /api/yield-vault?wallet=xxx
  if (req.method === "GET") {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    try {
      const snap = await col.where("wallet", "==", wallet).where("status", "==", "active").get();
      return res.status(200).json({ vaults: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // POST /api/yield-vault
  if (req.method === "POST") {
    const { wallet, earnPositionId, earnSymbol, earnMint, earnJlMint, depositedAmount, depositedValueUSD, thresholdUSD, targetTokenSymbol, targetTokenMint, targetTokenDecimals } = req.body;
    if (!wallet || !earnMint || !thresholdUSD || !targetTokenMint) {
      return res.status(400).json({ error: "Missing required fields: wallet, earnMint, thresholdUSD, targetTokenMint" });
    }
    const existing = await col.where("wallet", "==", wallet).where("earnMint", "==", earnMint).where("status", "==", "active").get();
    if (!existing.empty) {
      const docId = existing.docs[0].id;
      await col.doc(docId).update({ thresholdUSD: parseFloat(thresholdUSD), targetTokenSymbol, targetTokenMint, targetTokenDecimals: targetTokenDecimals || 9, updatedAt: new Date().toISOString() });
      return res.status(200).json({ success: true, id: docId, action: "updated" });
    }
    const ref = await col.add({
      wallet, earnPositionId: earnPositionId || earnMint, earnSymbol: earnSymbol || "Token",
      earnMint, earnJlMint: earnJlMint || null,
      depositedAmount: parseFloat(depositedAmount) || 0, depositedValueUSD: parseFloat(depositedValueUSD) || 0,
      thresholdUSD: parseFloat(thresholdUSD), targetTokenSymbol, targetTokenMint,
      targetTokenDecimals: targetTokenDecimals || 9, status: "active",
      totalSwapped: 0, swapCount: 0,
      lastCheckedAt: null, lastTriggeredAt: null, lastTxSig: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    return res.status(200).json({ success: true, id: ref.id, action: "created" });
  }

  // PATCH /api/yield-vault — update threshold, target token, and/or depositedAmount
  if (req.method === "PATCH") {
    const { id, wallet, targetTokenSymbol, targetTokenMint, targetTokenDecimals, thresholdUSD, depositedAmount } = req.body;
    if (!id || !wallet) return res.status(400).json({ error: "id and wallet required" });
    try {
      const doc = col.doc(id);
      const snap = await doc.get();
      if (!snap.exists) return res.status(404).json({ error: "Vault not found" });
      if (snap.data().wallet !== wallet) return res.status(403).json({ error: "Forbidden" });
      const updates = { updatedAt: new Date().toISOString() };
      if (targetTokenSymbol  !== undefined) updates.targetTokenSymbol  = targetTokenSymbol;
      if (targetTokenMint    !== undefined) updates.targetTokenMint    = targetTokenMint;
      if (targetTokenDecimals !== undefined) updates.targetTokenDecimals = targetTokenDecimals ?? 6;
      if (thresholdUSD       !== undefined) updates.thresholdUSD       = parseFloat(thresholdUSD);
      // depositedAmount sync — sent by frontend when user partially withdraws from Earn
      if (depositedAmount    !== undefined) updates.depositedAmount    = parseFloat(depositedAmount);
      await doc.update(updates);
      return res.status(200).json({ success: true, id });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // DELETE /api/yield-vault?id=xxx&wallet=xxx
  if (req.method === "DELETE") {
    const { id, wallet } = req.query;
    if (!id || !wallet) return res.status(400).json({ error: "id and wallet required" });
    try {
      const doc = col.doc(id);
      const snap = await doc.get();
      if (!snap.exists) return res.status(404).json({ error: "Vault not found" });
      if (snap.data().wallet !== wallet) return res.status(403).json({ error: "Forbidden" });
      await doc.update({ status: "cancelled", cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      return res.status(200).json({ success: true, message: "Yield Vault cancelled" });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
