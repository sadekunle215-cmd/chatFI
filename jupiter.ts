/**
 * Jupiter API layer for React Native
 * All calls route through chatfi.pro backend (same proxy as web app)
 */

const BASE_URL = "https://chatfi.pro";

const JUP_BASE        = "https://api.jup.ag";
const JUP_LITE        = "https://lite-api.jup.ag";
const JUP_PRICE_API   = `${JUP_BASE}/price/v3`;
const JUP_TOKEN_SEARCH= `${JUP_BASE}/tokens/v2/search`;
const JUP_TOKEN_CAT   = `${JUP_BASE}/tokens/v2`;
const JUP_SWAP_ORDER  = `${JUP_BASE}/swap/v2/order`;
const JUP_SWAP_EXEC   = `${JUP_BASE}/swap/v2/execute`;
const JUP_TRIGGER_BASE= `${JUP_BASE}/trigger/v1`;
const JUP_TV2         = `${JUP_BASE}/trigger/v2`;
const JUP_RECUR_BASE  = `${JUP_BASE}/recurring/v1`;
const JUP_PORTFOLIO   = `${JUP_BASE}/portfolio/v1`;
const JUP_PRED_API    = "https://lite-api.jup.ag/prediction/v1";
const JUP_EARN_API    = `${JUP_BASE}/lend/v1/earn`;
const JUP_PERPS_API   = `${JUP_BASE}/perps/v1`;
const JUP_ROUTE_API   = `${JUP_BASE}/swap/v1/quote`;
const JUP_LOCK_API    = `${JUP_BASE}/lock/v1`;

export { JUP_BASE, JUP_LITE, JUP_PRICE_API, JUP_TOKEN_SEARCH,
         JUP_SWAP_ORDER, JUP_SWAP_EXEC, JUP_TRIGGER_BASE, JUP_TV2,
         JUP_RECUR_BASE, JUP_PORTFOLIO, JUP_PRED_API, JUP_EARN_API,
         JUP_PERPS_API, JUP_ROUTE_API, JUP_LOCK_API, JUP_TOKEN_CAT };

// ── Proxy — identical to web app's /api/jupiter ──────────────────────────────
export const jupFetch = async (url: string, options: any = {}): Promise<any> => {
  const payload: any = { url, method: (options.method || "GET").toUpperCase() };
  if (options.body !== undefined) {
    payload.body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
  }
  if (url.includes("/lend/v1/") || url.includes("/studio/v1/")) {
    payload.apiKey = options.apiKey || "";
  }
  const res = await fetch(`${BASE_URL}/api/jupiter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Proxy error (${res.status}): ${text.slice(0, 200)}`); }
};

// Direct fetch for prediction endpoints (geo-sensitive)
export const predFetch = async (url: string, options: any = {}): Promise<any> => {
  const method = (options.method || "GET").toUpperCase();
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(options.body && method !== "GET" ? { body: JSON.stringify(options.body) } : {}),
  });
  return res.json();
};

// ── Token resolution cache ───────────────────────────────────────────────────
const tokenCache: Record<string, string>  = {};
const decimalCache: Record<string, number> = {};

