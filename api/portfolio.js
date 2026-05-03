// api/portfolio.js
// ─────────────────────────────────────────────────────────────────────────────
// Deep Portfolio Aggregator — fetches ALL DeFi positions for a wallet:
//   • Token balances (via Jupiter Portfolio API)
//   • Jupiter Earn positions (supply APY, deposited amount, asset)
//   • Jupiter DCA orders (active recurring buys)
//   • Jupiter Trigger / Limit orders
//   • Jupiter Perps positions
//   • Locked / Vesting positions
//   • Yield Vault configs (from Firestore)
//
// GET /api/portfolio?wallet=<pubkey>
//
// Returns:
// {
//   wallet, totalUSD,
//   tokens:        [ { symbol, mint, amount, usdValue, logoURI } ],
//   earnPositions: [ { planId, symbol, mint, depositedAmount, depositedUSD, supplyApy, totalApy } ],
//   dcaOrders:     [ { id, inputSymbol, outputSymbol, amountPerCycle, remainingCycles, nextCycleAt } ],
//   triggerOrders: [ { id, inputSymbol, outputSymbol, triggerPrice, inputAmount } ],
//   perpPositions: [ { market, side, size, entryPrice, markPrice, pnl } ],
//   lockedPositions: [ { amount, symbol, vestingEnd, percentVested } ],
//   yieldVaults:   [ { id, earnSymbol, targetTokenSymbol, thresholdUSD, pendingHarvest, yieldUSD } ],
// }
// ─────────────────────────────────────────────────────────────────────────────

export const maxDuration = 60;

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Config ────────────────────────────────────────────────────────────────────
const JUP_API_KEY  = process.env.JUPITER_API_KEY || "";
const HELIUS_KEY   = process.env.HELIUS_API_KEY  || "";
const SOLANA_RPC   = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

const HEADERS = {
  "Content-Type": "application/json",
  ...(JUP_API_KEY ? { "x-api-key": JUP_API_KEY } : {}),
};

// ── Firebase ──────────────────────────────────────────────────────────────────
function getDb() {
  try {
    if (!getApps().length) {
      const sa = JSON.parse(process.env.FIREBASE_ADMIN_KEY || "{}");
      initializeApp({ credential: cert(sa) });
    }
    return getFirestore();
  } catch { return null; }
}

// ── Fetch helper with timeout ─────────────────────────────────────────────────
async function jFetch(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) }, signal: ctrl.signal });
    clearTimeout(timer);
    const text = await res.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// ── Token metadata cache (mint → { symbol, logoURI }) ────────────────────────
const TOKEN_CACHE = {};
async function mintMeta(mint) {
  if (!mint) return { symbol: "?", logoURI: "" };
  if (TOKEN_CACHE[mint]) return TOKEN_CACHE[mint];
  try {
    const data = await jFetch(`https://tokens.jup.ag/token/${mint}`, {}, 5000);
    const meta = {
      symbol:   data?.symbol  || mint.slice(0, 6) + "…",
      logoURI:  data?.logoURI || data?.icon || "",
    };
    TOKEN_CACHE[mint] = meta;
    return meta;
  } catch {
    return { symbol: mint.slice(0, 6) + "…", logoURI: "" };
  }
}
async function mintToSymbol(mint) {
  return (await mintMeta(mint)).symbol;
}

