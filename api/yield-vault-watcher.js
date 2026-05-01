// api/yield-vault-watcher.js
// Vercel Cron Job — runs every 5 minutes
// Checks all active yield vault configs, fetches live Jupiter Earn position values,
// triggers withdraw + swap when yield >= threshold
// Add to vercel.json: { "crons": [{ "path": "/api/yield-vault-watcher", "schedule": "*/5 * * * *" }] }

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";

// ── Firebase Admin init ──────────────────────────────────────────────────────
function getDb() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY || "{}");
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

// ── Delegate keypair (bot wallet that signs on behalf of users) ──────────────
// Users grant this wallet limited withdraw+swap authority onchain at vault setup
function getDelegateKeypair() {
  const raw = process.env.DELEGATE_PRIVATE_KEY;
  if (!raw) throw new Error("DELEGATE_PRIVATE_KEY not set");
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

const SOLANA_RPC =
  process.env.SOLANA_RPC ||
  process.env.HELIUS_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const JUP_EARN_API = "https://api.jup.ag/lend/v1/earn";
const JUP_SWAP_ORDER = "https://api.jup.ag/swap/v2/order";
const JUP_SWAP_EXEC = "https://api.jup.ag/swap/v2/execute";
const JUP_PRICE_API = "https://api.jup.ag/price/v3";

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

// ── Fetch live Jupiter Earn position value for a wallet + mint ───────────────
async function fetchEarnPositionValue(walletAddress, earnMint) {
  try {
    const res = await fetch(
      `${JUP_EARN_API}/positions?wallets=${walletAddress}`
    );
    if (!res.ok) throw new Error(`Earn API ${res.status}`);
    const data = await res.json();

    // Normalise response — API can return array or object
    let positions = Array.isArray(data)
      ? data
      : data?.data ||
        data?.positions ||
        Object.values(data || {}).flatMap((v) =>
          Array.isArray(v) ? v : []
        );

    // Find the position matching this earn mint
    const pos = positions.find(
      (p) =>
        p.assetMint === earnMint ||
        p.asset?.address === earnMint ||
        p.mint === earnMint ||
        p.token?.address === earnMint
    );

    if (!pos) return null;

    // Get current position value in underlying token units
    // underlyingBalance is human-readable; underlyingAssets is raw integer
    const dec =
      pos.asset?.decimals ?? pos.token?.decimals ?? pos.decimals ?? 6;
    const ub = parseFloat(pos.underlyingBalance || 0);
    const ua = parseFloat(
      pos.underlyingAssets || pos.underlying_assets || pos.amount || 0
    );
    const currentAmount = ub > 0 ? ub : ua > 1e6 ? ua / Math.pow(10, dec) : ua;

    // APY from Jupiter directly
    const apy = pos.apy ?? pos.supplyApy ?? null;

    return {
      currentAmount,
      decimals: dec,
      apy,
      raw: pos,
    };
  } catch (e) {
    console.error(`[YieldVault] fetchEarnPositionValue error:`, e.message);
    return null;
  }
}

// ── Fetch USD price for a mint ───────────────────────────────────────────────
async function fetchUSDPrice(mint) {
  try {
    const res = await fetch(`${JUP_PRICE_API}?ids=${mint}`);
    const data = await res.json();
    const info = data?.[mint];
    return info?.usdPrice ? parseFloat(info.usdPrice) : null;
  } catch {
    return null;
  }
}

// ── Withdraw yield from Jupiter Earn ─────────────────────────────────────────
// Partial withdraw of just the yield portion (currentValue - depositedAmount)
async function withdrawYield(vault, yieldAmount, connection, delegateKp) {
  const { wallet, earnMint, earnJlMint, depositedAmount } = vault;

  // Jupiter Earn withdraw endpoint
  // We withdraw exactly the yield amount (not principal)
  const withdrawBody = {
    owner: wallet,
    mint: earnMint,
    amount: yieldAmount.toString(), // human-readable amount of underlying token
    slippageBps: 50,
  };

  const res = await fetch(`${JUP_EARN_API}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withdrawBody),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Earn withdraw API ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data?.transaction) {
    throw new Error(`No transaction in withdraw response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  // Deserialize, sign with delegate keypair, send
  const tx = VersionedTransaction.deserialize(b64ToBytes(data.transaction));
  tx.sign([delegateKp]);

  const rpcRes = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [
        bytesToB64(tx.serialize()),
        { encoding: "base64", skipPreflight: true },
      ],
    }),
  });

  const rpcData = await rpcRes.json();
  const sig = rpcData?.result;
  if (!sig) throw new Error(rpcData?.error?.message || "Withdraw tx failed");

  // Wait for confirmation
  await waitConfirmed(sig, connection);
  return sig;
}

