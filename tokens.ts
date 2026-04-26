export const TOKEN_MINTS: Record<string, string> = {
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
  ORCA:    "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  POPCAT:  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  TRUMP:   "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
  SAMO:    "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
};

export const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9, JUP: 6, BONK: 5, WIF: 6, USDC: 6, USDT: 6,
  RAY: 6, PYTH: 6, MSOL: 9, JITOSOL: 9, ORCA: 6,
  POPCAT: 9, TRUMP: 6, SAMO: 9,
};

export const TOKEN_LOGOS: Record<string, string> = {
  SOL:     "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  USDC:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  USDT:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
  JUP:     "https://static.jup.ag/jup/icon.png",
  BONK:    "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
  WIF:     "https://bafkreibk3covs5ltyqxa272uodhculbgn2k7znl3yqco6hkvuoknoce5a.ipfs.nftstorage.link",
  RAY:     "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
  MSOL:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
  JITOSOL: "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
  ORCA:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
  PYTH:    "https://pyth.network/token.svg",
};

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const JUPUSD_MINT = "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD";

export const POPULAR_TOKENS = ["SOL", "JUP", "BONK", "WIF", "USDC", "USDT", "RAY", "PYTH"];

export const MULTIPLY_VAULTS = [
  { id: "jupsol-sol",  collateral: "JupSOL", debt: "SOL",  maxLev: "10x", ltv: "90%", risk: "Medium", desc: "Loop JupSOL vs SOL — amplify staking yield" },
  { id: "jitosol-sol", collateral: "JitoSOL", debt: "SOL", maxLev: "10x", ltv: "90%", risk: "Medium", desc: "JitoSOL loop — staking + MEV rewards" },
  { id: "sol-usdc",    collateral: "SOL",     debt: "USDC", maxLev: "5x",  ltv: "80%", risk: "High",   desc: "Leveraged SOL exposure vs USDC" },
  { id: "jlp-usdc",    collateral: "JLP",     debt: "USDC", maxLev: "5x",  ltv: "90%", risk: "Medium", desc: "JLP fees amplified vs USDC" },
  { id: "usdc-usdt",   collateral: "USDC",    debt: "USDT", maxLev: "20x", ltv: "95%", risk: "Low",    desc: "Stable-stable loop, amplify stablecoin yield" },
  { id: "wbtc-usdc",   collateral: "WBTC",    debt: "USDC", maxLev: "5x",  ltv: "80%", risk: "High",   desc: "Leveraged BTC exposure vs USDC" },
];

export const SUGGESTION_GROUPS = [
  {
    label: "Prices",
    color: "#c7f284",
    items: ["SOL price", "JUP price", "BONK price", "WIF vs SOL"],
  },
  {
    label: "Swap",
    color: "#63b3ed",
    items: ["Swap 1 SOL to USDC", "Swap 10 USDC to JUP", "Swap 0.5 SOL to BONK"],
  },
  {
    label: "Portfolio",
    color: "#b794f4",
    items: ["Show my portfolio", "My earn positions", "Check my DCA orders"],
  },
  {
    label: "Earn",
    color: "#f6ad55",
    items: ["Show earn vaults", "Earn on USDC", "Leverage SOL 3x"],
  },
];
