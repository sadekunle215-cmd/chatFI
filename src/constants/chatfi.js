// src/constants/jupiter.js
export const JUP_BASE = "https://api.jup.ag";
export const JUP_LITE = "https://lite-api.jup.ag";
export const JUP_PRICE_API = `${JUP_BASE}/price/v3`;
export const JUP_TOKENS_API = `${JUP_BASE}/tokens/v1/token`;
export const JUP_TOKEN_SEARCH = `${JUP_BASE}/tokens/v2/search`;
export const JUP_TOKEN_TAG = `${JUP_BASE}/tokens/v2/tag`;
export const JUP_TOKEN_CAT = `${JUP_BASE}/tokens/v2`;
export const JUP_TOKEN_RECENT = `${JUP_BASE}/tokens/v2/recent`;
export const JUP_TOKEN_VERIFY = `${JUP_BASE}/tokens/v2/verify/express/check-eligibility`;
export const JUP_SWAP_ORDER = `${JUP_BASE}/swap/v2/order`;
export const JUP_SWAP_EXEC = `${JUP_BASE}/swap/v2/execute`;
export const JUP_TRIGGER_BASE = `${JUP_BASE}/trigger/v1`;
export const JUP_TRIGGER_EXEC = `${JUP_LITE}/trigger/v1/execute`;
export const JUP_TV2 = `${JUP_BASE}/trigger/v2`;
export const JUP_TV2_LITE = `${JUP_LITE}/trigger/v2`;
export const JUP_RECUR_BASE = `${JUP_BASE}/recurring/v1`;
export const JUP_PORTFOLIO = `${JUP_BASE}/portfolio/v1`;
export const JUP_PRED_API = "https://lite-api.jup.ag/prediction/v1";
export const JUP_EARN_API = `${JUP_BASE}/lend/v1/earn`;
export const JUP_BORROW_API = `${JUP_BASE}/lend/v1/borrow`;
export const JUP_SEND_API = `${JUP_BASE}/send/v1`;
export const JUP_PERPS_API = `${JUP_BASE}/perps/v1`;
export const JUP_STUDIO_API = `${JUP_BASE}/studio/v1`;
export const JUP_LOCK_API = `${JUP_BASE}/lock/v1`;
export const JUP_ROUTE_API = `${JUP_BASE}/swap/v1/quote`;

export const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
export const SPL_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export const JUPUSD_MINT = "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const CHATFI_REFERRAL = "Rn8Z59LMmF3hxKbiCkgKoTYxvwTAerfDPPbq6H41PBw";

export const TOKEN_MINTS = {
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
  BTC:     "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  WBTC:    "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  ETH:     "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  WETH:    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
};

export const TOKEN_DECIMALS = {
  SOL:9, JUP:6, BONK:5, WIF:6, USDC:6, USDT:6, RAY:6, PYTH:6,
  MSOL:9, JITOSOL:9, BSOL:9, SAMO:9, ORCA:6, POPCAT:9, TRUMP:6,
  BTC:8, WBTC:8, ETH:8, WETH:8,
};

export const TOKEN_LOGO_URLS = {
  SOL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  USDC: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  // Add the rest of your logo URLs here if missing
};

export const PRED_CATEGORIES = ["sports","crypto","politics","esports","culture","economics","tech"];

export const MULTIPLY_VAULTS = [
  // Paste your full MULTIPLY_VAULTS array here from original file
];