export const resolveToken = async (symbolOrName: string): Promise<{ mint: string; decimals: number } | null> => {
  if (!symbolOrName) return null;
  const upper = symbolOrName.toUpperCase();
  if (tokenCache[upper]) return { mint: tokenCache[upper], decimals: decimalCache[upper] ?? 6 };

  const tryParse = (data: any, sym: string) => {
    const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
    const match = list.find((t: any) => t.symbol?.toUpperCase() === sym) || list[0];
    const mint = match?.id || match?.address;
    return mint ? { mint, decimals: match.decimals ?? 6 } : null;
  };

  try {
    const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbolOrName)}`);
    const r = tryParse(data, upper);
    if (r) { tokenCache[upper] = r.mint; decimalCache[upper] = r.decimals; return r; }
  } catch {}

  try {
    const data = await jupFetch(`${JUP_BASE}/tokens/v1/search?query=${encodeURIComponent(symbolOrName)}&limit=20`);
    const r = tryParse(data, upper);
    if (r) { tokenCache[upper] = r.mint; decimalCache[upper] = r.decimals; return r; }
  } catch {}
  return null;
};

export const getTokenCache = () => tokenCache;
export const getDecimalCache = () => decimalCache;
export const setTokenCache = (sym: string, mint: string, decimals: number) => {
  tokenCache[sym.toUpperCase()] = mint;
  decimalCache[sym.toUpperCase()] = decimals;
};

// ── Price fetch ───────────────────────────────────────────────────────────────
import { TOKEN_MINTS } from "../constants/tokens";

export const fetchPrices = async (symbols: string[] = Object.keys(TOKEN_MINTS)): Promise<Record<string, number>> => {
  try {
    const mints = symbols
      .map(t => tokenCache[t.toUpperCase()] || TOKEN_MINTS[t.toUpperCase()])
      .filter(Boolean);
    if (!mints.length) return {};
    const json = await jupFetch(`${JUP_PRICE_API}?ids=${mints.join(",")}`);
    const out: Record<string, number> = {};
    for (const [mint, info] of Object.entries(json || {})) {
      const sym = Object.entries(tokenCache).find(([, v]) => v === mint)?.[0]
        || Object.entries(TOKEN_MINTS).find(([, v]) => v === mint)?.[0];
      if (sym && (info as any)?.usdPrice) out[sym] = parseFloat((info as any).usdPrice);
    }
    return out;
  } catch { return {}; }
};

// ── Token info ────────────────────────────────────────────────────────────────
export const fetchTokenInfo = async (symbol: string): Promise<any> => {
  const upper = symbol.toUpperCase();
  const mint = tokenCache[upper] || TOKEN_MINTS[upper];
  if (mint) {
    try {
      const data = await jupFetch(`${JUP_BASE}/tokens/v2/${mint}`);
      if (data && !data.error && data.id) {
        tokenCache[upper] = data.id;
        decimalCache[upper] = data.decimals ?? 6;
        return data;
      }
    } catch {}
  }
  try {
    const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbol)}`);
    const list = Array.isArray(data) ? data : data?.tokens || data?.data || [];
    const match = list.find((t: any) => t.symbol?.toUpperCase() === upper) || list[0];
    if (match) {
      const m = match.id || match.address;
      if (m) { tokenCache[upper] = m; decimalCache[upper] = match.decimals ?? 6; }
      return match;
    }
  } catch {}
  return null;
};

// ── Price chart history ───────────────────────────────────────────────────────
export const fetchPriceHistory = async (mint: string, range: "1H" | "4H" | "1D" | "7D" | "30D" = "1D"): Promise<{ t: number; p: number }[]> => {
  const now = Math.floor(Date.now() / 1000);
  const rangeMap: Record<string, number> = {
    "1H": 3600, "4H": 14400, "1D": 86400, "7D": 604800, "30D": 2592000,
  };
  const from = now - rangeMap[range];

  try {
    const data = await jupFetch(`${JUP_BASE}/price/v3/history?id=${mint}&from=${from}&to=${now}&resolution=${range === "30D" ? "1D" : "1H"}`);
    const items: any[] = Array.isArray(data) ? data : data?.data || data?.items || [];
    return items.map((d: any) => ({ t: d.time ?? d.timestamp ?? d.t, p: parseFloat(d.price ?? d.p ?? 0) })).filter(d => d.p > 0);
  } catch {}

  try {
    const res = await fetch(`https://birdeye-proxy.jup.ag/defi/history_price?address=${mint}&address_type=token&type=${range === "30D" ? "1D" : "1H"}&time_from=${from}&time_to=${now}`);
    const data = await res.json();
    const items = data?.data?.items || [];
    return items.map((d: any) => ({ t: d.unixTime, p: d.value })).filter((d: any) => d.p > 0);
  } catch {}
  return [];
};

// ── Swap quote ────────────────────────────────────────────────────────────────
export const fetchSwapQuote = async (fromMint: string, toMint: string, amountRaw: string, slippageBps = 50): Promise<any> => {
  const data = await jupFetch(`${JUP_BASE}/swap/v1/quote?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&slippageBps=${slippageBps}`);
  if (data?.error) throw new Error(data.error?.message || JSON.stringify(data.error));
  return data;
};

// ── Swap execute ──────────────────────────────────────────────────────────────
export const buildSwapTransaction = async (quoteResponse: any, userPublicKey: string): Promise<string> => {
  // v2 order endpoint
  const orderRes = await jupFetch(JUP_SWAP_ORDER, {
    method: "POST",
    body: { quoteResponse, userPublicKey, wrapAndUnwrapSol: true },
  });
  if (orderRes?.error) throw new Error(orderRes.error?.message || JSON.stringify(orderRes.error));
  const txB64 = orderRes?.transaction || orderRes?.swapTransaction;
  if (!txB64) throw new Error("No transaction returned from Jupiter swap.");
  return txB64;
};

