// api/yield-vault.js
// Yield Vault — CRUD + Cron Watcher + Telegram Notifications

export const config = { runtime: "nodejs" };
//
// Routes:
//   GET    /api/yield-vault?wallet=xxx                → fetch active vaults for wallet
//   POST   /api/yield-vault                           → create/update vault config
//   PATCH  /api/yield-vault                           → update threshold, target token, depositedAmount
//   DELETE /api/yield-vault?id=xxx&wallet=xxx         → cancel vault
//   GET    /api/yield-vault?cron=1                    → watcher (called by cron-job.org)
//   POST   /api/yield-vault?action=link-telegram      → generate magic link token
//   POST   /api/yield-vault?action=telegram-webhook   → Telegram bot webhook receiver
//
// vercel.json crons entry (or use cron-job.org):
//   { "path": "/api/yield-vault?cron=1",       "schedule": "*/5 * * * *" }   ← yield harvest watcher (every 5 min)
//   { "path": "/api/yield-vault?cron=rotator", "schedule": "0 */12 * * *" }  ← APY rotator alerts (every 12 hrs)
//
// Telegram setup:
//   1. Create bot via @BotFather → get token → add as TELEGRAM_BOT_TOKEN in Vercel
//   2. Set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://chatfi.pro/api/yield-vault?action=telegram-webhook

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import crypto from "crypto";

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

// ── Delegate keypair ─────────────────────────────────────────────────────────
function getDelegateKeypair() {
  const raw = process.env.DELEGATE_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("DELEGATE_PRIVATE_KEY not set");
  // Support both JSON array [1,2,3...] and base58 string formats
  if (raw.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  // Base58 decode — manual implementation (no bs58 dependency needed)
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let bytes = BigInt(0);
  for (const char of raw) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base58 character in DELEGATE_PRIVATE_KEY");
    bytes = bytes * BigInt(58) + BigInt(idx);
  }
  const hex = bytes.toString(16).padStart(128, "0");
  const arr = new Uint8Array(64);
  for (let i = 0; i < 64; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return Keypair.fromSecretKey(arr);
}

const SOLANA_RPC =
  process.env.SOLANA_RPC ||
  process.env.HELIUS_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const JUP_EARN_API   = "https://api.jup.ag/lend/v1/earn";
const JUP_SWAP_ORDER = "https://api.jup.ag/swap/v2/order";
const JUP_SWAP_EXEC  = "https://api.jup.ag/swap/v2/execute";
const JUP_PRICE_API  = "https://api.jup.ag/price/v3";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://chatfi.pro";

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

// ── Telegram: send message ────────────────────────────────────────────────────
async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN not set — skipping notification");
    return;
  }
  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    };
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[Telegram] sendMessage failed:", err);
    }
  } catch (e) {
    console.error("[Telegram] sendMessage error:", e.message);
  }
}

// ── Telegram: notify yield ready ─────────────────────────────────────────────
async function notifyYieldReady(vault, yieldUSD, isReminder = false) {
  const db = getDb();
  const userSnap = await db
    .collection("chatfi_users")
    .where("wallet", "==", vault.wallet)
    .limit(1)
    .get();

  if (userSnap.empty) return;
  const user = userSnap.docs[0].data();
  if (!user.telegramChatId) return;

  const harvestUrl = `${APP_URL}/?harvest=${vault.id}`;
  const pingCount = (vault.pendingHarvestPingCount || 0) + 1;

  const message = isReminder
    ? `🔔 <b>Reminder #${pingCount} — Yield Still Waiting</b>\n\n` +
      `Your <b>${vault.earnSymbol}</b> vault has <b>$${yieldUSD.toFixed(2)}</b> in yield ready to harvest into <b>${vault.targetTokenSymbol}</b>.\n\n` +
      `Tap below to harvest now 👇`
    : `🌾 <b>Yield Ready — ChatFi</b>\n\n` +
      `Your <b>${vault.earnSymbol}</b> vault has accumulated <b>$${yieldUSD.toFixed(2)}</b> in yield.\n\n` +
      `Target: <b>${vault.targetTokenSymbol}</b>\n` +
      `Threshold: <b>$${vault.thresholdUSD}</b>\n\n` +
      `Tap below to harvest now 👇`;

  const replyMarkup = {
    inline_keyboard: [[
      { text: "🚀 Harvest Now", url: harvestUrl },
    ]],
  };

  await sendTelegramMessage(user.telegramChatId, message, replyMarkup);
}

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