// ── Swap withdrawn yield into target token via Jupiter ───────────────────────
async function swapYield(vault, yieldAmountRaw, connection, delegateKp) {
  const { earnMint, targetTokenMint, wallet } = vault;

  // Get swap order from Jupiter
  const orderRes = await fetch(
    `${JUP_SWAP_ORDER}?inputMint=${earnMint}&outputMint=${targetTokenMint}&amount=${yieldAmountRaw}&taker=${wallet}&slippageBps=50`
  );

  if (!orderRes.ok) {
    const txt = await orderRes.text();
    throw new Error(`Swap order API ${orderRes.status}: ${txt.slice(0, 200)}`);
  }

  const order = await orderRes.json();
  if (!order?.transaction) {
    throw new Error(`No transaction in swap order: ${JSON.stringify(order).slice(0, 200)}`);
  }

  // Sign with delegate keypair
  const tx = VersionedTransaction.deserialize(b64ToBytes(order.transaction));
  tx.sign([delegateKp]);

  // Execute via Jupiter v2 execute endpoint
  const execRes = await fetch(JUP_SWAP_EXEC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signedTransaction: bytesToB64(tx.serialize()),
      requestId: order.requestId,
    }),
  });

  const execData = await execRes.json();
  if (execData?.error) throw new Error(JSON.stringify(execData.error));

  const sig = execData?.signature || execData?.txid;
  if (!sig) throw new Error("No signature from swap execute");

  await waitConfirmed(sig, connection);
  return { sig, outAmount: execData?.outAmount };
}

// ── Wait for tx confirmation (polls getSignatureStatuses) ──────────────────
async function waitConfirmed(sig, connection, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2500);
    const res = await fetch(SOLANA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[sig], { searchTransactionHistory: true }],
      }),
    });
    const data = await res.json();
    const status = data?.result?.value?.[0];
    if (status?.err) throw new Error("Tx failed on-chain: " + JSON.stringify(status.err));
    if (
      status &&
      (status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized")
    ) {
      return;
    }
  }
  throw new Error("Transaction confirmation timeout");
}

