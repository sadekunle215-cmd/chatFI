// ─── Design Tokens ────────────────────────────────────────────────────────────
export const T = {
  bg:       "#0d1117",
  sidebar:  "#111820",
  surface:  "#161e27",
  border:   "#1e2d3d",
  text1:    "#e8f4f0",
  text2:    "#8fa8b8",
  text3:    "#4d6a7a",
  accent:   "#c7f284",
  accentBg: "#1a2e1a",
  green:    "#c7f284",
  greenBg:  "#1a2e1a",
  greenBd:  "#2d4d1a",
  red:      "#f28484",
  redBg:    "#2e1a1a",
  redBd:    "#4d2d2d",
  purple:   "#a78bfa",
  purpleBg: "#1e1a2e",
  teal:     "#38bdf8",
  tealBg:   "#0f2233",
  body:     "'DM Sans','Segoe UI',sans-serif",
  serif:    "'Lora','Georgia',serif",
  mono:     "'JetBrains Mono',monospace",
};

// ─── Token Mint Addresses ─────────────────────────────────────────────────────
export const TOKEN_MINTS = {
  SOL:      "So11111111111111111111111111111111111111112",
  USDC:     "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT:     "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  JUP:      "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK:     "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF:      "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  PENGU:    "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
  FARTCOIN: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
  PYTH:     "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  RAY:      "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  ORCA:     "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  MNGO:     "MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac",
  MSOL:     "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  JUPSOL:   "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
};

// ─── Jupiter API Base URLs ────────────────────────────────────────────────────
export const JUP_BASE         = "https://api.jup.ag";
export const JUP_PRICE_API    = `${JUP_BASE}/price/v3`;
export const JUP_QUOTE_API    = `${JUP_BASE}/swap/v1/quote`;
export const JUP_SWAP_API     = `${JUP_BASE}/swap/v1/swap`;
export const JUP_ROUTE_API    = `${JUP_BASE}/swap/v1/quote`;
export const JUP_TOKENS_API   = `${JUP_BASE}/tokens/v2`;
export const JUP_TOKEN_SEARCH = `${JUP_BASE}/tokens/v2/search`;
export const JUP_TOKEN_TAG    = `${JUP_BASE}/tokens/v2/search`;
export const JUP_TOKEN_CAT    = `${JUP_BASE}/tokens/v2/category`;
export const JUP_TOKEN_RECENT = `${JUP_BASE}/tokens/v2/new`;
export const JUP_PORTFOLIO    = `${JUP_BASE}/portfolio/v1`;
export const JUP_TRIGGER_API  = `${JUP_BASE}/trigger/v1`;
export const JUP_RECURRING_API= `${JUP_BASE}/recurring/v1`;
export const JUP_EARN_API     = `${JUP_BASE}/earn/v1`;
export const JUP_LEND_API     = `${JUP_BASE}/lend/v1`;
export const JUP_STUDIO_API   = `${JUP_BASE}/studio/v1`;
export const JUP_PRED_API     = "https://prediction.jup.ag/prediction/v1";
export const JUP_SEND_API     = `${JUP_BASE}/send/v1`;
export const JUP_WALLET_API   = `${JUP_BASE}/wallet/v1`;

// ─── Suggestion Groups ────────────────────────────────────────────────────────
export const SUGGESTION_GROUPS = [
  {
    label: "⚡ Power",
    color: "#a78bfa",
    items: ["Smart entry SOL", "Exit my JUP", "Deep dive BONK", "Morning briefing"],
  },
  {
    label: "Market",
    color: "#c7f284",
    items: ["What's the SOL price?", "Top trending tokens today", "Top xStocks", "Show swap route: SOL → USDC"],
  },
  {
    label: "Trade",
    color: "#63b3ed",
    items: ["Swap SOL to BONK", "Limit order: buy SOL below $140", "OCO: TP $200 SL $120 on SOL", "Long SOL 10x perps", "Buy $50 each of SOL, JUP, BONK", "Auto-order on SOL volatility spike"],
  },
  {
    label: "Earn",
    color: "#68d391",
    items: ["Show earn vaults", "DCA $10 USDC into SOL daily"],
  },
  {
    label: "Tools",
    color: "#f6ad55",
    items: ["Send 1 SOL via invite link", "Create a token on Jupiter Studio", "Lock 1000 JUP for 1 year", "Alert me when SOL hits $200", "My trade journal", "Arsenal vs Man City prediction", "Scan prediction odds for value bets"],
  },
];

// ─── Reown AppKit Config ──────────────────────────────────────────────────────
export const REOWN_PROJECT_ID = "21a9551a7eeedcd3c442d912b6ea336f"; // replace with your own