// ── Cron watcher ─────────────────────────────────────────────────────────────
async function runWatcher(req, res) {
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

        const storedDeposit = vault.depositedAmount || 0;
        const priceUSD = await fetchUSDPrice(vault.earnMint);

        // ── Detect partial unstake: current balance dropped below stored baseline ──
        // If the user manually withdrew some (or all) of their principal outside the app,
        // reset depositedAmount to the new lower balance so the yield baseline stays correct.
        // Without this, yieldAmount would be negative → clamped to 0 forever.
        if (position.currentAmount < storedDeposit && storedDeposit > 0) {
          const diff = storedDeposit - position.currentAmount;
          const diffUSD = priceUSD ? diff * priceUSD : 0;
          await doc.ref.update({
            depositedAmount: position.currentAmount,
            updatedAt: new Date().toISOString(),
          });
          vaultLog.push(`Partial unstake detected — depositedAmount reset from ${storedDeposit.toFixed(4)} to ${position.currentAmount.toFixed(4)} (~$${diffUSD.toFixed(2)} withdrawn externally)`);
          // Update local vault object so yield calc below uses the new baseline
          vault.depositedAmount = position.currentAmount;
        }

        const yieldAmount = Math.max(0, position.currentAmount - (vault.depositedAmount || 0));
        const yieldUSD = priceUSD ? yieldAmount * priceUSD : 0;

        vaultLog.push(`current=${position.currentAmount.toFixed(4)}, yield=${yieldAmount.toFixed(4)} (~$${yieldUSD.toFixed(2)}), threshold=$${vault.thresholdUSD}`);

        if (yieldUSD < vault.thresholdUSD) {
          // ── If was pending but yield dropped below threshold (user harvested externally) ──
          if (vault.pendingHarvest) {
            await doc.ref.update({ pendingHarvest: false, pendingHarvestYieldUSD: null, pendingHarvestAlertedAt: null, updatedAt: new Date().toISOString() });
            vaultLog.push(`Pending harvest cleared — yield dropped below threshold`);
          } else {
            vaultLog.push(`Below threshold — skipping`);
          }
          log.push(`[${vault.wallet.slice(0, 8)}] ${vaultLog.join(" | ")}`);
          continue;
        }

        // ── Threshold hit — decide whether to send alert ────────────────────
        const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
        const now = Date.now();
        const lastAlerteAt = vault.pendingHarvestAlertedAt ? new Date(vault.pendingHarvestAlertedAt).getTime() : 0;
        const isFirstAlert = !vault.pendingHarvest;
        const isDueForPing = (now - lastAlerteAt) >= PING_INTERVAL_MS;

        if (isFirstAlert || isDueForPing) {
          vaultLog.push(`THRESHOLD HIT — ${isFirstAlert ? "first alert" : "repeat ping"}`);

          // ── Auto-harvest if user opted in ────────────────────────────────
          if (vault.autoHarvest) {
            try {
              vaultLog.push(`Auto-harvest enabled — executing withdraw + swap...`);
              const withdrawSig = await withdrawYield(vault, Math.floor(yieldAmount * Math.pow(10, vault.earnDecimals ?? 6)), connection, delegateKp);
              vaultLog.push(`Withdraw confirmed: ${withdrawSig}`);
              const { sig: swapSig, outAmount } = await swapYield(vault, Math.floor(yieldAmount * Math.pow(10, vault.earnDecimals ?? 6)));
              vaultLog.push(`Swap confirmed: ${swapSig}`);

              // Notify user via Telegram
              const userSnap = await db.collection("chatfi_users").where("wallet", "==", vault.wallet).limit(1).get();
              if (!userSnap.empty && userSnap.docs[0].data().telegramChatId) {
                const chatId = userSnap.docs[0].data().telegramChatId;
                const outHuman = outAmount ? (Number(outAmount) / Math.pow(10, vault.targetTokenDecimals ?? 6)).toFixed(4) : "?";
                const msg =
                  `✅ <b>Auto-Harvest Complete — ChatFi</b>

` +
                  `Your <b>${vault.earnSymbol}</b> vault yield of <b>$${yieldUSD.toFixed(2)}</b> has been automatically harvested and swapped into <b>${outHuman} ${vault.targetTokenSymbol}</b>.

` +
                  `<a href="https://solscan.io/tx/${swapSig}">View transaction on Solscan</a>`;
                const markup = { inline_keyboard: [[{ text: "Open ChatFi", url: APP_URL }]] };
                await sendTelegramMessage(chatId, msg, markup);
              }

              // Update vault — reset yield tracking
              await doc.ref.update({
                depositedAmount: position.currentAmount - yieldAmount + (Number(outAmount ?? 0) / Math.pow(10, vault.earnDecimals ?? 6)),
                pendingHarvest: false,
                pendingHarvestYieldUSD: null,
                lastAutoHarvestAt: new Date().toISOString(),
                lastAutoHarvestYieldUSD: yieldUSD,
                updatedAt: new Date().toISOString(),
              });
              log.push(`[${vault.wallet.slice(0, 8)}] Auto-harvest SUCCESS — $${yieldUSD.toFixed(2)}`);
              continue; // skip manual alert
            } catch (autoErr) {
              vaultLog.push(`Auto-harvest FAILED: ${autoErr.message} — falling back to manual alert`);
            }
          }

          // ── Send Telegram notification (manual harvest) ───────────────────
          await notifyYieldReady(vault, yieldUSD, !isFirstAlert);
          vaultLog.push(`Telegram ${isFirstAlert ? "alert" : "reminder"} sent`);

          // ── Update vault state ────────────────────────────────────────────
          await doc.ref.update({
            pendingHarvest: true,
            pendingHarvestYieldUSD: yieldUSD,
            pendingHarvestYieldAmount: yieldAmount,
            pendingHarvestDetectedAt: isFirstAlert ? new Date().toISOString() : (vault.pendingHarvestDetectedAt || new Date().toISOString()),
            pendingHarvestAlertedAt: new Date().toISOString(),
            pendingHarvestPingCount: (vault.pendingHarvestPingCount || 0) + 1,
            lastTriggeredAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          if (isFirstAlert) {
            await db.collection("yield_vault_notifications").add({
              wallet: vault.wallet,
              vaultId: vault.id,
              earnSymbol: vault.earnSymbol,
              targetTokenSymbol: vault.targetTokenSymbol,
              yieldUSD: yieldUSD.toFixed(2),
              type: "harvest_ready",
              read: false,
              createdAt: new Date().toISOString(),
            });
          }

          vaultLog.push(`SUCCESS — $${yieldUSD.toFixed(2)} pending harvest into ${vault.targetTokenSymbol} (ping #${(vault.pendingHarvestPingCount || 0) + 1})`);
        } else {
          const nextPingMs = PING_INTERVAL_MS - (now - lastAlerteAt);
          const nextPingMins = Math.ceil(nextPingMs / 60000);
          vaultLog.push(`Pending harvest — next ping in ~${nextPingMins} min`);
        }
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

// ── Yield Rotator: fetch all Jupiter Earn pools ───────────────────────────────
async function fetchAllEarnPools() {
  try {
    const res = await fetch("https://lend-api.jup.ag/api/v1/markets", {
      headers: { "Content-Type": "application/json", ...(process.env.JUP_API_KEY ? { "x-api-key": process.env.JUP_API_KEY } : {}) },
    });
    if (!res.ok) throw new Error(`Markets API ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : data?.markets || data?.data || [];
  } catch (e) {
    console.error("[YieldRotator] fetchAllEarnPools error:", e.message);
    return [];
  }
}

// ── Yield Rotator: fetch earn positions for a wallet ──────────────────────────
async function fetchEarnPositionsForWallet(wallet) {
  try {
    const res = await fetch(`https://lend-api.jup.ag/api/v1/positions?users=${wallet}`, {
      headers: { "Content-Type": "application/json", ...(process.env.JUP_API_KEY ? { "x-api-key": process.env.JUP_API_KEY } : {}) },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data?.data || data?.positions || [];
  } catch { return []; }
}

// ── Yield Rotator: find best pool for each position ───────────────────────────
function findBestPool(positions, allPools) {
  const ops = [];
  for (const pos of positions) {
    const posMint   = pos.asset?.mint || pos.mint || pos.tokenMint || pos.assetMint || "";
    const posSym    = pos.asset?.symbol || pos.assetSymbol || pos.symbol || posMint.slice(0, 6);
    const posApy    = parseFloat(pos.supplyApy ?? pos.apy ?? pos.lendingApy ?? pos.rate ?? 0);
    const posAmt    = parseFloat(pos.underlyingBalance ?? pos.underlyingAssets ?? pos.depositedAmount ?? pos.amount ?? 0);
    const posPoolId = pos.planId || pos.poolId || pos.marketId || "";
    if (posAmt <= 0) continue;

    let bestPool = null, bestApy = posApy;
    for (const pool of allPools) {
      const poolApy = parseFloat(pool.supplyApy ?? pool.apy ?? pool.lendingApy ?? pool.rate ?? 0);
      const poolId  = pool.planId || pool.id || pool.poolId || "";
      if (poolId && posPoolId && poolId === posPoolId) continue;
      if (poolApy > bestApy) { bestApy = poolApy; bestPool = pool; }
    }

    if (bestPool) {
      ops.push({
        posSym, posApy, posPoolId,
        bestSym: bestPool.asset?.symbol || bestPool.mint?.slice(0, 6) || "?",
        bestApy,
        apyGap: bestApy - posApy,
        isCrossAsset: (bestPool.asset?.mint || bestPool.mint || "") !== posMint,
      });
    }
  }
  return ops.sort((a, b) => b.apyGap - a.apyGap);
}

// ── Yield Rotator cron watcher ────────────────────────────────────────────────
async function runRotatorWatcher(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const log = [];
  const startTime = Date.now();

  try {
    const db = getDb();

    // 1. Fetch all live pools once
    const allPools = await fetchAllEarnPools();
    if (!allPools.length) return res.status(200).json({ message: "No pools returned — skipping", log });

    // 2. Get all wallets that have Telegram linked (reuse chatfi_users collection)
    const usersSnap = await db.collection("chatfi_users").where("telegramChatId", "!=", "").get();
    if (usersSnap.empty) return res.status(200).json({ message: "No Telegram-linked users", log });

    log.push(`Checking ${usersSnap.docs.length} wallet(s) against ${allPools.length} pool(s)`);

    let alertsSent = 0;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const { wallet, telegramChatId } = user;
      if (!wallet || !telegramChatId) continue;

      try {
        const positions = await fetchEarnPositionsForWallet(wallet);
        if (!positions.length) continue;

        const ops = findBestPool(positions, allPools);
        if (!ops.length) { log.push(`[${wallet.slice(0, 8)}] No better pool found`); continue; }

        const best = ops[0];

        // Check rotator state doc to avoid spam-alerting same pool
        const rotatorRef = db.collection("yield_rotators").doc(wallet.slice(0, 32));
        const rotatorSnap = await rotatorRef.get();
        const rotatorData = rotatorSnap.exists ? rotatorSnap.data() : {};

        // Skip if we already alerted for this same target pool within the last 12 hours
        const lastAlertPool   = rotatorData.lastAlertPool || "";
        const lastAlertAt     = rotatorData.lastAlertAt ? new Date(rotatorData.lastAlertAt).getTime() : 0;
        const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
        const alreadyAlerted  = lastAlertPool === best.bestSym && (Date.now() - lastAlertAt) < FIVE_HOURS_MS;

        if (alreadyAlerted) {
          const nextAlertMins = Math.ceil((FIVE_HOURS_MS - (Date.now() - lastAlertAt)) / 60000);
          log.push(`[${wallet.slice(0, 8)}] Already alerted for ${best.bestSym} — next in ~${nextAlertMins} min`);
          continue;
        }

        // Build alert — show repeat count if user has been notified before
        // Reset count if the best pool has changed (new opportunity)
        const alertCount = lastAlertPool !== best.bestSym ? 1 : (rotatorData.alertCount || 0) + 1;
        const isRepeat   = alertCount > 1;
        const msg =
          `📈 <b>${isRepeat ? `Reminder #${alertCount} — ` : ""}Better Yield Available — ChatFi</b>\n\n` +
          `Your <b>${best.posSym} Earn</b> is earning <b>${best.posApy.toFixed(2)}% APY</b>.\n\n` +
          `A better pool is available:\n` +
          `<b>${best.bestSym} Earn</b> — <b>${best.bestApy.toFixed(2)}% APY</b>` +
          (best.isCrossAsset ? ` <i>(includes a swap)</i>` : ``) + `\n\n` +
          `Potential gain: <b>+${best.apyGap.toFixed(2)}% more APY</b>\n\n` +
          `Tap below to migrate with one tap on ChatFi 👇`;

        const markup = {
          inline_keyboard: [[
            { text: "Migrate Now", url: `${APP_URL}` },
          ]],
        };
        await sendTelegramMessage(telegramChatId, msg, markup);
        alertsSent++;

        // Persist state — track alert count so reminders show "Reminder #N"
        await rotatorRef.set({
          wallet,
          lastAlertPool: best.bestSym,
          lastAlertAt:   new Date().toISOString(),
          alertCount,
        }, { merge: true });

        log.push(`[${wallet.slice(0, 8)}] Alert #${alertCount} sent — ${best.posSym} ${best.posApy.toFixed(2)}% → ${best.bestSym} ${best.bestApy.toFixed(2)}%`);
        await sleep(300);
      } catch (e) {
        log.push(`[${wallet.slice(0, 8)}] ERROR: ${e.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      checked:    usersSnap.docs.length,
      alertsSent,
      pools:      allPools.length,
      elapsed:    `${Date.now() - startTime}ms`,
      log,
    });

  } catch (err) {
    console.error("[YieldRotatorWatcher]", err);
    return res.status(500).json({ error: err.message, log });
  }
}

// ── Telegram: notify vault created ───────────────────────────────────────────
async function handleNotifyVaultCreated(req, res) {
  const { wallet, earnSymbol, targetTokenSymbol, thresholdUSD } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  try {
    const db = getDb();
    const userSnap = await db.collection("chatfi_users").where("wallet", "==", wallet).limit(1).get();
    if (userSnap.empty || !userSnap.docs[0].data().telegramChatId) {
      return res.status(200).json({ sent: false, reason: "no telegram linked" });
    }

    const chatId = userSnap.docs[0].data().telegramChatId;
    const message =
      `🌾 <b>Yield Vault Activated!</b>\n\n` +
      `Your <b>${earnSymbol || "Earn"}</b> position is now being monitored.\n\n` +
      `When yield reaches <b>$${thresholdUSD}</b>, it will be swapped into <b>${targetTokenSymbol}</b>. I'll ping you here when it's time to harvest.\n\n` +
      `<i>You'll receive reminders every 10 minutes until you harvest.</i>`;

    await sendTelegramMessage(chatId, message);
    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error("[notifyVaultCreated]", e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── Telegram: notify vault cancelled ─────────────────────────────────────────
async function handleNotifyVaultCancelled(req, res) {
  const { wallet, earnSymbol } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  try {
    const db = getDb();
    const userSnap = await db.collection("chatfi_users").where("wallet", "==", wallet).limit(1).get();
    if (userSnap.empty || !userSnap.docs[0].data().telegramChatId) {
      return res.status(200).json({ sent: false, reason: "no telegram linked" });
    }

    const chatId = userSnap.docs[0].data().telegramChatId;
    const message =
      `❌ <b>Yield Vault Cancelled</b>\n\n` +
      `Your <b>${earnSymbol || "Earn"}</b> vault has been cancelled.\n\n` +
      `Your principal remains in Jupiter Earn and continues earning. You can set up a new vault anytime from <a href="${APP_URL}">ChatFi</a>.`;

    await sendTelegramMessage(chatId, message);
    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error("[notifyVaultCancelled]", e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── Telegram: notify vault updated ───────────────────────────────────────────
async function handleNotifyVaultUpdated(req, res) {
  const { wallet, earnSymbol, targetTokenSymbol, thresholdUSD } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  try {
    const db = getDb();
    const userSnap = await db.collection("chatfi_users").where("wallet", "==", wallet).limit(1).get();
    if (userSnap.empty || !userSnap.docs[0].data().telegramChatId) {
      return res.status(200).json({ sent: false, reason: "no telegram linked" });
    }

    const chatId = userSnap.docs[0].data().telegramChatId;
    const message =
      `✏️ <b>Yield Vault Updated</b>\n\n` +
      `Your <b>${earnSymbol || "Earn"}</b> vault settings have been updated.\n\n` +
      `${targetTokenSymbol ? `Target token: <b>${targetTokenSymbol}</b>\n` : ""}` +
      `${thresholdUSD ? `Threshold: <b>$${thresholdUSD}</b>\n` : ""}` +
      `\nChanges are live immediately.`;

    await sendTelegramMessage(chatId, message);
    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error("[notifyVaultUpdated]", e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── Telegram: notify rotation complete ───────────────────────────────────────
async function handleNotifyRotationComplete(req, res) {
  const { wallet, posSym, bestSym, posApy, bestApy, depositSig, isCrossAsset } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  try {
    const db = getDb();
    const userSnap = await db.collection("chatfi_users").where("wallet", "==", wallet).limit(1).get();
    if (userSnap.empty || !userSnap.docs[0].data().telegramChatId) {
      return res.status(200).json({ sent: false, reason: "no telegram linked" });
    }

    const chatId = userSnap.docs[0].data().telegramChatId;
    const apyGain = bestApy && posApy ? (parseFloat(bestApy) - parseFloat(posApy)).toFixed(2) : null;
    const solscanUrl = depositSig ? `https://solscan.io/tx/${depositSig}` : null;

    const message =
      `✅ <b>Yield Migration Complete — ChatFi</b>

` +
      `Your position has been successfully migrated.

` +
      `<b>${posSym || "?"} Earn</b> (${parseFloat(posApy).toFixed(2)}% APY)
` +
      `➜ <b>${bestSym || "?"} Earn</b> (${parseFloat(bestApy).toFixed(2)}% APY)

` +
      (apyGain ? `You are now earning <b>+${apyGain}% more APY</b>.

` : "") +
      (isCrossAsset ? `<i>A cross-asset swap was performed automatically.</i>

` : "") +
      (solscanUrl ? `<a href="${solscanUrl}">View transaction on Solscan</a>` : "");

    const markup = {
      inline_keyboard: [[
        { text: "Open ChatFi", url: APP_URL },
      ]],
    };

    await sendTelegramMessage(chatId, message, markup);

    // Clear rotator alert state so next check starts fresh after migration
    try {
      const rotatorRef = db.collection("yield_rotators").doc(wallet.slice(0, 32));
      await rotatorRef.set({ lastAlertPool: "", lastAlertAt: null, alertCount: 0 }, { merge: true });
    } catch { /* non-fatal */ }

    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error("[notifyRotationComplete]", e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── Enable auto-harvest for a vault ─────────────────────────────────────────
async function handleEnableAutoHarvest(req, res) {
  const { wallet, vaultId } = req.body;
  if (!wallet || !vaultId) return res.status(400).json({ error: "wallet and vaultId required" });
  try {
    const db = getDb();
    const ref = db.collection("yield_vaults").doc(vaultId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().wallet !== wallet) {
      return res.status(403).json({ error: "Vault not found or wallet mismatch" });
    }
    await ref.update({ autoHarvest: true, autoHarvestEnabledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    // Notify user via Telegram
    const userSnap = await db.collection("chatfi_users").where("wallet", "==", wallet).limit(1).get();
    if (!userSnap.empty && userSnap.docs[0].data().telegramChatId) {
      const chatId = userSnap.docs[0].data().telegramChatId;
      const vault = doc.data();
      const msg =
        `⚡ <b>Auto-Harvest Enabled — ChatFi</b>

` +
        `Your <b>${vault.earnSymbol}</b> vault will now automatically harvest and swap yield into <b>${vault.targetTokenSymbol}</b> when your $${vault.thresholdUSD} threshold is reached.

` +
        `You can disable this anytime from ChatFi.`;
      await sendTelegramMessage(chatId, msg, { inline_keyboard: [[{ text: "Open ChatFi", url: APP_URL }]] });
    }

    return res.status(200).json({ success: true, autoHarvest: true });
  } catch (e) {
    console.error("[enableAutoHarvest]", e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── Disable auto-harvest for a vault ─────────────────────────────────────────
async function handleDisableAutoHarvest(req, res) {
  const { wallet, vaultId } = req.body;
  if (!wallet || !vaultId) return res.status(400).json({ error: "wallet and vaultId required" });
  try {
    const db = getDb();
    const ref = db.collection("yield_vaults").doc(vaultId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().wallet !== wallet) {
      return res.status(403).json({ error: "Vault not found or wallet mismatch" });
    }
    await ref.update({ autoHarvest: false, autoHarvestDisabledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return res.status(200).json({ success: true, autoHarvest: false });
  } catch (e) {
    console.error("[disableAutoHarvest]", e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── Telegram magic link: generate token ──────────────────────────────────────
async function handleLinkTelegram(req, res) {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const db = getDb();
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min expiry

  // Store token in Firestore
  await db.collection("telegram_link_tokens").doc(token).set({
    wallet,
    expiresAt,
    createdAt: new Date().toISOString(),
    used: false,
  });

  const botLink = `https://t.me/ChatFI_Ibot?start=${token}`;
  return res.status(200).json({ success: true, botLink });
}

// ── Telegram webhook: receive /start <token> from bot ────────────────────────
async function handleTelegramWebhook(req, res) {
  // Always respond 200 immediately to Telegram
  res.status(200).json({ ok: true });

  try {
    const update = req.body;
    const message = update?.message;
    if (!message) return;

    const chatId = message.chat.id;
    const text = message.text || "";
    const firstName = message.from?.first_name || "there";

    // Handle /start <token>
    if (text.startsWith("/start ")) {
      const token = text.split(" ")[1]?.trim();
      if (!token) {
        await sendTelegramMessage(chatId, "❌ Invalid link. Please generate a new one from ChatFi.");
        return;
      }

      const db = getDb();
      const tokenDoc = await db.collection("telegram_link_tokens").doc(token).get();

      if (!tokenDoc.exists) {
        await sendTelegramMessage(chatId, "❌ Link not found. Please generate a new one from ChatFi.");
        return;
      }

      const tokenData = tokenDoc.data();

      if (tokenData.used) {
        await sendTelegramMessage(chatId, "⚠️ This link has already been used. Generate a new one from ChatFi if needed.");
        return;
      }

      if (new Date(tokenData.expiresAt) < new Date()) {
        await sendTelegramMessage(chatId, "⏰ This link has expired. Please generate a new one from ChatFi.");
        return;
      }

      // Link telegramChatId to wallet in chatfi_users
      const usersSnap = await db
        .collection("chatfi_users")
        .where("wallet", "==", tokenData.wallet)
        .limit(1)
        .get();

      if (usersSnap.empty) {
        // Create user doc if it doesn't exist
        await db.collection("chatfi_users").add({
          wallet: tokenData.wallet,
          telegramChatId: chatId,
          telegramFirstName: firstName,
          telegramLinkedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      } else {
        await usersSnap.docs[0].ref.update({
          telegramChatId: chatId,
          telegramFirstName: firstName,
          telegramLinkedAt: new Date().toISOString(),
        });
      }

      // Mark token as used
      await tokenDoc.ref.update({ used: true, usedAt: new Date().toISOString() });

      await sendTelegramMessage(
        chatId,
        `✅ <b>Wallet linked successfully!</b>\n\nHi ${firstName}! You'll now receive yield harvest alerts here from ChatFi.\n\nWhen your yield threshold is hit, I'll send you a notification with a direct link to harvest. 🌾`
      );
      return;
    }

    // Handle /start with no token (user opened bot directly)
    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        `👋 <b>Welcome to ChatFI Bot!</b>\n\nTo link your wallet, go to <a href="${APP_URL}">ChatFi</a> and click <b>Connect Telegram</b> in your Yield Vault settings.`
      );
      return;
    }

    // Default response
    await sendTelegramMessage(
      chatId,
      `ℹ️ Use ChatFi to manage your yield vaults: <a href="${APP_URL}">${APP_URL}</a>`
    );
  } catch (e) {
    console.error("[TelegramWebhook] error:", e.message);
  }
}

// ── Set harvest pref (no vault required) ─────────────────────────────────────
async function handleSetHarvestPref(req, res) {
  const { wallet, sym, earnMint, autoHarvest, vaultId } = req.body;
  if (!wallet || !sym) return res.status(400).json({ error: "wallet and sym required" });
  try {
    const db = getDb();
    // If a vaultId was also supplied, update the vault record too
    if (vaultId) {
      const ref = db.collection("yield_vaults").doc(vaultId);
      const doc = await ref.get();
      if (doc.exists && doc.data().wallet === wallet) {
        await ref.update({ autoHarvest: !!autoHarvest, updatedAt: new Date().toISOString() });
      }
    }
    // Always write to harvest_prefs collection — keyed by wallet+sym
    const prefId = `${wallet}_${sym.toUpperCase()}`;
    await db.collection("harvest_prefs").doc(prefId).set({
      wallet,
      sym: sym.toUpperCase(),
      earnMint: earnMint || "",
      autoHarvest: !!autoHarvest,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return res.status(200).json({ success: true, autoHarvest: !!autoHarvest });
  } catch (e) {
    console.error("[setHarvestPref]", e.message);
    return res.status(500).json({ error: e.message });
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

  // Yield Rotator cron — GET ?cron=rotator
  if (req.method === "GET" && req.query.cron === "rotator") {
    return runRotatorWatcher(req, res);
  }

  // Telegram magic link — POST ?action=link-telegram
  if (req.method === "POST" && req.query.action === "link-telegram") {
    return handleLinkTelegram(req, res);
  }

  // Telegram webhook — POST ?action=telegram-webhook
  if (req.method === "POST" && req.query.action === "telegram-webhook") {
    return handleTelegramWebhook(req, res);
  }

  // Notify vault created — POST ?action=notify-vault-created
  if (req.method === "POST" && req.query.action === "notify-vault-created") {
    return handleNotifyVaultCreated(req, res);
  }

  // Notify vault cancelled — POST ?action=notify-vault-cancelled
  if (req.method === "POST" && req.query.action === "notify-vault-cancelled") {
    return handleNotifyVaultCancelled(req, res);
  }

  // Notify vault updated — POST ?action=notify-vault-updated
  if (req.method === "POST" && req.query.action === "notify-vault-updated") {
    return handleNotifyVaultUpdated(req, res);
  }

  // Notify rotation complete — POST ?action=notify-rotation-complete
  if (req.method === "POST" && req.query.action === "notify-rotation-complete") {
    return handleNotifyRotationComplete(req, res);
  }

  // Enable auto-harvest — POST ?action=enable-auto-harvest
  if (req.method === "POST" && req.query.action === "enable-auto-harvest") {
    return handleEnableAutoHarvest(req, res);
  }

  // Disable auto-harvest — POST ?action=disable-auto-harvest
  if (req.method === "POST" && req.query.action === "disable-auto-harvest") {
    return handleDisableAutoHarvest(req, res);
  }

  // Set harvest pref (works with or without a vault) — POST ?action=set-harvest-pref
  if (req.method === "POST" && req.query.action === "set-harvest-pref") {
    return handleSetHarvestPref(req, res);
  }

  let db;
  try { db = getDb(); } catch (e) { return res.status(500).json({ error: e.message }); }

  const col = db.collection("yield_vaults");

  // GET /api/yield-vault?wallet=xxx&checkTelegram=1
  if (req.method === "GET") {
    const { wallet, checkTelegram } = req.query;
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    try {
      if (checkTelegram === "1") {
        const userSnap = await db.collection("chatfi_users").where("wallet", "==", wallet).limit(1).get();
        const linked = !userSnap.empty && !!userSnap.docs[0].data().telegramChatId;
        return res.status(200).json({ telegramLinked: linked });
      }
      const snap = await col.where("wallet", "==", wallet).where("status", "==", "active").get();
      const vaults = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Also fetch standalone harvest prefs (for positions without a vault)
      const prefSnap = await db.collection("harvest_prefs").where("wallet", "==", wallet).get();
      const harvestPrefs = {};
      prefSnap.docs.forEach(d => { harvestPrefs[d.data().sym] = d.data().autoHarvest; });
      return res.status(200).json({ vaults, harvestPrefs });
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
      pendingHarvest: false,
      lastCheckedAt: null, lastTriggeredAt: null, lastTxSig: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    return res.status(200).json({ success: true, id: ref.id, action: "created" });
  }

  // PATCH /api/yield-vault  — also accepts ?id=&wallet= as query params (for plugin sync calls)
  if (req.method === "PATCH") {
    const id     = req.body.id     || req.query.id;
    const wallet = req.body.wallet || req.query.wallet;
    const { targetTokenSymbol, targetTokenMint, targetTokenDecimals, thresholdUSD, depositedAmount, earnMint, earnSymbol } = req.body;
    if (!id || !wallet) return res.status(400).json({ error: "id and wallet required" });
    try {
      const doc = col.doc(id);
      const snap = await doc.get();
      if (!snap.exists) return res.status(404).json({ error: "Vault not found" });
      if (snap.data().wallet !== wallet) return res.status(403).json({ error: "Forbidden" });
      const updates = { updatedAt: new Date().toISOString() };
      if (targetTokenSymbol   !== undefined) updates.targetTokenSymbol   = targetTokenSymbol;
      if (targetTokenMint     !== undefined) updates.targetTokenMint     = targetTokenMint;
      if (targetTokenDecimals !== undefined) updates.targetTokenDecimals = targetTokenDecimals ?? 6;
      if (thresholdUSD        !== undefined) updates.thresholdUSD        = parseFloat(thresholdUSD);
      if (depositedAmount     !== undefined) updates.depositedAmount     = parseFloat(depositedAmount);
      // earnMint/earnSymbol updated when YieldRotator migrates position to a new pool
      if (earnMint            !== undefined) updates.earnMint            = earnMint;
      if (earnSymbol          !== undefined) updates.earnSymbol          = earnSymbol;
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
