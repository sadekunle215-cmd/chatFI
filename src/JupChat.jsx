import { useState, useEffect, useRef, useCallback } from "react";
import { VersionedTransaction } from "@solana/web3.js";

// ─── Jupiter API endpoints (verified against developers.jup.ag docs Apr 2026) ─
const JUP_BASE         = "https://api.jup.ag";
const JUP_LITE         = "https://lite-api.jup.ag";
const JUP_PRICE_API    = `${JUP_BASE}/price/v3`;             // v3: usdPrice field, priceChange24h
const JUP_TOKENS_API   = `${JUP_BASE}/tokens/v1/token`;
const JUP_TOKEN_SEARCH = `${JUP_BASE}/tokens/v1/search`;
const JUP_SWAP_ORDER   = `${JUP_BASE}/swap/v2/order`;        // v2 meta-aggregator (RTSE auto, gasless auto)
const JUP_SWAP_EXEC    = `${JUP_BASE}/swap/v2/execute`;      // v2 execute
const JUP_TRIGGER_BASE = `${JUP_BASE}/trigger/v1`;
const JUP_TRIGGER_EXEC = `${JUP_LITE}/trigger/v1/execute`;
const JUP_PORTFOLIO    = `${JUP_BASE}/portfolio/v1`;
const JUP_PRED_API     = `${JUP_BASE}/prediction/v1`;
const JUP_EARN_API     = `${JUP_BASE}/lend/v1/earn`;
const SOLANA_RPC       = "SOLANA_RPC";
const SPL_PROGRAM      = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
// JupUSD mint for prediction market deposits
const JUPUSD_MINT      = "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD";
const USDC_MINT        = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Popular tokens — expands dynamically as user searches
const TOKEN_MINTS = {
  SOL:     "So11111111111111111111111111111111111111112",
  JUP:     "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK:    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF:     "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  USDC:    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT:    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  RAY:     "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  PYTH:    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  MSOL:    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  JITOSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  BSOL:    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
  SAMO:    "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  ORCA:    "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  POPCAT:  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  TRUMP:   "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
};

const TOKEN_DECIMALS = {
  SOL:9, JUP:6, BONK:5, WIF:6, USDC:6, USDT:6, RAY:6, PYTH:6,
  MSOL:9, JITOSOL:9, BSOL:9, SAMO:9, ORCA:6, POPCAT:9, TRUMP:6,
};

// Jupiter Prediction categories (per official API docs)
const PRED_CATEGORIES = ["sports","crypto","politics","esports","culture","economics","tech"];

// ─── AI system prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ChatFi — a sharp, honest AI trading assistant built on Jupiter DEX (Solana). Tone: thoughtful, direct, warm — never hyped.

You pull live data: token prices (Jupiter Price API v3), safety scores, metadata. You help users swap ANY Solana token, set limit/DCA orders, track full portfolios (wallet balances + DeFi positions + prediction market positions + earn positions), research tokens, analyse sports for prediction markets, and earn yield via Jupiter Lend vaults.

ALWAYS reply in this exact raw JSON — no markdown fences, no text outside:
{
  "text": "your message to the user",
  "action": null,
  "actionData": {}
}

Available actions:
- null               → just chat
- "FETCH_PRICE"      → actionData: { "tokens": ["SOL","JUP"] }
- "FETCH_TOKEN_INFO" → actionData: { "symbol": "BONK" }
- "FETCH_PORTFOLIO"  → actionData: { "wallet": "address_or_connected" } — fetches wallet balances + DeFi positions + prediction positions + earn positions + pending orders
- "SHOW_SWAP"        → actionData: { "from": "SOL", "to": "PEPE", "reason": "brief why" }
- "SHOW_TRIGGER"     → actionData: { "token": "SOL", "direction": "below", "hint": "brief why" }
- "SHOW_PREDICTION"  → actionData: { "teamA": "Arsenal", "teamB": "Man City", "sport": "football", "league": "Premier League", "analysis": "deep tactical breakdown with form, H2H, key players" }
- "FETCH_PREDICTIONS"→ actionData: { "sport": "sports", "query": null } — sport categories (exact): sports, crypto, politics, esports, culture, economics, tech. For specific leagues/competitions like "EPL", "Champions League", "NBA playoffs", set query to the search string instead of sport. Use null sport for all.
- "FETCH_EARN"       → actionData: { "filter": "highest_apy" or null }
- "CLAIM_PAYOUTS"    → actionData: {} — triggers fetch of claimable prediction positions

Rules:
- "buy X" / "swap X to Y" / "exchange" → SHOW_SWAP — use EXACT symbol user mentioned even if unknown meme coin
- "price of X" → FETCH_PRICE — ALWAYS use this for any token price, even unknown ones. The UI will search Jupiter for the mint. Use the token SYMBOL in the tokens array (e.g. "METEOR" for Meteora, "URANUS" for Uranus).
- "is X safe?" / "research X" / token info → FETCH_TOKEN_INFO — always attempt, UI searches Jupiter live
- "my portfolio" / "my wallet" / "my positions" / "my orders" / "my bets" → FETCH_PORTFOLIO
- "claim" / "claim winnings" / "claim payout" → CLAIM_PAYOUTS
- sports + predict/bet / "EPL" / "Champions League" / specific match → SHOW_PREDICTION with thorough analysis, AND suggest FETCH_PREDICTIONS with query set
- "predictions" / "show markets" / "what can I bet on" → FETCH_PREDICTIONS
- "earn" / "yield" / "APY" / "lend" / "passive income" / "staking" → FETCH_EARN
- "limit order" / "DCA" / "buy when price hits" → SHOW_TRIGGER
- NEVER say you don't have live data. ALWAYS trigger the appropriate action and let the UI fetch it. Never fabricate prices. Be concise.`;

const SUGGESTIONS = [
  "What's the SOL price?",
  "Swap SOL to BONK",
  "Is PEPE safe to buy?",
  "Arsenal vs Man City prediction",
  "Show open predictions",
  "Show earn vaults",
  "My portfolio & positions",
  "Claim my payouts",
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:       "#f5f0e8",
  sidebar:  "#ede8de",
  surface:  "#faf7f2",
  border:   "#ddd5c4",
  text1:    "#1a1410",
  text2:    "#5c4f3d",
  text3:    "#a09080",
  accent:   "#d97931",
  accentBg: "#fff3e8",
  green:    "#2a8a5e",
  greenBg:  "#edf7f2",
  greenBd:  "#b8ddc8",
  red:      "#c0392b",
  redBg:    "#fdf0ee",
  redBd:    "#f0c0b8",
  purple:   "#7c5cbf",
  purpleBg: "#f3effb",
  teal:     "#1a7a8a",
  tealBg:   "#e8f6f8",
  body:     "'DM Sans','Segoe UI',sans-serif",
  serif:    "'Lora','Georgia',serif",
  mono:     "'JetBrains Mono',monospace",
};

const fmt = (text = "") =>
  text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:#d97931;text-decoration:underline">$1</a>')
    .replace(/\n/g, "<br/>");

