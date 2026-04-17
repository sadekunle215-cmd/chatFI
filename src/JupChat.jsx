import { useState, useEffect, useRef, useCallback } from "react";
import { VersionedTransaction } from "@solana/web3.js";

// ─── Jupiter API endpoints (verified against developers.jup.ag docs Apr 2026) ─
const JUP_BASE         = "https://api.jup.ag";
const JUP_LITE         = "https://lite-api.jup.ag";
const JUP_PRICE_API    = `${JUP_BASE}/price/v3`;
const JUP_TOKENS_API   = `${JUP_BASE}/tokens/v1/token`;
const JUP_TOKEN_SEARCH = `${JUP_BASE}/tokens/v1/search`;
const JUP_SWAP_ORDER   = `${JUP_BASE}/swap/v2/order`;
const JUP_SWAP_EXEC    = `${JUP_BASE}/swap/v2/execute`;
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

// (All other constants, SUGGESTIONS, T, fmt, TokenPicker stay exactly as in your original file)

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

// TokenPicker component (unchanged from your original)
function TokenPicker({ value, onSelect, jupFetch }) {
  // ... (your original TokenPicker code - exactly as before)
  const [query, setQuery]     = useState(value || "");
  const [results, setResults] = useState([]);
  const [busy, setBusy]       = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef(null);

  useEffect(() => { if (!focused) setQuery(value || ""); }, [value, focused]);

  const search = (q) => { /* ... your original search logic ... */ };
  const pick = (t) => { /* ... your original pick logic ... */ };

  return (
    <div style={{ flex:1, position:"relative" }}>
      {/* ... rest of your TokenPicker JSX unchanged ... */}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function JupChat() {
  // All your state, hooks, refs, and functions stay exactly the same until buildWalletList

  // ── Wallet helpers (only buildWalletList was updated) ───────────────────────
  const getStandardWallets = () => { /* your original code */ };
  const getLegacyProvider = (name) => { /* your original code */ };
  const MOBILE_DEEP_LINKS = { /* your original code */ };
  const WALLET_ICONS = { /* your original code */ };
  const wrapStandardWallet = (stdWallet) => { /* your original code */ };

  // ── UPDATED buildWalletList (this is the fix) ───────────────────────────────
  const buildWalletList = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const list = [];

    // 1. Wallet Standard (highest priority)
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

    // 2. Legacy injected providers
    const LEGACY = [
      { name:"Phantom",  icon:"👻" },
      { name:"Solflare", icon:"🔥" },
      { name:"Backpack", icon:"🎒" },
      { name:"Jupiter",  icon:"🪐" },
    ];
    for (const w of LEGACY) {
      const already = list.find(l => l.name.toLowerCase() === w.name.toLowerCase());
      if (already) continue;
      const prov = getLegacyProvider(w.name);
      if (prov) {
        list.push({ name: w.name, icon: w.icon, detected: true, connect: async () => prov, type: "legacy" });
      }
    }

    // 2.5. CRITICAL FIX: Jupiter Mobile in-app browser detection
    if (isMobile && window?.solana?.connect) {
      const alreadyHasJupiter = list.some(l => l.name.toLowerCase().includes("jupiter"));
      if (!alreadyHasJupiter) {
        list.unshift({
          name:     "Jupiter Wallet",
          icon:     "🪐",
          detected: true,
          connect:  async () => window.solana,
          type:     "legacy",
        });
      }
    }

    // 3. Generic window.solana catch-all
    const alreadyHasLegacy = list.some(l => l.type === "standard" || l.type === "legacy");
    if (!alreadyHasLegacy && window?.solana?.connect) {
      const solProv = window.solana;
      const name = solProv.isJupiter  ? "Jupiter"
                 : solProv.isPhantom  ? "Phantom"
                 : solProv.isSolflare ? "Solflare"
                 : solProv.isBackpack ? "Backpack"
                 : "Solana Wallet";
      const icon = solProv.isJupiter  ? "🪐"
                 : solProv.isPhantom  ? "👻"
                 : solProv.isSolflare ? "🔥"
                 : solProv.isBackpack ? "🎒"
                 : "💎";
      list.push({ name, icon, detected: true, connect: async () => solProv, type: "legacy" });
    }

    // 4. Mobile deep-links for wallets NOT detected yet
    if (isMobile) {
      const detectedNames = new Set(list.map(l => l.name.toLowerCase()));
      for (const [name, fn] of Object.entries(MOBILE_DEEP_LINKS)) {
        if (!detectedNames.has(name.toLowerCase())) {
          list.push({
            name,
            icon:     WALLET_ICONS[name] || "💳",
            detected: false,
            deepLink: fn(window.location.href),
            type:     "deeplink",
          });
        }
      }
    }

    // 5. Desktop install links + Jupiter mobile download fallback
    if (!isMobile && list.length === 0) {
      const DESKTOP_INSTALLS = [
        { name:"Jupiter Wallet", icon:"🪐", url:"https://chromewebstore.google.com/detail/jupiter-wallet/iledlaeogohbilgbfhmbgkgmpplbfboh" },
        { name:"Phantom",  icon:"👻", url:"https://phantom.com/download" },
        { name:"Solflare", icon:"🔥", url:"https://solflare.com/download" },
        { name:"Backpack", icon:"🎒", url:"https://backpack.app/downloads" },
      ];
      for (const w of DESKTOP_INSTALLS) {
        list.push({ name: w.name, icon: w.icon, detected: false, deepLink: w.url, type: "download" });
      }
    }
    if (isMobile && !list.some(l => l.type === "download")) {
      list.push({ name:"Get Jupiter Wallet", icon:"⬇️", detected:false, deepLink:"https://jup.ag/mobile", type:"download" });
    }

    return list;
  };

  // ── Rest of your component (all state, effects, functions, render, etc.) is 100% unchanged from your original file
  // (copy-paste the rest of your original JupChat component code here - everything after the wallet helpers)

  const [walletList, setWalletList] = useState([]);
  const pendingSwapRef = useRef(null);
  const connectedProviderRef = useRef(null);

  // ... all your useEffects, fetch functions, doSwap, doTrigger, doPredictionBet, etc. exactly as before ...

  // ── Render (your original JSX) ───────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", background:T.bg, fontFamily:T.body, color:T.text1, overflow:"hidden" }}>
      {/* Your entire original return JSX goes here - unchanged */}
    </div>
  );
}
