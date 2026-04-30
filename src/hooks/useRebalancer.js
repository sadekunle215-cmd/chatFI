import { useState, useEffect, useRef, useCallback } from "react";
import { jupFetch } from "../utils/solana";
import { TOKEN_MINTS } from "../constants";

// ── Default target portfolio ──────────────────────────────────────────────────
export const DEFAULT_TARGETS = [
  { symbol: "SOL",  targetPct: 40 },
  { symbol: "JUP",  targetPct: 20 },
  { symbol: "USDC", targetPct: 30 },
  { symbol: "BONK", targetPct: 10 },
];

// ── useRebalancer ─────────────────────────────────────────────────────────────
// Props:
//   walletFull      — connected wallet address
//   portfolio       — { [symbol]: balance } from useWallet
//   volData         — from useVolatility
//   allLow          — from useVolatility
//   getActiveProvider
//   push            — chat push fn
//   tokenCacheRef
//   tokenDecimalsRef
//
// Returns:
//   targets, setTargets     — user-defined target weights
//   currentWeights          — live portfolio weights with drift
//   driftItems              — tokens that need rebalancing
//   autopilotEnabled        — bool
//   setAutopilotEnabled
//   checkInterval           — minutes between autopilot checks
//   setCheckInterval
//   status                  — "idle"|"waiting"|"executing"|"done"|"error"
//   log                     — array of { ts, message } execution log entries
//   manualRebalance()       — trigger immediately
//   clearLog()
export default function useRebalancer({
  walletFull,
  portfolio = {},
  prices = {},
  volData = {},
  allLow = false,
  getActiveProvider,
  push,
  tokenCacheRef,
  tokenDecimalsRef,
}) {
  const [targets, setTargets]                 = useState(DEFAULT_TARGETS);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [checkIntervalMin, setCheckIntervalMin] = useState(15);
  const [driftThresholdPct, setDriftThresholdPct] = useState(5); // trigger if any token drifts > 5%
  const [status, setStatus]                   = useState("idle");
  const [log, setLog]                         = useState([]);
  const autopilotRef                          = useRef(null);
  const executingRef                          = useRef(false);

  const addLog = (message) =>
    setLog(prev => [...prev.slice(-49), { ts: Date.now(), message }]);

  // ── Compute current portfolio weights ─────────────────────────────────────
  const currentWeights = useCallback(() => {
    const totalUsd = targets.reduce((sum, t) => {
      const bal   = portfolio[t.symbol] || 0;
      const price = prices[t.symbol]   || volData[t.symbol]?.currentPrice || 0;
      return sum + bal * price;
    }, 0);

    return targets.map(t => {
      const bal      = portfolio[t.symbol] || 0;
      const price    = prices[t.symbol]    || volData[t.symbol]?.currentPrice || 0;
      const usdValue = bal * price;
      const actualPct = totalUsd > 0 ? (usdValue / totalUsd) * 100 : 0;
      const drift     = actualPct - t.targetPct;
      return {
        symbol:     t.symbol,
        targetPct:  t.targetPct,
        actualPct:  parseFloat(actualPct.toFixed(2)),
        drift:      parseFloat(drift.toFixed(2)),
        usdValue:   parseFloat(usdValue.toFixed(2)),
        balance:    bal,
        price,
        needsRebal: Math.abs(drift) > driftThresholdPct,
      };
    });
  }, [targets, portfolio, prices, volData, driftThresholdPct]);

  const driftItems = currentWeights().filter(w => w.needsRebal);

  // ── Build rebalance trade list ─────────────────────────────────────────────
  const buildTrades = useCallback(() => {
    const weights   = currentWeights();
    const totalUsd  = weights.reduce((s, w) => s + w.usdValue, 0);
    if (totalUsd <= 0) return [];

    // Sell overweight → USDC, buy underweight ← USDC
    const trades = [];
    for (const w of weights) {
      if (!w.needsRebal) continue;
      const targetUsd = (w.targetPct / 100) * totalUsd;
      const diff      = targetUsd - w.usdValue; // + means need to buy, - means sell

      if (diff < 0 && w.symbol !== "USDC") {
        // Sell |diff| USD of this token → USDC
        const sellAmt = Math.abs(diff) / (w.price || 1);
        trades.push({ from: w.symbol, to: "USDC", amountUsd: Math.abs(diff), amount: sellAmt, type: "sell" });
      } else if (diff > 0 && w.symbol !== "USDC") {
        // Buy diff USD worth from USDC
        trades.push({ from: "USDC", to: w.symbol, amountUsd: diff, amount: diff, type: "buy" });
      }
    }
    // Sort: sells first so USDC is available for buys
    return trades.sort((a, b) => (a.type === "sell" ? -1 : 1));
  }, [currentWeights]);

  // ── Execute rebalance via webhook ─────────────────────────────────────────
  const executeRebalance = useCallback(async (triggeredBy = "manual") => {
    if (executingRef.current) return;
    if (!walletFull)          { addLog("⚠ No wallet connected"); return; }

    const trades = buildTrades();
    if (!trades.length)       { addLog("✓ Portfolio already balanced"); setStatus("idle"); return; }

    executingRef.current = true;
    setStatus("executing");
    addLog(`▶ Rebalance triggered by ${triggeredBy} — ${trades.length} trade(s)`);

    try {
      // ── Call Vercel serverless webhook ──────────────────────────────────
      const res = await fetch("/api/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet:  walletFull,
          trades:  trades.map(t => ({
            from:      t.from,
            to:        t.to,
            amountUsd: t.amountUsd,
            fromMint:  tokenCacheRef?.current?.[t.from.toUpperCase()] || TOKEN_MINTS[t.from.toUpperCase()],
            toMint:    tokenCacheRef?.current?.[t.to.toUpperCase()]   || TOKEN_MINTS[t.to.toUpperCase()],
          })),
          regime:  Object.fromEntries(
            Object.entries(volData).map(([sym, d]) => [sym, d.regime])
          ),
        }),
      });

      const result = await res.json();

      if (!res.ok || result.error) throw new Error(result.error || `HTTP ${res.status}`);

      // Log each trade result
      for (const r of result.results || []) {
        if (r.success) {
          addLog(`✓ ${r.from} → ${r.to}: ${r.amountFormatted} | tx ${r.sig?.slice(0, 8)}…`);
        } else {
          addLog(`✗ ${r.from} → ${r.to}: ${r.error}`);
        }
      }

      setStatus("done");
      push("ai", `Rebalance complete ✓ — ${(result.results||[]).filter(r=>r.success).length}/${trades.length} trades executed.\n\nPortfolio is now aligned with your target weights.`);

    } catch (err) {
      addLog(`✗ Error: ${err?.message}`);
      setStatus("error");
      push("ai", `Rebalance failed: ${err?.message}`);
    }

    executingRef.current = false;
    setTimeout(() => setStatus("idle"), 3000);
  }, [walletFull, buildTrades, volData, push, tokenCacheRef]);

  // ── Autopilot loop ────────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(autopilotRef.current);
    if (!autopilotEnabled) { setStatus("idle"); return; }

    setStatus("waiting");
    addLog(`🤖 Autopilot ON — checking every ${checkIntervalMin} min`);

    autopilotRef.current = setInterval(() => {
      if (!allLow) {
        const regimes = Object.entries(volData)
          .map(([sym, d]) => `${sym}:${d.regime}`)
          .join(" · ");
        addLog(`⏸ Regime not LOW — ${regimes}`);
        return;
      }
      if (driftItems.length === 0) {
        addLog("✓ No drift detected — skipping");
        return;
      }
      addLog("🟢 ALL tokens LOW vol + drift detected — executing…");
      executeRebalance("autopilot");
    }, checkIntervalMin * 60_000);

    return () => clearInterval(autopilotRef.current);
  }, [autopilotEnabled, checkIntervalMin, allLow, driftItems.length]);

  return {
    targets, setTargets,
    currentWeights: currentWeights(),
    driftItems,
    buildTrades,
    autopilotEnabled, setAutopilotEnabled,
    checkIntervalMin, setCheckIntervalMin,
    driftThresholdPct, setDriftThresholdPct,
    status,
    log,
    clearLog: () => setLog([]),
    manualRebalance: () => {
      if (!allLow) {
        push("ai", "⚠ Volatility is not LOW across all tokens. Rebalance queued — autopilot will execute when conditions are met.\n\nEnable autopilot to auto-execute.");
        addLog("⚠ Manual trigger blocked — not in LOW regime");
        return;
      }
      executeRebalance("manual");
    },
    forceRebalance: () => executeRebalance("forced"),
  };
}