// ─── Token search picker component ───────────────────────────────────────────
function TokenPicker({ value, onSelect, jupFetch }) {
  const [query, setQuery]     = useState(value || "");
  const [results, setResults] = useState([]);
  const [busy, setBusy]       = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef(null);

  // Sync display when value changes externally
  useEffect(() => { if (!focused) setQuery(value || ""); }, [value, focused]);

  const search = (q) => {
    setQuery(q);
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        // Use higher limit and broader search for full Jupiter token list
        const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(q)}&limit=50`);
        const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
        // Prioritise: exact symbol match first, then sort by daily volume
        const upper = q.trim().toUpperCase();
        const sorted = [...list].sort((a, b) => {
          const aExact = a.symbol?.toUpperCase() === upper ? 1 : 0;
          const bExact = b.symbol?.toUpperCase() === upper ? 1 : 0;
          if (bExact !== aExact) return bExact - aExact;
          return (b.daily_volume || 0) - (a.daily_volume || 0);
        });
        setResults(sorted.slice(0, 20));
      } catch { setResults([]); }
      setBusy(false);
    }, 300);
  };

  const pick = (t) => {
    const sym = (t.symbol || "").toUpperCase();
    onSelect(sym, t.address, t.decimals ?? 6);
    setQuery(sym);
    setResults([]);
    setFocused(false);
  };

  return (
    <div style={{ flex:1, position:"relative" }}>
      <input
        value={query}
        onChange={e => search(e.target.value)}
        onFocus={() => { setFocused(true); if (query.trim()) search(query); }}
        onBlur={() => setTimeout(() => { setFocused(false); setResults([]); }, 200)}
        placeholder="Search token…"
        style={{ width:"100%", padding:"8px 10px", border:`2px solid ${focused ? T.accent : T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, outline:"none", transition:"border-color 0.15s" }}
      />
      {(busy || (results.length > 0 && focused)) && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:40, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, boxShadow:"0 6px 18px rgba(0,0,0,0.13)", overflow:"hidden", maxHeight:260, overflowY:"auto" }}>
          {busy && <div style={{ padding:"8px 12px", fontSize:12, color:T.text3 }}>Searching Jupiter…</div>}
          {!busy && results.length === 0 && query.length > 1 && (
            <div style={{ padding:"8px 12px", fontSize:12, color:T.text3 }}>No results for "{query}"</div>
          )}
          {results.map(t => (
            <div key={t.address} onMouseDown={() => pick(t)}
              style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${T.border}` }}
              className="hov-row"
            >
              <span><strong>{t.symbol}</strong>{t.name ? ` — ${t.name.slice(0,24)}` : ""}</span>
              {t.daily_volume > 0 && <span style={{ fontSize:10, color:T.text3 }}>${(t.daily_volume/1e3).toFixed(0)}k vol</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function JupChat() {
  const [msgs, setMsgs] = useState([{ id:1, role:"ai", text:"Good morning! I'm ChatFi, your AI trading assistant built on Jupiter DEX.\n\nI can pull live token prices, help you swap **any** Solana token, set limit orders, track your full portfolio — including prediction market positions, earn deposits, and pending orders — analyse sports for on-chain prediction bets, earn yield via Jupiter Lend vaults, and claim your prediction winnings.\n\nConnect your wallet to get started, or just ask me anything. Don't have a wallet? [Download Jupiter Wallet →](https://jup.ag/mobile)" }]);
  const [showWalletModal, setShowWalletModal] = useState(false);
  // WalletConnect state
  const [wcStatus, setWcStatus]   = useState("idle"); // "idle" | "loading" | "waiting" | "connected"
  const [wcUri, setWcUri]         = useState("");
  const wcClientRef               = useRef(null);
  const wcSessionRef              = useRef(null);
  const wcQrRef                   = useRef(null);
  const [input, setInput]         = useState("");
  const [typing, setTyping]       = useState(false);
  const [wallet, setWallet]       = useState(null);
  const [walletFull, setWalletFull] = useState(null);
  const [prices, setPrices]       = useState({});
  const [portfolio, setPortfolio] = useState({});

  // Swap — stores symbol + resolved mint + decimals for any token
  const [showSwap, setShowSwap]   = useState(false);
  const [swapCfg, setSwapCfg]     = useState({
    from:"SOL", fromMint:TOKEN_MINTS.SOL, fromDecimals:9,
    to:"JUP",   toMint:TOKEN_MINTS.JUP,   toDecimals:6,
    amount:""
  });
  const [swapQuote, setSwapQuote] = useState(null);
  const [quoteFetching, setQF]    = useState(false);
  const [swapStatus, setSwapStatus] = useState(null);
  const [swapTxid, setSwapTxid]   = useState(null);

  // Limit order
  const [showTrig, setShowTrig]   = useState(false);
  const [trigCfg, setTrigCfg]     = useState({ token:"SOL", targetPrice:"", amount:"", direction:"below" });

  // Predictions — AI analysis panel (SHOW_PREDICTION action)
  const [showPred, setShowPred]   = useState(false);
  const [pred, setPred]           = useState(null);
  const [pick, setPick]           = useState(null);
  const [stake, setStake]         = useState("10");
  // Predictions — live market list (FETCH_PREDICTIONS action)
  const [showPredList, setShowPredList] = useState(false);
  const [predMarkets, setPredMarkets]   = useState([]);
  const [predCategory, setPredCategory] = useState(null);
  // Prediction on-chain bet panel (opened from live market list)
  const [showBet, setShowBet]         = useState(false);
  const [betMarket, setBetMarket]     = useState(null);
  const [betSide, setBetSide]         = useState(null);
  const [betAmount, setBetAmount]     = useState("5");
  const [betStatus, setBetStatus]     = useState(null);

  // Earn / Lend
  const [showEarn, setShowEarn]           = useState(false);
  const [earnVaults, setEarnVaults]       = useState([]);
  const [earnLoading, setEarnLoading]     = useState(false);
  const [earnDeposit, setEarnDeposit]     = useState({ vault:null, amount:"" });
  const [showEarnDeposit, setShowEarnDeposit] = useState(false);

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState([{ id:"default", title:"New conversation", active:true }]);

  // Dynamic token cache — grows as user searches any token
  const tokenCacheRef    = useRef({ ...TOKEN_MINTS });
  const tokenDecimalsRef = useRef({ ...TOKEN_DECIMALS });

  const histRef     = useRef([]);
  const endRef      = useRef(null);
  const textareaRef = useRef(null);

  // ── Fonts + global CSS ──────────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
      @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      @keyframes blink  { 0%,80%,100%{opacity:0.15} 40%{opacity:0.9} }
      @keyframes spin   { to{transform:rotate(360deg)} }
      .msg-enter { animation:fadeUp 0.22s ease forwards; }
      ::-webkit-scrollbar { width:5px; height:5px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:#d4c9b5; border-radius:6px; }
      textarea { resize:none; }
      textarea::placeholder, input::placeholder { color:#b0a090; }
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      select option { background:#faf7f2; color:#1a1410; }
      code { font-family:'JetBrains Mono',monospace; background:#ede8de; padding:1px 5px; border-radius:3px; font-size:0.87em; color:#7a5c00; }
      .dot1,.dot2,.dot3 { display:inline-block; width:7px; height:7px; border-radius:50%; background:#b5a896; animation:blink 1.2s infinite; }
      .dot2{animation-delay:0.2s} .dot3{animation-delay:0.4s}
      .hov-row:hover { background:#e8e2d5 !important; }
      .hov-btn:hover { opacity:0.8; }
      .hov-sugg:hover { background:#e8e2d5 !important; color:#3d2e1e !important; }
      .hov-pick:hover { border-color:#d97931 !important; }
      .send-btn:not(:disabled):hover { background:#c4562a !important; }
      .spinner { width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.7s linear infinite; }
      .vault-card:hover { border-color:#d97931 !important; background:#fff3e8 !important; }
      .market-row:hover { background:#e8e2d5 !important; cursor:pointer; }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, typing, showSwap, showPred, showPredList, showEarn, showTrig]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  // Render WalletConnect QR code when URI is ready
  useEffect(() => {
    if (wcStatus !== "waiting" || !wcUri) return;
    const render = () => {
      if (wcQrRef.current && window.QRCode) {
        window.QRCode.toCanvas(wcQrRef.current, wcUri, { width: 240, margin: 2, color: { dark: "#1a1410", light: "#faf7f2" } }, () => {});
      }
    };
    if (window.QRCode) { render(); return; }
    // Load qrcode lib if not yet loaded
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode@1/build/qrcode.min.js";
    s.onload = render;
    document.head.appendChild(s);
  }, [wcStatus, wcUri]);

  // Debounce swap quote fetch when swap config changes
  useEffect(() => {
    if (!swapCfg.fromMint || !swapCfg.toMint) { setSwapQuote(null); return; }
    const t = setTimeout(() => fetchSwapQuote(), 600);
    return () => clearTimeout(t);
  }, [swapCfg.fromMint, swapCfg.toMint, swapCfg.amount, showSwap]);

  // ── Proxy helper ────────────────────────────────────────────────────────────
  // All Jupiter API calls go through /api/jupiter (Vercel serverless) which injects the API key
  const jupFetch = async (url, options = {}) => {
    const payload = { url, method: (options.method || "GET").toUpperCase() };
    if (options.body !== undefined) {
      payload.body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    }
    const res = await fetch("/api/jupiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  };

  // ── Resolve any token symbol → { mint, decimals } ───────────────────────────
  const resolveToken = async (symbolOrName) => {
    if (!symbolOrName) return null;
    const upper = symbolOrName.toUpperCase();
    if (tokenCacheRef.current[upper]) {
      return { mint: tokenCacheRef.current[upper], decimals: tokenDecimalsRef.current[upper] ?? 6 };
    }
    try {
      const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbolOrName)}&limit=3`);
      const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
      // Prefer exact symbol match first
      const match = list.find(t => t.symbol?.toUpperCase() === upper) || list[0];
      if (match?.address) {
        tokenCacheRef.current[upper] = match.address;
        tokenDecimalsRef.current[upper] = match.decimals ?? 6;
        return { mint: match.address, decimals: match.decimals ?? 6 };
      }
    } catch {}
    return null;
  };

  // ── Jupiter Price API v3 ────────────────────────────────────────────────────
  // v3: GET /price/v3?ids=mint1,mint2 → { mint: { usdPrice, priceChange24h, decimals, blockId } }
  const fetchPrices = useCallback(async (tokens = Object.keys(TOKEN_MINTS)) => {
    try {
      const mints = tokens.map(t => tokenCacheRef.current[t.toUpperCase()] || TOKEN_MINTS[t.toUpperCase()]).filter(Boolean);
      if (!mints.length) return {};
      const json = await jupFetch(`${JUP_PRICE_API}?ids=${mints.join(",")}`);
      const out  = {};
      // v3 response: top-level object keyed by mint address, each with { usdPrice, ... }
      for (const [mint, info] of Object.entries(json || {})) {
        const sym = Object.entries(tokenCacheRef.current).find(([, v]) => v === mint)?.[0];
        if (sym && info?.usdPrice) out[sym] = parseFloat(info.usdPrice);
      }
      setPrices(p => ({ ...p, ...out }));
      return out;
    } catch { return {}; }
  }, []);

  // ── Token info — search by symbol, return rich metadata ────────────────────
  const fetchTokenInfo = async (symbol) => {
    if (!symbol) return null;
    try {
      // First try direct search for exact symbol match
      const searchData = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbol)}&limit=5`);
      const list = Array.isArray(searchData) ? searchData : (searchData?.tokens || searchData?.data || []);
      const upper = symbol.toUpperCase();
      // Prefer exact symbol match
      const match = list.find(t => t.symbol?.toUpperCase() === upper) || list[0];
      if (match?.address) {
        // Cache for future use
        tokenCacheRef.current[upper] = match.address;
        tokenDecimalsRef.current[upper] = match.decimals ?? 6;
        // Also fetch full token details from /tokens/v1/token/{mint}
        try {
          const detail = await jupFetch(`${JUP_TOKENS_API}/${match.address}`);
          // Merge search result + detail (detail may have richer metadata)
          return { ...match, ...(detail || {}) };
        } catch {}
        return match;
      }
    } catch {}
    return null;
  };

  // ── Portfolio — full on-demand: wallet balances + DeFi positions + prediction + earn ─
  const fetchPortfolioData = async (walletAddress) => {
    if (!walletAddress) return null;
    const results = {};
    // 1. Jupiter portfolio (DeFi positions — perps, etc.)
    try { results.defi = await jupFetch(`${JUP_PORTFOLIO}/wallet/${walletAddress}`); } catch {}
    // 2. Prediction market open positions
    try {
      const pred = await jupFetch(`${JUP_PRED_API}/positions?ownerPubkey=${walletAddress}`);
      results.predPositions = Array.isArray(pred) ? pred : (pred?.data || []);
    } catch {}
    // 3. Prediction market open orders
    try {
      const orders = await jupFetch(`${JUP_PRED_API}/orders?ownerPubkey=${walletAddress}`);
      results.predOrders = Array.isArray(orders) ? orders : (orders?.data || []);
    } catch {}
    // 4. Earn (lend) positions
    try {
      const earn = await jupFetch(`${JUP_EARN_API}/positions?users=${walletAddress}`);
      results.earnPositions = Array.isArray(earn) ? earn : (earn?.data || []);
    } catch {}
    return results;
  };

  // ── Predictions — GET /prediction/v1/events with broader fetch ──────────────
  const fetchPredictionMarkets = async (category = null, searchQuery = null) => {
    // If searching for specific competition/league, use /events/search
    if (searchQuery) {
      try {
        const data = await jupFetch(`${JUP_PRED_API}/events/search?query=${encodeURIComponent(searchQuery)}&limit=20`);
        const events = Array.isArray(data) ? data : (data?.data || data?.events || []);
        if (events.length > 0) return { markets: events, source: "search" };
      } catch {}
    }

    // Fetch events — no filter param so we get all statuses (open + upcoming)
    // Use pagination: end=50 to get more results
    const buildUrl = (params) => `${JUP_PRED_API}/events?${params.toString()}`;

    const attempts = [
      // First: with category, broader fetch
      () => {
        const p = new URLSearchParams({ includeMarkets: "true", end: "50" });
        if (category) p.set("category", category.toLowerCase());
        return buildUrl(p);
      },
      // Second: without category (all markets)
      () => {
        const p = new URLSearchParams({ includeMarkets: "true", end: "50" });
        return buildUrl(p);
      },
    ];

    for (const getUrl of attempts) {
      try {
        const data = await jupFetch(getUrl());
        const events =
          Array.isArray(data)        ? data         :
          data?.data?.length         ? data.data    :
          data?.events?.length       ? data.events  : [];
        if (events.length > 0) return { markets: events, source: "api" };
      } catch { /* try next */ }
    }
    return { markets: [], source: "empty" };
  };

  // ── Earn / Lend vaults — correct endpoint: GET /lend/v1/earn/tokens ───────
  const fetchEarnVaults = async () => {
    setEarnLoading(true);
    try {
      const data = await jupFetch(`${JUP_EARN_API}/tokens`);
      const tokens = Array.isArray(data) ? data : (data?.data || []);
      if (tokens.length > 0) {
        const normalized = tokens.map(v => {
          // Jupiter API returns rates as percentages already (e.g. 12.5 = 12.5% APY)
          // NOT raw decimals — do NOT multiply by 100
          const totalRateRaw   = parseFloat(v.totalRate   || 0);
          const supplyRateRaw  = parseFloat(v.supplyRate  || 0);
          const rewardsRateRaw = parseFloat(v.rewardsRate || 0);
          const apyVal = totalRateRaw || supplyRateRaw;

          // Format cleanly: cap display at 9999% to avoid absurd numbers
          const fmtApy = (r) => {
            if (!r || r <= 0) return "N/A";
            if (r >= 10000) return ">9999%";
            if (r >= 100)   return r.toFixed(1) + "%";
            return r.toFixed(2) + "%";
          };

          const decimals = v.asset?.decimals ?? v.decimals ?? 6;
          return {
            id:           v.id || v.address || Math.random().toString(36).slice(2),
            name:         v.name || `Jupiter Lend ${v.asset?.symbol || v.symbol || ""}`,
            token:        v.asset?.symbol || v.symbol || "SOL",
            assetMint:    v.asset?.address || v.assetMint || v.mint || v.address || null,
            assetDecimals: decimals,
            apy:          apyVal,
            apyDisplay:   fmtApy(apyVal),
            supplyApy:    fmtApy(supplyRateRaw),
            rewardsApy:   rewardsRateRaw > 0 ? fmtApy(rewardsRateRaw) : null,
            tvl:          v.totalAssets ? (parseFloat(v.totalAssets) / Math.pow(10, decimals)) : 0,
            protocol:     "Jupiter Lend",
            description:  `Supply ${v.asset?.symbol || v.symbol || ""}${rewardsRateRaw > 0 ? ` · Rewards ${fmtApy(rewardsRateRaw)}` : ""}`,
            logoUrl:      v.asset?.logo_url || v.logoUrl || "",
            price:        v.asset?.price || 0,
          };
        }).sort((a, b) => b.apy - a.apy);
        setEarnVaults(normalized);
        setEarnLoading(false);
        return;
      }
    } catch { /* fall through */ }
    setEarnVaults([]);
    setEarnLoading(false);
  };

  // ── Earn deposit — real on-chain tx via POST /lend/v1/earn/deposit ────────────
  const doEarnDeposit = async () => {
    const { vault, amount } = earnDeposit;
    if (!amount || parseFloat(amount) <= 0) return;
    if (!walletFull) { push("ai", "Connect your wallet first to deposit."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    // Get the asset mint from the vault object
    const assetMint = vault.assetMint;
    if (!assetMint) {
      push("ai", `Could not resolve asset mint for **${vault.name}**. Please try again.`);
      return;
    }
    const decimals = vault.assetDecimals || 6;
    const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, decimals)).toString();

    setShowEarnDeposit(false);
    push("ai", `Preparing deposit of **${amount} ${vault.token}** into **${vault.name}** (${vault.apyDisplay} APY)…`);
    try {
      const res = await jupFetch(`${JUP_EARN_API}/deposit`, {
        method: "POST",
        body: { asset: assetMint, amount: amountRaw, signer: walletFull },
      });
      if (res.error) throw new Error(typeof res.error === "object" ? JSON.stringify(res.error) : res.error);
      if (!res.transaction) throw new Error("No transaction returned from Jupiter Lend.");

      const binaryStr = atob(res.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing.");
      const signedTx = await provider.signTransaction(tx);

      // Send via Solana RPC
      const signedBytes = signedTx.serialize();
      const rpcRes = await jupFetch(SOLANA_RPC, {
        method: "POST",
        body: { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [btoa(String.fromCharCode(...signedBytes)), { encoding: "base64", skipPreflight: true }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Transaction failed to send.");

      setShowEarn(false);
      push("ai", `Deposit submitted ✓\n\n**${amount} ${vault.token}** deposited into **${vault.name}**\n\nTransaction: \`${signature.slice(0, 20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
      const updated = await fetchSolanaBalances(walletFull);
      setPortfolio(updated);
    } catch (err) {
      push("ai", `Deposit failed: ${err?.message || "Unknown error"}. Please check your balance and try again.`);
    }
  };

  // ── Prediction on-chain bet — POST /prediction/v1/orders ────────────────────
  const doPredictionBet = async () => {
    if (!betMarket || !betSide || !betAmount || parseFloat(betAmount) < 5) return;
    if (!walletFull) { push("ai", "Connect your wallet first to place a prediction bet."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    // depositAmount in native USDC/JupUSD units (1 USD = 1_000_000)
    const depositAmount = Math.floor(parseFloat(betAmount) * 1_000_000).toString();
    const isYes = betSide === "yes";

    setBetStatus("signing");
    setShowBet(false);
    push("ai", `Placing **${betSide.toUpperCase()}** bet of **$${betAmount} USDC** on: _${betMarket.title}_…`);

    try {
      const orderRes = await jupFetch(`${JUP_PRED_API}/orders`, {
        method: "POST",
        body: {
          ownerPubkey: walletFull,
          marketId: betMarket.marketId,
          isYes,
          isBuy: true,
          depositAmount,
          depositMint: USDC_MINT,
        },
      });
      if (orderRes.error) throw new Error(typeof orderRes.error === "object" ? JSON.stringify(orderRes.error) : orderRes.error);
      if (!orderRes.transaction) throw new Error("No transaction returned from Jupiter Prediction.");

      const binaryStr = atob(orderRes.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing.");
      const signedTx = await provider.signTransaction(tx);

      // Send via Solana RPC
      const signedBytes = signedTx.serialize();
      const rpcRes = await jupFetch(SOLANA_RPC, {
        method: "POST",
        body: { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [btoa(String.fromCharCode(...signedBytes)), { encoding: "base64", skipPreflight: true }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Transaction failed to send.");

      const orderPubkey = orderRes?.order?.orderPubkey;
      const contracts   = orderRes?.order?.contracts;
      setBetStatus("done");
      push("ai", `Prediction order submitted ✓\n\n**${betSide.toUpperCase()}** on _${betMarket.title}_\nAmount: **$${betAmount} USDC**${contracts ? `  ·  Contracts: **${contracts}**` : ""}\n\nTransaction: \`${signature.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})${orderPubkey ? `\n\nOrder account: \`${orderPubkey.slice(0,20)}…\`` : ""}`);
    } catch (err) {
      setBetStatus("error");
      push("ai", `Prediction bet failed: ${err?.message || "Unknown error"}. Please check your USDC balance (minimum $5) and try again.`);
    }
    setBetStatus(null);
  };

  // ── Claim prediction payouts — POST /prediction/v1/positions/{pubkey}/claim ─
  const doClaimPayouts = async (introText = "") => {
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet not connected. Please connect to claim payouts."); return; }

    push("ai", (introText ? introText + "\n\n" : "") + "Checking for claimable prediction positions…");
    try {
      const res = await jupFetch(`${JUP_PRED_API}/positions?ownerPubkey=${walletFull}`);
      const positions = Array.isArray(res) ? res : (res?.data || []);
      const claimable = positions.filter(p => p.claimable === true && p.claimed === false);
      if (claimable.length === 0) {
        push("ai", "No claimable positions found. Winning payouts auto-claim within 24 hours of market settlement.");
        return;
      }
      const totalPayout = claimable.reduce((s, p) => s + parseInt(p.payoutUsd || 0), 0) / 1_000_000;
      push("ai", `Found **${claimable.length}** claimable position${claimable.length > 1 ? "s" : ""} worth **$${totalPayout.toFixed(2)} USDC** total. Claiming…`);

      let claimed = 0;
      for (const pos of claimable) {
        try {
          const claimRes = await jupFetch(`${JUP_PRED_API}/positions/${pos.pubkey}/claim`, {
            method: "POST",
            body: { ownerPubkey: walletFull },
          });
          if (!claimRes.transaction) throw new Error("No transaction in claim response.");

          const bytes = new Uint8Array(atob(claimRes.transaction).split("").map(c => c.charCodeAt(0)));
          const tx = VersionedTransaction.deserialize(bytes);
          if (!provider.signTransaction) throw new Error("Wallet cannot sign.");
          const signed = await provider.signTransaction(tx);
          const signedBytes = signed.serialize();
          const rpcRes = await jupFetch(SOLANA_RPC, {
            method: "POST",
            body: { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [btoa(String.fromCharCode(...signedBytes)), { encoding: "base64", skipPreflight: true }] },
          });
          const sig = rpcRes?.result;
          if (!sig) throw new Error(rpcRes?.error?.message || "Send failed.");
          const payoutUsd = (parseInt(pos.payoutUsd || 0) / 1_000_000).toFixed(2);
          const title = pos.marketMetadata?.title || pos.marketId || "market";
          push("ai", `✓ Claimed **$${payoutUsd} USDC** from _${title.slice(0, 50)}_\n[View on Solscan →](https://solscan.io/tx/${sig})`);
          claimed++;
        } catch (e) {
          push("ai", `Failed to claim position ${pos.pubkey?.slice(0, 12)}…: ${e?.message || "Unknown error"}`);
        }
      }
      if (claimed > 0) {
        const updated = await fetchSolanaBalances(walletFull);
        setPortfolio(updated);
      }
    } catch (err) {
      push("ai", `Could not fetch positions: ${err?.message || "Unknown error"}. Please try again.`);
    }
  };

  // ── Swap quote ──────────────────────────────────────────────────────────────
  const fetchSwapQuote = useCallback(async () => {
    const { fromMint, fromDecimals, toMint, amount } = swapCfg;
    if (!amount || parseFloat(amount) <= 0 || fromMint === toMint) return;
    if (!fromMint || !toMint) return;
    const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, fromDecimals || 9));
    setQF(true); setSwapQuote(null);
    try {
      const data = await jupFetch(`${JUP_SWAP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&taker=${walletFull || ""}`);
      if (data && !data.error && data.outAmount) setSwapQuote(data);
      else setSwapQuote(null);
    } catch { setSwapQuote(null); }
    setQF(false);
  }, [swapCfg, walletFull]);

  // ── Solana balances ─────────────────────────────────────────────────────────
  const fetchSolanaBalances = async (pubkey) => {
    try {
      const solJson = await jupFetch(SOLANA_RPC, { method:"POST", body:{ jsonrpc:"2.0", id:1, method:"getBalance", params:[pubkey,{ commitment:"confirmed" }] } });
      const sol = (solJson.result?.value || 0) / 1e9;
      const splJson = await jupFetch(SOLANA_RPC, { method:"POST", body:{ jsonrpc:"2.0", id:2, method:"getTokenAccountsByOwner", params:[pubkey,{ programId:SPL_PROGRAM },{ encoding:"jsonParsed", commitment:"confirmed" }] } });
      const balances = { SOL: sol };
      for (const acc of (splJson.result?.value || [])) {
        const info = acc.account.data.parsed.info;
        const sym  = Object.entries(tokenCacheRef.current).find(([, v]) => v === info.mint)?.[0];
        if (sym && info.tokenAmount.uiAmount > 0) balances[sym] = info.tokenAmount.uiAmount;
      }
      return balances;
    } catch { return {}; }
  };

  // ── WalletConnect — QR pairing flow ─────────────────────────────────────────
  // Dynamically loads @walletconnect/sign-client from CDN, generates a Solana
  // mainnet pairing URI, shows it as a QR code, waits for Jupiter Mobile to scan.

  const WC_PROJECT_ID = "21a9551a7eeedcd3c442d912b6ea336f";

  const loadWCScript = () =>
    new Promise((res, rej) => {
      // If already loaded AND class is resolvable, skip
      if (window._wcLoaded && resolveWCClass()) { res(); return; }

      // ── Node.js built-in polyfills required by WalletConnect UMD bundle ────
      // The WC UMD bundle references process/global/Buffer at runtime; without
      // these stubs the bundle throws internally and never sets window.SignClient.
      if (!window.global)  window.global  = window;
      if (!window.process) window.process = {
        env:      {},
        version:  "v16.0.0",
        browser:  true,
        nextTick: (cb, ...args) => setTimeout(() => cb(...args), 0),
      };
      if (typeof window.Buffer === "undefined") {
        // Minimal Buffer shim (WC only needs .from / .isBuffer / .alloc)
        try {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/buffer@6/index.min.js";
          document.head.appendChild(s);
          // Don't block on this — WC may not need Buffer at init time
        } catch {}
      }

      const CDNS = [
        "https://unpkg.com/@walletconnect/sign-client@2.17.0/dist/index.umd.js",
        "https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.17.0/dist/index.umd.js",
      ];
      const tryLoad = (i) => {
        if (i >= CDNS.length) {
          rej(new Error("WalletConnect SDK failed to load from all CDNs — window.SignClient not set. Open browser console for details."));
          return;
        }
        const s = document.createElement("script");
        s.src = CDNS[i];
        s.onload = () => {
          // Verify that the bundle actually populated a usable global.
          // Just trusting onload is wrong — the bundle may error internally
          // (e.g. missing process/Buffer) and fire onload without setting globals.
          if (resolveWCClass()) {
            window._wcLoaded = true;
            res();
          } else {
            // Script tag loaded but globals missing → try next CDN
            console.warn(`[JupChat] WC script loaded from ${CDNS[i]} but SignClient global not found, trying next CDN…`);
            tryLoad(i + 1);
          }
        };
        s.onerror = () => {
          console.warn(`[JupChat] Failed to fetch WC script from ${CDNS[i]}, trying next…`);
          tryLoad(i + 1);
        };
        document.head.appendChild(s);
      };
      tryLoad(0);
    });

  // Resolve the SignClient class from whatever the UMD bundle registers globally.
  const resolveWCClass = () => {
    const candidates = [
      window.SignClient,
      window.SignClient?.SignClient,
      window.SignClient?.default,
      window.WalletConnectSignClient,
      window.WCSignClient,
      window?.["@walletconnect/sign-client"],
      window?.["@walletconnect/sign-client"]?.SignClient,
      window?.["@walletconnect/sign-client"]?.default,
    ];
    for (const c of candidates) {
      if (c && typeof c.init === "function") return c;
    }
    return null;
  };

  const getWCSignClient = async () => {
    if (wcClientRef.current) return wcClientRef.current;
    await loadWCScript();
    const SC = resolveWCClass();
    if (!SC) throw new Error("WalletConnect SignClient not found on window — check CDN or browser console for script errors");
    const client = await SC.init({
      projectId: WC_PROJECT_ID,
      metadata: {
        name: "JupChat",
        description: "ChatFi — AI Trading powered by Jupiter DEX",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`, "https://jup.ag/favicon.ico"],
      },
    });
    wcClientRef.current = client;
    return client;
  };

  const initWalletConnect = async () => {
    setWcStatus("loading");
    try {
      const client = await getWCSignClient();

      // Clean up any stale pairings to avoid "already paired" errors
      try {
        const stale = client.pairing?.getAll?.({ active: false }) || [];
        for (const p of stale) { await client.pairing.delete(p.topic, { code: 0, message: "stale" }).catch(() => {}); }
      } catch {}

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          solana: {
            methods: ["solana_signTransaction", "solana_signMessage"],
            chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            events: [],
          },
        },
      });

      if (!uri) throw new Error("No pairing URI was generated");
      setWcUri(uri);
      setWcStatus("waiting");

      // Await user scanning + approving in Jupiter Mobile
      const session = await approval();
      wcSessionRef.current = session;

      const accounts = session.namespaces?.solana?.accounts || [];
      if (!accounts.length) throw new Error("No Solana account returned from session");
      const address = accounts[0].split(":").pop(); // "solana:chainId:PUBKEY" → "PUBKEY"

      // Build a signing provider backed by WalletConnect
      const wcProvider = {
        publicKey: { toString: () => address },
        connect: async () => ({ publicKey: { toString: () => address } }),
        signTransaction: async (tx) => {
          // Serialize the VersionedTransaction to base64
          const raw = tx.serialize();
          const base64 = btoa(String.fromCharCode(...raw));
          const result = await client.request({
            topic: session.topic,
            chainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            request: {
              method: "solana_signTransaction",
              params: { transaction: base64 },
            },
          });
          if (!result?.transaction) throw new Error("No signed transaction returned from wallet");
          const signed = new Uint8Array(atob(result.transaction).split("").map(c => c.charCodeAt(0)));
          return VersionedTransaction.deserialize(signed);
        },
        isWalletConnect: true,
      };

      // Close modal, reset WC UI state
      setShowWalletModal(false);
      setWcStatus("idle");
      setWcUri("");

      // Complete connection
      connectedProviderRef.current = wcProvider;
      const display = `${address.slice(0,4)}…${address.slice(-4)}`;
      setWallet(display);
      setWalletFull(address);
      const balances = await fetchSolanaBalances(address);
      setPortfolio(balances);
      const live = await fetchPrices();
      const solUSD = balances.SOL && live.SOL ? ` (~$${(balances.SOL * live.SOL).toFixed(2)})` : "";
      push("ai", `Jupiter Wallet connected via WalletConnect ✓\n\nBalance: **${(balances.SOL||0).toFixed(4)} SOL**${solUSD}${Object.entries(balances).filter(([k])=>k!=="SOL").map(([k,v])=>`\n${k}: ${v<1?v.toFixed(6):v.toFixed(2)}`).join("")}\n\nWhat would you like to do?`);
    } catch (err) {
      setWcStatus("idle");
      setWcUri("");
      const msg = err?.message || "";
      if (!msg.toLowerCase().includes("rejected") && !msg.toLowerCase().includes("cancel")) {
        push("ai", `WalletConnect error: ${msg || "Please try again."}`);
      }
    }
  };

  const cancelWalletConnect = () => {
    setWcStatus("idle");
    setWcUri("");
    try {
      if (wcClientRef.current && wcSessionRef.current?.topic) {
        wcClientRef.current.disconnect({ topic: wcSessionRef.current.topic, reason: { code: 0, message: "User cancelled" } }).catch(() => {});
      }
    } catch {}
  };

  // ── Wallet Standard detection + mobile deep-link registry ───────────────────
  // Detects wallets via the Wallet Standard API (works for extensions + mobile in-app browsers)
  // Falls back to legacy window injection checks, then offers mobile deep links.

  const getStandardWallets = () => {
    try {
      const reg = window?.__wallet_standard__?.get?.() || [];
      return reg.filter(w =>
        w.chains?.some(c => c.startsWith("solana:")) &&
        w.features?.["standard:connect"] &&
        w.features?.["standard:signTransaction"]
      );
    } catch { return []; }
  };

  // Legacy window-injection providers (desktop extensions / in-app browsers)
  const getLegacyProvider = (name) => {
    switch (name) {
      case "Phantom":       return window?.phantom?.solana;
      case "Solflare":      return window?.solflare?.isSolflare ? window.solflare : null;
      case "Backpack":      return window?.backpack?.solana;
      case "Jupiter": {
        // Jupiter Mobile in-app browser injects window.solana with isJupiter=true
        // It does NOT inject window.jupiter — check for that flag first
        const jupSolana = window?.solana;
        if (jupSolana?.isJupiter) return jupSolana;
        return window?.jupiter?.solana || window?.jupiter || null;
      }
      case "Trust Wallet": {
        const tw = window?.trustwallet?.solana || window?.trustWallet?.solana;
        return (tw && typeof tw.connect === "function") ? tw : null;
      }
      case "Coin98":        return window?.coin98?.sol;
      case "OKX":           return window?.okxwallet?.solana;
      default:              return window?.solana || null;
    }
  };

  // Mobile universal/deep links — open the wallet app which will redirect back
  const MOBILE_DEEP_LINKS = {
    "Phantom":      (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
    "Solflare":     (url) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
    "Backpack":     (url) => `https://backpack.app/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
    "Trust Wallet": (url) => `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(url)}`,
    "OKX":          (url) => `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`,
    "Coin98":       (url) => `coin98://browser?url=${encodeURIComponent(url)}`,
    // Jupiter deeplink is only shown when NOT inside Jupiter Mobile (in-app detection handles the rest)
    "Jupiter": () => "https://jup.ag/mobile",
  };

  // Wallet logo map — inline SVG data URIs for any that block hotlinking; favicon for the rest
  const WALLET_LOGOS = {
    // Phantom blocks favicon hotlinks — inline purple ghost SVG
    "Phantom": "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#ab9ff2"/><path d="M110 55c0-25.4-20.6-46-46-46S18 29.6 18 55c0 14.3 6.5 27 16.8 35.4L29 110h12l5-8a45.7 45.7 0 0 0 18 4 45.7 45.7 0 0 0 18-4l5 8h12l-5.8-19.6C108.9 82.1 110 68.8 110 55zm-60 8a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm28 0a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" fill="white"/></svg>`),
    // Solflare favicon works fine
    "Solflare":      "https://solflare.com/favicon.ico",
    // Backpack favicon works
    "Backpack":      "https://backpack.app/favicon.ico",
    // Jupiter favicon works
    "Jupiter":       "https://jup.ag/favicon.ico",
    // Trust Wallet favicon works
    "Trust Wallet":  "https://trustwallet.com/favicon.ico",
    // OKX blocks hotlinks — inline black grid logo SVG
    "OKX": "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#000"/><rect x="22" y="48" width="24" height="24" rx="4" fill="white"/><rect x="52" y="48" width="24" height="24" rx="4" fill="white"/><rect x="82" y="48" width="24" height="24" rx="4" fill="white"/><rect x="37" y="62" width="24" height="24" rx="4" fill="white"/><rect x="67" y="62" width="24" height="24" rx="4" fill="white"/><rect x="37" y="34" width="24" height="24" rx="4" fill="white"/><rect x="67" y="34" width="24" height="24" rx="4" fill="white"/></svg>`),
    // Coin98 favicon works
    "Coin98":        "https://coin98.com/favicon.ico",
    "Get Jupiter Wallet": "https://jup.ag/favicon.ico",
  };

  // Wrap a Wallet Standard wallet into the same {connect, signTransaction} shape
  const wrapStandardWallet = (stdWallet) => ({
    connect: async () => {
      const feat = stdWallet.features["standard:connect"];
      const result = await feat.connect();
      const acct = result.accounts?.[0];
      if (!acct) throw new Error("No account returned");
      // publicKey may be Uint8Array — convert to base58 string using bs58-style logic
      let pubkeyStr;
      if (typeof acct.address === "string") {
        pubkeyStr = acct.address;
      } else if (acct.publicKey instanceof Uint8Array) {
        // Inline base58 encode
        const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        let digits = [0];
        for (const byte of acct.publicKey) {
          let carry = byte;
          for (let j = 0; j < digits.length; ++j) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
          while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
        }
        let str = "";
        for (let k = 0; acct.publicKey[k] === 0 && k < acct.publicKey.length - 1; ++k) str += "1";
        for (let k = digits.length - 1; k >= 0; --k) str += ALPHABET[digits[k]];
        pubkeyStr = str;
      } else { throw new Error("Cannot read public key"); }
      return { publicKey: { toString: () => pubkeyStr } };
    },
    signTransaction: async (tx) => {
      const feat = stdWallet.features["standard:signTransaction"] ||
                   stdWallet.features["solana:signTransaction"];
      const result = await feat.signTransaction({ transaction: tx, account: stdWallet.accounts?.[0] });
      return result.signedTransaction || result.transaction || tx;
    },
    isStandard: true,
    walletName: stdWallet.name,
  });

  // Build the final wallet list shown in the modal
  const buildWalletList = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const list = [];

    // 1. Wallet Standard wallets (highest priority — works everywhere they're injected)
    const stdWallets = getStandardWallets();
    for (const sw of stdWallets) {
      list.push({
        name:      sw.name,
        icon:      sw.icon || "💳",
        detected:  true,
        connect:   async () => wrapStandardWallet(sw),
        type:      "standard",
      });
    }

    // 2. Legacy injected providers (desktop extensions / wallet in-app browsers)
    const LEGACY = [
      { name:"Phantom",     icon: WALLET_LOGOS["Phantom"] },
      { name:"Solflare",    icon: WALLET_LOGOS["Solflare"] },
      { name:"Backpack",    icon: WALLET_LOGOS["Backpack"] },
      { name:"Jupiter",     icon: WALLET_LOGOS["Jupiter"] },
      { name:"Trust Wallet",icon: WALLET_LOGOS["Trust Wallet"] },
      { name:"Coin98",      icon: WALLET_LOGOS["Coin98"] },
      { name:"OKX",         icon: WALLET_LOGOS["OKX"] },
    ];
    for (const w of LEGACY) {
      const already = list.find(l => l.name.toLowerCase() === w.name.toLowerCase());
      if (already) continue; // already added via Wallet Standard
      const prov = getLegacyProvider(w.name);
      if (prov) {
        list.push({ name: w.name, icon: w.icon, detected: true, connect: async () => prov, type: "legacy" });
      }
    }

    // 2.5. Generic window.solana catch-all
    // Jupiter Mobile's in-app browser injects window.solana but does NOT register via wallet-standard
    // and does NOT set window.jupiter. It may set window.solana.isJupiter, but we can't rely on that.
    // So: if window.solana exists and isn't already claimed by a named legacy wallet above, add it.
    const solanaProviderClaimed = list.some(l => (l.type === "standard" || l.type === "legacy"));
    const genericSolana = window?.solana;
    if (genericSolana && typeof genericSolana.connect === "function" && !solanaProviderClaimed) {
      // Try to identify by known flags
      let name = "Solana Wallet";
      let icon = "💎";
      if (genericSolana.isJupiter)   { name = "Jupiter";      icon = WALLET_LOGOS["Jupiter"]; }
      else if (genericSolana.isPhantom)  { name = "Phantom";  icon = WALLET_LOGOS["Phantom"]; }
      else if (genericSolana.isSolflare) { name = "Solflare"; icon = WALLET_LOGOS["Solflare"]; }
      else if (genericSolana.isBackpack) { name = "Backpack";  icon = WALLET_LOGOS["Backpack"]; }
      else if (genericSolana.isTrust)    { name = "Trust Wallet"; icon = WALLET_LOGOS["Trust Wallet"]; }
      list.push({ name, icon, detected: true, connect: async () => genericSolana, type: "legacy" });
    }

    // 2.6. Even if named wallets were detected, check if window.solana is a DIFFERENT wallet
    // (e.g. inside Jupiter Mobile, window.solana exists but none of the named checks above returned it)
    if (genericSolana && typeof genericSolana.connect === "function" && solanaProviderClaimed) {
      const isAlreadyListed = list.some(l =>
        (l.type === "legacy" || l.type === "standard") &&
        // check if any legacy entry is backed by this same object — we can't compare directly,
        // so instead check: if isJupiter flag set but "Jupiter" not in detected list, add it
        l.name.toLowerCase() === "jupiter"
      );
      if (!isAlreadyListed && genericSolana.isJupiter) {
        list.unshift({ name: "Jupiter", icon: WALLET_LOGOS["Jupiter"], detected: true, connect: async () => genericSolana, type: "legacy" });
      }
    }

    // 3. On mobile: show deep links for ALL wallets not already detected
    //    (this runs regardless of whether other wallets were found — critical fix)
    if (isMobile) {
      const detectedNames = new Set(list.map(l => l.name.toLowerCase()));
      for (const [name, fn] of Object.entries(MOBILE_DEEP_LINKS)) {
        if (!detectedNames.has(name.toLowerCase())) {
          list.push({
            name,
            icon:     WALLET_LOGOS[name] || WALLET_LOGOS["Jupiter"],
            detected: false,
            deepLink: fn(window.location.href),
            type:     "deeplink",
          });
        }
      }
    }

    // 4. On desktop with nothing detected: show extension install links
    if (!isMobile && list.length === 0) {
      const DESKTOP_INSTALLS = [
        { name:"Phantom",  icon: WALLET_LOGOS["Phantom"],  url:"https://phantom.com/download" },
        { name:"Solflare", icon: WALLET_LOGOS["Solflare"], url:"https://solflare.com/download" },
        { name:"Backpack", icon: WALLET_LOGOS["Backpack"], url:"https://backpack.app/downloads" },
        { name:"OKX",      icon: WALLET_LOGOS["OKX"],      url:"https://www.okx.com/web3/wallet" },
      ];
      for (const w of DESKTOP_INSTALLS) {
        list.push({ name: w.name, icon: w.icon, detected: false, deepLink: w.url, type: "download" });
      }
    }

    // 5. On mobile: always add Jupiter Wallet download at the bottom
    if (isMobile && !list.some(l => l.type === "download")) {
      list.push({ name:"Get Jupiter Wallet", icon: WALLET_LOGOS["Get Jupiter Wallet"], detected:false, deepLink:"https://jup.ag/mobile", type:"download" });
    }

    return list;
  };

  const [walletList, setWalletList] = useState([]);
  const pendingSwapRef = useRef(null);
  const connectedProviderRef = useRef(null); // store the active provider for signing

  // Rebuild wallet list every time the modal opens;
  // also listen for wallets that register asynchronously after page load
  useEffect(() => {
    if (!showWalletModal) return;

    const rebuild = () => setWalletList(buildWalletList());
    rebuild(); // immediate build

    // Some wallets (Backpack, OKX, etc.) fire this event slightly after page load
    window.addEventListener("wallet-standard:register-wallet", rebuild);

    // Jupiter Mobile and some other in-app browsers inject window.solana LATE.
    // Poll at 300ms, 800ms, and 2000ms to catch late injectors.
    const t1 = setTimeout(rebuild, 300);
    const t2 = setTimeout(rebuild, 800);
    const t3 = setTimeout(rebuild, 2000);

    return () => {
      window.removeEventListener("wallet-standard:register-wallet", rebuild);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [showWalletModal]);

  // ── Wallet connect ──────────────────────────────────────────────────────────
  const connectWallet = (pendingSwap) => {
    pendingSwapRef.current = pendingSwap;
    setShowWalletModal(true);
  };

  const doConnectWith = async (walletEntry) => {
    // Deep links / download — just open URL
    if (walletEntry.type === "deeplink" || walletEntry.type === "download") {
      window.open(walletEntry.deepLink, "_blank");
      setShowWalletModal(false);
      return;
    }

    setShowWalletModal(false);
    let provider;
    try {
      provider = await walletEntry.connect();
    } catch (err) {
      push("ai", `Could not get wallet provider for ${walletEntry.name}. Please try again.`);
      return;
    }

    try {
      const resp   = await provider.connect();
      // Solflare and some wallets put publicKey on the provider, not the connect() response
      const pubkeyObj = resp?.publicKey || provider?.publicKey;
      if (!pubkeyObj) throw new Error("No public key returned. Try opening this site inside your wallet's in-app browser.");
      const pubkey = pubkeyObj.toString();
      const display = pubkey.slice(0,4) + "…" + pubkey.slice(-4);
      connectedProviderRef.current = provider;
      setWallet(display);
      setWalletFull(pubkey);
      const balances = await fetchSolanaBalances(pubkey);
      setPortfolio(balances);
      const live = await fetchPrices();
      const solUSD = balances.SOL && live.SOL ? ` (~$${(balances.SOL * live.SOL).toFixed(2)})` : "";
      const pendingSwap = pendingSwapRef.current;
      if (pendingSwap) {
        setSwapCfg(c => ({
          ...c,
          from: pendingSwap.from || "SOL",
          fromMint: tokenCacheRef.current[pendingSwap.from?.toUpperCase()] || TOKEN_MINTS[pendingSwap.from?.toUpperCase()] || TOKEN_MINTS.SOL,
          fromDecimals: tokenDecimalsRef.current[pendingSwap.from?.toUpperCase()] || 9,
          to: pendingSwap.to || "JUP",
          toMint: tokenCacheRef.current[pendingSwap.to?.toUpperCase()] || TOKEN_MINTS[pendingSwap.to?.toUpperCase()] || TOKEN_MINTS.JUP,
          toDecimals: tokenDecimalsRef.current[pendingSwap.to?.toUpperCase()] || 6,
          amount: "",
        }));
        setShowSwap(true);
        push("ai", `Wallet connected. You have **${(balances.SOL||0).toFixed(4)} SOL**${solUSD} available. Swap interface is ready below.`);
      } else {
        push("ai", `Wallet connected ✓\n\nBalance: **${(balances.SOL||0).toFixed(4)} SOL**${solUSD}${Object.entries(balances).filter(([k])=>k!=="SOL").map(([k,v])=>`\n${k}: ${v<1?v.toFixed(6):v.toFixed(2)}`).join("")}\n\nWhat would you like to do?`);
      }
    } catch (err) {
      push("ai", err?.code === 4001 ? "Wallet connection declined." : `Failed to connect ${walletEntry.name} — ${err?.message || "please try again."}`);
    }
  };

  // ── Get active provider for signing ─────────────────────────────────────────
  // Used by swap/bet/deposit/claim — returns the connected provider or best fallback
  const getActiveProvider = () => {
    if (connectedProviderRef.current) return connectedProviderRef.current;
    // Fallback: try Wallet Standard first
    const stdWallets = getStandardWallets();
    if (stdWallets.length > 0) return wrapStandardWallet(stdWallets[0]);
    // Then legacy
    return (
      window?.phantom?.solana || window?.solflare || window?.backpack?.solana ||
      window?.trustwallet?.solana || window?.trustWallet?.solana ||
      window?.jupiter?.solana || window?.jupiter || window?.coin98?.sol ||
      window?.okxwallet?.solana || window?.solana || null
    );
  };

  // ── Swap execution ──────────────────────────────────────────────────────────
  const doSwap = async () => {
    const { from, fromMint, fromDecimals, to, toMint, toDecimals, amount } = swapCfg;
    if (!amount) return;
    if (!walletFull) { push("ai","Connect your wallet first to execute a swap."); return; }
    if (!fromMint || !toMint) {
      push("ai", `Could not resolve token addresses for **${from}** or **${to}**. Use the search dropdown to select them, then try again.`);
      return;
    }
    const provider = getActiveProvider();
    if (!provider) { push("ai","Wallet provider not found. Please reconnect."); return; }

    setSwapStatus("signing"); setSwapTxid(null);
    try {
      const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, fromDecimals || 9));
      // v2 /order: no slippageBps = auto RTSE slippage + auto gasless if <0.01 SOL
      const orderData = await jupFetch(`${JUP_SWAP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&taker=${walletFull}`);
      if (orderData.error) throw new Error(typeof orderData.error==="object"?JSON.stringify(orderData.error):orderData.error);
      if (!orderData.transaction) throw new Error("No transaction returned from Jupiter — check your balance.");

      const binaryStr = atob(orderData.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i=0;i<binaryStr.length;i++) txBytes[i]=binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing");
      const signedTx = await provider.signTransaction(tx);

      const signedBase64 = btoa(String.fromCharCode(...signedTx.serialize()));
      const execResult = await jupFetch(JUP_SWAP_EXEC, { method:"POST", body:{ signedTransaction:signedBase64, requestId:orderData.requestId } });
      if (execResult.error) throw new Error(typeof execResult.error==="object"?JSON.stringify(execResult.error):execResult.error);

      const signature = execResult.signature || execResult.txid || execResult.transaction;
      setSwapStatus("done"); setSwapTxid(signature); setShowSwap(false);
      // v2 outAmount field
      const outAmt = orderData?.outAmount ? (parseInt(orderData.outAmount)/Math.pow(10,toDecimals||6)).toFixed(4) : "?";
      const feeBps = orderData?.feeBps ? ` · Fee: ${orderData.feeBps}bps` : "";
      push("ai", `Swap executed via Jupiter ✓\n\nSent **${amount} ${from}** → received **~${outAmt} ${to}**${feeBps}\n\nTransaction: \`${signature?.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
      const updated = await fetchSolanaBalances(walletFull);
      setPortfolio(updated);
    } catch (err) {
      setSwapStatus("error");
      push("ai", `Swap failed: ${err?.message||"Unknown error"}. Please check your balance and try again.`);
    }
    setSwapStatus(null);
  };

  // ── Limit / DCA order ───────────────────────────────────────────────────────
  const doTrigger = async () => {
    const { token, targetPrice, amount, direction } = trigCfg;
    if (!targetPrice || !amount) return;
    if (!walletFull) { push("ai","Connect your wallet first to set a limit order."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai","Wallet provider not found."); return; }

    const inputMint  = direction==="below" ? TOKEN_MINTS.USDC  : (tokenCacheRef.current[token]||TOKEN_MINTS[token]);
    const outputMint = direction==="below" ? (tokenCacheRef.current[token]||TOKEN_MINTS[token]) : TOKEN_MINTS.USDC;
    const inDec  = direction==="below" ? TOKEN_DECIMALS.USDC : (tokenDecimalsRef.current[token]||TOKEN_DECIMALS[token]||9);
    const outDec = direction==="below" ? (tokenDecimalsRef.current[token]||TOKEN_DECIMALS[token]||9) : TOKEN_DECIMALS.USDC;
    const amountRaw  = Math.floor(parseFloat(amount)*Math.pow(10,inDec));
    const receiveAmt = direction==="below" ? parseFloat(amount)/parseFloat(targetPrice) : parseFloat(amount)*parseFloat(targetPrice);
    const takingRaw  = Math.floor(receiveAmt*Math.pow(10,outDec));

    try {
      const orderRes = await jupFetch(`${JUP_TRIGGER_BASE}/createOrder`, { method:"POST", body:{ inputMint, outputMint, maker:walletFull, payer:walletFull, params:{ makingAmount:amountRaw.toString(), takingAmount:takingRaw.toString() }, computeUnitPrice:"auto" } });
      if (orderRes.error) throw new Error(typeof orderRes.error==="object"?JSON.stringify(orderRes.error):orderRes.error);
      if (!orderRes.transaction) throw new Error("No transaction returned from Jupiter.");

      const binaryStr=atob(orderRes.transaction);
      const txBytes=new Uint8Array(binaryStr.length);
      for(let i=0;i<binaryStr.length;i++)txBytes[i]=binaryStr.charCodeAt(i);
      const tx=VersionedTransaction.deserialize(txBytes);
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing");
      const signedTx=await provider.signTransaction(tx);
      const signedBase64=btoa(String.fromCharCode(...signedTx.serialize()));
      const execRes=await jupFetch(JUP_TRIGGER_EXEC,{method:"POST",body:{signedTransaction:signedBase64,requestId:orderRes.requestId}});
      if (execRes.error) throw new Error(typeof execRes.error==="object"?JSON.stringify(execRes.error):execRes.error);
      const signature=execRes.signature||execRes.txid||orderRes.order;
      setShowTrig(false);
      push("ai",`Limit order placed ✓\n\nWill ${direction==="below"?"buy":"sell"} **${amount} ${direction==="below"?"USDC worth of "+token:token}** when price hits **$${targetPrice}**\n\nTransaction: \`${signature?.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
    } catch (err) {
      push("ai",`Limit order failed: ${err?.message||"Unknown error"}. Please try again.`);
    }
  };

  // ── Push message helper ─────────────────────────────────────────────────────
  const push = (role, text, extra={}) => {
    const id = Date.now() + Math.random();
    setMsgs(m => [...m, { id, role, text, ...extra }]);
    return id;
  };

  // ── Send message to Claude ──────────────────────────────────────────────────
  const send = async (override) => {
    const raw = (override ?? input).trim();
    if (!raw || typing) return;
    setInput("");
    push("user", raw);
    setTyping(true);
    setShowSwap(false); setShowPred(false); setShowTrig(false);
    setShowPredList(false); setShowEarn(false); setShowEarnDeposit(false); setShowBet(false);

    histRef.current = [...histRef.current, { role:"user", content:raw }];

    try {
      const res = await fetch("/api/claude", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: histRef.current,
        }),
      });
      const data = await res.json();
      const rawText = data?.content?.[0]?.text || '{"text":"Sorry, something went wrong.","action":null,"actionData":{}}';

      let parsed;
      try { parsed = JSON.parse(rawText); }
      catch { parsed = { text:rawText, action:null, actionData:{} }; }

      const { text, action, actionData } = parsed;
      histRef.current = [...histRef.current, { role:"assistant", content:rawText }];

      // ── Action handlers ───────────────────────────────────────────────────
      if (action === "FETCH_PRICE") {
        const tokens = actionData?.tokens || ["SOL"];
        // Resolve any unknown token symbols first
        for (const t of tokens) {
          const upper = t.toUpperCase();
          if (!tokenCacheRef.current[upper] && !TOKEN_MINTS[upper]) {
            const resolved = await resolveToken(t);
            if (resolved) {
              tokenCacheRef.current[upper] = resolved.mint;
              tokenDecimalsRef.current[upper] = resolved.decimals;
            }
          }
        }
        const live = await fetchPrices(tokens);
        const lines = tokens.map(t => {
          const price = live[t.toUpperCase()];
          return price !== undefined ? `${t.toUpperCase()}: $${price < 0.0001 ? price.toExponential(4) : price < 1 ? price.toFixed(6) : price.toFixed(4)}` : `${t.toUpperCase()}: price unavailable`;
        }).join("\n");
        push("ai", `${text}\n\n${lines}`);

      } else if (action === "FETCH_TOKEN_INFO") {
        const info = await fetchTokenInfo(actionData?.symbol);
        if (!info) {
          push("ai", text + `\n\nCould not find **${actionData?.symbol || "that token"}** on Jupiter. It may not be listed yet or the symbol might be different — try the exact contract address.`);
        } else {
          const mint = info.address || info.mint || "";
          const vol  = info.daily_volume ? `$${Number(info.daily_volume).toLocaleString(undefined,{maximumFractionDigits:0})}` : null;
          const mcap = info.market_cap   ? `$${Number(info.market_cap).toLocaleString(undefined,{maximumFractionDigits:0})}` : null;
          // Safety signals
          const hasFreeze  = info.extensions?.coingeckoId ? null : (info.freezeAuthority   ? "⚠ Freeze authority active" : null);
          const hasMintAuth = info.mint_authority !== null && info.mint_authority !== undefined ? "⚠ Mint authority active" : null;
          const organic    = info.organicScore !== undefined ? `Organic score: ${info.organicScore}/100` : null;
          const isSus      = info.audit?.isSus ? "🚨 Flagged as suspicious by Jupiter" : null;
          const verified   = info.tags?.includes("verified") ? "✓ Verified" : null;

          const safetyLines = [isSus, hasFreeze, hasMintAuth, verified, organic].filter(Boolean).join(" · ");

          let extra = `\n\n**${info.name || info.symbol || "Unknown"}** (${info.symbol || "?"})`;
          extra += `\nMint: \`${mint.slice(0,20)}…\``;
          if (vol)  extra += `\n24h Volume: ${vol}`;
          if (mcap) extra += `\nMarket Cap: ${mcap}`;
          if (info.decimals !== undefined) extra += `\nDecimals: ${info.decimals}`;
          if (info.tags?.length) extra += `\nTags: ${info.tags.slice(0,4).join(", ")}`;
          if (safetyLines) extra += `\n\n${safetyLines}`;
          push("ai", text + extra);
        }

      } else if (action === "FETCH_PORTFOLIO") {
        const addr = actionData?.wallet==="address_or_connected" ? walletFull : actionData?.wallet;
        if (!addr) {
          push("ai", text + "\n\nConnect your wallet first so I can pull your portfolio.");
        } else {
          const pData = await fetchPortfolioData(addr);
          const solBal = portfolio.SOL ? `SOL: **${portfolio.SOL.toFixed(4)}**${prices.SOL?" ($"+(portfolio.SOL*prices.SOL).toFixed(2)+")":""}` : "";
          const other  = Object.entries(portfolio).filter(([k])=>k!=="SOL").map(([k,v])=>`${k}: ${v<1?v.toFixed(6):v.toFixed(2)}`).join("\n");
          const defi   = pData?.defi?.positions?.length ? `\n\nDeFi Positions: ${pData.defi.positions.length} active` : "";
          // Prediction positions
          const predPos = pData?.predPositions || [];
          const predOpen = predPos.filter(p => !p.claimed && !p.claimable);
          const predClaim = predPos.filter(p => p.claimable && !p.claimed);
          const predStr = predPos.length > 0
            ? `\n\n**Prediction Positions (${predPos.length}):**\n` +
              predPos.slice(0,5).map(p => {
                const title = p.marketMetadata?.title || p.marketId || "Market";
                const side  = p.isYes ? "YES" : "NO";
                const cost  = p.totalCostUsd ? `$${(parseInt(p.totalCostUsd)/1_000_000).toFixed(2)}` : "";
                const claim = p.claimable ? ` 🏆 CLAIMABLE $${(parseInt(p.payoutUsd||0)/1_000_000).toFixed(2)}` : "";
                return `${side} on _${title.slice(0,40)}_ ${cost}${claim}`;
              }).join("\n")
            : "";
          // Earn positions
          const earnPos = pData?.earnPositions || [];
          const earnStr = earnPos.filter(e => parseFloat(e.underlyingAssets||e.shares||0) > 0).length > 0
            ? `\n\n**Earn Positions:**\n` +
              earnPos.filter(e => parseFloat(e.underlyingAssets||e.shares||0)>0).slice(0,5).map(e =>
                `${e.asset || e.underlyingAddress?.slice(0,8) || "Token"}: ${(parseFloat(e.underlyingAssets||0)/1e6).toFixed(4)} deposited`
              ).join("\n")
            : "";
          // Pending orders
          const orders = pData?.predOrders || [];
          const ordersStr = orders.length > 0 ? `\n\n**Pending Prediction Orders:** ${orders.length}` : "";
          push("ai", `${text}\n\n${solBal}${other?"\n"+other:""}${defi}${predStr}${earnStr}${ordersStr}`);
        }

      } else if (action === "SHOW_SWAP") {
        const fromSym = (actionData?.from || "SOL").toUpperCase();
        const toSym   = (actionData?.to   || "JUP").toUpperCase();
        // Resolve mints — use cache first, fallback to search
        const resolveAndSet = async () => {
          let fromMint = tokenCacheRef.current[fromSym] || TOKEN_MINTS[fromSym];
          let toMint   = tokenCacheRef.current[toSym]   || TOKEN_MINTS[toSym];
          // If not known, try to resolve via search
          if (!fromMint) {
            const r = await resolveToken(fromSym);
            if (r) { fromMint = r.mint; tokenCacheRef.current[fromSym]=r.mint; tokenDecimalsRef.current[fromSym]=r.decimals; }
          }
          if (!toMint) {
            const r = await resolveToken(toSym);
            if (r) { toMint = r.mint; tokenCacheRef.current[toSym]=r.mint; tokenDecimalsRef.current[toSym]=r.decimals; }
          }
          setSwapCfg({
            from: fromSym, fromMint: fromMint||null, fromDecimals: tokenDecimalsRef.current[fromSym]||9,
            to:   toSym,   toMint:   toMint||null,   toDecimals:   tokenDecimalsRef.current[toSym]||6,
            amount: "",
          });
          setShowSwap(true);
        };
        if (!walletFull) {
          push("ai", text + "\n\nConnect your wallet first to swap.");
          setTimeout(() => connectWallet({ from:fromSym, to:toSym }), 300);
        } else {
          push("ai", text);
          await resolveAndSet();
        }

      } else if (action === "SHOW_TRIGGER") {
        if (!walletFull) {
          push("ai", text + "\n\nConnect your wallet first to set a limit order.");
        } else {
          setTrigCfg(c => ({ ...c, token:actionData?.token||"SOL", direction:actionData?.direction||"below" }));
          setShowTrig(true);
          push("ai", text);
        }

      } else if (action === "SHOW_PREDICTION") {
        setPred(actionData);
        setPick(null);
        setShowPred(true);
        push("ai", text);

      } else if (action === "FETCH_PREDICTIONS") {
        push("ai", text + "\n\nFetching prediction markets…");
        const cat = actionData?.sport || actionData?.category || null;
        const query = actionData?.query || null; // for specific league/competition search
        const result = await fetchPredictionMarkets(cat, query);
        setPredMarkets(result.markets);
        setPredCategory(cat || query || null);
        setShowPredList(true);

      } else if (action === "FETCH_EARN") {
        push("ai", text + "\n\nFetching earn vaults…");
        await fetchEarnVaults();
        setShowEarn(true);

      } else if (action === "CLAIM_PAYOUTS") {
        if (!walletFull) { push("ai", text + "\n\nConnect your wallet first to check for claimable payouts."); }
        else { await doClaimPayouts(text); }

      } else {
        push("ai", text);
      }
    } catch {
      push("ai","Connection error. Please check your setup and try again.");
    }
    setTyping(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", background:T.bg, fontFamily:T.body, color:T.text1, overflow:"hidden" }}>

      {/* Sidebar */}
      {sidebarOpen && (
        <div style={{ width:240, background:T.sidebar, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", flexShrink:0 }}>
          <div style={{ padding:"18px 16px 12px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ fontFamily:T.serif, fontSize:18, fontWeight:500, color:T.text1, letterSpacing:"-0.3px" }}>ChatFi</div>
            <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>Jupiter AI Trading</div>
          </div>
          <div style={{ padding:"10px 8px" }}>
            <button onClick={() => { histRef.current=[]; setMsgs([{id:Date.now(),role:"ai",text:"New conversation started. How can I help?"}]); setChatHistory(h=>[{id:Date.now(),title:"New conversation",active:true},...h.map(c=>({...c,active:false}))]); }}
              style={{ width:"100%", padding:"8px 12px", background:"transparent", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:8 }}
              className="hov-row">
              <span style={{ fontSize:16 }}>+</span> New chat
            </button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"0 8px" }}>
            {chatHistory.map(c => (
              <div key={c.id} className="hov-row" style={{ padding:"8px 12px", borderRadius:8, fontSize:13, color:c.active?T.text1:T.text2, background:c.active?T.border:"transparent", cursor:"pointer", marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {c.title}
              </div>
            ))}
          </div>
          <div style={{ padding:"12px 16px", borderTop:`1px solid ${T.border}` }}>
            {wallet ? (
              <div style={{ fontSize:12, color:T.text2 }}>
                <div style={{ color:T.green, fontWeight:500, marginBottom:4 }}>● {wallet}</div>
                {portfolio.SOL !== undefined && <div>{portfolio.SOL.toFixed(4)} SOL{prices.SOL?` · $${(portfolio.SOL*prices.SOL).toFixed(2)}`:""}</div>}
              </div>
            ) : (
              <button onClick={() => connectWallet(null)} className="hov-btn"
                style={{ width:"100%", padding:"8px 12px", background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main chat */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>

        {/* Header */}
        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:12, background:T.surface }}>
          <button onClick={() => setSidebarOpen(o=>!o)} style={{ background:"none", border:"none", cursor:"pointer", color:T.text3, fontSize:18, padding:4 }} className="hov-btn">☰</button>
          <div style={{ fontFamily:T.serif, fontSize:16, fontWeight:500, color:T.text1 }}>ChatFi</div>
          {wallet && <div style={{ marginLeft:"auto", fontSize:12, color:T.green, fontWeight:500 }}>● {wallet}</div>}
          {!wallet && (
            <button onClick={() => connectWallet(null)} className="hov-btn"
              style={{ marginLeft:"auto", padding:"6px 14px", background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>
              Connect Wallet
            </button>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px 20px" }}>
          {msgs.map(m => (
            <div key={m.id} className="msg-enter" style={{ marginBottom:20, display:"flex", gap:12, justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
              {m.role==="ai" && (
                <div style={{ width:32, height:32, borderRadius:"50%", background:T.accentBg, border:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, marginTop:2 }}>🤖</div>
              )}
              <div style={{ maxWidth:"72%", padding:m.role==="user"?"10px 16px":"12px 16px", borderRadius:m.role==="user"?"18px 18px 4px 18px":"4px 18px 18px 18px", background:m.role==="user"?T.accent:T.surface, color:m.role==="user"?"#fff":T.text1, border:m.role==="ai"?`1px solid ${T.border}`:"none", fontSize:14, lineHeight:1.6 }}
                dangerouslySetInnerHTML={{ __html:fmt(m.text) }}
              />
            </div>
          ))}

          {typing && (
            <div style={{ display:"flex", gap:12, marginBottom:20 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:T.accentBg, border:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🤖</div>
              <div style={{ padding:"12px 16px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:"4px 18px 18px 18px", display:"flex", gap:5, alignItems:"center" }}>
                <span className="dot1"/><span className="dot2"/><span className="dot3"/>
              </div>
            </div>
          )}

          {/* ── Swap panel ─────────────────────────────────────────────────── */}
          {showSwap && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:16, color:T.text1 }}>Swap Tokens</div>
              <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"center" }}>
                <TokenPicker
                  value={swapCfg.from}
                  onSelect={(sym,mint,dec) => {
                    tokenCacheRef.current[sym]=mint;
                    tokenDecimalsRef.current[sym]=dec;
                    setSwapCfg(c=>({...c,from:sym,fromMint:mint,fromDecimals:dec}));
                  }}
                  jupFetch={jupFetch}
                />
                <button onClick={() => setSwapCfg(c=>({ ...c, from:c.to, fromMint:c.toMint, fromDecimals:c.toDecimals, to:c.from, toMint:c.fromMint, toDecimals:c.fromDecimals }))}
                  style={{ padding:"8px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, cursor:"pointer", color:T.text2, fontSize:14, flexShrink:0 }}>⇄</button>
                <TokenPicker
                  value={swapCfg.to}
                  onSelect={(sym,mint,dec) => {
                    tokenCacheRef.current[sym]=mint;
                    tokenDecimalsRef.current[sym]=dec;
                    setSwapCfg(c=>({...c,to:sym,toMint:mint,toDecimals:dec}));
                  }}
                  jupFetch={jupFetch}
                />
              </div>
              {(!swapCfg.fromMint || !swapCfg.toMint) && (
                <div style={{ fontSize:12, color:T.red, marginBottom:8 }}>
                  ⚠ Token not found in popular list — use "🔍 Search any token…" dropdown to find it on Jupiter.
                </div>
              )}
              <input type="number" placeholder="Amount" value={swapCfg.amount}
                onChange={e => setSwapCfg(c=>({...c,amount:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:10 }}
              />
              {quoteFetching && <div style={{ fontSize:12, color:T.text3, marginBottom:8 }}>Fetching quote…</div>}
              {swapQuote && !quoteFetching && (
                <div style={{ fontSize:12, color:T.green, background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:8, padding:"8px 12px", marginBottom:10 }}>
                  You'll receive ≈ {(parseInt(swapQuote.outAmount)/Math.pow(10,swapCfg.toDecimals||6)).toFixed(4)} {swapCfg.to}
                  {swapQuote.priceImpactPct && <span style={{ color:parseFloat(swapQuote.priceImpactPct)>1?T.red:T.text3 }}> · {parseFloat(swapQuote.priceImpactPct).toFixed(2)}% impact</span>}
                </div>
              )}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={doSwap} disabled={!swapCfg.amount||swapStatus==="signing"} className="send-btn"
                  style={{ flex:1, padding:"10px", background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {swapStatus==="signing" ? <><span className="spinner"/> Signing…</> : `Swap ${swapCfg.from} → ${swapCfg.to}`}
                </button>
                <button onClick={() => setShowSwap(false)}
                  style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Limit order panel ─────────────────────────────────────────── */}
          {showTrig && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:16, color:T.text1 }}>Limit / DCA Order</div>
              <div style={{ display:"flex", gap:10, marginBottom:12 }}>
                <select value={trigCfg.token} onChange={e => setTrigCfg(c=>({...c,token:e.target.value}))}
                  style={{ flex:1, padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}>
                  {Object.keys(TOKEN_MINTS).filter(t=>t!=="USDC"&&t!=="USDT").map(t=><option key={t}>{t}</option>)}
                </select>
                <select value={trigCfg.direction} onChange={e => setTrigCfg(c=>({...c,direction:e.target.value}))}
                  style={{ flex:1, padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}>
                  <option value="below">Buy when below</option>
                  <option value="above">Sell when above</option>
                </select>
              </div>
              <input type="number" placeholder="Target price (USD)" value={trigCfg.targetPrice}
                onChange={e => setTrigCfg(c=>({...c,targetPrice:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:8 }}
              />
              <input type="number" placeholder={`Amount (${trigCfg.direction==="below"?"USDC":trigCfg.token})`} value={trigCfg.amount}
                onChange={e => setTrigCfg(c=>({...c,amount:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:12 }}
              />
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={doTrigger} disabled={!trigCfg.targetPrice||!trigCfg.amount} className="hov-btn"
                  style={{ flex:1, padding:"10px", background:T.purple, border:"none", borderRadius:8, color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer" }}>
                  Place Order
                </button>
                <button onClick={() => setShowTrig(false)}
                  style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Prediction markets list ───────────────────────────────────── */}
          {showPredList && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:4, color:T.text1 }}>
                Prediction Markets {predCategory ? `— ${predCategory}` : ""}
              </div>
              {predMarkets.length > 0 ? (
                <>
                  <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>{predMarkets.length} market{predMarkets.length!==1?"s":""} found — click one to bet YES or NO</div>
                  {predMarkets.slice(0,20).map((m, i) => {
                    // Apr 2026: title, closeTime, category are TOP LEVEL (not nested in metadata)
                    const title    = m.title || m.metadata?.title || m.question || m.name || "Prediction Market";
                    const closeTs  = m.closeTime || m.metadata?.closeTime || m.endTime;
                    const cat      = m.category || m.metadata?.category || predCategory || "";
                    // Markets may be nested in m.markets array; take first market's marketId
                    const markets  = m.markets || [];
                    const firstMkt = markets[0];
                    const marketId = m.marketId || m.id || firstMkt?.marketId || firstMkt?.id || null;
                    // Pricing: buyYesPriceUsd / buyNoPriceUsd in native units (1_000_000 = $1.00)
                    const pricing  = m.pricing || firstMkt?.pricing || {};
                    const yesPrice = pricing.buyYesPriceUsd ? (pricing.buyYesPriceUsd / 1_000_000).toFixed(2) : null;
                    const noPrice  = pricing.buyNoPriceUsd  ? (pricing.buyNoPriceUsd  / 1_000_000).toFixed(2) : null;
                    const vol      = m.volume || m.totalVolume || firstMkt?.pricing?.volume;
                    return (
                      <div key={marketId||i}
                        style={{ padding:"12px 14px", border:`1px solid ${T.border}`, borderRadius:8, marginBottom:8, background:T.bg }}>
                        <div style={{ fontWeight:500, fontSize:13, color:T.text1, marginBottom:6 }}>{title}</div>
                        <div style={{ fontSize:11, color:T.text3, display:"flex", gap:12, marginBottom:8 }}>
                          {cat && <span>📂 {cat}</span>}
                          {closeTs && <span>🕐 {new Date(typeof closeTs==="number"?closeTs*1000:closeTs).toLocaleDateString()}</span>}
                          {vol > 0 && <span>💰 ${(vol/1_000_000).toFixed(0)} vol</span>}
                        </div>
                        {marketId ? (
                          <div style={{ display:"flex", gap:8 }}>
                            <button onClick={() => { setBetMarket({ marketId, title, yesPrice, noPrice }); setBetSide("yes"); setBetAmount("5"); setShowBet(true); setShowPredList(false); }} className="hov-btn"
                              style={{ flex:1, padding:"7px 10px", background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:8, color:T.green, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                              YES {yesPrice ? `$${yesPrice}` : ""}
                            </button>
                            <button onClick={() => { setBetMarket({ marketId, title, yesPrice, noPrice }); setBetSide("no"); setBetAmount("5"); setShowBet(true); setShowPredList(false); }} className="hov-btn"
                              style={{ flex:1, padding:"7px 10px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, color:T.red, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                              NO {noPrice ? `$${noPrice}` : ""}
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize:11, color:T.text3 }}>No tradable market available yet</div>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div style={{ fontSize:13, color:T.text2, marginBottom:16 }}>
                    No live markets found right now. Browse by category:
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
                    {PRED_CATEGORIES.map(cat => (
                      <button key={cat} onClick={() => send(`Show ${cat} prediction markets`)} className="hov-btn"
                        style={{ padding:"8px 16px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:20, fontSize:13, color:T.text2, cursor:"pointer" }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize:12, color:T.text3 }}>
                    Or ask about a specific match: <em>"Arsenal vs Man City prediction"</em>
                  </div>
                </>
              )}
              <button onClick={() => setShowPredList(false)}
                style={{ marginTop:14, padding:"6px 14px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          )}

          {/* ── Single prediction analysis panel (SHOW_PREDICTION) ──────────── */}
          {showPred && pred && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:4, color:T.text1 }}>{pred.teamA} vs {pred.teamB}</div>
              <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>{pred.league}{pred.league&&pred.sport?" · ":""}{pred.sport}</div>
              {pred.analysis && <div style={{ fontSize:13, color:T.text2, marginBottom:16, lineHeight:1.6, padding:"10px 12px", background:T.bg, borderRadius:8 }}>{pred.analysis}</div>}
              <div style={{ fontSize:12, color:T.text3, marginBottom:12, padding:"8px 12px", background:T.accentBg, border:`1px solid ${T.accent}30`, borderRadius:8 }}>
                💡 This is AI analysis. To place a real on-chain bet, ask <em>"Show prediction markets"</em> and pick from live Jupiter markets below.
              </div>
              <button onClick={() => { setShowPred(false); send("Show prediction markets"); }}
                style={{ padding:"8px 16px", background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:500, cursor:"pointer", marginRight:8 }} className="hov-btn">
                Browse Live Markets →
              </button>
              <button onClick={() => setShowPred(false)}
                style={{ padding:"8px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          )}

          {/* ── On-chain prediction bet panel ────────────────────────────── */}
          {showBet && betMarket && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:8, color:T.text1 }}>Place Prediction Bet</div>
              <div style={{ fontSize:13, color:T.text2, marginBottom:14, padding:"8px 12px", background:T.bg, borderRadius:8, lineHeight:1.5 }}>{betMarket.title}</div>

              {/* Show USDC balance warning if low */}
              {portfolio.USDC !== undefined && portfolio.USDC < 5 && (
                <div style={{ fontSize:12, color:T.red, background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, padding:"8px 12px", marginBottom:12 }}>
                  ⚠ Your USDC balance is ${(portfolio.USDC || 0).toFixed(4)} — minimum bet is $5 USDC. Swap some SOL to USDC first.
                  <button onClick={() => { setShowBet(false); send("Swap SOL to USDC"); }}
                    style={{ marginLeft:8, padding:"3px 10px", background:T.accent, border:"none", borderRadius:6, color:"#fff", fontSize:11, cursor:"pointer" }}>
                    Swap now →
                  </button>
                </div>
              )}

              <div style={{ fontSize:12, color:T.text3, marginBottom:10 }}>Choose outcome:</div>
              <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                {[
                  { side:"yes", label:"YES", price:betMarket.yesPrice, bg:T.greenBg, bd:T.greenBd, col:T.green },
                  { side:"no",  label:"NO",  price:betMarket.noPrice,  bg:T.redBg,  bd:T.redBd,  col:T.red  },
                ].map(({ side, label, price, bg, bd, col }) => {
                  const prob = price ? Math.round(parseFloat(price) * 100) + "%" : null;
                  const payout = price && betAmount && parseFloat(betAmount) >= 5
                    ? `Win $${(parseFloat(betAmount) / parseFloat(price)).toFixed(2)}`
                    : null;
                  return (
                    <button key={side} onClick={() => setBetSide(side)} className="hov-pick"
                      style={{ flex:1, padding:"12px 8px", border:`2px solid ${betSide===side?col:T.border}`, borderRadius:10, background:betSide===side?bg:T.bg, color:betSide===side?col:T.text2, fontSize:13, fontWeight:betSide===side?700:400, cursor:"pointer", transition:"all 0.15s", textAlign:"center" }}>
                      <div style={{ fontSize:16, fontWeight:700 }}>{label}</div>
                      {price && <div style={{ fontSize:11, opacity:0.8 }}>${price} · {prob}</div>}
                      {payout && betSide===side && <div style={{ fontSize:11, color:col, marginTop:2 }}>{payout}</div>}
                    </button>
                  );
                })}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
                <input type="number" placeholder="Amount (USDC, min $5)" value={betAmount}
                  onChange={e => setBetAmount(e.target.value)}
                  style={{ flex:1, padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                />
                <button onClick={doPredictionBet}
                  disabled={!betSide || !betAmount || parseFloat(betAmount) < 5 || betStatus === "signing"} className="hov-btn"
                  style={{ padding:"8px 18px", background:betSide==="yes"?T.green:betSide==="no"?T.red:T.text3, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", opacity:(!betSide||parseFloat(betAmount)<5)?0.5:1 }}>
                  {betStatus === "signing" ? <><span className="spinner"/> Signing…</> : `Confirm ${betSide ? betSide.toUpperCase() : "Pick"}`}
                </button>
                <button onClick={() => setShowBet(false)}
                  style={{ padding:"8px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
              {parseFloat(betAmount) < 5 && betAmount !== "" && <div style={{ fontSize:11, color:T.red }}>Minimum bet is $5 USDC</div>}
              <div style={{ fontSize:11, color:T.text3, marginTop:8 }}>
                Pays out $1 per winning contract · No fees · Auto-claimed within 24h if you win
                {portfolio.USDC !== undefined && <span style={{ marginLeft:8 }}>· Your USDC: ${(portfolio.USDC||0).toFixed(4)}</span>}
              </div>
            </div>
          )}

          {/* ── Earn / Lend vaults panel ──────────────────────────────────── */}
          {showEarn && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Jupiter Earn Vaults</div>
                <div style={{ fontSize:11, color:T.text3, background:T.tealBg, border:`1px solid ${T.teal}20`, borderRadius:10, padding:"2px 8px", color:T.teal }}>Live yield</div>
              </div>
              <div style={{ fontSize:12, color:T.text3, marginBottom:16 }}>Deposit assets to earn yield. Sorted by APY.</div>

              {earnLoading && (
                <div style={{ display:"flex", gap:8, alignItems:"center", color:T.text3, fontSize:13 }}>
                  <span className="spinner" style={{ borderColor:"rgba(0,0,0,0.1)", borderTopColor:T.text3 }}/> Loading vaults…
                </div>
              )}

              {!earnLoading && earnVaults.length === 0 && (
                <div style={{ padding:"16px", background:T.bg, borderRadius:8, fontSize:13, color:T.text2 }}>
                  Earn API is unavailable right now. Visit{" "}
                  <a href="https://earn.jup.ag" target="_blank" rel="noreferrer" style={{ color:T.accent }}>earn.jup.ag</a>{" "}
                  to browse all available yield opportunities directly.
                </div>
              )}

              {!earnLoading && earnVaults.map((v) => (
                <div key={v.id} className="vault-card"
                  style={{ padding:"14px 16px", border:`1px solid ${T.border}`, borderRadius:10, marginBottom:10, background:T.bg, transition:"all 0.15s", cursor:"default" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:14, color:T.text1 }}>{v.token} Earn Vault</div>
                      <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>
                        by Jupiter Lend
                        {v.tvl > 0 && <span style={{ marginLeft:8 }}>· TVL: ${Number(v.tvl).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                      </div>
                      <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
                        {v.supplyApy && v.supplyApy !== "N/A" && (
                          <span style={{ fontSize:11, background:T.greenBg, color:T.green, border:`1px solid ${T.greenBd}`, borderRadius:6, padding:"2px 7px" }}>
                            Supply {v.supplyApy}
                          </span>
                        )}
                        {v.rewardsApy && (
                          <span style={{ fontSize:11, background:T.tealBg, color:T.teal, border:`1px solid ${T.teal}30`, borderRadius:6, padding:"2px 7px" }}>
                            Rewards {v.rewardsApy}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                      <div style={{ fontSize:22, fontWeight:800, color:T.green, lineHeight:1 }}>{v.apyDisplay}</div>
                      <div style={{ fontSize:10, color:T.text3, marginBottom:8, marginTop:2 }}>Total APY</div>
                      <button
                        onClick={() => { setEarnDeposit({ vault:v, amount:"" }); setShowEarnDeposit(true); }} className="hov-btn"
                        style={{ padding:"6px 16px", background:T.accent, border:"none", borderRadius:6, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        Deposit
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={() => setShowEarn(false)}
                style={{ marginTop:4, padding:"6px 14px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          )}

          {/* ── Earn deposit panel ────────────────────────────────────────── */}
          {showEarnDeposit && earnDeposit.vault && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:4, color:T.text1 }}>
                Deposit to {earnDeposit.vault.name}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                <span style={{ fontSize:16, fontWeight:700, color:T.green }}>{earnDeposit.vault.apyDisplay} APY</span>
                {earnDeposit.vault.tvl > 0 && <span style={{ fontSize:12, color:T.text3 }}>· TVL ${Number(earnDeposit.vault.tvl).toLocaleString()}</span>}
              </div>
              <input type="number" placeholder={`Amount (${earnDeposit.vault.token || "SOL"})`} value={earnDeposit.amount}
                onChange={e => setEarnDeposit(d=>({...d,amount:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:12 }}
              />
              <div style={{ display:"flex", gap:8 }}>
                <button
                  onClick={doEarnDeposit}
                  disabled={!earnDeposit.amount||parseFloat(earnDeposit.amount)<=0} className="hov-btn"
                  style={{ flex:1, padding:"10px", background:T.teal, border:"none", borderRadius:8, color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer" }}>
                  Confirm Deposit
                </button>
                <button onClick={() => setShowEarnDeposit(false)}
                  style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Suggestions */}
          {msgs.length <= 2 && !typing && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20, paddingLeft:44 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} className="hov-sugg"
                  style={{ padding:"7px 14px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, fontSize:12, color:T.text2, cursor:"pointer" }}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={endRef}/>
        </div>

        {/* Wallet selection modal */}
        {showWalletModal && (
          <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}
            onClick={e => { if (e.target === e.currentTarget) { cancelWalletConnect(); setShowWalletModal(false); } }}>
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:"20px 20px 0 0", padding:"20px 20px 32px", width:"100%", maxWidth:480, boxShadow:"0 -8px 40px rgba(0,0,0,0.25)", maxHeight:"85vh", overflowY:"auto" }}>
              {/* Handle bar */}
              <div style={{ width:40, height:4, background:T.border, borderRadius:4, margin:"0 auto 18px" }}/>

              {/* ── WalletConnect QR screen ────────────────────────────── */}
              {(wcStatus === "loading" || wcStatus === "waiting") ? (
                <div style={{ textAlign:"center", padding:"8px 0 12px" }}>
                  <div style={{ fontFamily:T.serif, fontSize:17, fontWeight:500, color:T.text1, marginBottom:4 }}>Scan with Jupiter Mobile</div>
                  <div style={{ fontSize:12, color:T.text3, marginBottom:18 }}>
                    Open Jupiter Wallet → tap the scan icon → scan this QR code
                  </div>
                  {wcStatus === "loading" && (
                    <div style={{ padding:40, display:"flex", flexDirection:"column", alignItems:"center", gap:12, color:T.text3, fontSize:13 }}>
                      <span className="spinner" style={{ width:28, height:28, border:"3px solid rgba(0,0,0,0.1)", borderTopColor:T.accent }}/>
                      Generating pairing code…
                    </div>
                  )}
                  {wcStatus === "waiting" && (
                    <>
                      <div style={{ display:"inline-block", padding:12, background:T.bg, border:`2px solid ${T.border}`, borderRadius:16, marginBottom:14 }}>
                        <canvas ref={wcQrRef} style={{ display:"block", borderRadius:8 }}/>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center", marginBottom:16 }}>
                        <input readOnly value={wcUri} style={{ flex:1, padding:"7px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text3, fontSize:10, fontFamily:T.mono, overflow:"hidden", textOverflow:"ellipsis" }}/>
                        <button onClick={() => { try { navigator.clipboard.writeText(wcUri); } catch {} }}
                          style={{ padding:"7px 12px", background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:8, color:T.accent, fontSize:12, cursor:"pointer", flexShrink:0, fontWeight:500 }}>
                          Copy
                        </button>
                      </div>
                      <div style={{ fontSize:11, color:T.text3, marginBottom:14 }}>Waiting for Jupiter Wallet to approve…</div>
                    </>
                  )}
                  <button onClick={cancelWalletConnect}
                    style={{ width:"100%", padding:"10px", background:"none", border:`1px solid ${T.border}`, borderRadius:10, color:T.text2, fontSize:13, cursor:"pointer" }}>
                    Cancel
                  </button>
                </div>
              ) : (
                /* ── Normal wallet list ─────────────────────────────────── */
                <>
                  <div style={{ fontFamily:T.serif, fontSize:17, fontWeight:500, color:T.text1, marginBottom:4 }}>Connect Wallet</div>
                  <div style={{ fontSize:12, color:T.text3, marginBottom:18 }}>
                    {walletList.filter(w=>w.detected).length > 0
                      ? "Detected wallets shown first. Tap to connect."
                      : "No wallet detected in this browser. Open this page inside your wallet app, or tap a wallet below to launch it."}
                  </div>

                  {/* WalletConnect QR button — always first */}
                  <button onClick={initWalletConnect} className="hov-row"
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:T.accentBg, border:`1.5px solid ${T.accent}66`, borderRadius:12, cursor:"pointer", fontSize:14, color:T.text1, textAlign:"left", width:"100%", marginBottom:8 }}>
                    <span style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", background:T.accent, borderRadius:8, flexShrink:0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                        <path d="M14 14h2v2h-2zM18 14h3M14 18v3M18 18h3v3h-3z"/>
                      </svg>
                    </span>
                    <span style={{ flex:1 }}>
                      <span style={{ fontWeight:600, display:"block", color:T.accent }}>Scan QR (WalletConnect)</span>
                      <span style={{ fontSize:11, color:T.text3 }}>Best for Jupiter Mobile — scan in-app</span>
                    </span>
                    <span style={{ fontSize:11, color:T.accent, fontWeight:500 }}>→</span>
                  </button>

                  {/* Detected / available wallets */}
                  {walletList.length > 0 ? (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {walletList.map((w, i) => (
                        <button key={i} onClick={() => doConnectWith(w)} className="hov-row"
                          style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:T.bg, border:`1px solid ${w.detected ? T.accent+"44" : T.border}`, borderRadius:12, cursor:"pointer", fontSize:14, color:T.text1, textAlign:"left", width:"100%" }}>
                          <span style={{ width:32, textAlign:"center", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                            {typeof w.icon === "string" && (w.icon.startsWith("data:") || w.icon.startsWith("http"))
                              ? <img src={w.icon} style={{ width:26, height:26, borderRadius:6, objectFit:"contain" }} alt={w.name} onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="inline"; }} />
                              : null}
                            <span style={{ fontSize:22, display: (typeof w.icon === "string" && (w.icon.startsWith("data:") || w.icon.startsWith("http"))) ? "none" : "inline" }}>{w.icon}</span>
                          </span>
                          <span style={{ flex:1, fontWeight: w.detected ? 500 : 400 }}>{w.name}</span>
                          {w.detected && w.type !== "download" && (
                            <span style={{ fontSize:11, color:T.green, fontWeight:600, background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:6, padding:"2px 7px" }}>Detected</span>
                          )}
                          {(w.type === "deeplink") && (
                            <span style={{ fontSize:11, color:T.accent, fontWeight:500 }}>Open app →</span>
                          )}
                          {w.type === "download" && (
                            <span style={{ fontSize:11, color:T.accent, fontWeight:500 }}>Download →</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding:16, background:T.bg, borderRadius:10, fontSize:13, color:T.text2, textAlign:"center" }}>
                      <div style={{ marginBottom:10 }}>No wallet detected. Open this site inside your Phantom, Solflare, Backpack, OKX or Jupiter mobile app to connect automatically.</div>
                      <a href="https://jup.ag/mobile" target="_blank" rel="noreferrer"
                        style={{ display:"inline-block", padding:"10px 20px", background:T.accent, color:"#fff", borderRadius:8, fontSize:13, fontWeight:600, textDecoration:"none" }}>
                        Download Jupiter Wallet →
                      </a>
                    </div>
                  )}

                  <button onClick={() => setShowWalletModal(false)}
                    style={{ marginTop:14, width:"100%", padding:"10px", background:"none", border:`1px solid ${T.border}`, borderRadius:10, color:T.text2, fontSize:13, cursor:"pointer" }}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Input bar */}
        <div style={{ padding:"12px 20px 16px", borderTop:`1px solid ${T.border}`, background:T.surface }}>
          <div style={{ display:"flex", gap:10, alignItems:"flex-end", background:T.bg, border:`1px solid ${T.border}`, borderRadius:14, padding:"10px 14px" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }}
              placeholder="Ask about prices, swaps, tokens, predictions, or earn vaults…"
              rows={1}
              style={{ flex:1, border:"none", outline:"none", background:"transparent", fontFamily:T.body, fontSize:14, color:T.text1, lineHeight:1.5, maxHeight:160, overflowY:"auto" }}
            />
            <button onClick={() => send()} disabled={!input.trim()||typing} className="send-btn"
              style={{ padding:"8px 16px", background:(!input.trim()||typing)?T.border:T.accent, border:"none", borderRadius:10, color:(!input.trim()||typing)?T.text3:"#fff", fontSize:13, fontWeight:500, cursor:(!input.trim()||typing)?"default":"pointer", flexShrink:0, transition:"background 0.15s", display:"flex", alignItems:"center", gap:6 }}>
              {typing ? <><span className="spinner"/></> : "Send"}
            </button>
          </div>
          <div style={{ textAlign:"center", fontSize:11, color:T.text3, marginTop:8 }}>
            ChatFi · Powered by Jupiter DEX + Claude AI · Not financial advice
          </div>
        </div>
      </div>
    </div>
  );
}
