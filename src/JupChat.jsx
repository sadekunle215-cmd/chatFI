import { useState, useEffect, useRef, useCallback } from "react";
import { VersionedTransaction } from "@solana/web3.js";

// ─── Jupiter API endpoints ────────────────────────────────────────────────────
const JUP_BASE         = "https://api.jup.ag";
const JUP_LITE         = "https://lite-api.jup.ag";
const JUP_PRICE_API    = `${JUP_BASE}/price/v2`;
const JUP_TOKENS_API   = `${JUP_BASE}/tokens/v1/token`;
const JUP_TOKEN_SEARCH = `${JUP_BASE}/tokens/v1/search`;
const JUP_SWAP_ORDER   = `${JUP_BASE}/ultra/v1/order`;
const JUP_SWAP_EXEC    = `${JUP_BASE}/ultra/v1/execute`;
const JUP_TRIGGER_BASE = `${JUP_BASE}/trigger/v1`;
const JUP_TRIGGER_EXEC = `${JUP_LITE}/trigger/v1/execute`;
const JUP_PORTFOLIO    = `${JUP_BASE}/portfolio/v1`;
const JUP_PRED_API     = `${JUP_BASE}/predictions/v1`;
const JUP_EARN_API     = `${JUP_BASE}/earn/v1`;
const SOLANA_RPC       = "SOLANA_RPC";
const SPL_PROGRAM      = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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

const PRED_SPORTS = ["Football","Basketball","Tennis","Cricket","Esports","MMA","Other"];

// ─── AI system prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ChatFi — a sharp, honest AI trading assistant built on Jupiter DEX (Solana). Tone: thoughtful, direct, warm — never hyped.

You pull live data: token prices, safety scores, metadata. You help users swap ANY Solana token, set limit/DCA orders, track portfolios, research tokens, analyse sports for prediction markets, and earn yield via Jupiter Lend vaults.

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
- "FETCH_PORTFOLIO"  → actionData: { "wallet": "address_or_connected" }
- "SHOW_SWAP"        → actionData: { "from": "SOL", "to": "PEPE", "reason": "brief why" }
- "SHOW_TRIGGER"     → actionData: { "token": "SOL", "direction": "below", "hint": "brief why" }
- "SHOW_PREDICTION"  → actionData: { "teamA": "Arsenal", "teamB": "Man City", "sport": "football", "league": "Premier League", "analysis": "deep tactical breakdown with form, H2H, key players" }
- "FETCH_PREDICTIONS"→ actionData: { "sport": "football" } — use null sport for all categories
- "FETCH_EARN"       → actionData: { "filter": "highest_apy" or null }