// ── 1. Token balances via Helius RPC (reliable SPL) + Jupiter for prices ─────
async function fetchTokenBalances(wallet) {
  try {
    const HELIUS_RPC = process.env.HELIUS_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

    // Step 1: Get SOL balance
    const solRes = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [wallet] }),
    });
    const solJson = await solRes.json();
    const solAmt  = (solJson?.result?.value || 0) / 1e9;

    // Step 2: Get all SPL token accounts
    const splRes = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2,
        method: "getTokenAccountsByOwner",
        params: [wallet,
          { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
          { encoding: "jsonParsed" },
        ],
      }),
    });
    const splJson = await splRes.json();
    const accounts = splJson?.result?.value || [];

    // Step 3: Collect mints with nonzero balance
    const splMints = [];
    for (const acc of accounts) {
      const info   = acc.account?.data?.parsed?.info;
      const mint   = info?.mint || "";
      const uiAmt  = parseFloat(info?.tokenAmount?.uiAmount || 0);
      const dec    = parseInt(info?.tokenAmount?.decimals ?? 6);
      if (uiAmt > 0 && mint) splMints.push({ mint, amount: uiAmt, decimals: dec });
    }

    // Step 4: Resolve metadata + prices for all mints in parallel (including SOL)
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const allMints = [SOL_MINT, ...splMints.map(m => m.mint)];
    const SOL_PRICE_URL = `https://lite-api.jup.ag/price/v2?ids=${allMints.join(",")}`;
    const [solMeta, metaResults, priceRes] = await Promise.all([
      jFetch(`https://tokens.jup.ag/token/${SOL_MINT}`, {}, 5000),
      Promise.allSettled(splMints.map(({ mint }) => jFetch(`https://tokens.jup.ag/token/${mint}`, {}, 5000))),
      jFetch(SOL_PRICE_URL, {}, 8000),
    ]);

    // Helius DAS getAsset — resolves symbol + logo for any on-chain token not in Jupiter list
    const dasLookup = async (mint) => {
      try {
        const res = await fetch(HELIUS_RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "das", method: "getAsset", params: { id: mint } }),
        });
        const d = await res.json();
        const asset = d?.result;
        const symbol  = asset?.content?.metadata?.symbol || asset?.symbol || null;
        const logoURI = asset?.content?.links?.image || asset?.content?.files?.[0]?.uri || null;
        return { symbol, logoURI };
      } catch { return { symbol: null, logoURI: null }; }
    };

    // Run DAS lookups in parallel for all tokens Jupiter couldn't resolve (avoids sequential await timeout)
    const needsDas = splMints.map((_, i) => {
      const jupMeta = metaResults[i]?.status === "fulfilled" ? metaResults[i].value : null;
      return !jupMeta?.symbol;
    });
    const dasResults = await Promise.allSettled(
      splMints.map((m, i) => needsDas[i] ? dasLookup(m.mint) : Promise.resolve({ symbol: null, logoURI: null }))
    );

    const prices   = priceRes?.data || {};
    const solPrice = parseFloat(prices[SOL_MINT]?.price || 0);
    const solUSD   = solAmt * solPrice;

    const tokens = [{
      symbol:   solMeta?.symbol  || "SOL",
      mint:     SOL_MINT,
      amount:   solAmt,
      usdValue: solUSD,
      logoURI:  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      price:    solPrice,
    }];

    for (let i = 0; i < splMints.length; i++) {
      const { mint, amount } = splMints[i];
      const jupMeta = metaResults[i]?.status === "fulfilled" ? metaResults[i].value : null;
      const dasMeta = dasResults[i]?.status === "fulfilled" ? dasResults[i].value : { symbol: null, logoURI: null };
      const symbol  = jupMeta?.symbol || dasMeta.symbol || mint.slice(0, 6) + "…";
      const logoURI = jupMeta?.logoURI || jupMeta?.icon || jupMeta?.image
                    || dasMeta.logoURI || `https://img.jup.ag/tokens/${mint}`;
      const price    = parseFloat(prices[mint]?.price || 0);
      const usdValue = amount * price;
      tokens.push({ symbol, mint, amount, usdValue, logoURI, price });
    }

    tokens.sort((a, b) => b.usdValue - a.usdValue);
    const totalUSD = tokens.reduce((s, t) => s + t.usdValue, 0);
    return { tokens, totalUSD };
  } catch (e) {
    console.error("[portfolio] token balances error:", e.message);
    return { tokens: [], totalUSD: 0 };
  }
}

