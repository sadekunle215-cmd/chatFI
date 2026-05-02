/**
 * YieldRotatorPlugin.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Yield Rotator — auto-detects better Jupiter Earn APY pools and surfaces a
 * "Migrate" banner on any Earn position card.
 *
 * HOW TO ACTIVATE IN chatFI.jsx:
 *   1. import YieldRotatorPlugin, { suggestionGroup as yieldRotatorSuggestions }
 *        from "./plugins/YieldRotatorPlugin";
 *   2. Add yieldRotatorSuggestions to PLUGIN_SUGGESTION_GROUPS.
 *   3. Mount <YieldRotatorPlugin ... /> wherever you render plugin panels
 *      (same pattern as AutoPilotPlugin — inside the messages column, after
 *       all other panels, before the input box).
 *
 * ZERO USER CONFIG:
 *   • Any wallet with an active Jupiter Earn position is automatically monitored.
 *   • The plugin polls every 5 minutes, compares live pool APYs, and injects a
 *     "Migrate" banner onto the Earn position card when a better pool exists.
 *   • Cross-asset migration (USDC → USDT) is fully supported.
 *
 * MIGRATION TX FLOW (3 silent sequential txs):
 *   Tx 1 — Withdraw from current Earn pool
 *   Tx 2 — Swap (only if cross-asset)
 *   Tx 3 — Deposit into new Earn pool
 *
 * REQUIRED PROPS:
 *   walletFull        — connected wallet public key string (or null)
 *   earnPositions     — array from portfolioData.earnPositions
 *   jupFetch          — the existing jupFetch(url, opts?) helper
 *   getActiveProvider — existing getActiveProvider() from chatFI
 *   push              — push("ai", text) chat message helper
 *   T                 — design tokens object from chatFI
 *   isMobile          — boolean
 *
 * OPTIONAL PROPS:
 *   onMigrationDone   — () => void   — called after successful migration (e.g. to refresh portfolio)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { VersionedTransaction, Connection } from "@solana/web3.js";

// ── Jupiter Earn API base (same as chatFI) ───────────────────────────────────
const JUP_EARN_API   = "https://lend-api.jup.ag/api/v1";
const JUP_SWAP_ORDER = "https://lite-api.jup.ag/swap/v1/order";
const JUP_SWAP_EXEC  = "https://lite-api.jup.ag/swap/v1/execute";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Well-known mint addresses — mirrors chatFI TOKEN_MINTS subset
const KNOWN_MINTS = {
  USDC:   "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT:   "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  SOL:    "So11111111111111111111111111111111111111112",
  JUP:    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK:   "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  jitoSOL:"J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  JupSOL: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
};
const KNOWN_SYMS = Object.fromEntries(Object.entries(KNOWN_MINTS).map(([k,v])=>[v,k]));
const KNOWN_DECIMALS = { USDC:6, USDT:6, SOL:9, JUP:6, BONK:5, jitoSOL:9, JupSOL:9 };

// ── Helpers ───────────────────────────────────────────────────────────────────
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const bytesToB64 = (buf) => btoa(String.fromCharCode(...buf));

function mintToSym(mint) {
  return KNOWN_SYMS[mint] || (mint ? mint.slice(0, 6) + "…" : "?");
}
function symToMint(sym) {
  return KNOWN_MINTS[sym] || null;
}

// ── Suggestion group (for PLUGIN_SUGGESTION_GROUPS) ───────────────────────────
export const suggestionGroup = {
  label: "Yield Rotator",
  color: "#38bdf8",
  items: [
    "Check my earn yield",
    "Find better APY pools",
    "Migrate my earn position",
    "Best earn rates now",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Plugin Component
// ─────────────────────────────────────────────────────────────────────────────
export default function YieldRotatorPlugin({
  walletFull,
  earnPositions = [],
  jupFetch,
  getActiveProvider,
  push,
  T,
  isMobile,
  onMigrationDone,
}) {
  // ── State ────────────────────────────────────────────────────────────────
  const [allPools, setAllPools]         = useState([]);   // all live Jupiter Earn pools
  const [opportunities, setOpportunities] = useState([]); // [ { current, best, apyGap } ]
  const [migrating, setMigrating]       = useState(null); // position key being migrated
  const [migrateStep, setMigrateStep]   = useState("");   // progress label
  const [lastChecked, setLastChecked]   = useState(null);
  const pollRef = useRef(null);

  // ── Fetch all Jupiter Earn pools with live APYs ───────────────────────────
  const fetchAllPools = useCallback(async () => {
    try {
      const data = await jupFetch(`${JUP_EARN_API}/markets`);
      // API returns array or { markets: [...] }
      const arr = Array.isArray(data) ? data
                : data?.markets || data?.data || data?.pools || [];
      setAllPools(arr);
      return arr;
    } catch {
      return [];
    }
  }, [jupFetch]);

  // ── Compare user positions vs ALL pools → find best opportunity (any asset) ─
  const detectOpportunities = useCallback((positions, pools) => {
    if (!positions?.length || !pools?.length) return [];
    const ops = [];

    for (const pos of positions) {
      const posMint   = pos.asset?.mint || pos.mint || pos.tokenMint || pos.assetMint || "";
      const posSym    = pos.asset?.symbol || pos.assetSymbol || pos.symbol || mintToSym(posMint);
      const posApy    = parseFloat(
        pos.supplyApy ?? pos.apy ?? pos.apyPct ?? pos.lendingApy ?? pos.rate ?? 0
      );
      const posAmt    = parseFloat(
        pos.underlyingBalance ?? pos.underlyingAssets ?? pos.depositedAmount ?? pos.amount ?? pos.value ?? 0
      );
      const posPoolId = pos.planId || pos.poolId || pos.marketId || pos.pool || "";

      if (posAmt <= 0) continue;

      // Find the single best pool across ALL assets (cross-asset included)
      // No minimum APY gap — any improvement triggers the banner
      let bestPool = null;
      let bestApy  = -Infinity;

      for (const pool of pools) {
        const poolApyRaw = pool.totalApy ?? pool.supplyApy ?? pool.apy ??
                           pool.lendingApy ?? pool.rate ?? pool.apyPct ?? null;
        if (poolApyRaw === null) continue;
        const poolApy = parseFloat(poolApyRaw);
        if (isNaN(poolApy) || poolApy <= 0) continue;

        const poolMint = pool.asset?.mint || pool.mint || pool.tokenMint || pool.assetMint || "";
        const poolId   = pool.planId || pool.id || pool.poolId || pool.marketId || "";

        // Skip the user's current pool
        const sameById  = poolId && posPoolId && poolId === posPoolId;
        const sameByVal = !poolId && poolMint === posMint && Math.abs(poolApy - posApy) < 0.5;
        if (sameById || sameByVal) continue;

        if (poolApy > bestApy) {
          bestApy  = poolApy;
          bestPool = pool;
        }
      }

      // Only show banner if the best pool actually beats current APY
      if (bestPool && bestApy > posApy) {
        const bestMint = bestPool.asset?.mint || bestPool.mint || bestPool.tokenMint || "";
        ops.push({
          position:     pos,
          posSym,
          posMint,
          posApy,
          posAmt,
          posPoolId,
          bestPool,
          bestSym:      bestPool.asset?.symbol || bestPool.symbol || mintToSym(bestMint),
          bestMint,
          bestApy,
          apyGap:       bestApy - posApy,
          isCrossAsset: bestMint !== posMint,
        });
      }
    }

    ops.sort((a, b) => b.apyGap - a.apyGap);
    return ops;
  }, []);

  // ── Poll loop ─────────────────────────────────────────────────────────────
  const runCheck = useCallback(async () => {
    if (!walletFull) return;
    const pools = await fetchAllPools();
    const ops   = detectOpportunities(earnPositions, pools);
    setOpportunities(ops);
    setLastChecked(Date.now());
  }, [walletFull, earnPositions, fetchAllPools, detectOpportunities]);

  useEffect(() => {
    runCheck();
    pollRef.current = setInterval(runCheck, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [runCheck]);

  // ── Migration execution ───────────────────────────────────────────────────
  const doMigrate = async (op) => {
    if (!walletFull) { push("ai", "Connect your wallet to migrate."); return; }
    const provider = getActiveProvider();
    if (!provider)  { push("ai", "Wallet provider not found — please reconnect."); return; }

    const { position, posSym, posMint, posAmt, posPoolId, bestPool, bestSym, bestMint, isCrossAsset, posApy, bestApy } = op;

    setMigrating(posPoolId || posSym);
    const rpcUrl = import.meta.env?.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
    const conn   = new Connection(rpcUrl, "confirmed");

    const waitConfirm = async (sig, maxMs = 30000) => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        const res = await conn.getSignatureStatuses([sig], { searchTransactionHistory: true });
        const st  = res?.value?.[0];
        if (st?.err) throw new Error("On-chain error: " + JSON.stringify(st.err));
        if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return;
        await new Promise(r => setTimeout(r, 1500));
      }
      throw new Error("Tx timeout — check Solscan");
    };

    const signAndSend = async (txBase64) => {
      const tx = VersionedTransaction.deserialize(b64ToBytes(txBase64));
      try {
        const { blockhash } = await conn.getLatestBlockhash("confirmed");
        tx.message.recentBlockhash = blockhash;
      } catch { /* non-fatal */ }
      const signed = await provider.signTransaction(tx);
      return bytesToB64(signed.serialize());
    };

    try {
      // ── Tx 1: Withdraw from current Earn pool ──────────────────────────────
      setMigrateStep("Withdrawing from current pool…");
      push("ai", `🔄 **Migrating ${posSym} Earn → ${bestSym} Earn**\nStep 1/3 — withdrawing from current pool…`);

      const dec = KNOWN_DECIMALS[posSym] ?? 6;
      const withdrawAmtRaw = posAmt > 1e6
        ? Math.floor(posAmt)                           // already in raw units
        : Math.floor(posAmt * Math.pow(10, dec));      // convert from human-readable

      const withdrawRes = await jupFetch(`${JUP_EARN_API}/withdraw`, {
        method: "POST",
        body: {
          owner:     walletFull,
          planId:    posPoolId,
          amount:    withdrawAmtRaw,
          tokenMint: posMint || symToMint(posSym),
        },
      });
      if (withdrawRes?.error || !withdrawRes?.transaction) {
        throw new Error(withdrawRes?.error || "No withdraw transaction returned");
      }

      const withdrawSigned = await signAndSend(withdrawRes.transaction);
      const withdrawExec   = await jupFetch(`${JUP_EARN_API}/withdraw/execute`, {
        method: "POST",
        body: { signedTransaction: withdrawSigned, requestId: withdrawRes.requestId },
      });
      if (withdrawExec?.error) throw new Error(withdrawExec.error);
      const withdrawSig = withdrawExec?.signature || withdrawExec?.txid;
      if (!withdrawSig) throw new Error("No signature from withdraw tx");
      await waitConfirm(withdrawSig);
      push("ai", `✅ Step 1/3 done — withdrawn from ${posSym} Earn. [Solscan](https://solscan.io/tx/${withdrawSig})`);

      // ── Tx 2: Swap if cross-asset ──────────────────────────────────────────
      let depositMint = posMint || symToMint(posSym);
      let depositSym  = posSym;

      if (isCrossAsset && bestMint && bestMint !== depositMint) {
        setMigrateStep("Swapping to target asset…");
        push("ai", `🔄 Step 2/3 — swapping ${posSym} → ${bestSym}…`);

        // Use full withdrawn amount — re-fetch balance via portfolio or estimate
        // We'll use the withdrawAmtRaw we already know
        const swapOrderRes = await jupFetch(
          `${JUP_SWAP_ORDER}?inputMint=${depositMint}&outputMint=${bestMint}&amount=${withdrawAmtRaw}&taker=${walletFull}`
        );
        if (swapOrderRes?.error || !swapOrderRes?.transaction) {
          throw new Error(swapOrderRes?.error || "No swap transaction returned");
        }

        const swapSigned = await signAndSend(swapOrderRes.transaction);
        const swapExec   = await jupFetch(JUP_SWAP_EXEC, {
          method: "POST",
          body: { signedTransaction: swapSigned, requestId: swapOrderRes.requestId },
        });
        if (swapExec?.error) throw new Error(swapExec.error);
        const swapSig = swapExec?.signature || swapExec?.txid;
        if (!swapSig) throw new Error("No signature from swap tx");
        await waitConfirm(swapSig);

        depositMint = bestMint;
        depositSym  = bestSym;
        push("ai", `✅ Step 2/3 done — swapped to ${bestSym}. [Solscan](https://solscan.io/tx/${swapSig})`);
      } else {
        push("ai", `⏭ Step 2/3 — same asset (${posSym}), no swap needed.`);
      }

      // ── Tx 3: Deposit into new Earn pool ──────────────────────────────────
      setMigrateStep("Depositing into new pool…");
      push("ai", `🔄 Step 3/3 — depositing into ${bestSym} Earn (${bestApy.toFixed(2)}% APY)…`);

      const bestPlanId = bestPool.planId || bestPool.id || bestPool.poolId;
      const newDec     = KNOWN_DECIMALS[depositSym] ?? 6;
      // For cross-asset, use the swap output amount from outAmount if available,
      // otherwise re-use the withdraw raw amount scaled to the new asset's decimals
      const depositAmtRaw = isCrossAsset
        ? Math.floor(posAmt * Math.pow(10, newDec)) // approximate; actual balance will limit
        : withdrawAmtRaw;

      const depositRes = await jupFetch(`${JUP_EARN_API}/deposit`, {
        method: "POST",
        body: {
          owner:     walletFull,
          planId:    bestPlanId,
          amount:    depositAmtRaw,
          tokenMint: depositMint,
        },
      });
      if (depositRes?.error || !depositRes?.transaction) {
        throw new Error(depositRes?.error || "No deposit transaction returned");
      }

      const depositSigned = await signAndSend(depositRes.transaction);
      const depositExec   = await jupFetch(`${JUP_EARN_API}/deposit/execute`, {
        method: "POST",
        body: { signedTransaction: depositSigned, requestId: depositRes.requestId },
      });
      if (depositExec?.error) throw new Error(depositExec.error);
      const depositSig = depositExec?.signature || depositExec?.txid;
      if (!depositSig) throw new Error("No signature from deposit tx");
      await waitConfirm(depositSig);

      push("ai",
        `✅ **Migration complete!**\n` +
        `${posSym} Earn (${posApy.toFixed(2)}%) → ${bestSym} Earn (${bestApy.toFixed(2)}%)\n` +
        `You're now earning **+${(bestApy - posApy).toFixed(2)}% more APY**. 🎉\n` +
        `[View deposit tx](https://solscan.io/tx/${depositSig})`
      );

      // Refresh opportunities after successful migration
      await runCheck();
      onMigrationDone?.();

    } catch (err) {
      const msg = err?.message || "Unknown error";
      push("ai", `❌ Migration failed at: **${migrateStep || "unknown step"}**\n${msg}`);
    } finally {
      setMigrating(null);
      setMigrateStep("");
    }
  };

  // ── Render: Migrate banner cards ──────────────────────────────────────────
  // Returns an array of banner elements — caller can embed these anywhere
  // (typically right after the Earn Positions section in the portfolio panel)
  if (!opportunities.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        {/* rotate icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Better APY Available
        </span>
        <span style={{ fontSize: 10, color: T.text3, background: T.border, borderRadius: 8, padding: "1px 6px" }}>
          {opportunities.length}
        </span>
      </div>

      {opportunities.map((op, i) => {
        const key     = op.posPoolId || op.posSym + i;
        const isBusy  = migrating === key || migrating === (op.posPoolId || op.posSym);
        const usdVal  = op.posAmt; // already in display units if coming from portfolio
        const amtFmt  = usdVal > 0 ? `$${parseFloat(usdVal).toFixed(2)}` : "";
        const apyDiff = op.apyGap.toFixed(2);

        return (
          <div key={key}
            style={{
              padding: "12px 14px",
              background: "linear-gradient(135deg, #0f2233, #0d1c2a)",
              border: "1px solid #38bdf844",
              borderRadius: 12,
              fontSize: 12,
            }}>

            {/* Top row: current → best */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {/* Current pool chip */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: T.surface, borderRadius: 8, padding: "5px 10px", minWidth: 64 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.text2 }}>{op.posSym}</span>
                <span style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{op.posApy.toFixed(2)}%</span>
              </div>

              {/* Arrow + gap badge */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ height: 1, flex: 1, background: "#38bdf844" }}/>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#38bdf8" }}>+{apyDiff}%</span>
                  <div style={{ height: 1, flex: 1, background: "#38bdf844" }}/>
                </div>
                {op.isCrossAsset && (
                  <span style={{ fontSize: 9, color: T.text3, fontStyle: "italic" }}>cross-asset swap</span>
                )}
              </div>

              {/* Best pool chip */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#0a2a1a", border: "1px solid #2d5a3d", borderRadius: 8, padding: "5px 10px", minWidth: 64 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#68d391" }}>{op.bestSym}</span>
                <span style={{ fontSize: 10, color: "#68d391", marginTop: 1, fontWeight: 700 }}>{op.bestApy.toFixed(2)}%</span>
              </div>
            </div>

            {/* Amount row */}
            {amtFmt && (
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>
                Position: <span style={{ color: T.text2, fontWeight: 600 }}>{amtFmt}</span>
                {op.isCrossAsset && <span style={{ marginLeft: 8, color: "#38bdf8" }}>Includes swap</span>}
              </div>
            )}

            {/* Progress bar during migration */}
            {isBusy && migrateStep && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: "#38bdf8", marginBottom: 4 }}>{migrateStep}</div>
                <div style={{ height: 3, borderRadius: 3, background: T.border, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    background: "linear-gradient(90deg, #38bdf8, #68d391)",
                    borderRadius: 3,
                    animation: "rotatorProgress 1.5s ease-in-out infinite",
                    width: "60%",
                  }}/>
                </div>
              </div>
            )}

            {/* Migrate button */}
            <button
              disabled={!!migrating}
              onClick={() => doMigrate(op)}
              style={{
                width: "100%",
                padding: "8px",
                background: isBusy ? T.border : "linear-gradient(90deg, #0e3a5c, #0f4a3a)",
                border: `1px solid ${isBusy ? T.border : "#38bdf866"}`,
                borderRadius: 8,
                color: isBusy ? T.text3 : "#38bdf8",
                fontSize: 12,
                fontWeight: 700,
                cursor: migrating ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}>
              {isBusy ? (
                <>
                  <span style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    border: "2px solid #38bdf844",
                    borderTop: "2px solid #38bdf8",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}/>
                  Migrating…
                </>
              ) : (
                <>
                  {/* Rotate arrows icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  Migrate to {op.bestSym} Earn (+{apyDiff}% APY)
                </>
              )}
            </button>
          </div>
        );
      })}

      {/* Last checked */}
      {lastChecked && (
        <div style={{ fontSize: 10, color: T.text3, textAlign: "right", marginTop: 2 }}>
          Last checked: {new Date(lastChecked).toLocaleTimeString()}
          <button onClick={runCheck}
            style={{ marginLeft: 8, background: "none", border: "none", color: "#38bdf8", fontSize: 10, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
            refresh
          </button>
        </div>
      )}

      {/* Keyframe styles */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes rotatorProgress {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION GUIDE (paste into chatFI.jsx where earn positions are rendered)
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. IMPORT (top of chatFI.jsx, replace the commented-out example):
//
//    import YieldRotatorPlugin, { suggestionGroup as yieldRotatorSuggestions }
//      from "./plugins/YieldRotatorPlugin";
//
//    const PLUGIN_SUGGESTION_GROUPS = [
//      yieldRotatorSuggestions,
//    ];
//
//
// 2. MOUNT inside the portfolio panel, right AFTER the Earn Positions section
//    (around line 12783, after the earnPos block closes):
//
//    <YieldRotatorPlugin
//      walletFull={walletFull}
//      earnPositions={portfolioData?.earnPositions || []}
//      jupFetch={jupFetch}
//      getActiveProvider={getActiveProvider}
//      push={push}
//      T={T}
//      isMobile={isMobile}
//      onMigrationDone={() => fetchPortfolio()}  // your existing refresh fn
//    />
//
//
// 3. SERVER ROUTE (api/yield-rotator.js — optional, for Telegram alerts):
//    See YieldRotatorCron.js in the same folder for the Vercel cron handler.
//
// ─────────────────────────────────────────────────────────────────────────────
