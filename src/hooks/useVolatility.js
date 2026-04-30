import { useState, useEffect, useRef, useCallback } from "react";
import { jupFetch } from "../utils/solana";
import { TOKEN_MINTS } from "../constants";

// ── Regime thresholds (annualised vol %) ──────────────────────────────────────
export const REGIMES = {
  LOW:     { label: "LOW",     color: "#c7f284", bg: "#1a2e1a", border: "#2d4d1a", max: 40  },
  MEDIUM:  { label: "MEDIUM",  color: "#f6ad55", bg: "#2e2010", border: "#4d3510", max: 80  },
  HIGH:    { label: "HIGH",    color: "#f28484", bg: "#2e1a1a", border: "#4d2d2d", max: 150 },
  EXTREME: { label: "EXTREME", color: "#a78bfa", bg: "#1e1a2e", border: "#3d2d5e", max: Infinity },
};

export const classifyRegime = (annualisedVol) => {
  if (annualisedVol <= REGIMES.LOW.max)    return "LOW";
  if (annualisedVol <= REGIMES.MEDIUM.max) return "MEDIUM";
  if (annualisedVol <= REGIMES.HIGH.max)   return "HIGH";
  return "EXTREME";
};

// ── Rolling std-dev of log returns ───────────────────────────────────────────
const calcVol = (prices) => {
  if (prices.length < 2) return null;
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  // Annualise: assume each poll is ~1 min apart → 525600 periods/year
  return stdDev * Math.sqrt(525600) * 100; // as percentage
};

// ── Bollinger band calc ───────────────────────────────────────────────────────
const calcBands = (prices, multiplier = 2) => {
  if (prices.length < 2) return null;
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
  const sd = Math.sqrt(variance);
  return { upper: mean + multiplier * sd, middle: mean, lower: mean - multiplier * sd, sd };
};

// ── useVolatility ─────────────────────────────────────────────────────────────
// Props:
//   tokens        — array of symbols to monitor e.g. ["SOL","JUP","BONK"]
//   windowMinutes — rolling window length in minutes (user-configurable)
//   pollIntervalMs — how often to poll (default 60s)
//
// Returns:
//   volData  — { [symbol]: { prices[], currentPrice, vol, annualisedVol, regime, bands, history[] } }
//   allLow   — true when every monitored token is in LOW regime
//   loading
//   lastUpdated
export default function useVolatility({
  tokens = ["SOL", "USDC", "JUP"],
  windowMinutes = 60,
  pollIntervalMs = 60_000,
  tokenCacheRef,
}) {
  const [volData, setVolData]         = useState({});
  const [loading, setLoading]         = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const priceHistoryRef               = useRef({}); // symbol → number[]
  const intervalRef                   = useRef(null);

  const maxSamples = windowMinutes; // 1 sample per minute

  // ── Fetch current prices from Jupiter price API v3 ───────────────────────
  const fetchPrices = useCallback(async () => {
    if (!tokens.length) return;
    try {
      const mints = tokens
        .map(sym => tokenCacheRef?.current?.[sym.toUpperCase()] || TOKEN_MINTS[sym.toUpperCase()])
        .filter(Boolean);
      if (!mints.length) return;

      const data = await jupFetch(`https://api.jup.ag/price/v3?ids=${mints.join(",")}`);
      if (!data || typeof data !== "object") return;

      const now = Date.now();

      setVolData(prev => {
        const next = { ...prev };

        tokens.forEach(sym => {
          const mint  = tokenCacheRef?.current?.[sym.toUpperCase()] || TOKEN_MINTS[sym.toUpperCase()];
          if (!mint) return;
          const info  = data[mint];
          const price = info?.usdPrice ? parseFloat(info.usdPrice) : null;
          if (price == null || price <= 0) return;

          // Update rolling history
          if (!priceHistoryRef.current[sym]) priceHistoryRef.current[sym] = [];
          priceHistoryRef.current[sym].push(price);
          if (priceHistoryRef.current[sym].length > maxSamples) {
            priceHistoryRef.current[sym].shift();
          }

          const prices         = priceHistoryRef.current[sym];
          const annualisedVol  = calcVol(prices);
          const regime         = annualisedVol != null ? classifyRegime(annualisedVol) : "UNKNOWN";
          const bands          = calcBands(prices);

          // History for sparkline (last 60 points)
          const prevHistory = prev[sym]?.history || [];
          const history     = [...prevHistory, { t: now, price }].slice(-60);

          next[sym] = {
            symbol:       sym,
            currentPrice: price,
            prices,
            annualisedVol,
            vol:          annualisedVol,
            regime,
            bands,
            history,
            updatedAt:    now,
            // % position within bands (0 = at lower, 1 = at upper)
            bandPosition: bands
              ? Math.max(0, Math.min(1, (price - bands.lower) / (bands.upper - bands.lower || 1)))
              : 0.5,
          };
        });

        return next;
      });

      setLastUpdated(now);
    } catch (err) {
      console.warn("[useVolatility] fetch error:", err?.message);
    }
  }, [tokens, maxSamples, tokenCacheRef]);

  // ── Start / restart polling ────────────────────────────────────────────────
  useEffect(() => {
    // Reset history when tokens or window changes
    priceHistoryRef.current = {};
    setVolData({});
    setLoading(true);

    fetchPrices().then(() => setLoading(false));

    intervalRef.current = setInterval(fetchPrices, pollIntervalMs);
    return () => clearInterval(intervalRef.current);
  }, [tokens.join(","), windowMinutes, pollIntervalMs]);

  // ── allLow — true only when every token has confirmed LOW regime ──────────
  const allLow = tokens.length > 0 && tokens.every(sym => volData[sym]?.regime === "LOW");

  // ── Manual refresh ────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    setLoading(true);
    fetchPrices().then(() => setLoading(false));
  }, [fetchPrices]);

  return { volData, allLow, loading, lastUpdated, refresh };
}