// ── 2. Jupiter Earn positions ─────────────────────────────────────────────────
async function fetchEarnPositions(wallet) {
  try {
    // Try lend-api positions endpoint
    const data = await jFetch(
      `https://lend-api.jup.ag/api/v1/positions?users=${wallet}`,
      {}, 20000
    );

    // API can return array or { data: [...] } or { positions: [...] }
    let raw = Array.isArray(data) ? data
            : data?.data || data?.positions || data?.supplyPositions || [];

    // Also try the earn-specific endpoint
    if (!raw.length) {
      const data2 = await jFetch(
        `https://lend-api.jup.ag/api/v1/earn/positions?wallet=${wallet}`,
        {}, 10000
      );
      raw = Array.isArray(data2) ? data2 : data2?.data || data2?.positions || [];
    }

    const positions = await Promise.all(raw.map(async pos => {
      // Normalise across all possible field shapes
      const mint    = pos.asset?.mint  || pos.mint  || pos.tokenMint  || pos.assetMint  || "";
      const jlMint  = pos.asset?.jlMint || pos.jlMint || pos.lendingMint || "";
      const planId  = pos.planId || pos.poolId || pos.marketId || pos.plan?.id || "";
      const symbol  = pos.asset?.symbol || pos.symbol || pos.assetSymbol
                   || await mintToSymbol(mint);

      // Deposited amount — try all field names
      const decimals = pos.asset?.decimals ?? pos.decimals ?? pos.token?.decimals ?? 6;
      const rawAmt   = parseFloat(
        pos.underlyingAssets ?? pos.underlyingBalance ??
        pos.depositedAmount  ?? pos.supplyBalance     ??
        pos.amount           ?? pos.balance           ?? 0
      );
      // Convert from raw units if large number, else assume human-readable
      const depositedAmount = rawAmt > 1e8
        ? rawAmt / Math.pow(10, decimals)
        : rawAmt;

      // APY fields
      const supplyApy = parseFloat(
        pos.supplyApy ?? pos.apy ?? pos.lendingApy ?? pos.rate ?? pos.supplyRate ?? 0
      ) * (pos.supplyApy > 1 ? 1 : 100); // normalise 0.03 → 3%
      const rewardsApy = parseFloat(pos.rewardsApy ?? pos.incentiveApy ?? 0)
                       * (pos.rewardsApy > 1 ? 1 : 100);
      const totalApy   = parseFloat(pos.totalApy ?? 0) * (pos.totalApy > 1 ? 1 : 100)
                       || supplyApy + rewardsApy;

      // USD value
      const depositedUSD = parseFloat(
        pos.depositedValueUsd ?? pos.valueUsd ?? pos.usdValue ?? pos.usdAmount ?? 0
      ) || null; // null means we don't have it — UI can estimate

      const logoURI = pos.asset?.logoURI || pos.asset?.icon || pos.logoURI
                   || pos.token?.logoURI || pos.icon || "";

      return {
        planId,
        symbol,
        mint,
        jlMint,
        logoURI,
        depositedAmount,
        depositedUSD,
        supplyApy:  parseFloat(supplyApy.toFixed(4)),
        rewardsApy: parseFloat(rewardsApy.toFixed(4)),
        totalApy:   parseFloat(totalApy.toFixed(4)),
        decimals,
        raw: pos,
      };
    }));

    return positions.filter(p => p.depositedAmount > 0);
  } catch (e) {
    console.error("[portfolio] earn positions error:", e.message);
    return [];
  }
}

// ── 3. Jupiter DCA orders ─────────────────────────────────────────────────────
async function fetchDcaOrders(wallet) {
  try {
    const data = await jFetch(
      `https://dca-api.jup.ag/user/${wallet}?status=active`,
      {}, 10000
    );
    const orders = data?.dcaAccounts || data?.orders || data?.data || [];
    return await Promise.all(orders.map(async o => {
      const [inMeta, outMeta] = await Promise.all([mintMeta(o.inputMint), mintMeta(o.outputMint)]);
      return {
        id:              o.publicKey || o.id || "",
        inputMint:       o.inputMint  || "",
        outputMint:      o.outputMint || "",
        inputSymbol:     o.inputSymbol  || inMeta.symbol,
        outputSymbol:    o.outputSymbol || outMeta.symbol,
        inputLogoURI:    inMeta.logoURI,
        outputLogoURI:   outMeta.logoURI,
        amountPerCycle:  parseFloat(o.inAmountPerCycle || o.amountPerCycle || 0),
        remainingCycles: parseInt(o.remainingCycles || o.cyclesLeft || 0),
        cycleFrequency:  o.cycleFrequency || o.frequency || "",
        nextCycleAt:     o.nextCycleAt || o.nextExecutionAt || null,
        totalDeposited:  parseFloat(o.totalInDeposited || o.totalDeposited || 0),
        totalWithdrawn:  parseFloat(o.totalInWithdrawn  || o.totalWithdrawn  || 0),
      };
    }));
  } catch { return []; }
}

// ── 4. Jupiter Trigger / Limit orders ────────────────────────────────────────
async function fetchTriggerOrders(wallet) {
  try {
    const data = await jFetch(
      `https://trigger.jup.ag/v2/trigger-orders?wallet=${wallet}&status=open`,
      {}, 10000
    );
    const orders = data?.orders || data?.data || [];
    return await Promise.all(orders.map(async o => {
      const [inMeta, outMeta] = await Promise.all([mintMeta(o.inputMint), mintMeta(o.outputMint)]);
      return {
        id:           o.publicKey || o.id || "",
        inputMint:    o.inputMint  || "",
        outputMint:   o.outputMint || "",
        inputSymbol:  o.inputSymbol  || inMeta.symbol,
        outputSymbol: o.outputSymbol || outMeta.symbol,
        inputLogoURI:  inMeta.logoURI,
        outputLogoURI: outMeta.logoURI,
        inputAmount:  parseFloat(o.makingAmount || o.inputAmount || 0),
        outputAmount: parseFloat(o.takingAmount || o.outputAmount || 0),
        triggerPrice: parseFloat(o.triggerPrice || 0),
        expiredAt:    o.expiredAt || null,
        createdAt:    o.createdAt || null,
      };
    }));
  } catch { return []; }
}

