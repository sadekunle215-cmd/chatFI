import { useState, useRef, useCallback } from "react";
import { jupFetch, fmtNum } from "../utils/solana";
import {
  TOKEN_MINTS, JUP_PRICE_API, JUP_TOKEN_SEARCH, JUP_TOKENS_API,
  JUP_BASE, JUP_TOKEN_TAG, JUP_TOKEN_CAT, JUP_TOKEN_RECENT,
} from "../constants";

const XSTOCK_SYMBOLS = [
  "SPYx","QQQx","TSLAx","COINx","AAPLx","NVDAx","MSFTx","GOOGx","AMZNx","METAx",
  "NKEx","AMDx","INTCx","ARKKx","GDx","SLVx","GOLDx","BRKx","TSMx","SOFIx",
];

// ── useTokenData ──────────────────────────────────────────────────────────────
// Centralises all Jupiter token data fetching: prices, token info, categories.
export default function useTokenData() {
  const [prices, setPrices]           = useState({});
  const tokenCacheRef                 = useRef({ ...TOKEN_MINTS }); // symbol → mint
  const tokenDecimalsRef              = useRef({ SOL: 9, USDC: 6, USDT: 6, JUP: 6 });

  // ── Resolve symbol → { mint, decimals } ─────────────────────────────────────
  const resolveToken = useCallback(async (symbolOrName) => {
    if (!symbolOrName) return null;
    const upper = symbolOrName.toUpperCase().trim();
    if (tokenCacheRef.current[upper]) {
      return { mint: tokenCacheRef.current[upper], decimals: tokenDecimalsRef.current[upper] ?? 6 };
    }
    const isMintAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbolOrName.trim());
    if (isMintAddr) {
      tokenCacheRef.current[upper] = symbolOrName.trim();
      return { mint: symbolOrName.trim(), decimals: 6 };
    }
    const tryParse = (data, sym) => {
      const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
      const match = list.find(t => t.symbol?.toUpperCase() === sym);
      const mint  = match?.id || match?.address;
      return mint ? { mint, decimals: match.decimals ?? 6 } : null;
    };
    try {
      const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbolOrName)}`);
      const r = tryParse(data, upper);
      if (r) { tokenCacheRef.current[upper] = r.mint; tokenDecimalsRef.current[upper] = r.decimals; return r; }
    } catch {}
    try {
      const data = await jupFetch(`${JUP_BASE}/tokens/v1/search?query=${encodeURIComponent(symbolOrName)}&limit=20`);
      const r = tryParse(data, upper);
      if (r) { tokenCacheRef.current[upper] = r.mint; tokenDecimalsRef.current[upper] = r.decimals; return r; }
    } catch {}
    return null;
  }, []);

  // ── Fetch prices for a list of symbols ──────────────────────────────────────
  const fetchPrices = useCallback(async (tokens = Object.keys(TOKEN_MINTS)) => {
    try {
      const mints = tokens.map(t => tokenCacheRef.current[t.toUpperCase()] || TOKEN_MINTS[t.toUpperCase()]).filter(Boolean);
      if (!mints.length) return {};
      const json = await jupFetch(`${JUP_PRICE_API}?ids=${mints.join(",")}`);
      const out  = {};
      for (const [mint, info] of Object.entries(json || {})) {
        const sym = Object.entries(tokenCacheRef.current).find(([, v]) => v === mint)?.[0];
        if (sym && info?.usdPrice) out[sym] = parseFloat(info.usdPrice);
      }
      setPrices(p => ({ ...p, ...out }));
      return out;
    } catch { return {}; }
  }, []);

  // ── Fetch full token info ────────────────────────────────────────────────────
  const fetchTokenInfo = useCallback(async (symbol) => {
    if (!symbol) return null;
    const upper = symbol.toUpperCase();
    const cachedMint = tokenCacheRef.current[upper] || TOKEN_MINTS[upper];

    const normalise = (match, mint) => ({
      ...(match || {}),
      address:     mint,
      logo_url:    match?.icon || match?.logo_url || "",
      usdPrice:    match?.usdPrice ?? null,
      market_cap:  match?.mcap   || match?.market_cap || null,
      fdv:         match?.fdv    ?? null,
      liquidity:   match?.liquidity ?? null,
      circSupply:  match?.circSupply ?? null,
      totalSupply: match?.totalSupply ?? null,
      holderCount: match?.holderCount ?? null,
      daily_volume: match?.stats24h
        ? (match.stats24h.buyVolume || 0) + (match.stats24h.sellVolume || 0)
        : (match?.daily_volume || null),
      priceChange24h: match?.stats24h?.priceChange ?? null,
      numBuys24h:     match?.stats24h?.numBuys ?? null,
      numSells24h:    match?.stats24h?.numSells ?? null,
      numTraders24h:  match?.stats24h?.numTraders ?? null,
      buyVolume24h:   match?.stats24h?.buyVolume ?? null,
      sellVolume24h:  match?.stats24h?.sellVolume ?? null,
      holderChange24h:   match?.stats24h?.holderChange ?? null,
      liquidityChange24h: match?.stats24h?.liquidityChange ?? null,
      stats1h: match?.stats1h ?? null,
      stats6h: match?.stats6h ?? null,
      firstPoolId:   match?.firstPool?.id ?? null,
      firstPoolAt:   match?.firstPool?.createdAt ?? null,
      organicScore:  match?.organicScore ?? null,
      organicScoreLabel: match?.organicScoreLabel ?? null,
      freezeAuthority: match?.audit?.freezeAuthorityDisabled === false ? "active" : null,
      mint_authority:  match?.audit?.mintAuthorityDisabled   === false ? "active" : null,
      topHoldersPercentage: match?.audit?.topHoldersPercentage ?? null,
      devMints:  match?.audit?.devMints ?? null,
      twitter:   match?.twitter  ?? null,
      website:   match?.website  ?? null,
      telegram:  match?.telegram ?? null,
      discord:   match?.discord  ?? null,
      launchpad:   match?.launchpad   ?? null,
      graduatedAt: match?.graduatedAt ?? null,
      tags: match?.tags || (match?.isVerified ? ["verified"] : []),
    });

    const isMintAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbol.trim());
    const knownMint  = TOKEN_MINTS[upper];
    if (knownMint || isMintAddr) {
      const targetMint = knownMint || symbol.trim();
      try {
        const detail = await jupFetch(`${JUP_TOKENS_API}/${targetMint}`);
        if (detail?.address || detail?.id) {
          const resolvedMint = detail.address || detail.id || targetMint;
          tokenCacheRef.current[upper] = resolvedMint;
          tokenDecimalsRef.current[upper] = detail.decimals ?? 6;
          return normalise(detail, resolvedMint);
        }
      } catch {}
    }

    try {
      const searchData = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbol)}`);
      const list  = Array.isArray(searchData) ? searchData : (searchData?.tokens || searchData?.data || []);
      const match = list.find(t => t.symbol?.toUpperCase() === upper && (t.id || t.address) === cachedMint)
                 || list.find(t => t.symbol?.toUpperCase() === upper)
                 || (cachedMint ? list.find(t => (t.id || t.address) === cachedMint) : null)
                 || list[0];
      const mint  = match?.id || match?.address || cachedMint;
      if (mint) {
        tokenCacheRef.current[upper] = mint;
        tokenDecimalsRef.current[upper] = match?.decimals ?? 6;
        return normalise(match, mint);
      }
    } catch {}

    if (cachedMint) {
      try {
        const detail = await jupFetch(`${JUP_TOKENS_API}/${cachedMint}`);
        if (detail?.address || detail?.mint) return normalise(detail, cachedMint);
      } catch {}
    }
    return null;
  }, []);

  // ── Fetch tokens by tag (verified | lst) ────────────────────────────────────
  const fetchTokensByTag = useCallback(async (tag = "verified") => {
    try {
      const data = await jupFetch(`${JUP_TOKEN_TAG}?query=${encodeURIComponent(tag)}`);
      return Array.isArray(data) ? data : (data?.tokens || data?.data || []);
    } catch { return []; }
  }, []);

  // ── Fetch tokens by category ─────────────────────────────────────────────────
  const fetchTokensByCategory = useCallback(async (category = "toptrending", interval = "24h", limit = 20) => {
    try {
      const data = await jupFetch(`${JUP_TOKEN_CAT}/${category}/${interval}?limit=${limit}`);
      return Array.isArray(data) ? data : (data?.tokens || data?.data || []);
    } catch { return []; }
  }, []);

  // ── Fetch recently listed tokens ─────────────────────────────────────────────
  const fetchRecentTokens = useCallback(async (limit = 30) => {
    try {
      const data = await jupFetch(`${JUP_TOKEN_RECENT}?limit=${limit}`);
      return Array.isArray(data) ? data : (data?.tokens || data?.data || []);
    } catch { return []; }
  }, []);

  // ── Fetch xStocks (tokenized stocks) ────────────────────────────────────────
  const fetchXStocks = useCallback(async (limit = 15) => {
    const results = await Promise.allSettled(
      XSTOCK_SYMBOLS.slice(0, Math.max(limit, XSTOCK_SYMBOLS.length)).map(async (sym) => {
        const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(sym)}&limit=5`);
        const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
        return list.find(t => t.symbol?.toLowerCase() === sym.toLowerCase()) || null;
      })
    );
    return results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value).slice(0, limit);
  }, []);

  // ── Format a token list for chat display ────────────────────────────────────
  const fmtTokenList = (tokens, limit = 20) =>
    tokens.slice(0, limit).map((t, i) => {
      const sym  = t.symbol || "?";
      const name = t.name ? ` — ${t.name.slice(0, 28)}` : "";
      const price = t.usdPrice != null
        ? ` $${t.usdPrice < 1 ? t.usdPrice.toFixed(4) : t.usdPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`
        : "";
      const chg = t.stats24h?.priceChange != null
        ? ` (${t.stats24h.priceChange > 0 ? "+" : ""}${t.stats24h.priceChange.toFixed(2)}%)`
        : t.priceChange24h != null
          ? ` (${t.priceChange24h > 0 ? "+" : ""}${t.priceChange24h.toFixed(2)}%)` : "";
      const score  = t.organicScore != null ? ` · score ${t.organicScore}` : "";
      const ver    = t.isVerified  ? " ✓" : "";
      const addr   = t.id || t.address || t.mint;
      const logo   = t.icon || t.logoURI || (addr ? `https://img.jup.ag/tokens/${addr}` : "");
      const logoTag = logo ? `[img:${logo}]` : "";
      return `${i+1}. ${logoTag}**${sym}**${name}${ver}${price}${chg}${score}`;
    }).join("\n");

  return {
    prices, setPrices,
    tokenCacheRef, tokenDecimalsRef,
    resolveToken, fetchPrices,
    fetchTokenInfo, fetchTokensByTag, fetchTokensByCategory,
    fetchRecentTokens, fetchXStocks,
    fmtTokenList,
  };
}