// ── Portfolio ─────────────────────────────────────────────────────────────────
export const fetchPortfolio = async (walletAddress: string): Promise<any> => {
  return jupFetch(`${JUP_PORTFOLIO}/wallet/${walletAddress}`);
};

// ── SOL + SPL balances via Solana RPC ─────────────────────────────────────────
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const SPL_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export const fetchSolanaBalances = async (wallet: string): Promise<{ SOL: number; [key: string]: number }> => {
  const balances: Record<string, number> = { SOL: 0 };
  try {
    const solRes = await fetch(SOLANA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [wallet] }),
    });
    const solData = await solRes.json();
    if (solData?.result?.value != null) balances.SOL = solData.result.value / 1e9;
  } catch {}

  try {
    const tokRes = await fetch(SOLANA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "getTokenAccountsByOwner",
        params: [wallet, { programId: SPL_PROGRAM }, { encoding: "jsonParsed" }],
      }),
    });
    const tokData = await tokRes.json();
    const accounts = tokData?.result?.value || [];
    for (const acct of accounts) {
      const info = acct.account?.data?.parsed?.info;
      if (!info) continue;
      const mint = info.mint;
      const sym = Object.entries(TOKEN_MINTS).find(([, v]) => v === mint)?.[0]
        || Object.entries(tokenCache).find(([, v]) => v === mint)?.[0];
      const amt = parseFloat(info.tokenAmount?.uiAmount || 0);
      if (sym && amt > 0) balances[sym] = amt;
    }
  } catch {}
  return balances;
};

// ── Earn vaults ───────────────────────────────────────────────────────────────
export const fetchEarnVaults = async (): Promise<any[]> => {
  try {
    const data = await jupFetch(`${JUP_EARN_API}/tokens`);
    const tokens = Array.isArray(data) ? data : data?.data || [];
    return tokens.map((v: any) => {
      const parseRate = (r: any) => { const n = parseFloat(r || 0); return n > 100 ? n / 100 : n; };
      const apy = parseRate(v.totalRate) || parseRate(v.supplyRate);
      return {
        ...v,
        apy: apy > 0 ? apy.toFixed(apy >= 10 ? 1 : 2) + "%" : "N/A",
        token: v.asset?.symbol || v.symbol || "?",
        name: v.name || v.asset?.name || "Vault",
        tvl: parseFloat(v.totalSupply || v.totalAssets || 0),
        utilization: parseFloat(v.utilization || 0) * 100,
        assetMint: v.asset?.address || v.mint || "",
        decimals: v.asset?.decimals ?? v.decimals ?? 6,
      };
    });
  } catch { return []; }
};

// ── Recurring orders ──────────────────────────────────────────────────────────
export const fetchRecurringOrders = async (wallet: string): Promise<any[]> => {
  try {
    const data = await jupFetch(`${JUP_RECUR_BASE}/getRecurringOrders?wallets=${wallet}&status=active`);
    return Array.isArray(data?.recurringOrders) ? data.recurringOrders
         : Array.isArray(data) ? data : [];
  } catch { return []; }
};

// ── Trigger orders ────────────────────────────────────────────────────────────
export const fetchTriggerOrders = async (wallet: string): Promise<any[]> => {
  try {
    const data = await jupFetch(`${JUP_TRIGGER_BASE}/getTriggerOrders?wallet=${wallet}&status=open`);
    return Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : [];
  } catch { return []; }
};

// ── Prediction markets ────────────────────────────────────────────────────────
export const fetchPredictionMarkets = async (category?: string): Promise<any[]> => {
  try {
    const p = new URLSearchParams({ includeMarkets: "true", sortBy: "volume", sortDirection: "desc", end: "100" });
    if (category) p.set("category", category.toLowerCase());
    const data = await predFetch(`${JUP_PRED_API}/events?${p.toString()}`);
    const events = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    return events;
  } catch { return []; }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
export const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

export const bytesToB64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

export const formatPrice = (p: number): string => {
  if (!p) return "$0";
  if (p >= 1000) return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1) return "$" + p.toFixed(4);
  if (p >= 0.001) return "$" + p.toFixed(6);
  return "$" + p.toExponential(3);
};

export const formatUsd = (v: number): string => {
  if (!v && v !== 0) return "$0";
  if (Math.abs(v) >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(2) + "K";
  return "$" + v.toFixed(2);
};