// ── Main cron handler ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Only allow GET (Vercel cron) or POST (manual trigger)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Security: Vercel cron sends Authorization header with CRON_SECRET
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const log = [];
  const startTime = Date.now();

  try {
    const db = getDb();
    const delegateKp = getDelegateKeypair();
    const connection = new Connection(SOLANA_RPC, "confirmed");

    // Fetch all active vault configs
    const snap = await db
      .collection("yield_vaults")
      .where("status", "==", "active")
      .get();

    if (snap.empty) {
      return res.status(200).json({ message: "No active vaults", log });
    }

    log.push(`Found ${snap.docs.length} active vault(s)`);

    for (const doc of snap.docs) {
      const vault = { id: doc.id, ...doc.data() };
      const vaultLog = [];

      try {
        // Update lastCheckedAt
        await doc.ref.update({ lastCheckedAt: new Date().toISOString() });

        // 1. Fetch current earn position value from Jupiter
        const position = await fetchEarnPositionValue(
          vault.wallet,
          vault.earnMint
        );

        if (!position) {
          // Position no longer exists — auto-cancel vault
          await doc.ref.update({
            status: "cancelled",
            cancelReason: "earn_position_closed",
            cancelledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          vaultLog.push(`Auto-cancelled: earn position no longer found`);
          log.push(`[${vault.wallet.slice(0, 8)}] ${vaultLog.join(" | ")}`);
          continue;
        }

        // 2. Calculate yield = current position value - deposited amount
        const currentAmount = position.currentAmount;
        const depositedAmount = vault.depositedAmount || 0;
        const yieldAmount = Math.max(0, currentAmount - depositedAmount);

        // 3. Convert yield to USD
        const priceUSD = await fetchUSDPrice(vault.earnMint);
        const yieldUSD = priceUSD ? yieldAmount * priceUSD : 0;

        vaultLog.push(
          `deposited=${depositedAmount.toFixed(4)}, current=${currentAmount.toFixed(4)}, yield=${yieldAmount.toFixed(4)} (~$${yieldUSD.toFixed(2)}), threshold=$${vault.thresholdUSD}`
        );

        // 4. Check if yield has hit threshold
        if (yieldUSD < vault.thresholdUSD) {
          vaultLog.push(`Below threshold — skipping`);
          log.push(`[${vault.wallet.slice(0, 8)}] ${vaultLog.join(" | ")}`);
          continue;
        }

        vaultLog.push(`THRESHOLD HIT — initiating withdraw + swap`);

        // 5. Withdraw yield from Jupiter Earn
        const withdrawSig = await withdrawYield(
          vault,
          yieldAmount,
          connection,
          delegateKp
        );
        vaultLog.push(`Withdraw OK: ${withdrawSig.slice(0, 20)}...`);

        // Small delay between withdraw and swap
        await sleep(3000);

        // 6. Swap withdrawn yield into target token
        const dec = position.decimals;
        const yieldAmountRaw = Math.floor(yieldAmount * Math.pow(10, dec));
        const { sig: swapSig, outAmount } = await swapYield(
          vault,
          yieldAmountRaw,
          connection,
          delegateKp
        );
        vaultLog.push(`Swap OK: ${swapSig.slice(0, 20)}...`);

        // 7. Update vault record — reset baseline to current (post-withdraw) amount
        const newDeposited = depositedAmount; // principal stays the same
        await doc.ref.update({
          depositedAmount: newDeposited,
          swapCount: (vault.swapCount || 0) + 1,
          totalSwapped: (vault.totalSwapped || 0) + yieldUSD,
          lastTriggeredAt: new Date().toISOString(),
          lastTxSig: swapSig,
          lastWithdrawSig: withdrawSig,
          lastYieldUSD: yieldUSD,
          updatedAt: new Date().toISOString(),
        });

        // 8. Write notification to Firestore so UI can pick it up
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

        vaultLog.push(`SUCCESS — yield $${yieldUSD.toFixed(2)} rotated into ${vault.targetTokenSymbol}`);
      } catch (vaultErr) {
        vaultLog.push(`ERROR: ${vaultErr.message}`);
        // Log error to vault doc but don't cancel — retry next cycle
        await doc.ref.update({
          lastError: vaultErr.message,
          lastErrorAt: new Date().toISOString(),
        }).catch(() => {});
      }

      log.push(`[${vault.wallet.slice(0, 8)}] ${vaultLog.join(" | ")}`);

      // Rate limit between vaults — avoid hammering RPC
      await sleep(500);
    }

    const elapsed = Date.now() - startTime;
    return res.status(200).json({
      success: true,
      processed: snap.docs.length,
      elapsed: `${elapsed}ms`,
      log,
    });
  } catch (err) {
    console.error("[YieldVaultWatcher]", err);
    return res.status(500).json({ error: err.message, log });
  }
}