Rules:
- "buy X" / "swap X to Y" / "exchange" → SHOW_SWAP — use EXACT symbol user mentioned even if unknown meme coin, the UI searches any Jupiter-listed token live
- "price of X" → FETCH_PRICE
- "is X safe?" / "research X" → FETCH_TOKEN_INFO
- "my portfolio" / "my wallet" → FETCH_PORTFOLIO
- sports + predict/bet → SHOW_PREDICTION with thorough analysis
- "predictions" / "show markets" / "what can I bet on" → FETCH_PREDICTIONS
- "earn" / "yield" / "APY" / "lend" / "passive income" / "staking" / "earn vault" / "best APY" → FETCH_EARN
- "limit order" / "DCA" / "buy when price hits" → SHOW_TRIGGER
- Never fabricate prices. Be concise and precise. No bullet lists — write plain prose.`;

const SUGGESTIONS = [
  "What's the SOL price?",
  "Swap SOL to BONK",
  "Is PEPE safe to buy?",
  "Arsenal vs Man City prediction",
  "Show open predictions",
  "Show earn vaults",
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
  const [mode, setMode]       = useState("select");
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy]       = useState(false);
  const timer = useRef(null);

  const search = (q) => {
    setQuery(q);
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(q)}&limit=10`);
        const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
        setResults(list.slice(0, 10));
      } catch { setResults([]); }
      setBusy(false);
    }, 400);
  };

  const pick = (t) => {
    const sym = (t.symbol || "").toUpperCase();
    onSelect(sym, t.address, t.decimals ?? 6);
    setMode("select");
    setQuery("");
    setResults([]);
  };

  if (mode === "select") {
    return (
      <select
        value={value}
        onChange={e => {
          if (e.target.value === "__search__") { setMode("search"); }
          else {
            const sym = e.target.value;
            onSelect(sym, TOKEN_MINTS[sym], TOKEN_DECIMALS[sym] ?? 9);
          }
        }}
        style={{ flex:1, padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
      >
        {Object.keys(TOKEN_MINTS).map(t => <option key={t} value={t}>{t}</option>)}
        {!TOKEN_MINTS[value] && value && <option value={value}>{value}</option>}
        <option value="__search__">🔍 Search any token…</option>
      </select>
    );
  }

  return (
    <div style={{ flex:1, position:"relative" }}>
      <input
        autoFocus
        value={query}
        onChange={e => search(e.target.value)}
        placeholder="Token name or symbol…"
        style={{ width:"100%", padding:"8px 10px", border:`2px solid ${T.accent}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, outline:"none" }}
      />
      <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:40, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, boxShadow:"0 6px 18px rgba(0,0,0,0.13)", overflow:"hidden", maxHeight:220, overflowY:"auto" }}>
        {busy && <div style={{ padding:"8px 12px", fontSize:12, color:T.text3 }}>Searching Jupiter…</div>}
        {!busy && results.length === 0 && query.length > 1 && (
          <div style={{ padding:"8px 12px", fontSize:12, color:T.text3 }}>No results for "{query}"</div>
        )}
        {results.map(t => (
          <div key={t.address} onClick={() => pick(t)}
            style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${T.border}` }}
            className="hov-row"
          >
            <span><strong>{t.symbol}</strong>{t.name ? ` — ${t.name.slice(0,24)}` : ""}</span>
            {t.daily_volume > 0 && <span style={{ fontSize:10, color:T.text3 }}>${(t.daily_volume/1e3).toFixed(0)}k vol</span>}
          </div>
        ))}
        <div onClick={() => { setMode("select"); setQuery(""); setResults([]); }}
          style={{ padding:"7px 12px", cursor:"pointer", fontSize:12, color:T.text3 }}>
          ← Popular tokens
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function JupChat() {
  const [msgs, setMsgs]           = useState([{ id:1, role:"ai", text:"Good morning! I'm ChatFi, your AI trading assistant built on Jupiter DEX.\n\nI can pull live token prices from Solana, help you swap **any** token, research token safety, set limit orders, track your portfolio, analyse sports for prediction markets, and find the best earn vaults — all in one conversation.\n\nConnect your Phantom wallet to get started, or just ask me anything." }]);
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

  // Predictions
  const [showPred, setShowPred]   = useState(false);
  const [pred, setPred]           = useState(null);
  const [pick, setPick]           = useState(null);
  const [stake, setStake]         = useState("10");
  const [showPredList, setShowPredList] = useState(false);
  const [predMarkets, setPredMarkets]   = useState([]);
  const [predSport, setPredSport]       = useState(null);

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

  useEffect(() => {
    if (!showSwap || !swapCfg.amount || parseFloat(swapCfg.amount) <= 0) { setSwapQuote(null); return; }
    if (!swapCfg.fromMint || !swapCfg.toMint) { setSwapQuote(null); return; }
    const t = setTimeout(() => fetchSwapQuote(), 600);
    return () => clearTimeout(t);
  }, [swapCfg.fromMint, swapCfg.toMint, swapCfg.amount, showSwap]);

  // ── Proxy helper ────────────────────────────────────────────────────────────
  const jupFetch = async (url, options = {}) => {
    const payload = { url, method: options.method || "GET" };
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

  // ── Jupiter Price API ───────────────────────────────────────────────────────
  const fetchPrices = useCallback(async (tokens = Object.keys(TOKEN_MINTS)) => {
    try {
      const mints = tokens.map(t => tokenCacheRef.current[t.toUpperCase()] || TOKEN_MINTS[t.toUpperCase()]).filter(Boolean);
      if (!mints.length) return {};
      const json = await jupFetch(`${JUP_PRICE_API}?ids=${mints.join(",")}`);
      const out  = {};
      for (const [mint, info] of Object.entries(json.data || {})) {
        const sym = Object.entries(tokenCacheRef.current).find(([, v]) => v === mint)?.[0];
        if (sym && info.price) out[sym] = parseFloat(info.price);
      }
      setPrices(p => ({ ...p, ...out }));
      return out;
    } catch { return {}; }
  }, []);

  // ── Token info ──────────────────────────────────────────────────────────────
  const fetchTokenInfo = async (symbol) => {
    const resolved = await resolveToken(symbol);
    if (!resolved) return null;
    try { return await jupFetch(`${JUP_TOKENS_API}/${resolved.mint}`); }
    catch { return null; }
  };

  // ── Portfolio ───────────────────────────────────────────────────────────────
  const fetchPortfolioData = async (walletAddress) => {
    if (!walletAddress) return null;
    try { return await jupFetch(`${JUP_PORTFOLIO}/wallet/${walletAddress}`); }
    catch { return null; }
  };

  // ── Predictions — tries multiple endpoint shapes ────────────────────────────
  const fetchPredictionMarkets = async (sport = null) => {
    const sportParam = sport ? sport.toLowerCase() : null;
    const endpoints = [
      sportParam
        ? `${JUP_PRED_API}/markets?category=${sportParam}&status=open`
        : `${JUP_PRED_API}/markets?status=open`,
      `${JUP_PRED_API}/events${sportParam ? `?sport=${sportParam}` : ""}`,
      `${JUP_PRED_API}/list${sportParam ? `?category=${sportParam}` : ""}`,
      `${JUP_PRED_API}/open`,
    ];
    for (const url of endpoints) {
      try {
        const data = await jupFetch(url);
        const markets =
          Array.isArray(data)    ? data         :
          data?.markets?.length  ? data.markets :
          data?.data?.length     ? data.data    :
          data?.events?.length   ? data.events  : [];
        if (markets.length > 0) return { markets, source: "api" };
      } catch { /* try next */ }
    }
    return { markets: [], source: "empty" };
  };

  // ── Earn / Lend vaults ──────────────────────────────────────────────────────
  const fetchEarnVaults = async () => {
    setEarnLoading(true);
    const endpoints = [
      `${JUP_EARN_API}/vaults`,
      `${JUP_EARN_API}/pools`,
      `${JUP_BASE}/lend/v1/vaults`,
      `${JUP_BASE}/lend/v1/pools`,
      "https://earn.jup.ag/api/vaults",
    ];
    for (const url of endpoints) {
      try {
        const data = await jupFetch(url);
        const vaults =
          Array.isArray(data)   ? data        :
          data?.vaults?.length  ? data.vaults :
          data?.pools?.length   ? data.pools  :
          data?.data?.length    ? data.data   : [];
        if (vaults.length > 0) {
          // Normalize and sort by APY descending
          const normalized = vaults.map(v => ({
            id:     v.id || v.address || v.pubkey || Math.random().toString(36).slice(2),
            name:   v.name || v.symbol || v.token || v.asset || "Vault",
            token:  v.token || v.symbol || v.inputToken || "SOL",
            apy:    parseFloat(v.apy || v.apyPercent || v.apr || v.yield || 0),
            apyDisplay: v.apy ? (parseFloat(v.apy) * (parseFloat(v.apy) < 1 ? 100 : 1)).toFixed(2) + "%" : (v.apyPercent || v.apr || "N/A"),
            tvl:    v.tvl || v.totalDeposits || v.totalValueLocked || 0,
            protocol: v.protocol || v.provider || "",
            description: v.description || "",
          })).sort((a, b) => b.apy - a.apy);
          setEarnVaults(normalized);
          setEarnLoading(false);
          return;
        }
      } catch { /* try next */ }
    }
    setEarnVaults([]);
    setEarnLoading(false);
  };

  // ── Swap quote ──────────────────────────────────────────────────────────────
  const fetchSwapQuote = useCallback(async () => {
    const { fromMint, fromDecimals, toMint, amount } = swapCfg;
    if (!amount || parseFloat(amount) <= 0 || fromMint === toMint) return;
    if (!fromMint || !toMint) return;
    const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, fromDecimals || 9));
    setQF(true); setSwapQuote(null);
    try {
      const data = await jupFetch(`${JUP_SWAP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&slippageBps=50&taker=${walletFull || ""}`);
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

  // ── Wallet connect ──────────────────────────────────────────────────────────
  const connectWallet = async (pendingSwap) => {
    const provider =
      window?.phantom?.solana || window?.solflare || window?.backpack?.solana ||
      window?.trustwallet?.solana || window?.trustWallet?.solana ||
      window?.jupiter?.solana || window?.jupiter ||
      window?.coin98?.sol || window?.okxwallet?.solana || window?.solana;
    if (!provider) {
      push("ai", "No Solana wallet detected. Please install **Phantom**, **Solflare**, **Backpack**, **Trust Wallet**, or **Jupiter Wallet** to connect.");
      return;
    }
    try {
      const resp    = await provider.connect();
      const pubkey  = resp.publicKey.toString();
      const display = pubkey.slice(0,4) + "…" + pubkey.slice(-4);
      setWallet(display);
      setWalletFull(pubkey);
      const balances = await fetchSolanaBalances(pubkey);
      setPortfolio(balances);
      const live = await fetchPrices();
      const solUSD = balances.SOL && live.SOL ? ` (~$${(balances.SOL * live.SOL).toFixed(2)})` : "";
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
      push("ai", err?.code === 4001 ? "Wallet connection declined." : "Failed to connect wallet — please try again.");
    }
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
    const provider =
      window?.phantom?.solana || window?.solflare || window?.backpack?.solana ||
      window?.trustwallet?.solana || window?.trustWallet?.solana ||
      window?.jupiter?.solana || window?.jupiter || window?.coin98?.sol ||
      window?.okxwallet?.solana || window?.solana;
    if (!provider) { push("ai","Wallet provider not found. Please reconnect."); return; }

    setSwapStatus("signing"); setSwapTxid(null);
    try {
      const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, fromDecimals || 9));
      const orderData = await jupFetch(`${JUP_SWAP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&slippageBps=50&taker=${walletFull}`);
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
      const outAmt = orderData?.outAmount ? (parseInt(orderData.outAmount)/Math.pow(10,toDecimals||6)).toFixed(4) : "?";
      push("ai", `Swap executed via Jupiter ✓\n\nSent **${amount} ${from}** → received **~${outAmt} ${to}**\n\nTransaction: \`${signature?.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
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
    const provider =
      window?.phantom?.solana || window?.solflare || window?.backpack?.solana ||
      window?.trustwallet?.solana || window?.trustWallet?.solana ||
      window?.jupiter?.solana || window?.jupiter || window?.coin98?.sol ||
      window?.okxwallet?.solana || window?.solana;
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
    setShowPredList(false); setShowEarn(false); setShowEarnDeposit(false);

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
        const live = await fetchPrices(tokens);
        const lines = tokens.map(t => `${t}: $${live[t]?.toFixed(4) ?? "N/A"}`).join("\n");
        push("ai", `${text}\n\n${lines}`);

      } else if (action === "FETCH_TOKEN_INFO") {
        const info = await fetchTokenInfo(actionData?.symbol);
        const extra = info
          ? `\n\nName: ${info.name||"N/A"}\nSymbol: ${info.symbol||"N/A"}\nMint: \`${(info.address||info.mint||"")?.slice(0,16)}…\`${info.tags?.length?"\nTags: "+info.tags.join(", "):""}${info.daily_volume?"\n24h Volume: $"+Number(info.daily_volume).toLocaleString():""}`
          : "\n\nCould not fetch token data. It may not be listed on Jupiter.";
        push("ai", text + extra);

      } else if (action === "FETCH_PORTFOLIO") {
        const addr = actionData?.wallet==="address_or_connected" ? walletFull : actionData?.wallet;
        if (!addr) {
          push("ai", text + "\n\nConnect your wallet first so I can pull your portfolio.");
        } else {
          const pData = await fetchPortfolioData(addr);
          const solBal = portfolio.SOL ? `SOL: **${portfolio.SOL.toFixed(4)}**${prices.SOL?" ($"+(portfolio.SOL*prices.SOL).toFixed(2)+")":""}` : "";
          const other  = Object.entries(portfolio).filter(([k])=>k!=="SOL").map(([k,v])=>`${k}: ${v<1?v.toFixed(6):v.toFixed(2)}`).join("\n");
          const defi   = pData?.positions?.length ? `\n\nDeFi Positions: ${pData.positions.length} active` : "";
          push("ai", `${text}\n\n${solBal}${other?"\n"+other:""}${defi}`);
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
        const result = await fetchPredictionMarkets(actionData?.sport);
        setPredMarkets(result.markets);
        setPredSport(actionData?.sport || null);
        setShowPredList(true);

      } else if (action === "FETCH_EARN") {
        push("ai", text + "\n\nFetching earn vaults…");
        await fetchEarnVaults();
        setShowEarn(true);

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
                Prediction Markets {predSport ? `— ${predSport}` : ""}
              </div>
              {predMarkets.length > 0 ? (
                <>
                  <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>{predMarkets.length} open market{predMarkets.length!==1?"s":""} found — click one to predict</div>
                  {predMarkets.map((m, i) => {
                    const title   = m.title || m.question || m.name || `${m.teamA||"Team A"} vs ${m.teamB||"Team B"}`;
                    const close   = m.closeTime || m.endTime || m.closingDate;
                    const sport   = m.sport || m.category || predSport || "";
                    const poolUSD = m.totalVolume || m.pool || m.totalStake;
                    return (
                      <div key={m.id||i} className="market-row"
                        onClick={() => {
                          setPred({ teamA:m.teamA||m.title||title, teamB:m.teamB||"Team B", sport:sport, league:m.league||m.category||"", analysis:m.description||"" });
                          setPick(null); setShowPred(true); setShowPredList(false);
                        }}
                        style={{ padding:"12px 14px", border:`1px solid ${T.border}`, borderRadius:8, marginBottom:8, background:T.bg, cursor:"pointer", transition:"all 0.15s" }}>
                        <div style={{ fontWeight:500, fontSize:13, color:T.text1, marginBottom:3 }}>{title}</div>
                        <div style={{ fontSize:11, color:T.text3, display:"flex", gap:12 }}>
                          {sport && <span>⚽ {sport}</span>}
                          {close && <span>🕐 Closes {new Date(close).toLocaleDateString()}</span>}
                          {poolUSD && <span>💰 ${Number(poolUSD).toLocaleString()} pool</span>}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div style={{ fontSize:13, color:T.text2, marginBottom:16 }}>
                    No live API markets found right now. Browse by sport or ask about a specific match:
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
                    {PRED_SPORTS.map(sport => (
                      <button key={sport} onClick={() => send(`Show ${sport.toLowerCase()} prediction markets`)} className="hov-btn"
                        style={{ padding:"8px 16px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:20, fontSize:13, color:T.text2, cursor:"pointer" }}>
                        {sport}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize:12, color:T.text3 }}>
                    Or type a match: <em>"Arsenal vs Man City prediction"</em>
                  </div>
                </>
              )}
              <button onClick={() => setShowPredList(false)}
                style={{ marginTop:14, padding:"6px 14px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          )}

          {/* ── Single prediction panel ───────────────────────────────────── */}
          {showPred && pred && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:4, color:T.text1 }}>{pred.teamA} vs {pred.teamB}</div>
              <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>{pred.league} · {pred.sport}</div>
              {pred.analysis && <div style={{ fontSize:13, color:T.text2, marginBottom:16, lineHeight:1.6, padding:"10px 12px", background:T.bg, borderRadius:8 }}>{pred.analysis}</div>}
              <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                {[pred.teamA, "Draw", pred.teamB].map(opt => (
                  <button key={opt} onClick={() => setPick(opt)} className="hov-pick"
                    style={{ flex:1, padding:"10px 8px", border:`2px solid ${pick===opt?T.accent:T.border}`, borderRadius:10, background:pick===opt?T.accentBg:T.bg, color:pick===opt?T.accent:T.text2, fontSize:13, fontWeight:pick===opt?600:400, cursor:"pointer", transition:"all 0.15s" }}>
                    {opt}
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="number" placeholder="Stake (USDC)" value={stake}
                  onChange={e => setStake(e.target.value)}
                  style={{ flex:1, padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                />
                <button
                  onClick={() => {
                    if (!pick) return;
                    push("ai", `Prediction noted: **${pick}** with $${stake} USDC.\n\nNote: Minimum order size on Jupiter Predictions is $5. On-chain execution will be wired in the next update.`);
                    setShowPred(false);
                  }}
                  disabled={!pick||!stake||parseFloat(stake)<5} className="hov-btn"
                  style={{ padding:"8px 16px", background:T.green, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>
                  Confirm Pick
                </button>
                <button onClick={() => setShowPred(false)}
                  style={{ padding:"8px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
              {parseFloat(stake)<5 && stake!=="" && <div style={{ fontSize:11, color:T.red, marginTop:6 }}>Minimum stake is $5 USDC</div>}
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
                    <div>
                      <div style={{ fontWeight:600, fontSize:14, color:T.text1 }}>{v.name}</div>
                      <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>
                        {v.protocol && <span style={{ marginRight:8 }}>by {v.protocol}</span>}
                        {v.tvl > 0 && <span>TVL: ${Number(v.tvl).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                      </div>
                      {v.description && <div style={{ fontSize:11, color:T.text3, marginTop:4, maxWidth:220 }}>{v.description.slice(0,80)}</div>}
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                      <div style={{ fontSize:18, fontWeight:700, color:T.green }}>{v.apyDisplay}</div>
                      <div style={{ fontSize:10, color:T.text3, marginBottom:6 }}>APY</div>
                      <button
                        onClick={() => { setEarnDeposit({ vault:v, amount:"" }); setShowEarnDeposit(true); }} className="hov-btn"
                        style={{ padding:"5px 14px", background:T.accent, border:"none", borderRadius:6, color:"#fff", fontSize:12, fontWeight:500, cursor:"pointer" }}>
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
                  onClick={() => {
                    push("ai", `Deposit noted: **${earnDeposit.amount} ${earnDeposit.vault.token||"SOL"}** into **${earnDeposit.vault.name}** (${earnDeposit.vault.apyDisplay} APY).\n\nOn-chain deposit execution is being wired up. You can deposit directly at [earn.jup.ag](https://earn.jup.ag) for now.`);
                    setShowEarnDeposit(false); setShowEarn(false);
                  }}
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