// ── 5. Jupiter Perps positions ────────────────────────────────────────────────
async function fetchPerpPositions(wallet) {
  try {
    const data = await jFetch(
      `https://perp.jup.ag/v1/positions?wallet=${wallet}`,
      {}, 10000
    );
    const positions = data?.positions || data?.data || [];
    return positions.map(p => ({
      market:     p.market     || p.symbol     || "?",
      side:       p.side       || p.direction  || "long",
      sizeUsd:    parseFloat(p.sizeUsd    || p.size        || 0),
      entryPrice: parseFloat(p.entryPrice || p.avgEntry    || 0),
      markPrice:  parseFloat(p.markPrice  || p.currentPrice || 0),
      pnlUsd:     parseFloat(p.pnlUsd     || p.unrealizedPnl || 0),
      leverage:   parseFloat(p.leverage   || 1),
      collateral: parseFloat(p.collateralUsd || p.collateral || 0),
      liquidationPrice: parseFloat(p.liquidationPrice || 0),
    }));
  } catch { return []; }
}

// ── 6. Locked / Vesting positions ─────────────────────────────────────────────
async function fetchLockedPositions(wallet) {
  try {
    const data = await jFetch(
      `https://lock.jup.ag/v1/locks?wallet=${wallet}`,
      {}, 10000
    );
    const locks = data?.locks || data?.data || data?.vestingAccounts || [];
    return await Promise.all(locks.map(async l => {
      const mint = l.mint || l.tokenMint || "";
      return {
        id:           l.publicKey || l.id || "",
        symbol:       l.symbol || await mintToSymbol(mint),
        mint,
        amount:       parseFloat(l.amount || l.totalAmount || 0),
        claimedAmount: parseFloat(l.claimedAmount || l.withdrawn || 0),
        percentVested: parseFloat(l.percentVested || l.vestedPercent || 0),
        vestingEnd:   l.vestingEnd || l.endTime || l.unlockTime || null,
        vestingStart: l.vestingStart || l.startTime || null,
        cliff:        l.cliff || null,
      };
    }));
  } catch { return []; }
}

// ── 7. Yield Vaults from Firestore ────────────────────────────────────────────
async function fetchYieldVaults(wallet) {
  try {
    const db = getDb();
    if (!db) return [];
    const snap = await db.collection("yield_vaults")
      .where("wallet",  "==", wallet)
      .where("status",  "==", "active")
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: "wallet param required" });

  try {
    // Fetch all in parallel
    const [
      { tokens, totalUSD: tokenUSD },
      earnPositions,
      dcaOrders,
      triggerOrders,
      perpPositions,
      lockedPositions,
      yieldVaults,
    ] = await Promise.allSettled([
      fetchTokenBalances(wallet),
      fetchEarnPositions(wallet),
      fetchDcaOrders(wallet),
      fetchTriggerOrders(wallet),
      fetchPerpPositions(wallet),
      fetchLockedPositions(wallet),
      fetchYieldVaults(wallet),
    ]).then(([tokensR, earnR, dcaR, trigR, perpR, lockedR, vaultsR]) => [
      tokensR.status  === "fulfilled" ? tokensR.value  : { tokens: [], totalUSD: 0 },
      earnR.status    === "fulfilled" ? earnR.value    : [],
      dcaR.status     === "fulfilled" ? dcaR.value     : [],
      trigR.status    === "fulfilled" ? trigR.value    : [],
      perpR.status    === "fulfilled" ? perpR.value    : [],
      lockedR.status  === "fulfilled" ? lockedR.value  : [],
      vaultsR.status  === "fulfilled" ? vaultsR.value  : [],
    ]);

    // Compute total USD including earn positions
    const earnUSD = earnPositions.reduce((s, p) => s + (p.depositedUSD || 0), 0);
    const totalUSD = (tokenUSD || 0) + earnUSD;

    return res.status(200).json({
      wallet,
      totalUSD:        parseFloat(totalUSD.toFixed(2)),
      tokens,
      earnPositions,
      dcaOrders,
      triggerOrders,
      perpPositions,
      lockedPositions,
      yieldVaults,
      fetchedAt:       new Date().toISOString(),
    });

  } catch (err) {
    console.error("[portfolio] fatal error:", err);
    return res.status(500).json({ error: err.message });
  }
}
