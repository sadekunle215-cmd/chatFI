import { useState, useEffect, useRef, useCallback } from "react";
import { Connection, Transaction, VersionedTransaction, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

// ── Reown AppKit (external wallet connect — Phantom, Backpack, etc.) ─────────
import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect, useWalletInfo } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana as solanaMainnet } from "@reown/appkit/networks";

// ── Privy (social / email login with embedded Solana wallet) ─────────────────
import { PrivyProvider, usePrivy, useWallets, useSolanaWallets } from "@privy-io/react-auth";

// ── SVG Icon Components ─────────────────────────────────────────────────────
const SvgChat = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const SvgWallet = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 12h2"/>
    <path d="M2 10h20"/>
  </svg>
);
const SvgZap = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const SvgBarChart = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const SvgLink = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
const SvgTwitterX = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.743l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);
const SvgDiscord = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);
const SvgTelegram = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);
const SvgGithub = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);
const SvgBlog = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const SvgPhone = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
);
const SvgLock = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const SvgPalette = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/>
    <circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
  </svg>
);
const SvgCoin = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);
const SvgMap = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
  </svg>
);
const SvgUpload = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);
const SvgCalendar = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const SvgRocket = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
  </svg>
);
const SvgWarning = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const SvgFrog = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="9" r="2"/><circle cx="15" cy="9" r="2"/>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
    <path d="M8 15s1.5 2 4 2 4-2 4-2"/>
  </svg>
);
const SvgArrowReturn = ({size=14,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.43"/>
  </svg>
);
const SvgSearch = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

// ─── Jupiter API endpoints (verified against developers.jup.ag docs Apr 2026) ─
const JUP_BASE         = "https://api.jup.ag";
const JUP_LITE         = "https://lite-api.jup.ag";
const JUP_PRICE_API    = `${JUP_BASE}/price/v3`;             // v3: usdPrice field, priceChange24h
const JUP_TOKENS_API   = `${JUP_BASE}/tokens/v1/token`;      // detail by mint (v1 still works)
const JUP_TOKEN_SEARCH = `${JUP_BASE}/tokens/v2/search`;      // v2 search: id=mint, icon, isVerified, audit.*
const JUP_TOKEN_TAG    = `${JUP_BASE}/tokens/v2/tag`;          // ?query=lst|verified
const JUP_TOKEN_CAT    = `${JUP_BASE}/tokens/v2`;              // /{category}/{interval} — toporganicscore|toptraded|toptrending
const JUP_TOKEN_RECENT = `${JUP_BASE}/tokens/v2/recent`;       // recently listed (first pool)
const JUP_TOKEN_VERIFY = `${JUP_BASE}/tokens/v2/verify/express/check-eligibility`; // Express verification eligibility
const JUP_SWAP_ORDER   = `${JUP_BASE}/swap/v2/order`;        // v2 meta-aggregator (RTSE auto, gasless auto)
const JUP_SWAP_EXEC    = `${JUP_BASE}/swap/v2/execute`;      // v2 execute
const JUP_TRIGGER_BASE  = `${JUP_BASE}/trigger/v1`;       // v1 kept for legacy reference
const JUP_TRIGGER_EXEC  = `${JUP_LITE}/trigger/v1/execute`;
const JUP_TV2           = `${JUP_BASE}/trigger/v2`;       // v2: JWT auth, USD price, vault, OCO/OTOCO
const JUP_TV2_LITE      = `${JUP_LITE}/trigger/v2`;
const JUP_RECUR_BASE   = `${JUP_BASE}/recurring/v1`;      // createOrder, execute, cancelOrder, getRecurringOrders
const JUP_PORTFOLIO    = `${JUP_BASE}/portfolio/v1`;
const JUP_PRED_API     = "https://lite-api.jup.ag/prediction/v1";
const JUP_EARN_API     = `${JUP_BASE}/lend/v1/earn`;   // deposit, withdraw, mint, redeem, tokens, positions, earnings
const JUP_BORROW_API   = `${JUP_BASE}/lend/v1/borrow`;  // borrow vault data (SDK-based ops)
const JUP_SEND_API     = `${JUP_BASE}/send/v1`;          // craft-send, craft-clawback, pending-invites, invite-history
const JUP_PERPS_API    = `${JUP_BASE}/perps/v1`;         // positions, orders, markets, open/close
const JUP_STUDIO_API   = `${JUP_BASE}/studio/v1`;        // DBC token creation, fee claims
const JUP_LOCK_API     = `${JUP_BASE}/lock/v1`;          // token vesting / locking
const JUP_ROUTE_API    = `${JUP_BASE}/swap/v1/quote`;    // raw quote with full route breakdown
const SOLANA_RPC       = import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const SPL_PROGRAM      = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
// JupUSD mint for prediction market deposits
const JUPUSD_MINT      = "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD";
const USDC_MINT        = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CHATFI_REFERRAL  = "Rn8Z59LMmF3hxKbiCkgKoTYxvwTAerfDPPbq6H41PBw"; // ChatFi referral account — fees accrue here

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
  // Bridged major assets — prevents meme-token collision on common tickers
  BTC:     "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",  // Wormhole WBTC
  WBTC:    "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  ETH:     "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",  // Wormhole ETH
  WETH:    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
};

const TOKEN_DECIMALS = {
  SOL:9, JUP:6, BONK:5, WIF:6, USDC:6, USDT:6, RAY:6, PYTH:6,
  MSOL:9, JITOSOL:9, BSOL:9, SAMO:9, ORCA:6, POPCAT:9, TRUMP:6,
  BTC:8, WBTC:8, ETH:8, WETH:8,
};

// Reliable logo URLs — img.jup.ag blocks cross-origin hotlinks from non-jup.ag origins
const TOKEN_LOGO_URLS = {
  SOL:     "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  USDC:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  USDT:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
  JUP:     "https://static.jup.ag/jup/icon.png",
  BONK:    "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
  WIF:     "https://bafkreibk3covs5ltyqxa272uodhculbgn2k7znl3yqco6hkvuoknoce5a.ipfs.nftstorage.link",
  RAY:     "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
  MSOL:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
  JITOSOL: "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
  BSOL:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
  ORCA:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
  SAMO:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/logo.png",
  PYTH:    "https://pyth.network/token.svg",
  POPCAT:  "https://bafkreifonkfmn75h5cdxdlkjkjzzgskvifndrpofb3fbgqxdktfzpkiebe.ipfs.nftstorage.link",
  TRUMP:   "https://bafkreia4g6tdumxzs3yuumfyixxwtlzqkjexifb44lprpioexmzblbq4y4.ipfs.nftstorage.link",
  WBTC:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh/logo.png",
  BTC:     "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh/logo.png",
  ETH:     "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png",
  WETH:    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png",
};

// Jupiter Prediction categories (per official API docs)
const PRED_CATEGORIES = ["sports","crypto","politics","esports","culture","economics","tech"];

// Jupiter Multiply vaults — leveraged looping strategies via Jupiter Lend
const MULTIPLY_VAULTS = [
  // vaultId: on-chain vault ID used by getOperateIx. colDecimals/debtDecimals for amount conversion.
  { id:"jupsol-sol",  vaultId:3,  collateral:"JupSOL", debt:"SOL",  colDecimals:9, debtDecimals:9, maxLev:"10x", ltv:"90%", desc:"Loop JupSOL vs SOL. Earn staking yield amplified. Best for SOL bulls.", risk:"Medium", url:"https://jup.ag/lend/multiply/jupsol-sol"  },
  { id:"jitosol-sol", vaultId:2,  collateral:"JitoSOL",debt:"SOL",  colDecimals:9, debtDecimals:9, maxLev:"10x", ltv:"90%", desc:"Loop JitoSOL vs SOL. Earn Jito staking + MEV rewards amplified.",      risk:"Medium", url:"https://jup.ag/lend/multiply/jitosol-sol" },
  { id:"sol-usdc",    vaultId:1,  collateral:"SOL",    debt:"USDC", colDecimals:9, debtDecimals:6, maxLev:"5x",  ltv:"80%", desc:"Leverage SOL exposure against USDC. Higher upside and downside.",       risk:"High",   url:"https://jup.ag/lend/multiply/sol-usdc"    },
  { id:"jlp-usdc",    vaultId:5,  collateral:"JLP",    debt:"USDC", colDecimals:6, debtDecimals:6, maxLev:"5x",  ltv:"90%", desc:"Loop JLP (Jupiter LP token) vs USDC. Earn JLP fees amplified.",         risk:"Medium", url:"https://jup.ag/lend/multiply/jlp-usdc"    },
  { id:"usdc-usdt",   vaultId:7,  collateral:"USDC",   debt:"USDT", colDecimals:6, debtDecimals:6, maxLev:"20x", ltv:"95%", desc:"Stable-stable loop. Very low risk, amplify stablecoin yield.",           risk:"Low",    url:"https://jup.ag/lend/multiply"             },
  { id:"wbtc-usdc",   vaultId:4,  collateral:"WBTC",   debt:"USDC", colDecimals:8, debtDecimals:6, maxLev:"5x",  ltv:"80%", desc:"Leverage BTC exposure against USDC.",                                   risk:"High",   url:"https://jup.ag/lend/multiply/wbtc-usdc"   },
  { id:"jup-usdc",    vaultId:6,  collateral:"JUP",    debt:"USDC", colDecimals:6, debtDecimals:6, maxLev:"4x",  ltv:"75%", desc:"Use JUP as collateral, loop to amplify JUP exposure.",                   risk:"High",   url:"https://jup.ag/lend/multiply"             },
];

const CHATFI_AVATAR = "data:image/png;base64,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AAAAAMDDQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA4A4AAAAAAAHBHQAAAAAAAoI7AAAAAAAEBHcAAAAAAAgI7gAAAAAAEBDcAQAAAAAgILgDAAAAAEBAcAcAAAAAgIDgDgAAAAAAAcEdAAAAAAACgjsAAAAAAAQEdwAAAAAACAjuAAAAAAAQENwBAAAAACAguAMAAAAAQEBwBwAAAACAgOAOAAAAAAABwR0AAAAAAAKCOwAAAAAABAR3AAAAAAAICO4AAAAAABAQ3AEAAAAAICC4AwAAAABAQHAHAAAAAICA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ENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAAACACwR0AAAAAACIQ3AEAAAAAIALBHQAAAAAAIhDcAQAAAAAgAsEdAAAAAAAiENwBAAAA+P/bsWMBAAAAgEH+1pPYWRgBMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAQ7gAAAAAAMBDuAAAAAAAwEO4AAAAAADAIBi2HxaIVIkUAAAAASUVORK5CYII=";

// ─── AI system prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ChatFi — a sharp, honest AI trading assistant built on Jupiter DEX (Solana). Tone: thoughtful, direct, warm — never hyped.

You pull live data: token prices (Jupiter Price API v3), safety scores, metadata. You help users swap ANY Solana token, set limit/DCA orders, track full portfolios, research tokens, analyse sports for prediction markets, interact with Jupiter Lend (Earn, Borrow, Multiply, Flashloans), send tokens via invite links, and trade perpetual futures.

JUPITER LEND KNOWLEDGE:
• Earn: Deposit assets → earn yield from borrowers. No fees, no supply limits. Withdrawals use Automated Debt Ceiling (smoothed per block). Returns jlTokens (receipt tokens). Endpoints: deposit/withdraw (by asset amount) or mint/redeem (by shares). token_exchange_price (scaled 1e12) converts shares ↔ underlying.
• Borrow: Deposit collateral into a vault → borrow against it. Positions are NFTs. Each vault has one collateral token and one debt token. Up to 95% LTV. Liquidation removes bad debt automatically.
• Multiply (looping): Flash-borrow debt → swap to collateral → deposit + borrow → repay flashloan. All atomic in one tx. Position tracked as NFT.
• Unwind (deleverage): Flash-borrow collateral → swap → repay debt + withdraw → repay flashloan. MAX_REPAY_AMOUNT / MAX_WITHDRAW_AMOUNT for full close.
• Repay-with-Collateral: Use when you only hold collateral, not debt token — flash-borrow debt → repay + withdraw max collateral → swap → repay flashloan.
• Flashloans: Zero fee, atomic, no collateral. Must repay within same tx. Use cases: arbitrage, liquidations, collateral swaps.
• Risks: Smart contract risk, liquidation if LTV breached, borrow rate > yield erodes Multiply profits.

JUPITER SEND KNOWLEDGE:
• Send tokens to anyone via invite links — recipient doesn't need a wallet to claim.
• Sender creates an invite link with amount + token. Recipient claims via the link.
• Unclaimed tokens can be clawed back by the sender.
• Use cases: gifting, payroll, airdrops, onboarding new users.

JUPITER PERPS KNOWLEDGE:
• Perpetual futures on Solana via Jupiter. Trade SOL, BTC, ETH with leverage up to 100x.
• Long = profit when price rises. Short = profit when price falls.
• Collateral: USDC for shorts; SOL/BTC/ETH for longs on respective pairs.
• Fees: open/close fee 0.06%. Borrow fee accrues per hour based on utilisation.
• Liquidation when position value < maintenance margin. Always set stop-loss.
• Price impact increases with position size relative to pool liquidity.

JUPITER STUDIO KNOWLEDGE:
• Create tokens on Solana via Dynamic Bonding Curves (DBC) — automated liquidity from day 1.
• Params: name, symbol, decimals (default 9), initial supply, description, website, twitter.
• Creator earns buy/sell trading fees from their DBC pool automatically.
• Claim creator fees: FETCH_STUDIO_FEES shows unclaimed SOL/token fees per DBC pool.
• Good for: meme coins, project tokens, fan tokens, community launches.
• DBC ensures tokens are tradeable immediately on Jupiter after creation.

JUPITER LOCK KNOWLEDGE:
• Lock tokens on-chain with cliff + linear vesting schedules. Non-custodial, on-chain guarantee.
• Cliff: delay before ANY tokens unlock. After cliff, tokens vest linearly until end of vesting period.
• Params: token, amount, cliff duration, vesting duration, recipient wallet.
• Use cases: team vesting, investor allocations, personal time-lock, DAO treasury.
• FETCH_LOCKS shows all locks where user is creator or recipient.
• Vested tokens can be claimed progressively — no need to wait for full vest.

JUPITER ROUTING KNOWLEDGE:
• SHOW_ROUTE reveals the exact DEX path for any swap: which AMMs are used, split %, price impact per hop.
• Powered by Jupiter's DEX aggregator across Orca, Raydium, Meteora, Lifinity, etc.
• Useful for: understanding swap execution, comparing routes, verifying slippage before swapping.
• Route data: routeInfo.marketInfos[] with dex name, input/output amounts, price impact.

 No code fences, no markdown, no text outside the JSON object. Output starts with { and ends with }:
{
  "text": "your message to the user",
  "action": null,
  "actionData": {}
}

Available actions:
- null               → just chat
- "FETCH_PRICE"      → actionData: { "tokens": ["SOL","JUP"] }
- "FETCH_TOKEN_INFO"     → actionData: { "symbol": "BONK" } — full token details: price, supply, holders, liquidity, 24h stats, audit, social links
- "FETCH_TOKEN_TAG"     → actionData: { "tag": "verified", "limit": 20 } — tag must be "lst" (liquid staking) or "verified". ALWAYS set limit to the number the user requests (e.g. "top 50" → limit:50). Default 20.
- "FETCH_TOKEN_CATEGORY"→ actionData: { "category": "toptrending", "interval": "24h", "limit": 20 } — category: toporganicscore|toptraded|toptrending; interval: 5m|1h|6h|24h. ALWAYS set limit to the number the user requests (e.g. "top 30" → limit:30). Default 20.
- "FETCH_TOKEN_RECENT"  → actionData: { "limit": 30 } — newest tokens that just got their first liquidity pool. ALWAYS set limit to the number the user requests (e.g. "top 50 new coins" → limit:50). Default 30.
- "CHECK_TOKEN_VERIFY"  → actionData: { "symbol": "BONK" } — check if a token is eligible for Jupiter express verification
- "FETCH_PORTFOLIO"  → actionData: { "wallet": "address_or_connected" } — fetches wallet balances + DeFi positions + prediction positions + earn positions + pending orders + airdrops (claimed & unclaimed)
- "SHOW_SWAP"        → actionData: { "from": "SOL", "to": "PEPE", "amount": "10", "amountUSD": null, "portion": null, "reason": "brief why" }
  Amount rules (pick ONE, others null):
  • portion: "all" | "half" | "quarter" | "75%" | "10%" — when user says "all my X", "half my X", "25% of X", etc.
  • amount: token units — when user says "swap 10 SOL"
  • amountUSD: dollar value — when user says "swap $10 of SOL"
  Examples: "swap all my USDC→SOL" → portion:"all", from:"USDC" | "swap half my SOL→BONK" → portion:"half"
- "SHOW_TRIGGER_V2"  → actionData: { "orderType": "single"|"oco"|"otoco", "from": "USDC", "to": "SOL", "amount": "100", "triggerCondition": "below"|"above", "triggerPriceUsd": "150", "tpPriceUsd": "200", "slPriceUsd": "120", "slippageBps": "100", "expiryDays": "7" }
  • single: one trigger price — standard limit order or stop-loss
  • oco: take-profit + stop-loss pair sharing one deposit — when one fills the other cancels
  • otoco: entry trigger fires first, then auto-activates a TP/SL (OCO) on the output
  • triggerPriceUsd required for single/otoco; tpPriceUsd+slPriceUsd required for oco/otoco; TP must be > SL
  • Min order: $10 USD. Default expiry: 7 days. slippage defaults: TP/buy-below=auto, SL/buy-above=20%
- "FETCH_TRIGGER_ORDERS" → actionData: { "state": "active" } — state: "active"|"past". Show open orders with cancel buttons.
- "SHOW_RECURRING"   → actionData: { "from": "USDC", "to": "SOL", "amountPerCycle": "10", "numberOfOrders": "10", "intervalSecs": "86400", "reason": "brief why" } — time-based DCA. intervalSecs: 60=1min,3600=1hr,86400=1day,604800=1wk,2592000=1mo
- "FETCH_RECURRING_ORDERS" → actionData: { "status": "active" } — status: "active"|"history". Show user open or past recurring orders with cancel buttons.
- "SHOW_PREDICTION"  → actionData: { "teamA": "Arsenal", "teamB": "Man City", "sport": "football", "league": "Premier League", "analysis": "deep tactical breakdown with form, H2H, key players", "searchQuery": "Arsenal Man City" } — ALWAYS set searchQuery. ALSO trigger FETCH_PREDICTIONS with the same query.
- "FETCH_PREDICTIONS"→ actionData: { "sport": "sports", "query": null } — sport categories (exact): sports, crypto, politics, esports, culture, economics, tech. For specific leagues set query instead.
- "FETCH_EARN"       → actionData: { "filter": "highest_apy" or null, "vault": "USDC" or null, "amount": "10" or null, "portion": "10%" or null } — portion: "all"|"half"|"quarter"|"N%"
- "SHOW_MULTIPLY"    → actionData: { "asset": "SOL" or null, "leverage": "3x" or null } — leveraged looping via Jupiter Lend flashloans. Explain mechanics + show vaults.
- "SHOW_BORROW"        → actionData: { "collateral": "SOL", "debt": "USDC", "colAmount": "10", "borrowAmount": "200", "reason": "brief why" } — deposit collateral into a Jupiter Lend vault and borrow against it. colAmount = collateral to deposit; borrowAmount = debt token to receive. Available vaults: SOL→USDC (vault 1, 80% LTV), JitoSOL→SOL (vault 2, 90%), JupSOL→SOL (vault 3, 90%), WBTC→USDC (vault 4, 80%), JLP→USDC (vault 5, 90%), JUP→USDC (vault 6, 75%), USDC→USDT (vault 7, 95%).
- "SHOW_LEND_POSITIONS" → actionData: {} — show user's open Lend positions (borrow/multiply) with unwind buttons AND earn positions with withdraw buttons
- "CLAIM_PAYOUTS"    → actionData: {} — triggers fetch of claimable prediction positions
- "SHOW_SEND"        → actionData: { "token": "SOL", "amount": "1", "reason": "brief why" } — send tokens via Jupiter invite link. Recipient claims without needing a wallet upfront.
- "FETCH_SEND_HISTORY" → actionData: { "type": "pending"|"history" } — show pending unclaimed invites (with clawback buttons) or full invite history
- "SHOW_PERPS"       → actionData: { "market": "SOL-PERP"|"BTC-PERP"|"ETH-PERP", "side": "long"|"short", "collateral": "100", "leverage": "10", "reason": "brief why" } — open a perpetuals position. Collateral in USD. Leverage 1–100x.
- "FETCH_PERPS_POSITIONS" → actionData: {} — show user's open perps positions with close/increase/decrease buttons
- "SHOW_STUDIO"     → actionData: { "name": "MyToken", "symbol": "MTK", "supply": "1000000", "decimals": "9", "description": "brief token purpose", "website": "", "twitter": "" } — open Jupiter Studio token creation panel (Dynamic Bonding Curve). Pre-fill any fields the user mentioned.
- "FETCH_STUDIO_FEES" → actionData: {} — check unclaimed DBC creator trading fees for connected wallet
- "SHOW_LOCK"       → actionData: { "token": "JUP", "amount": "1000", "cliffDays": "90", "vestingDays": "365", "recipient": "" } — lock SPL tokens with cliff+vesting schedule. NOTE: Native SOL cannot be locked — if user asks to lock SOL, suggest USDC or JUP instead. recipient blank = connected wallet. Pre-fill fields from user message.
- "FETCH_LOCKS"     → actionData: {} — view all token locks where user is creator or recipient. Shows claimable amounts.
- "SHOW_ROUTE"      → actionData: { "from": "SOL", "to": "USDC", "amount": "1" } — show full DEX route breakdown for this swap: AMMs used, split percentages, price impact per hop.
- "FETCH_XSTOCKS"   → actionData: { "limit": 15, "sort": "volume" } — tokenized real-world stocks (xStocks / RWA stocks) on Solana. sort: "volume"|"price_change"|"market_cap". Default limit 15.
- "SET_PRICE_ALERT" → actionData: { "token": "SOL", "condition": "above"|"below", "price": "200" } — set an in-session price alert; ChatFi notifies in chat when price crosses the threshold.
- "SHOW_TRADE_JOURNAL" → actionData: { "period": "all"|"today"|"week" } — show the user's local trade history and estimated PnL.
- "BASKET_SWAP"     → actionData: { "trades": [...] } — execute multiple swaps in sequence. Each trade supports THREE amount modes (pick one): amountUSD:"100" (spend $100 of from token), amount:"5.4" (native token units — parse k/K suffix as ×1000, m/M as ×1000000), or portion:"all"|"max"|"half"|"quarter"|"N%" (wallet balance fraction). from/to can vary per trade (many-to-one and one-to-many both work). Examples: "buy $100 each of SOL JUP BONK" → [{from:"USDC",to:"SOL",amountUSD:"100"},…]; "swap 5.4 JUP, 158.4k BONK to USDC" → [{from:"JUP",to:"USDC",amount:"5.4"},{from:"BONK",to:"USDC",amount:"158400"}]; "swap max of SOL PENGU to USDC" → [{from:"SOL",to:"USDC",portion:"max"},{from:"PENGU",to:"USDC",portion:"max"}]; "swap half my JUP and all my FARTCOIN to SOL" → [{from:"JUP",to:"SOL",portion:"half"},{from:"FARTCOIN",to:"SOL",portion:"all"}].
- "COPY_TRADE"      → actionData: { "wallet": "WALLET_ADDRESS", "limit": 5 } — fetch and show recent swaps from another wallet so user can mirror them. limit default 5.

Rules:
- "buy X" / "swap X to Y" / "exchange" → SHOW_SWAP — use EXACT symbol user mentioned even if unknown meme coin
- "price of X" → FETCH_PRICE — ALWAYS use this for any token price, even unknown ones. Use the token SYMBOL (e.g. "METEOR" for Meteora).
- "is X safe?" / "research X" / token info → FETCH_TOKEN_INFO — always attempt, UI searches Jupiter live; shows full metadata
- "show verified tokens" / "list verified" / "show LST tokens" / "liquid staking tokens" → FETCH_TOKEN_TAG
- "trending tokens" / "top trending" / "top traded" / "best organic score" / "hot tokens" → FETCH_TOKEN_CATEGORY
- "top stocks" / "xstocks" / "x stocks" / "tokenized stocks" / "stock tokens" / "rwa stocks" / "spy token" / "qqq" / "backed finance" / "real world assets stocks" → FETCH_XSTOCKS
- "new tokens" / "recently listed" / "new listings" / "just launched" → FETCH_TOKEN_RECENT
- "can I verify X?" / "verify eligibility" / "submit X for verification" → CHECK_TOKEN_VERIFY
- "my portfolio" / "my wallet" / "my positions" / "my orders" / "my bets" → FETCH_PORTFOLIO
- "claim" / "claim winnings" / "claim payout" / "claim ASR" / "claim governance rewards" / "claim JUP rewards" → CLAIM_PAYOUTS
- sports + predict/bet / "EPL" / "Champions League" / specific match → ALWAYS do BOTH: SHOW_PREDICTION then FETCH_PREDICTIONS
- "predictions" / "show markets" / "what can I bet on" → FETCH_PREDICTIONS
- "earn" / "yield" / "APY" / "lend" / "passive income" / "staking" → FETCH_EARN
- "withdraw from earn" / "redeem jlTokens" / "take out my earn" → SHOW_LEND_POSITIONS (earn panel has withdraw buttons)
- "multiply" / "leverage" / "loop" / "leveraged yield" / "amplify" / "2x" / "3x" on Jupiter → SHOW_MULTIPLY
- "borrow" / "I want to borrow" / "use borrow" / "deposit collateral" / "take a loan" / "borrow USDC" / "borrow against SOL" / "lend borrow" / "use SOL as collateral" / "how do I borrow" / "open borrow" → SHOW_BORROW — fire this IMMEDIATELY even if no amounts given; open the panel and let the user fill in details. Extract collateral/debt/amounts if present, otherwise leave blank.
- CRITICAL: "borrow" alone → SHOW_BORROW. NEVER ask the user to specify details before opening the panel. NEVER return action:null for borrow intent.
- "my open positions" / "my lend positions" / "close position" / "unwind" / "deleverage" / "repay with collateral" → SHOW_LEND_POSITIONS
- NEVER use SHOW_LEND_POSITIONS when user asks about borrowing — that is SHOW_BORROW.
- "flashloan" / "flash loan" → explain: zero-fee atomic loan, repay within same tx; use cases: arbitrage, liquidations, collateral swaps
- "limit order" / "buy below $X" / "sell above $X" / "price trigger" → SHOW_TRIGGER_V2 with orderType:"single"
- "OCO" / "take profit and stop loss" / "TP/SL" / "bracket order" → SHOW_TRIGGER_V2 with orderType:"oco"
- "OTOCO" / "buy then set TP/SL" / "entry + exit" / "conditional order" → SHOW_TRIGGER_V2 with orderType:"otoco"
- "my trigger orders" / "open trigger" / "limit order history" → FETCH_TRIGGER_ORDERS
- "DCA" / "recurring" / "buy every day/week/month" / "dollar cost average" / "auto-buy" / "schedule trades" / "buy X daily" / "buy X weekly" / "recur" / "reccur" → SHOW_RECURRING — ALWAYS pre-fill all fields you can infer. If user says "$10 of SOL daily for 3 days": from:"USDC", to:"SOL", amountPerCycle:"10", numberOfOrders:"3", intervalSecs:"86400". Default from:"USDC" when user gives a dollar amount. intervalSecs defaults: daily=86400, weekly=604800, monthly=2592000. numberOfOrders = the number of cycles mentioned.
- "my recurring orders" / "show DCA orders" / "active recurring" / "DCA history" → FETCH_RECURRING_ORDERS
- "cancel recurring" / "stop DCA" → FETCH_RECURRING_ORDERS (so user can see cancel buttons)
- "send tokens" / "send SOL to someone" / "gift tokens" / "invite link" / "send via link" → SHOW_SEND
- "my invites" / "pending invites" / "clawback" / "unclaimed sends" → FETCH_SEND_HISTORY with type:"pending"
- "send history" / "past sends" → FETCH_SEND_HISTORY with type:"history"
- "perps" / "perpetuals" / "long SOL" / "short BTC" / "leveraged trade" / "futures" / "open long" / "open short" → SHOW_PERPS — pre-fill market + side from user intent
- "my perps" / "my futures positions" / "open perps positions" / "close perp" → FETCH_PERPS_POSITIONS
- "create token" / "launch token" / "mint token" / "DBC" / "dynamic bonding curve" / "token studio" / "launch on jupiter" → SHOW_STUDIO — open creation panel, pre-fill any params mentioned
- "my creator fees" / "claim creator fees" / "DBC fees" / "studio fees" / "unclaimed fees" → FETCH_STUDIO_FEES
- "lock tokens" / "vesting" / "lock JUP" / "lock SOL" / "lock my tokens" / "team vesting" / "investor lock" → SHOW_LOCK — open lock panel, pre-fill token/amount/cliff/vesting from user message
- "my locks" / "vested tokens" / "claim vested" / "locked tokens" / "view locks" / "my vesting" → FETCH_LOCKS
- "show route" / "how is swap routed" / "which DEX" / "route breakdown" / "swap path" / "which AMM" → SHOW_ROUTE
- "alert me when" / "notify me when" / "price alert" / "tell me when X hits $Y" / "alert when X above/below" → SET_PRICE_ALERT — extract token, condition (above/below), price
- "my trades" / "trade history" / "trade journal" / "my PnL" / "what have I traded" / "show my swaps" / "trading history" → SHOW_TRADE_JOURNAL
- "buy $X each of A B C" / "split $N between" / "basket buy" / "buy multiple tokens" / "swap X JUP and Y BONK to USDC" / "swap all these tokens to USDC" / "swap max/all of A B C to X" / "dump all my A B C into X" → BASKET_SWAP — parse each token, amount mode, and direction into trades array; default from:"USDC" when buying, default to:"USDC" when selling/dumping
- "copy trade" / "mirror wallet" / "copy trades from" / "what is wallet X buying" / "follow wallet" / "mirror trades of" → COPY_TRADE — extract the wallet address
- NEVER say you don't have live data. ALWAYS trigger the appropriate action and let the UI fetch it. Never fabricate prices. Be concise.
- CRITICAL — NEVER say "I can't", "I currently can't", "I don't support", "I'm unable to", or any phrase implying you cannot do something that has a supported action. ALWAYS fire the action instead.
- CRITICAL — SHOW_RECURRING is fully supported. When user asks for a recurring/DCA order, you MUST return action:"SHOW_RECURRING" with all fields pre-filled from the user's message. Never tell the user to do it manually.
- "smart entry X" / "best way to enter X" / "how should I buy X" → Power Command (client-side). Return action:null, text:"Running smart entry analysis for **X** — fetching live price, trending rank, and swap quote…"
- "exit my X" / "best way to exit X" / "exit strategy X" → Power Command (client-side). Return action:null, text:"Analysing exit strategy for **X** — checking price momentum, balance, and best route…"
- "deep dive X" / "full analysis X" / "research X" / "analyse X" / "tell me everything about X" → Power Command (client-side). Return action:null, text:"Running full deep dive on **X** — pulling metadata, organic score, safety flags, and liquidity depth…"
- "morning briefing" / "portfolio pulse" / "how is my portfolio doing" / "daily brief" → Power Command (client-side). Return action:null, text:"Pulling your portfolio pulse — checking balances, earn positions, and open orders in parallel…"`;

const SUGGESTION_GROUPS = [
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
    items: ["Swap SOL to BONK", "Limit order: buy SOL below $140", "OCO: TP $200 SL $120 on SOL", "Long SOL 10x perps", "Buy $50 each of SOL, JUP, BONK"],
  },
  {
    label: "Earn",
    color: "#68d391",
    items: ["Show earn vaults", "DCA $10 USDC into SOL daily"],
  },
  {
    label: "Tools",
    color: "#f6ad55",
    items: ["Send 1 SOL via invite link", "Create a token on Jupiter Studio", "Lock 1000 JUP for 1 year", "Alert me when SOL hits $200", "My trade journal", "Arsenal vs Man City prediction"],
  },
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
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

// ── Reown AppKit Init ────────────────────────────────────────────────────────
// Get a free projectId at https://cloud.reown.com
const REOWN_PROJECT_ID = "21a9551a7eeedcd3c442d912b6ea336f"; // replace with your own
const _solanaAdapter = new SolanaAdapter();
createAppKit({
  adapters: [_solanaAdapter],
  networks: [solanaMainnet],
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: "ChatFi",
    description: "ChatFi — Your personal AI tools on Solana",
    url: typeof window !== "undefined" ? window.location.origin : "https://chatfi.app",
    icons: ["https://jup.ag/favicon.ico"],
  },
  features: { analytics: false },
});

const fmt = (text = "") => {
  // Inline markdown helpers
  const inlineMd = (s) =>
    s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
     .replace(/\*(.*?)\*/g, "<em>$1</em>")
     .replace(/`(.*?)`/g, "<code>$1</code>")
     .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:#c7f284;text-decoration:underline">$1</a>');

  const lines = text.split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Numbered list item: "1. TOKEN — Name $price (+x%) · score N"
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      // Collect consecutive numbered lines into a card grid
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\d+)\.\s+(.+)/);
        if (!m) break;
        items.push({ num: m[1], content: m[2] });
        i++;
      }

      html += `<div style="display:flex;flex-direction:column;gap:5px;margin:10px 0">`;
      for (const item of items) {
        // Extract optional leading [img:URL] logo tag before matching
        const imgMatch = item.content.match(/^\[img:([^\]]+)\]/);
        const logoSrc  = imgMatch ? imgMatch[1] : null;
        const content  = imgMatch ? item.content.slice(imgMatch[0].length) : item.content;

        // Parse "**SYMBOL** — Name ✓ $price (+x%) · score N" or "SYMBOL — Name ✓ $price (+x%) · score N"
        const tokenMatch = content.match(/^\*{0,2}(\S+?)\*{0,2}\s+[—–]\s+(.*?)\s+(\$[\d.,e+-]+)\s+\(([^)]+)\)(?:\s+[·•]\s+score\s+(\d+))?/);
        if (tokenMatch) {
          const [, sym, name, price, change, score] = tokenMatch;
          const isUp = change.startsWith("+");
          const isVerified = content.includes("✓");
          const changeColor = isUp ? "#68d391" : "#fc8181";
          const changeBg = isUp ? "rgba(104,211,145,0.1)" : "rgba(252,129,129,0.1)";
          const scoreNum = score ? parseInt(score) : null;
          const scoreColor = scoreNum >= 90 ? "#c7f284" : scoreNum >= 70 ? "#68d391" : "#8fa8b8";
          const rankNum = parseInt(item.num);
          const rankColor = rankNum === 1 ? "#f6d860" : rankNum === 2 ? "#c0c0c0" : rankNum === 3 ? "#cd7f32" : "#2d4a5a";
          const logoHtml = logoSrc
            ? `<img src="${logoSrc}" alt="${sym}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid #1e2d3d;" onerror="this.style.display='none'">`
            : `<div style="width:28px;height:28px;border-radius:50%;background:#1e2d3d;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#4d6a7a">${sym.slice(0,2)}</div>`;

          const cleanSym = sym.replace(/✓/g,"").trim();
          html += `<div onclick="window.__chatfiSend && window.__chatfiSend('${cleanSym} info')" style="display:flex;align-items:center;gap:0;background:#161e27;border:1px solid #1e2d3d;border-radius:11px;overflow:hidden;cursor:pointer;transition:border-color 0.15s,background 0.15s;" onmouseenter="this.style.borderColor='#c7f284';this.style.background='#1a2618'" onmouseleave="this.style.borderColor='#1e2d3d';this.style.background='#161e27'">
            <div style="width:3px;align-self:stretch;background:${rankNum<=3 ? rankColor : "#1e2d3d"};flex-shrink:0"></div>
            <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;flex:1;min-width:0">
              <span style="font-size:10px;font-weight:700;color:${rankColor};min-width:16px;text-align:center;flex-shrink:0">${item.num}</span>
              ${logoHtml}
              <div style="flex:1;min-width:0;overflow:hidden">
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
                  <span style="font-size:13px;font-weight:700;color:#e8f4f0;letter-spacing:-0.2px">${cleanSym}</span>
                  ${isVerified ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#c7f284" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
                  <span style="font-size:11px;color:#4d6a7a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name.replace(/✓/g,"").trim()}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:12px;font-weight:600;color:#c8d8e0">${price}</span>
                  <span style="font-size:10px;font-weight:700;color:${changeColor};background:${changeBg};padding:1px 6px;border-radius:5px">${change}</span>
                </div>
              </div>
              ${scoreNum ? `<div style="text-align:center;flex-shrink:0;padding-left:4px"><div style="font-size:9px;color:#4d6a7a;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:1px">score</div><div style="font-size:14px;font-weight:800;color:${scoreColor};line-height:1">${scoreNum}</div></div>` : ""}
              <span style="font-size:9px;color:#2d4a5a;flex-shrink:0;padding-left:2px">›</span>
            </div>
          </div>`;
        } else {
          // Generic numbered item — clean pill
          const rankNum = parseInt(item.num);
          const rankColor = rankNum === 1 ? "#f6d860" : rankNum === 2 ? "#c0c0c0" : rankNum === 3 ? "#cd7f32" : "#2d4a5a";
          // Extract first bold word or plain first word as click target
          const genericSym = (content.match(/^\*\*([^*]+)\*\*/) || content.match(/^([A-Za-z][A-Za-z0-9]+)/))?.[1] || "";
          const clickAttr = genericSym ? `onclick="window.__chatfiSend && window.__chatfiSend('${genericSym} info')" style="cursor:pointer;"` : "";
          html += `<div ${clickAttr} style="display:flex;align-items:flex-start;gap:0;background:#161e27;border:1px solid #1e2d3d;border-radius:11px;overflow:hidden;${genericSym ? "cursor:pointer;" : ""}" ${genericSym ? 'onmouseenter="this.style.borderColor=\'#c7f284\'" onmouseleave="this.style.borderColor=\'#1e2d3d\'"' : ""}>
            <div style="width:3px;align-self:stretch;background:${rankNum<=3 ? rankColor : "#1e2d3d"};flex-shrink:0"></div>
            <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;flex:1">
              <span style="font-size:10px;font-weight:700;color:${rankColor};min-width:16px;text-align:center;padding-top:2px;flex-shrink:0">${item.num}</span>
              <span style="font-size:13px;color:#e8f4f0;line-height:1.5">${inlineMd(content)}</span>
            </div>
          </div>`;
        }
      }
      html += `</div>`;
      continue;
    }

    // ── Section header: line ending with colon or all-caps short phrase
    if (/^[A-Z][^a-z]{0,40}:$/.test(line.trim()) || /^\*\*[^*]+\*\*$/.test(line.trim())) {
      html += `<div style="font-size:11px;font-weight:700;color:#4d6a7a;letter-spacing:0.08em;text-transform:uppercase;margin:12px 0 6px">${inlineMd(line.trim().replace(/:$/, ""))}</div>`;
      i++;
      continue;
    }

    // ── Bullet list item
    if (/^[-•]\s/.test(line)) {
      html += `<div style="display:flex;gap:8px;padding:3px 0"><span style="color:#c7f284;font-size:10px;margin-top:4px;flex-shrink:0">▸</span><span style="font-size:13px;color:#e8f4f0;line-height:1.5">${inlineMd(line.replace(/^[-•]\s+/, ""))}</span></div>`;
      i++;
      continue;
    }

    // ── Blank line → small gap
    if (line.trim() === "") {
      html += `<div style="height:6px"></div>`;
      i++;
      continue;
    }

    // ── Price line: "TOKEN: $price" or "SOL: $86.84"
    const priceLineMatch = line.match(/^([A-Z]{2,10}):\s+(\$[\d.,]+)(\s+.*)?$/);
    if (priceLineMatch) {
      const [, tok, price, rest] = priceLineMatch;
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#161e27;border:1px solid #1e2d3d;border-radius:10px;margin:4px 0">
        <span style="font-size:13px;font-weight:700;color:#8fa8b8">${tok}</span>
        <span style="font-size:16px;font-weight:800;color:#e8f4f0;letter-spacing:-0.3px">${price}</span>
        ${rest ? `<span style="font-size:12px;color:#68d391">${inlineMd(rest.trim())}</span>` : ""}
      </div>`;
      i++;
      continue;
    }

    // ── Swap card: [swap-card|from|to|sentAmt|outAmt|fee|sig|status]
    const swapCardMatch = line.match(/^\[swap-card\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]*)\|([^|]+)\|([^\]]+)\]$/);
    if (swapCardMatch) {
      const [, from, to, sent, out, fee, sig, status] = swapCardMatch;
      const isOk    = status === "ok";
      const short   = sig.length > 10 ? sig.slice(0,8)+"…"+sig.slice(-6) : sig;
      const color   = isOk ? "#c7f284" : "#fc8181";
      const iconSvg = isOk
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#c7f284" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fc8181" stroke-width="2.5"/><path d="M15 9l-6 6M9 9l6 6" stroke="#fc8181" stroke-width="2.5" stroke-linecap="round"/></svg>`;
      html += `<div style="background:#0e1820;border:1px solid ${isOk ? "rgba(199,242,132,0.18)" : "rgba(252,129,129,0.18)"};border-radius:14px;overflow:hidden;margin:6px 0;font-family:inherit">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px 8px;border-bottom:1px solid #1a2535">
          <div style="display:flex;align-items:center;gap:7px">
            ${iconSvg}
            <span style="font-size:13px;font-weight:700;color:${color};letter-spacing:-0.1px">Swap ${isOk ? "Executed" : "Failed"}</span>
          </div>
          <span style="font-size:10px;color:#4d6a7a;background:#161e27;padding:2px 8px;border-radius:20px;letter-spacing:0.04em">Jupiter</span>
        </div>
        <div style="padding:10px 14px 4px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <div style="background:#161e27;border-radius:8px;padding:6px 10px;flex:1;text-align:center">
              <div style="font-size:9px;color:#4d6a7a;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px">Sent</div>
              <div style="font-size:14px;font-weight:800;color:#e8f4f0;letter-spacing:-0.3px">${sent}</div>
              <div style="font-size:10px;color:#4d6a7a">${from}</div>
            </div>
            <div style="flex-shrink:0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#4d6a7a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div style="background:#161e27;border-radius:8px;padding:6px 10px;flex:1;text-align:center">
              <div style="font-size:9px;color:#4d6a7a;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px">Received</div>
              <div style="font-size:14px;font-weight:800;color:${isOk ? "#c7f284" : "#8fa8b8"};letter-spacing:-0.3px">${out}</div>
              <div style="font-size:10px;color:#4d6a7a">${to}</div>
            </div>
          </div>
          ${fee ? `<div style="font-size:10px;color:#4d6a7a;text-align:center;margin-bottom:6px">Fee: ${fee}</div>` : ""}
        </div>
        ${isOk && sig ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#0b1219;border-top:1px solid #1a2535">
          <div style="display:flex;align-items:center;gap:6px">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#4d6a7a" stroke-width="2"/><path d="M7 12h10M7 8h10M7 16h6" stroke="#4d6a7a" stroke-width="1.5" stroke-linecap="round"/></svg>
            <span style="font-size:10px;color:#4d6a7a;font-family:monospace">${short}</span>
            <span onclick="navigator.clipboard.writeText('${sig}').then(()=>{this.textContent='✓';setTimeout(()=>{this.textContent='Copy'},1200)})" style="cursor:pointer;font-size:9px;color:#8fa8b8;background:#161e27;border:1px solid #1e2d3d;border-radius:4px;padding:1px 6px;margin-left:2px;user-select:none">Copy</span>
          </div>
          <a href="https://solscan.io/tx/${sig}" target="_blank" rel="noreferrer" style="display:flex;align-items:center;gap:4px;font-size:10px;color:#c7f284;text-decoration:none;font-weight:600">
            View
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="#c7f284" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </div>` : ""}
      </div>`;
      i++;
      continue;
    }

    // ── Normal paragraph line
    html += `<span style="font-size:14px;line-height:1.6">${inlineMd(line)}</span><br/>`;
    i++;
  }

  return html;
};

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
        // Search V2 (verified) + V1 (all Jupiter tokens) in parallel, merge & dedup
        const [v2raw, v1raw] = await Promise.allSettled([
          jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(q)}`),
          jupFetch(`${JUP_BASE}/tokens/v1/search?query=${encodeURIComponent(q)}&limit=50`),
        ]);
        const toList = (r) => {
          const d = r.status === "fulfilled" ? r.value : [];
          return Array.isArray(d) ? d : (d?.tokens || d?.data || []);
        };
        const v2list = toList(v2raw).map(t => ({ ...t, address: t.id || t.address, _src: "v2" }));
        const v1list = toList(v1raw).map(t => ({ ...t, address: t.address || t.id, _src: "v1" }));
        // Merge: V2 first, then V1 extras not already in V2 (dedup by address/id)
        const seen = new Set(v2list.map(t => t.address).filter(Boolean));
        const merged = [...v2list, ...v1list.filter(t => t.address && !seen.has(t.address))];
        // Sort: exact symbol match → then V2 before V1 → then 24h volume
        const upper = q.trim().toUpperCase();
        const sorted = [...merged].sort((a, b) => {
          const aE = a.symbol?.toUpperCase() === upper ? 1 : 0;
          const bE = b.symbol?.toUpperCase() === upper ? 1 : 0;
          if (bE !== aE) return bE - aE;
          if (a._src !== b._src) return a._src === "v2" ? -1 : 1;
          const aVol = (a.stats24h?.buyVolume||0)+(a.stats24h?.sellVolume||0)||a.daily_volume||0;
          const bVol = (b.stats24h?.buyVolume||0)+(b.stats24h?.sellVolume||0)||b.daily_volume||0;
          return bVol - aVol;
        });
        setResults(sorted.slice(0, 50));
      } catch { setResults([]); }
      setBusy(false);
    }, 300);
  };

  const pick = (t) => {
    const sym  = (t.symbol || "").toUpperCase();
    const mint = t.id || t.address;    // v2 uses "id"; v1 used "address"
    onSelect(sym, mint, t.decimals ?? 6);
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

// ─── Token price chart (GeckoTerminal → CoinGecko fallback, no API key) ───────
function TokenMiniChart({ mint, T }) {
  const [data,    setData]    = useState(null);  // [{ t, p }]
  const [loading, setLoading] = useState(true);
  const [range,   setRange]   = useState("1D");
  const abortRef = useRef(null);

  useEffect(() => {
    if (!mint) { setLoading(false); return; }
    // Cancel any previous in-flight fetch
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true); setData(null);

    const daysCfg = { "1D":1, "7D":7, "30D":30 }[range] || 1;
    const gtCfg   = { "1D":{ gran:"hour",agg:1,lim:24 }, "7D":{ gran:"hour",agg:4,lim:42 }, "30D":{ gran:"day",agg:1,lim:30 } }[range];

    const tryGeckoTerminal = () =>
      fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/ohlcv/${gtCfg.gran}?aggregate=${gtCfg.agg}&limit=${gtCfg.lim}`, { signal: ctrl.signal })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => {
          const list = d?.data?.attributes?.ohlcv_list;
          if (!list?.length) throw new Error("empty");
          return list.map(([ts,,,,close]) => ({ t: ts * 1000, p: parseFloat(close) })).filter(d => d.p > 0);
        });

    const tryCoinGecko = () =>
      fetch(`https://api.coingecko.com/api/v3/coins/solana/contract/${mint}/market_chart?vs_currency=usd&days=${daysCfg}`, { signal: ctrl.signal })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => {
          const pts = d?.prices;
          if (!pts?.length) throw new Error("empty");
          const step = Math.max(1, Math.floor(pts.length / 36));
          return pts.filter((_, i) => i % step === 0).map(([t, p]) => ({ t, p }));
        });

    tryGeckoTerminal()
      .catch(() => tryCoinGecko())
      .then(pts => {
        if (!ctrl.signal.aborted) { setData(pts); setLoading(false); }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [mint, range]);

  const BD = "#1e2d3d";
  const ranges = ["1D","7D","30D"];

  // Skeleton — always show while loading so user knows the chart section is there
  if (loading) return (
    <div style={{ padding:"12px 14px", background:(T||{}).bg||"#0d1117", border:`1px solid ${BD}`, borderRadius:12, marginBottom:0 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:10, color:"#4d6a7a", letterSpacing:"0.08em", textTransform:"uppercase" }}>Price Chart</span>
        <div style={{ display:"flex", gap:4 }}>
          {ranges.map(r => <button key={r} onClick={() => setRange(r)} style={{ padding:"2px 8px", borderRadius:6, fontSize:10, background:"none", border:`1px solid ${BD}`, color:"#4d6a7a", cursor:"pointer" }}>{r}</button>)}
        </div>
      </div>
      <div style={{ height:72, borderRadius:8, background:"linear-gradient(90deg,#0d1117 25%,#1e2d3d 50%,#0d1117 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }}/>
    </div>
  );

  // No data from either source — render nothing (no ghost border)
  if (!data?.length) return null;

  const prices = data.map(d => d.p);
  const min = Math.min(...prices), max = Math.max(...prices);
  const W = 300, H = 72, PAD = 3;
  const px = i  => (i / (prices.length - 1)) * W;
  const py = p  => H - PAD - ((p - min) / ((max - min) || min * 0.001 || 1)) * (H - PAD * 2);
  const linePts = prices.map((p, i) => `${px(i).toFixed(1)},${py(p).toFixed(1)}`).join(" ");
  const areaPts = `0,${H} ${linePts} ${W},${H}`;
  const isUp    = prices[prices.length - 1] >= prices[0];
  const color   = isUp ? "#68d391" : "#fc8181";
  const gradId  = `mcg-${mint.slice(0,6)}`;
  const pct     = prices[0] > 0 ? ((prices[prices.length-1] - prices[0]) / prices[0] * 100) : 0;
  const fmtT    = ts => {
    const d = new Date(ts);
    return range === "30D"
      ? d.toLocaleDateString(undefined, { month:"short", day:"numeric" })
      : d.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
  };

  return (
    <div style={{ padding:"12px 14px", background:(T||{}).bg||"#0d1117", border:`1px solid ${BD}`, borderRadius:12 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:10, color:"#4d6a7a", letterSpacing:"0.08em", textTransform:"uppercase" }}>Price Chart</span>
          <span style={{ fontSize:11, fontWeight:700, color, background:color+"22", borderRadius:6, padding:"1px 7px" }}>
            {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
          </span>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {ranges.map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:600, cursor:"pointer",
              background: range === r ? color+"22" : "none",
              border: `1px solid ${range === r ? color : BD}`,
              color: range === r ? color : "#4d6a7a",
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* SVG chart */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:H, display:"block" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill={`url(#${gradId})`}/>
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"/>
        <circle cx={px(prices.length-1)} cy={py(prices[prices.length-1])} r="3.5"
          fill={color} stroke="#0d1117" strokeWidth="1.5"/>
      </svg>

      {/* Time labels */}
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#4d6a7a", marginTop:4 }}>
        <span>{fmtT(data[0].t)}</span>
        <span>{fmtT(data[data.length-1].t)}</span>
      </div>
    </div>
  );
}

// ─── Blog posts data ──────────────────────────────────────────────────────────
const BLOG_POSTS = [
  {
    id: 1,
    title: "What is ChatFi? Your AI Trading Copilot on Solana",
    category: "Overview",
    readTime: "4 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "ChatFi is the first AI-native trading interface built on Jupiter — the largest DEX aggregator on Solana. Learn what it is, how it works, and why it's different.",
    sections: [
      {
        heading: "The Problem With DeFi Today",
        body: "DeFi is powerful but brutal to use. You need to know which DEX has the best price, understand slippage, manage multiple tabs, and decode transaction errors — all before you've made a single trade. Most people give up, or make costly mistakes trying."
      },
      {
        heading: "What ChatFi Does Differently",
        body: "ChatFi wraps Jupiter's entire trading suite — swaps, limit orders, DCA, lending, yield, and prediction markets — behind a natural language interface. You just type what you want. \"Swap $50 of SOL to JUP\" or \"buy $100 each of BONK, PENGU, and FARTCOIN\" — ChatFi figures out the rest and executes it on-chain."
      },
      {
        heading: "Built on Jupiter — The #1 Solana DEX",
        body: "Jupiter processes billions in monthly swap volume and aggregates liquidity from every major Solana DEX: Orca, Raydium, Meteora, Phoenix, and more. When ChatFi executes your swap, it routes through Jupiter to guarantee you get the best possible price across the entire Solana ecosystem — automatically."
      },
      {
        heading: "Non-Custodial & Trustless",
        body: "ChatFi never holds your funds. Your wallet stays in your control at all times. When you execute a trade, ChatFi prepares the transaction and your wallet (Phantom, Backpack, Solflare, etc.) signs it. Nothing moves without your explicit approval."
      },
      {
        heading: "Who Is It For?",
        body: "ChatFi is built for anyone who wants to trade smarter on Solana — from first-time DeFi users who find DEX interfaces confusing, to experienced traders who want to automate strategies and manage portfolios faster."
      }
    ],
    tips: [
      "Connect your wallet in one tap — Phantom, Backpack, Solflare, and social login all supported",
      "You don't need to know token addresses — just use ticker symbols like SOL, JUP, BONK",
      "All transactions happen via Jupiter's audited smart contracts — no middleman"
    ]
  },
  {
    id: 2,
    title: "How to Swap Any Token on Solana Instantly",
    category: "Guide",
    readTime: "3 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "A step-by-step guide to swapping tokens with ChatFi — from simple SOL→USDC trades to swapping obscure meme coins by contract address.",
    sections: [
      {
        heading: "Basic Swaps",
        body: "To swap tokens, just describe what you want in plain English. ChatFi's AI parses your intent and opens the swap panel pre-filled and ready to confirm. You review, approve in your wallet, and it's done."
      },
      {
        heading: "What You Can Say",
        body: "\"Swap 1 SOL to USDC\" · \"Buy $50 of JUP\" · \"Exchange half my USDC for SOL\" · \"Sell all my BONK\" · \"Swap 0.5 SOL to WIF\" — any natural phrasing works. You can specify amounts in USD, in native token units, or as a portion of your balance (half, all, 25%, etc.)."
      },
      {
        heading: "Unknown & Meme Tokens",
        body: "ChatFi uses Jupiter's live token search API to resolve any token — not just the big ones. If you say \"swap $10 to FARTCOIN\", it searches Jupiter's full index, finds the correct mint address, and routes the swap. You can also paste a contract address directly if you want to be precise."
      },
      {
        heading: "Slippage & Price Impact",
        body: "ChatFi applies sensible slippage defaults (0.5% for most swaps). For low-liquidity meme coins, slippage is auto-adjusted upward to prevent failed transactions. You can always review the price impact in the swap panel before confirming."
      },
      {
        heading: "After the Swap",
        body: "Once confirmed, ChatFi shows you a receipt card with: what you sent, what you received, the Jupiter route used, and a Solscan link to inspect the transaction on-chain."
      }
    ],
    tips: [
      "\"Swap all my X\" automatically reads your wallet balance — no need to type the exact amount",
      "For meme coins with thin liquidity, consider smaller trade sizes to reduce price impact",
      "Use \"show route for X to Y\" to preview which DEXes Jupiter will route through before swapping"
    ]
  },
  {
    id: 3,
    title: "Basket Swaps: Trade Multiple Tokens in One Command",
    category: "Feature",
    readTime: "4 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "Basket swaps let you execute multiple trades simultaneously with a single chat message. Buy a portfolio of tokens, or sell multiple holdings to USDC — all at once.",
    sections: [
      {
        heading: "What Is a Basket Swap?",
        body: "A basket swap bundles multiple individual swaps into a single workflow. ChatFi prepares all the transactions in parallel, requests one batch approval from your wallet, and then executes each trade sequentially on-chain. It's like doing 5 trades at once, with one wallet confirmation."
      },
      {
        heading: "Buying a Basket of Tokens",
        body: "The most common use case: deploy capital into multiple tokens at once. Say \"buy $100 each of SOL, JUP, BONK, and WIF\" — ChatFi creates 4 swaps from USDC to each token, each worth $100, and submits them for your approval together."
      },
      {
        heading: "Selling Multiple Tokens to USDC",
        body: "You can also sell specific amounts of multiple tokens at once. \"Swap 5.4 JUP, 113.7 PENGU, and 158.4k BONK to USDC\" — ChatFi recognises each token and amount, resolves their mint addresses, and prepares all three sell orders. You approve once, they execute in sequence."
      },
      {
        heading: "Using Wallet Balance (Max / All)",
        body: "You don't have to know your exact balance. \"Swap max of SOL, PENGU, and BONK to USDC\" or \"dump all my JUP and FARTCOIN into SOL\" — ChatFi reads your current wallet balance for each token and sizes each swap accordingly. \"Half\", \"all\", \"max\", \"quarter\", or a percentage like \"50%\" all work."
      },
      {
        heading: "Tips for Reliable Execution",
        body: "Basket swaps execute trades one by one on-chain. If one swap fails (e.g. not enough balance, token not found), the rest still proceed. Failed swaps are reported individually in chat so you know exactly what happened."
      }
    ],
    tips: [
      "Use \"k\" shorthand for thousands: \"158.4k BONK\" = 158,400 BONK",
      "Each swap in a basket gets its own slippage protection — meme coins won't sink your entire batch",
      "To split $500 evenly across 5 tokens: \"buy $100 each of SOL JUP BONK WIF PENGU\"",
      "Mix and match: some trades by USD, some by amount, some by portion — all in one message"
    ]
  },
  {
    id: 4,
    title: "Automate Your Trades: Limit Orders, DCA & Recurring Buys",
    category: "Guide",
    readTime: "5 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "Stop watching charts 24/7. ChatFi lets you set limit orders, take-profit/stop-loss brackets, and scheduled recurring buys — all through conversational commands.",
    sections: [
      {
        heading: "Limit Orders",
        body: "A limit order executes only when a token hits your target price. \"Buy 100 USDC of SOL if it drops below $140\" or \"Sell 5 SOL when it reaches $200\" — ChatFi creates a Jupiter trigger order that sits on-chain and fires automatically when the condition is met."
      },
      {
        heading: "OCO: Take Profit + Stop Loss Together",
        body: "OCO (One-Cancels-Other) lets you set a take-profit and a stop-loss on the same position at the same time. \"Buy SOL at $150, set TP at $200 and SL at $130\" — if either condition is triggered, the other is automatically cancelled. This is the standard bracket order strategy used by professional traders."
      },
      {
        heading: "DCA / Recurring Buys",
        body: "Dollar-cost averaging is proven to reduce the impact of volatility over time. \"Buy $10 of SOL every day for 30 days\" — ChatFi schedules 30 recurring orders via Jupiter's DCA engine. Orders execute automatically at your chosen interval: daily, weekly, monthly, or even every minute."
      },
      {
        heading: "Manage Your Open Orders",
        body: "Say \"show my trigger orders\" or \"show my recurring orders\" to see all active automations with cancel buttons. You can stop a DCA series at any time, and unfilled limit orders can be cancelled individually."
      },
      {
        heading: "Why Use Automation?",
        body: "Markets move 24/7. You don't. Automation means your strategy executes even when you're offline, asleep, or away from your phone. It also removes emotional decision-making — you set your plan in advance and the protocol follows it precisely."
      }
    ],
    tips: [
      "Limit orders are free to set — you only pay the swap fee when they execute",
      "DCA is ideal for entering volatile positions over time rather than all at once",
      "\"Cancel all my recurring orders\" stops every active DCA series at once",
      "Orders expire after 7 days by default — mention a specific expiry if you need longer"
    ]
  },
  {
    id: 5,
    title: "Earn Passive Yield on Your Solana Assets",
    category: "Feature",
    readTime: "4 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "Your idle USDC and SOL can be earning yield right now. ChatFi connects to Jupiter Earn and Lend to let you deposit, multiply, and withdraw — all in one chat.",
    sections: [
      {
        heading: "What Is Jupiter Earn?",
        body: "Jupiter Earn is a yield aggregator on Solana. When you deposit assets, they're deployed into carefully curated lending protocols and liquidity strategies — automatically optimised for the best APY. You receive jlTokens in return (e.g. jlUSDC), which represent your share of the pool and accrue yield in real time."
      },
      {
        heading: "How to Deposit",
        body: "\"Earn yield on 100 USDC\" or \"deposit 5 SOL into Earn\" — ChatFi opens the Earn panel showing available vaults, current APY, and deposit limits. Select a vault, confirm the transaction, and your assets start earning immediately. APYs are variable and update continuously based on protocol demand."
      },
      {
        heading: "Withdrawing Your Funds",
        body: "\"Show my earn positions\" or \"withdraw my USDC from Earn\" — ChatFi pulls up your current positions with live balances and one-click withdraw buttons. Withdrawals are settled on-chain instantly; no lock-up periods."
      },
      {
        heading: "Multiply: Leveraged Yield",
        body: "For more advanced users, Multiply lets you loop your position using Jupiter Lend flashloans to amplify yield exposure. For example, deposit JupSOL as collateral, borrow SOL, convert to more JupSOL, and repeat — resulting in 2x–5x leveraged staking yield. ChatFi explains the mechanics and manages the loop for you."
      },
      {
        heading: "Borrow Against Your Assets",
        body: "You can also borrow stablecoins against your SOL or JLP without selling. \"Borrow 200 USDC using 2 SOL as collateral\" — ChatFi opens the Borrow panel with LTV ratios, liquidation prices, and interest rates displayed clearly before you confirm."
      }
    ],
    tips: [
      "USDC Earn is the lowest-risk option — good for idle stablecoins",
      "JLP (Jupiter Liquidity Provider) vaults offer higher APY but with market exposure",
      "Keep your LTV below 70% when borrowing to avoid liquidation risk",
      "Ask \"what are the highest APY vaults?\" to see currently best-performing options"
    ]
  },
  {
    id: 6,
    title: "Prediction Markets: Bet on Sports & Crypto Events",
    category: "Feature",
    readTime: "3 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "Jupiter's prediction markets let you stake USDC on real-world outcomes — football matches, crypto price targets, elections, and more. Here's how to use them via ChatFi.",
    sections: [
      {
        heading: "What Are Prediction Markets?",
        body: "Prediction markets are decentralised betting pools where participants stake on the outcome of future events. Unlike traditional sports betting, there's no bookmaker — payouts come directly from the pool of participants who bet on the losing side. Odds are determined by market demand, not a centrally set spread."
      },
      {
        heading: "What Can You Bet On?",
        body: "Jupiter predictions cover: football (EPL, Champions League, La Liga), basketball, crypto price targets (\"Will SOL hit $300 by end of month?\"), US elections, esports, and more. Markets are added continuously based on upcoming events."
      },
      {
        heading: "How to Place a Bet",
        body: "\"Who's playing in the Champions League final?\" or \"Show me EPL predictions\" — ChatFi fetches live markets and displays them with current odds, pool size, and time remaining. \"Bet $10 on Arsenal to win\" — it opens the prediction panel with your position pre-filled. You approve the USDC transaction and your bet is live on-chain."
      },
      {
        heading: "Claiming Winnings",
        body: "After an event resolves, say \"claim my winnings\" or \"claim payouts\" — ChatFi checks all your prediction positions and shows any claimable amounts with one-click claim buttons. Winnings are paid in USDC directly to your wallet."
      },
      {
        heading: "Risk & Strategy",
        body: "Markets with large pool sizes have more predictable odds. Early positions often offer better value before the crowd shifts prices. You can place multiple small positions across different markets to spread risk — just like a traditional betting portfolio."
      }
    ],
    tips: [
      "Check pool size before betting — thin markets can shift dramatically with large positions",
      "Claim winnings promptly — unclaimed positions may expire after the resolution window",
      "\"Show crypto predictions\" filters for on-chain price-based markets specifically",
      "You can track all your open bets under \"my portfolio\" → predictions tab"
    ]
  },
  {
    id: 7,
    title: "Understanding Your Solana Portfolio in ChatFi",
    category: "Guide",
    readTime: "3 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "ChatFi gives you a unified view of everything in your wallet — spot balances, DeFi positions, yield, perps, and your trade history — without leaving the chat.",
    sections: [
      {
        heading: "Your Wallet Balances",
        body: "\"Show my portfolio\" or \"what's in my wallet?\" — ChatFi fetches your current SPL token balances, SOL balance, and their USD values in real time. Tokens are sorted by USD value so you see your largest positions first."
      },
      {
        heading: "DeFi Positions",
        body: "Beyond spot balances, ChatFi pulls your full DeFi footprint: open limit and DCA orders, Jupiter Earn deposits with live APY, Lend borrow positions with LTV health, LP positions with earned fees, staked JUP, and prediction market bets — all in one panel."
      },
      {
        heading: "Perpetuals Positions",
        body: "If you've opened leveraged perps positions on Jupiter, they appear in your portfolio with unrealised PnL, liquidation price, and position size. You can increase, decrease, or close perps positions directly from the portfolio panel."
      },
      {
        heading: "Trade Journal",
        body: "\"Show my trade history\" pulls up your Trade Journal — a chronological log of every swap, limit order fill, and basket trade executed through ChatFi. It shows what you bought and sold, at what price, and your rough PnL estimate. Filter by today, this week, or all time."
      },
      {
        heading: "Price Alerts",
        body: "Set in-session price alerts to monitor tokens without watching charts. \"Alert me when SOL drops below $140\" — ChatFi monitors the price in the background and sends you a notification message in chat when the condition triggers. You can set multiple alerts across different tokens."
      }
    ],
    tips: [
      "Ask \"what's my total portfolio value?\" for a quick USD summary across all positions",
      "Portfolio data refreshes each time you open the panel — always live",
      "\"My pending invites\" shows unclaimed token sends you've sent via invite link",
      "You can check any wallet's portfolio, not just yours — paste any Solana address"
    ]
  },
];

// ─── Main component ───────────────────────────────────────────────────────────
const INITIAL_MSG = { id:1, role:"ai", showConnectBtn:true, text:"Hey! I'm **ChatFi** — your personal AI tools on Solana.\n\nI can swap tokens, check prices, set limit orders, track your portfolio, predict sports outcomes, and earn yield.\n\nConnect your wallet to get started, or just ask me anything!" };

function JupChatInner() {
  const [msgs, setMsgs] = useState(() => {
    try {
      const saved = sessionStorage.getItem("chatfi-msgs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [INITIAL_MSG];
  });
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showSignInDropdown, setShowSignInDropdown] = useState(false);
  // WalletConnect state
  const [wcStatus, setWcStatus]   = useState("idle"); // "idle" | "loading" | "waiting" | "connected"
  const [wcUri, setWcUri]         = useState("");
  const [wcMode, setWcMode]       = useState("qr");   // "qr" | "uri" — which tab is shown in the WC screen
  const [wcCopied, setWcCopied]         = useState(false);  // copy-to-clipboard feedback
  const [wcPreferredWallet, setWcPreferredWallet] = useState(null); // which wallet was picked on mobile
  const wcClientRef               = useRef(null);
  const wcSessionRef              = useRef(null);
  const wcQrRef                   = useRef(null);
  const [input, setInput]         = useState("");
  const [typing, setTyping]       = useState(false);
  const [wallet, setWallet]               = useState(null);
  const [walletFull, setWalletFull]       = useState(null);
  const [connectedWalletName, setConnectedWalletName] = useState(null); // e.g. "Phantom", "Jupiter"
  const [prices, setPrices]       = useState({});
  const [portfolio, setPortfolio] = useState({});

  // ── Reown AppKit hooks ─────────────────────────────────────────────────────
  const { open: reownOpen }                                     = useAppKit();
  const { address: reownAddress, isConnected: reownConnected }  = useAppKitAccount();
  const { walletProvider: reownProvider }                       = useAppKitProvider("solana");
  const { disconnect: reownDisconnect }                         = useDisconnect();
  const { walletInfo: reownWalletInfo }                         = useWalletInfo();
  const [connectedWalletIcon, setConnectedWalletIcon]           = useState(null);
  const prevConnectedRef = useRef(false);

  // ── Privy hooks (social login + embedded wallet) ───────────────────────────
  const { ready: privyReady, authenticated: privyAuthed, user: privyUser,
          login: privyLogin, logout: privyLogout } = usePrivy();
  const { wallets: _privyEVMWallets } = useWallets();
  const { wallets: _privySolWallets } = (() => { try { return useSolanaWallets(); } catch { return { wallets: [] }; } })();
  // Merge both hooks — useSolanaWallets() is the correct one for embedded Solana wallets
  // in newer Privy SDK versions; useWallets() covers older versions
  const privyWallets = [...(_privySolWallets || []), ...(_privyEVMWallets || [])];
  // Find the Privy-managed Solana embedded wallet.
  // Solana addresses are base58 (never start with "0x") — use that as the
  // definitive signal since chainType/walletClientType vary across SDK versions.
  const privyEmbeddedWallet = (() => {
    if (!privyWallets?.length) return null;
    return (
      privyWallets.find(w => /^solana/i.test(w.chainType || "")) ||
      privyWallets.find(w => /^svm$/i.test(w.chainType || "")) ||
      privyWallets.find(w => /^solana/i.test(w.type || "")) ||
      privyWallets.find(w => /^solana/i.test(w.walletClientType || "")) ||
      // Most reliable: Solana addresses are base58 and never start with "0x"
      privyWallets.find(w => w.address && !w.address.startsWith("0x") && w.address.length >= 32) ||
      null
    );
  })();
  // Track whether Privy is the active auth method
  const [privyMode, setPrivyMode] = useState(false);
  const [privyProvider, setPrivyProvider] = useState(null); // "google"|"twitter"|"discord"|"email"

  // Capture wallet icon from Reown whenever it changes
  useEffect(() => {
    if (reownWalletInfo?.icon) setConnectedWalletIcon(reownWalletInfo.icon);
  }, [reownWalletInfo]);

  // ── Force-close Privy modal as soon as auth is confirmed ─────────────────
  // Privy's OTP modal can get stuck showing "Success!" without closing itself.
  // Clicking the X on the modal or dismissing it manually completes the flow.
  // We simulate that by calling login() again if already authed — Privy will
  // detect the existing session and immediately close the modal.
  useEffect(() => {
    if (privyReady && privyAuthed) {
      // Close any open Privy UI overlay by targeting its close button in DOM.
      // This is a safe fallback — Privy renders a fixed iframe/div overlay.
      const closeBtn = document.querySelector('[data-privy-dialog] button[aria-label="Close"], [data-privy-dialog] button.privy-close, iframe[id*="privy"] + * button');
      if (closeBtn) closeBtn.click();
    }
  }, [privyReady, privyAuthed]);

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

  // Recurring / DCA orders
  const [showRecurring, setShowRecurring]       = useState(false);
  const [recurringCfg, setRecurringCfg]         = useState({
    from:"USDC", fromMint:TOKEN_MINTS.USDC, fromDecimals:6,
    to:"SOL",   toMint:TOKEN_MINTS.SOL,   toDecimals:9,
    amountPerCycle:"10", numberOfOrders:"10", intervalSecs:"86400"  // default: $10/day × 10 times
  });
  const [recurringStatus, setRecurringStatus]   = useState(null);  // null|"signing"|"done"|"error"
  const [recurringOrders, setRecurringOrders]   = useState([]);
  const [showRecurringOrders, setShowRecurringOrders] = useState(false);
  const [recurringOrdersLoading, setRecurringOrdersLoading] = useState(false);

  // Trigger v2 state — JWT, vault, orders list, active order type
  const trigJwtRef                                    = { current: null };  // in-memory only, never persisted
  const [trigV2Orders, setTrigV2Orders]               = useState([]);
  const [showTrigOrders, setShowTrigOrders]           = useState(false);
  const [trigOrdersLoading, setTrigOrdersLoading]     = useState(false);
  const [showTrigV2, setShowTrigV2]                   = useState(false);
  const [trigV2Cfg, setTrigV2Cfg]                     = useState({
    orderType: 'single',          // 'single' | 'oco' | 'otoco'
    from: 'USDC', fromMint: TOKEN_MINTS.USDC, fromDecimals: 6,
    to: 'SOL',   toMint: TOKEN_MINTS.SOL,   toDecimals: 9,
    amount: '',
    triggerCondition: 'below',    // 'above' | 'below'
    triggerPriceUsd: '',
    tpPriceUsd: '',               // OCO / OTOCO take-profit
    slPriceUsd: '',               // OCO / OTOCO stop-loss
    slippageBps: '100',
    expiryDays: '7',
  });
  const [trigV2Status, setTrigV2Status]               = useState(null); // null|'authing'|'signing'|'done'|'error'

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
  const [betMint, setBetMint]         = useState("USDC");  // "USDC" | "JUPUSD"
  const [betStatus, setBetStatus]     = useState(null);

  // Earn / Lend
  const [showMultiply, setShowMultiply]     = useState(false);
  const [multiplyFilter, setMultiplyFilter] = useState(null);
  const [multiplyPos, setMultiplyPos]       = useState({ vault:null, colAmount:"", leverage:"2" });
  const [multiplyStatus, setMultiplyStatus] = useState(null); // null | "signing" | "done" | "error"
  const [realVaultMap, setRealVaultMap]       = useState({}); // { supplyMint+"/"+borrowMint → real vaultId }
  const [showMultiplyForm, setShowMultiplyForm] = useState(false);
  const [lendPositions, setLendPositions]       = useState([]);
  const [showLendPos, setShowLendPos]           = useState(false);
  const [lendPosLoading, setLendPosLoading]     = useState(false);
  const [unwindStatus, setUnwindStatus]         = useState(null); // null | positionId | "done"
  const [showBorrow, setShowBorrow]             = useState(false);

  // ── Send panel ───────────────────────────────────────────────────────────────
  const [showSend, setShowSend]         = useState(false);
  const [sendCfg, setSendCfg]           = useState({ token:"SOL", amount:"", mint: TOKEN_MINTS.SOL });
  const [sendStatus, setSendStatus]     = useState(null); // null|"signing"|"done"|"error"
  const [sendLink, setSendLink]         = useState("");
  const [sendMode, setSendMode]         = useState("invite"); // "invite" | "direct"
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendTxSig, setSendTxSig]       = useState("");
  // Jupiter token search for direct send
  const [directTokenQuery, setDirectTokenQuery]     = useState("SOL");
  const [directTokenResults, setDirectTokenResults] = useState([]);
  const [directTokenLoading, setDirectTokenLoading] = useState(false);
  const [directTokenOpen, setDirectTokenOpen]       = useState(false);
  const directTokenTimerRef = useRef(null);

  // ── Portfolio panel ──────────────────────────────────────────────────────────
  const [showPortfolio, setShowPortfolio]   = useState(false);
  const [portfolioData, setPortfolioData]   = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  // ── Token Info Card ──────────────────────────────────────────────────────────
  const [showTokenCard, setShowTokenCard]   = useState(false);
  const [tokenCardData, setTokenCardData]   = useState(null);

  // ── Perps panel (SHOW_PERPS — interactive trade config) ─────────────────────
  const [showPerps, setShowPerps]           = useState(false);
  const [perpCfg, setPerpCfg]              = useState({ market:"SOL-PERP", side:"long", collateral:"", leverage:"10" });

  // ── Perps Positions panel ────────────────────────────────────────────────────
  const [showPerpsPos, setShowPerpsPos]     = useState(false);
  const [perpPositions, setPerpPositions]   = useState([]);
  const [perpsLoading, setPerpsLoading]     = useState(false);
  const [closingPerp, setClosingPerp]       = useState(null); // positionKey being closed
  const [borrowCfg, setBorrowCfg]               = useState({ vaultId:1, collateral:"SOL", debt:"USDC", colDecimals:9, debtDecimals:6, colAmount:"", borrowAmount:"" });
  const [borrowStatus, setBorrowStatus]         = useState(null); // null|"signing"|"done"|"error"
  const [showEarn, setShowEarn]           = useState(false);
  const [earnVaults, setEarnVaults]       = useState([]);
  const [earnLoading, setEarnLoading]     = useState(false);
  const [earnDeposit, setEarnDeposit]     = useState({ vault:null, amount:"" });
  const [showEarnDeposit, setShowEarnDeposit] = useState(false);
  const [earnWithdraw, setEarnWithdraw]       = useState({ vault:null, amount:"", positionAmount:0 });
  const [showEarnWithdraw, setShowEarnWithdraw] = useState(false);
  const [earnUserPositions, setEarnUserPositions] = useState({}); // { [TOKEN]: { amount, amountRaw, shares, decimals } }

  // ── Jupiter Studio state ─────────────────────────────────────────────────────
  const [showStudio, setShowStudio]         = useState(false);
  const [studioCfg, setStudioCfg]           = useState({ name:"", symbol:"", description:"", website:"", twitter:"", preset:"meme" });
  const [studioImage, setStudioImage]       = useState(null); // { file, dataUrl, type }
  const [studioStatus, setStudioStatus]     = useState(null); // null|"signing"|"done"|"error"
  const [studioResult, setStudioResult]     = useState(null); // { mintAddress, txSig, poolAddress }
  const [studioFees, setStudioFees]         = useState(null); // unclaimed fee data
  const [showStudioFees, setShowStudioFees] = useState(false);

  // ── Jupiter Lock state ───────────────────────────────────────────────────────
  const [showLock, setShowLock]             = useState(false);
  const [lockCfg, setLockCfg]              = useState({ token:"JUP", mint:TOKEN_MINTS.JUP, amount:"", cliffDays:"90", vestingDays:"365", recipient:"" });
  const [lockStatus, setLockStatus]         = useState(null); // null|"signing"|"done"|"error"
  const [lockResult, setLockResult]         = useState(null); // { lockId, txSig }
  const [showLocks, setShowLocks]           = useState(false);
  const [lockList, setLockList]             = useState([]);
  const [locksLoading, setLocksLoading]     = useState(false);
  const [claimingLock, setClaimingLock]     = useState(null); // lockId being claimed

  // ── Route Inspector state ────────────────────────────────────────────────────
  const [showRoute, setShowRoute]           = useState(false);
  const [routeData, setRouteData]           = useState(null); // full Jupiter v1 quote response
  const [routeLoading, setRouteLoading]     = useState(false);

  // ── Price Alerts ──────────────────────────────────────────────────────────────
  const [priceAlerts, setPriceAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("chatfi-alerts") || "[]"); } catch { return []; }
  });
  const alertIntervalRef = useRef(null);

  // ── Trade Journal ─────────────────────────────────────────────────────────────
  const [tradeJournal, setTradeJournal] = useState(() => {
    try { return JSON.parse(localStorage.getItem("chatfi-journal") || "[]"); } catch { return []; }
  });

  // ── Copy Trade ────────────────────────────────────────────────────────────────
  const [copyTradeData, setCopyTradeData] = useState(null);
  const [showCopyTrade, setShowCopyTrade] = useState(false);

  // ── Jupiter official docs — fetched once, injected into AI system prompt ────
  const [jupDocs, setJupDocs] = useState("");

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState([{ id:"default", title:"New conversation", active:true }]);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showSocialsNav, setShowSocialsNav] = useState(false);
  const [showBlog, setShowBlog]             = useState(false);
  const [blogPostIndex, setBlogPostIndex]   = useState(null); // null = list, number = open post

  // Dynamic token cache — grows as user searches any token
  const tokenCacheRef    = useRef({ ...TOKEN_MINTS });
  const tokenDecimalsRef = useRef({ ...TOKEN_DECIMALS });

  const histRef     = useRef((() => { try { const h = sessionStorage.getItem("chatfi-hist"); return h ? JSON.parse(h) : []; } catch { return []; } })());
  const endRef      = useRef(null);
  const textareaRef = useRef(null);

  // ── PWA Install Prompt ──────────────────────────────────────────────────────
  const [installBanner, setInstallBanner] = useState(null); // { prompt, isIOS }
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.navigator.standalone === true ||
      document.referrer.includes("android-app://") ||
      localStorage.getItem("chatfi-install-done") === "true";

    if (isStandalone) { localStorage.setItem("chatfi-install-done", "true"); return; }

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

    if (isIOS) {
      setTimeout(() => setInstallBanner({ prompt: null, isIOS: true }), 1500);
    } else {
      const handler = (e) => {
        e.preventDefault();
        setTimeout(() => setInstallBanner({ prompt: e, isIOS: false }), 1500);
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  // ── Fetch Jupiter official AI docs (llms-full.txt) ──────────────────────────
  useEffect(() => {
    fetch("https://developers.jup.ag/docs/llms-full.txt")
      .then(r => r.text())
      .then(txt => { setJupDocs(txt.slice(0, 40000)); })
      .catch(() =>
        fetch("https://developers.jup.ag/docs/llms.txt")
          .then(r => r.text())
          .then(txt => setJupDocs(txt.slice(0, 20000)))
          .catch(() => {})
      );
  }, []);

  // ── Fetch real on-chain vault IDs from /api/multiply GET ────────────────────
  useEffect(() => {
    fetch("/api/multiply")
      .then(r => r.json())
      .then(data => {
        if (data?.vaults) {
          const map = {};
          data.vaults.forEach(v => {
            // Key by "supplyToken/borrowToken" so we can look up by mint pair
            map[v.supplyToken + "/" + v.borrowToken] = v.vaultId;
          });
          setRealVaultMap(map);
          console.log("[ChatFi] Real vault map loaded:", map);
        }
      })
      .catch(e => console.warn("[ChatFi] Could not load real vault IDs:", e));
  }, []);

  // ── Fonts + global CSS ──────────────────────────────────────────────────────
  useEffect(() => {
    document.title = "ChatFi — Your personal AI tools";

    // Lock viewport — prevent pinch-zoom and mobile bounce
    let vp = document.querySelector("meta[name=viewport]");
    if (!vp) { vp = document.createElement("meta"); vp.name = "viewport"; document.head.appendChild(vp); }
    vp.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
      html, body { height:100%; overflow:hidden; overscroll-behavior:none; touch-action:pan-x pan-y; -webkit-text-size-adjust:100%; }
      body { position:fixed; width:100%; }
      @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      @keyframes blink  { 0%,80%,100%{opacity:0.15} 40%{opacity:0.9} }
      @keyframes spin   { to{transform:rotate(360deg)} }
      @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      .msg-enter { animation:fadeUp 0.22s ease forwards; }
      ::-webkit-scrollbar { width:5px; height:5px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:#1e2d3d; border-radius:6px; }
      textarea { resize:none; }
      textarea::placeholder, input::placeholder { color:#4d6a7a; }
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      select option { background:#161e27; color:#e8f4f0; }
      code { font-family:'JetBrains Mono',monospace; background:#1e2d3d; padding:1px 5px; border-radius:3px; font-size:0.87em; color:#c7f284; }
      .dot1,.dot2,.dot3 { display:inline-block; width:7px; height:7px; border-radius:50%; background:#4d6a7a; animation:blink 1.2s infinite; }
      .dot2{animation-delay:0.2s} .dot3{animation-delay:0.4s}
      .hov-row:hover { background:rgba(255,255,255,0.06) !important; }
      .hov-btn:hover { opacity:0.8; }
      .hov-sugg:hover { background:#1e2d3d !important; color:#e8f4f0 !important; border-color:#2d4a5a !important; transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.3); }
      .hov-pick:hover { border-color:#c7f284 !important; }
      .send-btn:not(:disabled):hover { background:#c4562a !important; }
      .spinner { width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.7s linear infinite; }
      .vault-card:hover { border-color:#c7f284 !important; background:#1a2e1a !important; }
      .market-row:hover { background:#e8e2d5 !important; cursor:pointer; }
    `;
    document.head.appendChild(style);
  }, []);

  const chatContainerRef = useRef(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; } // skip first render
    const container = chatContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) endRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [msgs, typing, showSwap, showPred, showPredList, showEarn, showTrig, showTrigV2, showTrigOrders, showMultiply, showMultiplyForm, showRecurring, showRecurringOrders, showStudio, showStudioFees, showLock, showLocks, showRoute]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  // Expose send() globally so HTML-rendered token cards can trigger it on click
  useEffect(() => {
    window.__chatfiSend = (query) => {
      setInput("");
      send(query);
    };
    return () => { delete window.__chatfiSend; };
  });

  // Render WalletConnect QR code when URI is ready
  useEffect(() => {
    if (wcStatus !== "waiting" || !wcUri) return;
    const render = () => {
      if (wcQrRef.current && window.QRCode) {
        window.QRCode.toCanvas(wcQrRef.current, wcUri, { width: 240, margin: 2, color: { dark: "#c7f284", light: "#161e27" } }, () => {});
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
  // Direct browser fetch for prediction endpoints — bypasses proxy so Jupiter sees
  // the user's real IP (same as jup.ag does), avoiding server-side geo-blocks.
  const predFetch = async (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const fetchOptions = { method, headers: { "Content-Type": "application/json" } };
    if (options.body && method !== "GET") {
      fetchOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }
    const res = await fetch(url, fetchOptions);
    return res.json();
  };

  // All Jupiter API calls go through /api/jupiter (Vercel serverless) which injects the API key
  const jupFetch = async (url, options = {}) => {
    const payload = { url, method: (options.method || "GET").toUpperCase() };
    if (options.body !== undefined) {
      payload.body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    }
    // Pass x-api-key for Lend and Studio endpoints
    if (url.includes("/lend/v1/") || url.includes("/studio/v1/")) payload.apiKey = options.apiKey || "";
    const res = await fetch("/api/jupiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    // Safe parse: proxy may return HTML on error (404/500), never throw JSON parse crash
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { throw new Error(`Proxy error (${res.status}): ${text.slice(0, 200)}`); }
  };

  // ── Resolve any token symbol → { mint, decimals } ───────────────────────────
  // Tries V2 first (verified tokens), then V1 fallback for any Jupiter-listed token
  const resolveToken = async (symbolOrName) => {
    if (!symbolOrName) return null;
    const upper = symbolOrName.toUpperCase().trim();
    // Cache hit (includes TOKEN_MINTS pre-seeded at init)
    if (tokenCacheRef.current[upper]) {
      return { mint: tokenCacheRef.current[upper], decimals: tokenDecimalsRef.current[upper] ?? 6 };
    }
    // Detect base58 mint address (32-44 chars)
    const isMintAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbolOrName.trim());
    if (isMintAddr) {
      tokenCacheRef.current[upper] = symbolOrName.trim();
      return { mint: symbolOrName.trim(), decimals: 6 };
    }
    const tryParse = (data, sym) => {
      const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
      // Prefer exact symbol match over first-result fallback
      const match = list.find(t => t.symbol?.toUpperCase() === sym);
      const mint = match?.id || match?.address;
      return mint ? { mint, decimals: match.decimals ?? 6 } : null;
    };
    // V2 search (verified + community tokens)
    try {
      const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbolOrName)}`);
      const r = tryParse(data, upper);
      if (r) { tokenCacheRef.current[upper] = r.mint; tokenDecimalsRef.current[upper] = r.decimals; return r; }
    } catch {}
    // V1 fallback — covers unverified/new/meme tokens not yet in V2
    try {
      const data = await jupFetch(`${JUP_BASE}/tokens/v1/search?query=${encodeURIComponent(symbolOrName)}&limit=20`);
      const r = tryParse(data, upper);
      if (r) { tokenCacheRef.current[upper] = r.mint; tokenDecimalsRef.current[upper] = r.decimals; return r; }
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
  // Token API v2: full schema incl. holderCount, circSupply, totalSupply, fdv, mcap,
  // usdPrice, liquidity, stats24h.{priceChange,buyVolume,sellVolume,numBuys,numSells,numTraders},
  // firstPool, audit.{mintAuthorityDisabled,freezeAuthorityDisabled,topHoldersPercentage,devMints},
  // organicScore, isVerified, tags, twitter/website/telegram/discord
  const fetchTokenInfo = async (symbol) => {
    if (!symbol) return null;
    const upper = symbol.toUpperCase();
    // If we already have the mint cached, try direct detail fetch first
    const cachedMint = tokenCacheRef.current[upper] || TOKEN_MINTS[upper];
    const normalise = (match, mint) => ({
      ...(match || {}),
      address: mint,
      logo_url: match?.icon || match?.logo_url || "",
      // Price & market data
      usdPrice: match?.usdPrice ?? null,
      market_cap: match?.mcap || match?.market_cap || null,
      fdv: match?.fdv ?? null,
      liquidity: match?.liquidity ?? null,
      circSupply: match?.circSupply ?? null,
      totalSupply: match?.totalSupply ?? null,
      holderCount: match?.holderCount ?? null,
      // Volume — prefer stats24h breakdown, fall back to legacy field
      daily_volume: match?.stats24h
        ? (match.stats24h.buyVolume || 0) + (match.stats24h.sellVolume || 0)
        : (match?.daily_volume || null),
      // 24h trading stats
      priceChange24h: match?.stats24h?.priceChange ?? null,
      numBuys24h: match?.stats24h?.numBuys ?? null,
      numSells24h: match?.stats24h?.numSells ?? null,
      numTraders24h: match?.stats24h?.numTraders ?? null,
      buyVolume24h: match?.stats24h?.buyVolume ?? null,
      sellVolume24h: match?.stats24h?.sellVolume ?? null,
      holderChange24h: match?.stats24h?.holderChange ?? null,
      liquidityChange24h: match?.stats24h?.liquidityChange ?? null,
      // 1h / 6h stats if available
      stats1h: match?.stats1h ?? null,
      stats6h: match?.stats6h ?? null,
      // First pool (age of token)
      firstPoolId: match?.firstPool?.id ?? null,
      firstPoolAt: match?.firstPool?.createdAt ?? null,
      // Audit / safety
      organicScore: match?.organicScore ?? null,
      organicScoreLabel: match?.organicScoreLabel ?? null,
      freezeAuthority: match?.audit?.freezeAuthorityDisabled === false ? "active" : null,
      mint_authority: match?.audit?.mintAuthorityDisabled === false ? "active" : null,
      topHoldersPercentage: match?.audit?.topHoldersPercentage ?? null,
      devMints: match?.audit?.devMints ?? null,
      // Social / links
      twitter: match?.twitter ?? null,
      website: match?.website ?? null,
      telegram: match?.telegram ?? null,
      discord: match?.discord ?? null,
      // Launchpad / graduation info
      launchpad: match?.launchpad ?? null,
      graduatedAt: match?.graduatedAt ?? null,
      tags: match?.tags || (match?.isVerified ? ["verified"] : []),
    });

    // ── Solana address detection (base58, 32-44 chars) ─────────────────────────
    const isMintAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbol.trim());

    // ── Priority 1: Known hardcoded token OR direct mint address input ─────────
    // Skip text search entirely — go straight to the token detail API.
    // This prevents meme tokens with the same ticker (e.g. "betcuin" for BTC) from
    // hijacking lookups, and makes CA paste work reliably.
    const knownMint = TOKEN_MINTS[upper];
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
      // v2 fallback for the same mint
      try {
        const v2 = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(targetMint)}&limit=5`);
        const list2 = Array.isArray(v2) ? v2 : (v2?.tokens || v2?.data || []);
        const m2 = list2.find(t => (t.id || t.address) === targetMint) || list2[0];
        if (m2) {
          const resolvedMint = m2.id || m2.address || targetMint;
          tokenCacheRef.current[upper] = resolvedMint;
          tokenDecimalsRef.current[upper] = m2.decimals ?? 6;
          return normalise(m2, resolvedMint);
        }
      } catch {}
    }

    // ── Priority 2: Symbol text search (non-hardcoded tokens) ─────────────────
    // Prefer exact symbol match; also prefer result whose mint === cachedMint.
    try {
      const searchData = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbol)}`);
      const list = Array.isArray(searchData) ? searchData : (searchData?.tokens || searchData?.data || []);
      // Exact symbol match first, then cachedMint match, then first result
      const match = list.find(t => t.symbol?.toUpperCase() === upper && (t.id || t.address) === cachedMint)
                 || list.find(t => t.symbol?.toUpperCase() === upper)
                 || (cachedMint ? list.find(t => (t.id || t.address) === cachedMint) : null)
                 || list[0];
      const mint = match?.id || match?.address || cachedMint;
      if (mint) {
        tokenCacheRef.current[upper] = mint;
        tokenDecimalsRef.current[upper] = match?.decimals ?? 6;
        return normalise(match, mint);
      }
    } catch {}

    // V1 fallback — finds unverified / new / meme tokens not yet in V2
    try {
      const searchData = await jupFetch(`${JUP_BASE}/tokens/v1/search?query=${encodeURIComponent(symbol)}&limit=10`);
      const list = Array.isArray(searchData) ? searchData : (searchData?.tokens || searchData?.data || []);
      const match = list.find(t => t.symbol?.toUpperCase() === upper) || list[0];
      const mint = match?.address || match?.id || cachedMint;
      if (mint) {
        tokenCacheRef.current[upper] = mint;
        tokenDecimalsRef.current[upper] = match?.decimals ?? 6;
        return normalise(match, mint);
      }
    } catch {}

    // Last resort: cached mint direct fetch
    if (cachedMint) {
      try {
        const detail = await jupFetch(`${JUP_TOKENS_API}/${cachedMint}`);
        if (detail?.address || detail?.mint) return normalise(detail, cachedMint);
      } catch {}
    }
    return null;
  };

  // ── Token Tag — fetch all tokens with a specific tag (lst | verified) ───────
  const fetchTokensByTag = async (tag = "verified") => {
    try {
      const data = await jupFetch(`${JUP_TOKEN_TAG}?query=${encodeURIComponent(tag)}`);
      return Array.isArray(data) ? data : (data?.tokens || data?.data || []);
    } catch { return []; }
  };

  // ── Token Category — top tokens by category + interval ──────────────────────
  // category: toporganicscore | toptraded | toptrending
  // interval: 5m | 1h | 6h | 24h
  const fetchTokensByCategory = async (category = "toptrending", interval = "24h", limit = 20) => {
    try {
      const data = await jupFetch(`${JUP_TOKEN_CAT}/${category}/${interval}?limit=${limit}`);
      return Array.isArray(data) ? data : (data?.tokens || data?.data || []);
    } catch { return []; }
  };

  // ── xStocks — tokenized real-world stocks on Solana ────────────────────────
  const XSTOCK_SYMBOLS = [
    "SPYx","QQQx","TSLAx","COINx","AAPLx","NVDAx","MSFTx","GOOGx","AMZNx","METAx",
    "NKEx","AMDx","INTCx","ARKKx","GDx","SLVx","GOLDx","BRKx","TSMx","SOFIx",
    "POLYMARKET","OPENAI","ANTHROPIC","SPACEX","NEURALINK","KALSHI",
    "NVIDIAx","JPMx","BABAx","NOx","UBERx","AIRBNBx","COSTCOx","WMTx",
  ];
  const fetchXStocks = async (limit = 15) => {
    // Jupiter tag API only has 2-3 xStocks tagged — skip it.
    // Instead, search each known symbol in parallel for reliable full results.
    const symsToFetch = XSTOCK_SYMBOLS.slice(0, Math.max(limit, XSTOCK_SYMBOLS.length));
    const results = await Promise.allSettled(
      symsToFetch.map(async (sym) => {
        const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(sym)}&limit=5`);
        const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
        return list.find(t => t.symbol?.toLowerCase() === sym.toLowerCase()) || null;
      })
    );
    return results
      .filter(r => r.status === "fulfilled" && r.value)
      .map(r => r.value)
      .slice(0, limit);
  };

  // ── Token Recent — newly listed tokens (first pool just created) ────────────
  const fetchRecentTokens = async (limit = 30) => {
    try {
      const data = await jupFetch(`${JUP_TOKEN_RECENT}?limit=${limit}`);
      return Array.isArray(data) ? data : (data?.tokens || data?.data || []);
    } catch { return []; }
  };

  // ── Verify Eligibility — check if a token can be express-verified ───────────
  // ── Trade Journal — log completed trades to localStorage ────────────────────
  const logTrade = (entry) => {
    const record = { ...entry, ts: Date.now() };
    setTradeJournal(prev => {
      const next = [record, ...prev].slice(0, 300);
      try { localStorage.setItem("chatfi-journal", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── Price Alert polling — checks every 30s ────────────────────────────────────
  useEffect(() => {
    if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    const active = priceAlerts.filter(a => !a.triggered);
    if (!active.length) return;
    alertIntervalRef.current = setInterval(async () => {
      try {
        const syms = [...new Set(active.map(a => a.token))];
        const priceRes = await fetch(`${JUP_PRICE_API}?ids=${syms.join(",")}`).then(r => r.json());
        const priceMap = priceRes?.data || {};
        const updated = priceAlerts.map(a => {
          if (a.triggered) return a;
          const p = priceMap[a.token]?.price || priceMap[a.tokenMint]?.price;
          if (!p) return a;
          const hit = a.condition === "above" ? p >= a.target : p <= a.target;
          if (hit) {
            push("ai", `**Price Alert:**\n\n**${a.token}** just hit **$${Number(p).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})}** — your alert was set for ${a.condition === "above" ? "above" : "below"} **$${Number(a.target).toLocaleString()}**.`);
            return { ...a, triggered: true };
          }
          return a;
        });
        setPriceAlerts(updated);
        try { localStorage.setItem("chatfi-alerts", JSON.stringify(updated)); } catch {}
      } catch {}
    }, 30000);
    return () => clearInterval(alertIntervalRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceAlerts]);

  // ── Copy Trade — serverside Helius fetch ─────────────────────────────────────
  const fetchWalletTrades = async (walletAddress, limit = 5) => {
    const res = await fetch(`/api/wallet-trades?wallet=${encodeURIComponent(walletAddress)}&limit=${limit}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const checkVerifyEligibility = async (mintAddress) => {
    if (!mintAddress) return null;
    try {
      const data = await jupFetch(`${JUP_TOKEN_VERIFY}?tokenId=${encodeURIComponent(mintAddress)}`);
      return data;
    } catch { return null; }
  };

  // ── Format a token list into a readable summary string ──────────────────────
  const fmtTokenList = (tokens, limit = 10) => {
    if (!tokens?.length) return "No tokens found.";
    return tokens.slice(0, limit).map((t, i) => {
      const sym   = t.symbol || t.id?.slice(0,6) || "?";
      const mint  = t.id || t.address || "";
      const name  = t.name ? ` — ${t.name.slice(0,22)}` : "";
      const price = t.usdPrice ? ` $${t.usdPrice < 0.001 ? t.usdPrice.toExponential(2) : t.usdPrice < 1 ? t.usdPrice.toFixed(4) : t.usdPrice.toFixed(2)}` : "";
      const chg   = t.stats24h?.priceChange != null ? ` (${t.stats24h.priceChange > 0 ? "+" : ""}${t.stats24h.priceChange.toFixed(1)}%)` : "";
      const score = t.organicScore != null ? ` · score ${Math.round(t.organicScore)}` : "";
      const ver   = t.isVerified ? " ✓" : "";
      // Resolve logo: v2 icon → v1 logoURI → normalized logo_url → known static map → img.jup.ag CDN
      const logoUrl = t.icon || t.logoURI || t.logo_url
        || TOKEN_LOGO_URLS[sym.toUpperCase()]
        || (mint ? `https://img.jup.ag/tokens/${mint}` : "");
      const logoTag = logoUrl ? `[img:${logoUrl}]` : "";
      return `${i + 1}. ${logoTag}**${sym}**${name}${ver}${price}${chg}${score}`;
    }).join("\n");
  };

  // ── Portfolio — full on-demand, always fresh ─────────────────────────────────
  // Uses Jupiter Ultra balances API + Portfolio positions API for complete data
  const fetchPortfolioData = async (walletAddress) => {
    if (!walletAddress) return null;
    const results = {};

    // ── 1. Jupiter Ultra balances API — returns ALL tokens keyed by mint ───────
    // https://lite-api.jup.ag/ultra/v1/balances/{wallet}
    // Response: { "SOL": { uiAmount, amount, slot }, "MINT_ADDR": { uiAmount, amount }, ... }
    try {
      const rawBals = await fetch("https://lite-api.jup.ag/ultra/v1/balances/" + walletAddress)
        .then(r => r.json());

      if (rawBals && !rawBals.error) {
        const balances = {};  // sym → uiAmount
        const mintMap  = {};  // sym → mint address
        const logoMap  = {};  // sym → logo url

        // SOL is keyed as "SOL" directly
        if (rawBals["SOL"]) {
          const uiAmt = rawBals["SOL"].uiAmount || 0;
          balances["SOL"] = uiAmt;
          mintMap["SOL"]  = "So11111111111111111111111111111111111111112";
          logoMap["SOL"]  = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
        }

        // All other keys are mint addresses
        const MINT_TO_SYM = {
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
          "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
          "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD":  "JUPUSD",
          "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
          "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
          "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "WIF",
          "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
          "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": "PYTH",
          "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": "MSOL",
          "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": "JITOSOL",
          "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": "BSOL",
          "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU": "SAMO",
          "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": "ORCA",
          "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": "POPCAT",
          "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN": "TRUMP",
        };

        const unknownMints = [];
        for (const [key, val] of Object.entries(rawBals)) {
          if (key === "SOL") continue;
          const uiAmt = val?.uiAmount || 0;
          if (uiAmt <= 0) continue; // skip dust
          const mint = key; // key IS the mint address
          // Resolve symbol: tokenCache → TOKEN_MINTS reverse → MINT_TO_SYM → unknown
          const sym = Object.entries(tokenCacheRef.current).find(([, v]) => v === mint)?.[0]
                   || MINT_TO_SYM[mint]
                   || Object.entries(TOKEN_MINTS).find(([, m]) => m === mint)?.[0];
          if (sym) {
            balances[sym] = uiAmt;
            mintMap[sym]  = mint;
            logoMap[sym]  = TOKEN_LOGO_URLS[sym] || "https://img.jup.ag/tokens/" + mint;
            if (!tokenCacheRef.current[sym]) tokenCacheRef.current[sym] = mint;
          } else {
            unknownMints.push({ mint, uiAmt });
          }
        }

        // Batch-resolve unknown mints via Jupiter token metadata API
        if (unknownMints.length > 0) {
          const resolved = await Promise.allSettled(
            unknownMints.slice(0, 15).map(({ mint, uiAmt }) =>
              fetch("https://lite-api.jup.ag/tokens/v1/token/" + mint)
                .then(r => r.json())
                .then(meta => ({ mint, uiAmt, sym: meta?.symbol || mint.slice(0,6), logo: meta?.logoURI }))
                .catch(() => ({ mint, uiAmt, sym: mint.slice(0,6), logo: null }))
            )
          );
          for (const r of resolved) {
            if (r.status === "fulfilled") {
              const { mint, uiAmt, sym, logo } = r.value;
              const finalSym = balances[sym] !== undefined ? mint.slice(0,8) : sym;
              balances[finalSym] = uiAmt;
              mintMap[finalSym]  = mint;
              if (logo) logoMap[finalSym] = logo;
              if (!tokenCacheRef.current[sym]) tokenCacheRef.current[sym] = mint;
            }
          }
        }

        results.walletBalances = balances;
        results.mintMap        = mintMap;
        results.logoMap        = logoMap;
        setPortfolio(balances);
      }
    } catch {}

    // ── 2. Jupiter Portfolio positions API — wallet + all DeFi positions ───────
    // https://api.jup.ag/portfolio/v1/positions/{wallet}
    // Returns: { elements: [{type, label, platformId, value, data}], tokenInfo, fetcherReports }
    // label="Wallet" → token balances with USD values
    // label="LimitOrder","DCA","Staked","LiquidityPool","Leverage" → DeFi positions
    try {
      const portRes = await fetch("https://api.jup.ag/portfolio/v1/positions/" + walletAddress)
        .then(r => r.json());

      if (portRes && !portRes.error) {
        results.portfolioElements = portRes.elements || [];
        results.portfolioTokenInfo = portRes.tokenInfo || {};

        // Debug: log all element labels/platformIds to console so we can see what the API returns
        if (portRes.elements?.length) {
          console.log("[JupChat Portfolio] elements:", portRes.elements.map(e => ({
            label: e.label, platformId: e.platformId, name: e.name, value: e.value
          })));
        }

        // Extract logos from tokenInfo for any tokens we still don't have logos for
        const tokenInfoSolana = portRes.tokenInfo?.solana || portRes.tokenInfo || {};
        for (const [mint, info] of Object.entries(tokenInfoSolana)) {
          if (info?.logoURI && results.logoMap) {
            // Find sym for this mint and update logoMap
            const sym = Object.entries(results.mintMap || {}).find(([, m]) => m === mint)?.[0];
            if (sym && !results.logoMap[sym]) results.logoMap[sym] = info.logoURI;
          }
        }

        // If Ultra balances failed, try to build balances from wallet elements
        if (!results.walletBalances) {
          const walletEl = (portRes.elements || []).filter(e => e.label === "Wallet");
          const balances = {};
          const mintMap  = {};
          const logoMap  = {};
          for (const el of walletEl) {
            const assets = el.data?.assets || el.data?.positions || [];
            for (const asset of assets) {
              const sym   = asset.symbol || asset.name || "?";
              const uiAmt = asset.balance || asset.amount || 0;
              const mint  = asset.mint || asset.address || "";
              const logo  = asset.logoURI || asset.logo || "";
              if (uiAmt > 0) {
                balances[sym] = uiAmt;
                if (mint) mintMap[sym] = mint;
                if (logo) logoMap[sym] = logo;
              }
            }
          }
          if (Object.keys(balances).length > 0) {
            results.walletBalances = balances;
            results.mintMap = mintMap;
            results.logoMap = logoMap;
            setPortfolio(balances);
          }
        }

        // ── Capture ALL non-wallet DeFi elements from portfolio API ────────
        // We don't filter by label name because Jupiter uses many different labels
        // (JupiterLend, Earn, Vault, JupiterLock, Vested, etc.) and they change.
        // Instead we take everything with value > 0 that isn't a plain wallet balance.
        const allDefi = (portRes.elements || []).filter(el => {
          const label = (el.label || "").toLowerCase();
          return label !== "wallet" && parseFloat(el.value || 0) > 0;
        });

        // Sort into earn vs lock vs other based on best-effort label/platformId matching
        const isEarnEl = (el) => {
          const s = ((el.label || "") + (el.platformId || "") + (el.name || "")).toLowerCase();
          return s.includes("earn") || s.includes("lend") || s.includes("vault") || s.includes("yield");
        };
        const isLockEl = (el) => {
          const s = ((el.label || "") + (el.platformId || "") + (el.name || "")).toLowerCase();
          return s.includes("lock") || s.includes("vest");
        };

        const toEarnPos = (el) => {
          const assets = el.data?.assets || el.data?.positions || [];
          if (assets.length === 0) {
            return [{ _fromPortfolio: true, label: el.label, symbol: el.name || el.label || "Token",
              value: el.value, underlyingAssets: el.value, shares: 0, asset: { decimals: 6 } }];
          }
          return assets.map(a => ({
            _fromPortfolio: true, label: el.label,
            symbol: a.symbol || a.name || el.name || "Token",
            value: a.value ?? el.value,
            underlyingAssets: a.underlyingAssets || a.amount || a.balance || a.depositedAmount || a.value,
            shares: a.shares || 0,
            asset: { decimals: a.decimals ?? a.asset?.decimals ?? 6 },
          }));
        };
        const toLockPos = (el) => {
          const assets = el.data?.assets || el.data?.positions || [];
          if (assets.length === 0) {
            return [{ _fromPortfolio: true, label: el.label, symbol: el.name || "Token",
              totalAmount: el.value ? parseFloat(el.value).toFixed(2) : "0",
              claimableAmount: "0", vestedPercent: "0" }];
          }
          return assets.map(a => ({
            _fromPortfolio: true, label: el.label,
            symbol: a.symbol || a.name || el.name || "Token",
            totalAmount: a.amount != null ? parseFloat(a.amount).toFixed(4)
                       : el.value ? parseFloat(el.value).toFixed(2) : "0",
            claimableAmount: a.claimableAmount ? parseFloat(a.claimableAmount).toFixed(4) : "0",
            vestedPercent: "0", cliff: a.cliff || a.cliffTime || null,
          }));
        };

        const earnEls = allDefi.filter(isEarnEl);
        const lockEls = allDefi.filter(isLockEl);
        // Any element that didn't match earn or lock → treat as earn (generic DeFi yield)
        const otherEls = allDefi.filter(el => !isEarnEl(el) && !isLockEl(el));

        if (earnEls.length || otherEls.length) {
          results._earnFromPortfolio = [...earnEls, ...otherEls].flatMap(toEarnPos)
            .filter(e => parseFloat(e.value || e.underlyingAssets || 0) > 0);
        }
        if (lockEls.length) {
          results._lockFromPortfolio = lockEls.flatMap(toLockPos);
        }
      }
    } catch {}

    // ── 3. Trigger orders — v2 (JWT) or v1 public fallback ───────────────────
    if (trigJwtRef.current) {
      try {
        const trigRes = await fetch("/api/jupiter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: JUP_TV2 + "/orders/history?state=active&limit=50&offset=0",
            method: "GET",
            triggerJwt: trigJwtRef.current,
          }),
        });
        const trigData = await trigRes.json();
        results.triggerOrders = Array.isArray(trigData?.orders) ? trigData.orders : [];
      } catch {}
    }
    // Public v1 fallback — no JWT needed
    if (!results.triggerOrders?.length) {
      try {
        const trigV1 = await jupFetch(`${JUP_TRIGGER_BASE}/getTriggerOrders?wallet=${walletAddress}&status=open`);
        const orders = Array.isArray(trigV1?.orders) ? trigV1.orders
                     : Array.isArray(trigV1) ? trigV1 : [];
        if (orders.length) results.triggerOrders = orders;
      } catch {}
    }

    // ── 4. Recurring / DCA orders ─────────────────────────────────────────────
    try {
      const recur = await jupFetch(JUP_RECUR_BASE + "/getRecurringOrders?wallets=" + walletAddress + "&status=active");
      results.recurringOrders = Array.isArray(recur?.recurringOrders) ? recur.recurringOrders
                              : Array.isArray(recur) ? recur : [];
    } catch {}

    // ── 5. Prediction positions ───────────────────────────────────────────────
    try {
      const pred = await predFetch(JUP_PRED_API + "/positions?ownerPubkey=" + walletAddress);
      results.predPositions = Array.isArray(pred) ? pred : (pred?.data || []);
    } catch {}

    // ── 6. Prediction orders ──────────────────────────────────────────────────
    try {
      const orders = await predFetch(JUP_PRED_API + "/orders?ownerPubkey=" + walletAddress);
      results.predOrders = Array.isArray(orders) ? orders : (orders?.data || []);
    } catch {}

    // ── 7. Earn positions ─────────────────────────────────────────────────────
    // Try direct fetch first — the earn positions endpoint is publicly readable
    // and going through the proxy fails silently when API key is missing.
    try {
      const earnRes = await fetch(JUP_EARN_API + "/positions?wallets=" + walletAddress);
      if (!earnRes.ok) throw new Error("not ok");
      const earn = await earnRes.json();
      if (!earn || earn.error) throw new Error("empty");
      let earnArr = Array.isArray(earn) ? earn
        : earn.data || earn.positions || earn.earnPositions || earn.result || earn.items || earn.balances || [];
      if (!Array.isArray(earnArr)) {
        earnArr = Object.values(earn).filter(v => v && typeof v === "object" && !Array.isArray(v));
      }
      if (earnArr.length) results.earnPositions = earnArr;
    } catch {}
    // Proxy fallback
    if (!results.earnPositions?.length) {
      try {
        const earn = await jupFetch(JUP_EARN_API + "/positions?wallets=" + walletAddress);
        if (earn && !earn.error) {
          let earnArr = Array.isArray(earn) ? earn
            : earn.data || earn.positions || earn.earnPositions || earn.result || earn.items || earn.balances || [];
          if (!Array.isArray(earnArr)) {
            earnArr = Object.values(earn).filter(v => v && typeof v === "object" && !Array.isArray(v));
          }
          if (earnArr.length) results.earnPositions = earnArr;
        }
      } catch {}
    }
    // Final fallback: earn elements extracted from portfolio API
    if (!results.earnPositions?.length && results._earnFromPortfolio?.length) {
      results.earnPositions = results._earnFromPortfolio;
    }

    // ── 8. Staked JUP ─────────────────────────────────────────────────────────
    try {
      const stakedRes = await fetch("https://api.jup.ag/portfolio/v1/staked-jup/" + walletAddress)
        .then(r => r.json());
      if (stakedRes && !stakedRes.error) results.stakedJup = stakedRes;
    } catch {}

    // ── 8b. JUP ASR (Active Staking Rewards) ─────────────────────────────────
    try {
      // Jupiter ASR: claimable governance rewards for staked JUP holders
      // epoch-based, claimable at vote.jup.ag/asr
      const asrRes = await fetch(`https://vote.jup.ag/api/asr/claimable?wallet=${walletAddress}`)
        .then(r => r.json()).catch(() => null);
      if (asrRes && !asrRes.error) {
        // asrRes shape: { claimable: true/false, amount: number, epoch: number, token: "USDC"|"JUP" }
        // or array of epochs
        const asrArr = Array.isArray(asrRes) ? asrRes : [asrRes];
        const claimableEpochs = asrArr.filter(a => a && (a.claimable || parseFloat(a.amount || 0) > 0));
        if (claimableEpochs.length > 0) results.asrRewards = claimableEpochs;
      }
    } catch {}

    // ── 9. Perps positions ────────────────────────────────────────────────────
    try {
      const perpData = await jupFetch(`${JUP_PORTFOLIO}/positions/${walletAddress}?platforms=jupiter-perps`);
      const perpElements = (perpData?.elements || []).filter(el =>
        el.platformId === "jupiter-perps" || el.name?.toLowerCase().includes("perp")
      );
      const perpPositionsList = perpElements.flatMap(el => {
        const assets = el.data?.assets || el.data?.borrows || [];
        return assets.map(asset => ({
          market:   asset.data?.symbol || el.name || "PERP",
          side:     el.data?.side || asset.data?.side || "long",
          sizeUsd:  asset.value ?? el.value ?? null,
          entryPrice: asset.data?.price ?? null,
          unrealizedPnlUsd: el.data?.pnl ?? asset.data?.pnl ?? null,
          leverage:   el.data?.leverage ?? null,
          liquidationPrice: el.data?.liquidationPrice ?? null,
          positionKey: el.id || asset.data?.address || Math.random().toString(),
        }));
      });
      if (perpPositionsList.length > 0) results.perpPositions = perpPositionsList;
    } catch {}

    // ── 10. LP / Liquidity positions from portfolioElements ───────────────────
    try {
      const lpElements = (results.portfolioElements || []).filter(el =>
        el.label === "LiquidityPool" || el.type === "liquidity-position" || el.platformId?.includes("orca") || el.platformId?.includes("raydium") || el.platformId?.includes("meteora")
      );
      if (lpElements.length > 0) {
        results.lpPositions = lpElements.map(el => ({
          platform: el.platformId || el.name || "LP",
          name:     el.name || el.label || "Liquidity Position",
          value:    el.value || el.data?.value || null,
          assets:   el.data?.assets || [],
          id:       el.id || Math.random().toString(),
        }));
      }
    } catch {}

    // ── 11. Locks (token vesting) ─────────────────────────────────────────────
    // Try Jupiter lock API directly first (public endpoint)
    try {
      const lockDirect = await fetch(`${JUP_LOCK_API}/locks?wallet=${walletAddress}`).then(r => r.json());
      const locks = Array.isArray(lockDirect) ? lockDirect
        : lockDirect?.locks || lockDirect?.accounts || lockDirect?.data || [];
      if (locks.length > 0) {
        const KNOWN_MINT_SYMS = {
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
          "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN":  "JUP",
          "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
          "So11111111111111111111111111111111111111112":   "SOL",
        };
        const KNOWN_DECIMALS = { USDC:6, USDT:6, JUP:6, SOL:9, BONK:5, WIF:6 };
        results.lockPositions = locks.map(lk => {
          const mint = lk.mint || lk.tokenMint || lk.asset || "";
          const sym = Object.entries(tokenCacheRef.current).find(([, v]) => v === mint)?.[0]
            || KNOWN_MINT_SYMS[mint] || mint.slice(0, 6);
          const dec = tokenDecimalsRef.current[sym] || KNOWN_DECIMALS[sym] || 6;
          const fmtAmt = (raw) => (raw / Math.pow(10, dec)).toFixed(dec >= 9 ? 4 : 2);
          const totalRaw = lk.totalRaw || lk.totalAmount || lk.amount || lk.depositedAmount || 0;
          const claimRaw = lk.claimableRaw || lk.claimableAmount || lk.unlockedAmount || 0;
          // Compute claimable: check if cliff has passed and tokens are unvested
          const cliffTs = lk.cliff || lk.cliffTime || lk.cliffTimestamp || 0;
          const cliffPassed = cliffTs ? (Date.now() / 1000 > cliffTs) : true;
          const claimedRaw = lk.claimedAmount || lk.claimedRaw || 0;
          const unlockedPct = lk.unlockedPercent || lk.vestedPercent || 0;
          // If claimRaw is 0 but cliff passed and unlockedPct > 0 and totalRaw > 0
          // → compute from unlockedPercent minus already-claimed
          let effectiveClaimRaw = claimRaw;
          if (!effectiveClaimRaw && cliffPassed && unlockedPct > 0 && totalRaw > 0) {
            effectiveClaimRaw = Math.max(0, (totalRaw * unlockedPct / 100) - claimedRaw);
          }
          return {
            ...lk,
            lockId:          lk.pubkey || lk.id || lk.address,
            symbol:          sym,
            claimableAmount: typeof effectiveClaimRaw === "number" && effectiveClaimRaw > 1000 ? fmtAmt(effectiveClaimRaw) : parseFloat(effectiveClaimRaw || 0).toFixed(4),
            totalAmount:     typeof totalRaw === "number" && totalRaw > 1000 ? fmtAmt(totalRaw) : parseFloat(totalRaw || 0).toFixed(4),
            vestedPercent:   totalRaw > 0 ? ((parseFloat(effectiveClaimRaw + claimedRaw) / parseFloat(totalRaw)) * 100).toFixed(1) : (unlockedPct ? String(unlockedPct) : "0"),
            cliff:           cliffTs || null,
            cliffPassed,
          };
        });
      }
    } catch {}
    // Server proxy fallback (/api/lock)
    if (!results.lockPositions?.length) {
      try {
        const lockRes = await fetch("/api/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "accounts", wallet: walletAddress }),
        });
        const lockData = await lockRes.json();
        if (!lockData.error && lockData.accounts?.length > 0) {
          const KNOWN_MINT_SYMS = {
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
            "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN":  "JUP",
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
            "So11111111111111111111111111111111111111112":   "SOL",
            "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
            "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "WIF",
          };
          const KNOWN_DECIMALS = { USDC:6, USDT:6, JUP:6, SOL:9, BONK:5, WIF:6, JUPUSD:6 };
          results.lockPositions = lockData.accounts.map(acct => {
            const sym = Object.entries(tokenCacheRef.current).find(([, v]) => v === acct.mint)?.[0]
              || KNOWN_MINT_SYMS[acct.mint] || `${acct.mint.slice(0, 6)}…`;
            const dec = tokenDecimalsRef.current[sym] || KNOWN_DECIMALS[sym] || 6;
            const fmtAmt = (raw) => (raw / Math.pow(10, dec)).toFixed(dec >= 9 ? 4 : 2);
            return {
              ...acct,
              lockId:          acct.pubkey,
              symbol:          sym,
              claimableAmount: fmtAmt(acct.claimableRaw || 0),
              totalAmount:     fmtAmt(acct.totalRaw || 0),
              vestedPercent:   acct.totalRaw > 0 ? ((acct.claimableRaw / acct.totalRaw) * 100).toFixed(1) : "0",
            };
          });
        }
      } catch {}
    }
    // Final fallback: lock elements from portfolio API
    if (results._lockFromPortfolio?.length) {
      results.lockPositions = [...(results.lockPositions || []), ...results._lockFromPortfolio];
    }

    return results;
  };

  // ── Studio: fetch unclaimed DBC creator fees ────────────────────────────────
  const fetchStudioFees = async () => {
    if (!walletFull) { push("ai", "Connect your wallet first to check creator fees."); return; }
    setShowStudioFees(false);
    try {
      const data = await jupFetch(`${JUP_STUDIO_API}/dbc/fee`, {
        method: "POST",
        body: { creator: walletFull },
      });
      setStudioFees(data);
      setShowStudioFees(true);
      if (!data || data.error) {
        push("ai", "No unclaimed creator fees found — either you have no DBC pools, or fees have already been claimed.");
      }
    } catch {
      push("ai", "Could not fetch studio fees. Try again shortly.");
    }
  };

  // ── Studio: create token via DBC — correct Jupiter Studio API flow ──────────
  // Flow: POST /dbc-pool/create-tx → PUT image presigned URL → PUT metadata presigned URL → POST /dbc-pool/submit (multipart)
  const doCreateToken = async () => {
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet not connected."); return; }
    const { name, symbol, description, website, twitter, preset } = studioCfg;
    if (!name.trim() || !symbol.trim()) return;
    if (!studioImage) { push("ai", "Please upload a token image before launching."); return; }
    setStudioStatus("signing");
    let succeeded = false;
    try {
      // ── Preset configs per Jupiter Studio docs ──
      const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
      const presets = {
        meme: {
          buildCurveByMarketCapParam: {
            quoteMint: USDC, initialMarketCap: 16000, migrationMarketCap: 69000, tokenQuoteDecimal: 6,
            lockedVestingParam: { totalLockedVestingAmount:0, cliffUnlockAmount:0, numberOfVestingPeriod:0, totalVestingDuration:0, cliffDurationFromMigrationTime:0 },
          },
          antiSniping: false, fee:{ feeBps:100 }, isLpLocked: true,
        },
        indie: {
          buildCurveByMarketCapParam: {
            quoteMint: USDC, initialMarketCap: 32000, migrationMarketCap: 240000, tokenQuoteDecimal: 6,
            lockedVestingParam: { totalLockedVestingAmount:100000000, cliffUnlockAmount:0, numberOfVestingPeriod:365, totalVestingDuration:31536000, cliffDurationFromMigrationTime:0 },
          },
          antiSniping: true, fee:{ feeBps:100 }, isLpLocked: true,
        },
      };
      const presetCfg = presets[preset] || presets.meme;
      const imageType = studioImage.type || "image/jpeg";

      // ── Step 1: Get transaction + presigned URLs ──
      // Try proxy first; if proxy returns an error fall back to direct fetch (needs CORS support from Jupiter)
      const createPayload = {
        ...presetCfg,
        tokenName: name.trim(),
        tokenSymbol: symbol.trim().toUpperCase(),
        tokenImageContentType: imageType,
        creator: walletFull,
      };
      let createData;
      try {
        createData = await jupFetch(`${JUP_STUDIO_API}/dbc-pool/create-tx`, { method: "POST", body: createPayload });
        if (typeof createData !== "object" || createData === null) throw new Error("Bad proxy response");
      } catch (proxyErr) {
        // Proxy failed — try direct (works if Jupiter adds CORS headers in future)
        console.warn("Studio proxy failed, trying direct:", proxyErr.message);
        const directRes = await fetch(`${JUP_STUDIO_API}/dbc-pool/create-tx`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createPayload),
        });
        createData = await directRes.json();
      }
      if (createData.error) throw new Error(createData.error?.message || JSON.stringify(createData.error));
      if (!createData.transaction) throw new Error("No transaction returned from Studio API.");

      const { transaction: txB64, imagePresignedUrl, metadataPresignedUrl, imageUrl, mint } = createData;

      // ── Step 2: Upload token image to presigned URL ──
      await fetch(imagePresignedUrl, {
        method: "PUT",
        headers: { "Content-Type": imageType },
        body: studioImage.file,
      });

      // ── Step 3: Upload token metadata to presigned URL ──
      await fetch(metadataPresignedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          description: description || "",
          image: imageUrl,
          website: website || "",
          twitter: twitter || "",
        }),
      });

      // ── Step 4: Sign transaction ──
      const bytes = b64ToBytes(txB64);
      const tx = VersionedTransaction.deserialize(bytes);
      const signed = await provider.signTransaction(tx);
      const signedB64 = bytesToB64(signed.serialize());

      // ── Step 5: Submit signed tx via multipart/form-data ──
      // headerImage is optional (Studio page banner only, not on-chain).
      // We build the FormData and POST directly — Jupiter's submit endpoint
      // does support CORS for the submit call (unlike create-tx).
      const formData = new FormData();
      formData.append("transaction", signedB64);
      formData.append("owner", walletFull);
      formData.append("content", description || "");
      // headerImage optional — skip to keep request simple and avoid proxy issues

      // Try direct first (submit supports CORS), fall back to proxy route.
      // IMPORTANT: by this point the tx is signed — the token exists on-chain regardless
      // of whether the submit HTTP call succeeds. Never treat a submit error as token failure.
      let submitData = {};
      try {
        const submitRes = await fetch("https://api.jup.ag/studio/v1/dbc-pool/submit", {
          method: "POST",
          body: formData,
        });
        const submitText = await submitRes.text();
        try { submitData = JSON.parse(submitText); } catch { /* non-fatal */ }
      } catch (directErr) {
        console.warn("Direct submit failed, trying proxy:", directErr.message);
        try {
          const submitRes2 = await fetch("/api/studio-submit", {
            method: "POST",
            body: formData,
          });
          const submitText2 = await submitRes2.text();
          try { submitData = JSON.parse(submitText2); } catch { /* non-fatal */ }
        } catch (proxyErr) {
          console.warn("Proxy submit also failed:", proxyErr.message);
          // Still continue — token is on-chain, just show success with mint from create-tx
        }
      }
      // submitData.error is also non-fatal — token is already on chain
      if (submitData.error) console.warn("Submit returned error (token still created):", submitData.error);

      succeeded = true;
      setStudioResult({ mintAddress: mint, poolAddress: submitData.poolAddress || null });
      setStudioStatus("done");
      const mintShort = `${mint.slice(0,8)}…${mint.slice(-6)}`;
      push("ai", `**Token created ✓**\n\n**${name.trim()} (${symbol.trim().toUpperCase()})** is live on Jupiter Studio!\n\nMint: \`${mintShort}\`\n\nView on: [Jupiter Studio](https://jup.ag/studio/${mint}) · [Solscan](https://solscan.io/token/${mint})\n\nCreator fees will accrue as people trade your DBC pool.`);
    } catch (err) {
      if (!succeeded) {
        setStudioStatus("error");
        push("ai", `Token creation failed: ${err?.message}\n\nTip: Make sure your wallet has enough SOL for pool creation (~0.05–0.1 SOL).`);
      }
    }
  };

  // ── Lock: fetch existing locks for wallet ────────────────────────────────────
  // Routes through /api/lock (action:"accounts") so the server-side RPC is used —
  // the public mainnet RPC silently returns [] for getProgramAccounts with filters.
  const fetchLocks = async () => {
    if (!walletFull) { push("ai", "Connect your wallet first to view locks."); return; }
    setLocksLoading(true);
    setShowLocks(false);
    setLockList([]);

    const KNOWN_MINT_SYMS = {
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
      "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN":  "JUP",
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
      "So11111111111111111111111111111111111111112":   "SOL",
      "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
      "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "WIF",
      "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R":  "RAY",
      "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn":  "JITOSOL",
      "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD":  "JUPUSD",
    };
    const KNOWN_DECIMALS = { USDC:6, USDT:6, JUP:6, SOL:9, BONK:5, WIF:6, RAY:6, JITOSOL:9, JUPUSD:6 };

    const enrichLocks = (rawList) => rawList.map(acct => {
      const mint = acct.mint || acct.tokenMint || acct.asset || "";
      const mintSym = Object.entries(tokenCacheRef.current).find(([, v]) => v === mint)?.[0]
        || KNOWN_MINT_SYMS[mint]
        || `${mint.slice(0, 6)}…`;
      const dec = tokenDecimalsRef.current[mintSym] || KNOWN_DECIMALS[mintSym] || 6;
      const fmtAmt = (raw) => (raw / Math.pow(10, dec)).toFixed(dec >= 9 ? 4 : 2);
      const totalRaw = acct.totalRaw || acct.totalAmount || acct.amount || acct.depositedAmount || 0;
      const claimRaw = acct.claimableRaw || acct.claimableAmount || acct.unlockedAmount || 0;
      const claimedRaw = acct.claimedAmount || acct.claimedRaw || 0;
      const cliffTs = acct.cliff || acct.cliffTime || acct.cliffTimestamp || 0;
      const cliffPassed = cliffTs ? (Date.now() / 1000 > cliffTs) : true;
      const unlockedPct = acct.unlockedPercent || acct.vestedPercent || 0;
      let effectiveClaimRaw = claimRaw;
      if (!effectiveClaimRaw && cliffPassed && unlockedPct > 0 && totalRaw > 0) {
        effectiveClaimRaw = Math.max(0, (totalRaw * unlockedPct / 100) - claimedRaw);
      }
      return {
        ...acct,
        lockId:          acct.pubkey || acct.id || acct.address,
        symbol:          mintSym,
        claimableAmount: typeof effectiveClaimRaw === "number" && effectiveClaimRaw > 1000 ? fmtAmt(effectiveClaimRaw) : parseFloat(effectiveClaimRaw || 0).toFixed(4),
        totalAmount:     typeof totalRaw === "number" && totalRaw > 1000 ? fmtAmt(totalRaw) : parseFloat(totalRaw || 0).toFixed(4),
        vestedPercent:   totalRaw > 0 ? ((parseFloat(effectiveClaimRaw + claimedRaw) / parseFloat(totalRaw)) * 100).toFixed(1) : (unlockedPct ? String(unlockedPct) : "0"),
        cliff:           cliffTs || null,
        cliffPassed,
      };
    });

    // 1. Portfolio positions API — same source portfolio panel uses (most reliable)
    let enriched = [];
    try {
      const portRes = await fetch(`${JUP_PORTFOLIO}/positions/${walletFull}`);
      const portData = await portRes.json();
      const allEl = Array.isArray(portData) ? portData : (portData?.data || portData?.elements || portData?.positions || []);
      const lockEls = allEl.filter(el => {
        const s = ((el.label || "") + (el.platformId || "") + (el.name || "")).toLowerCase();
        return s.includes("lock") || s.includes("vest");
      });
      if (lockEls.length) {
        enriched = lockEls.flatMap(el => {
          const assets = el.data?.assets || el.data?.positions || [];
          if (!assets.length) return [{ _fromPortfolio:true,
            symbol: el.name || el.label || "Token",
            totalAmount: el.value ? parseFloat(el.value).toFixed(2) : "0",
            claimableAmount: "0", vestedPercent: "0", lockId: el.id || el.address }];
          return assets.map(a => ({ _fromPortfolio:true,
            symbol: a.symbol || a.name || el.name || "Token",
            totalAmount: a.amount != null ? parseFloat(a.amount).toFixed(4) : el.value ? parseFloat(el.value).toFixed(2) : "0",
            claimableAmount: a.claimableAmount ? parseFloat(a.claimableAmount).toFixed(4) : "0",
            vestedPercent: "0", cliff: a.cliff || a.cliffTime || null,
            lockId: a.pubkey || a.id || el.id }));
        });
      }
    } catch {}

    // 2. Direct Jupiter Lock API — always check BOTH wallet (creator) AND recipient
    try {
      const [walletRes, recipRes] = await Promise.allSettled([
        fetch(`${JUP_LOCK_API}/locks?wallet=${walletFull}`).then(r => r.json()),
        fetch(`${JUP_LOCK_API}/locks?recipient=${walletFull}`).then(r => r.json()),
      ]);
      const seen = new Set(enriched.map(l => l.lockId).filter(Boolean));
      for (const result of [walletRes, recipRes]) {
        if (result.status !== "fulfilled") continue;
        const raw = Array.isArray(result.value) ? result.value
          : result.value?.locks || result.value?.accounts || result.value?.data || [];
        enrichLocks(raw).forEach(lk => {
          if (!seen.has(lk.lockId)) { seen.add(lk.lockId); enriched.push(lk); }
        });
      }
    } catch {}

    // 3. Server proxy fallback
    if (!enriched.length) {
      try {
        const res = await fetch("/api/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "accounts", wallet: walletFull }),
        });
        const data = await res.json();
        if (!data.error && (data.accounts?.length > 0)) {
          enriched = enrichLocks(data.accounts);
        }
      } catch {}
    }

    setLockList(enriched);
    setShowLocks(true);
    if (!enriched.length) push("ai", "No token locks found for your wallet.");
    setLocksLoading(false);
  };

  // ── Lock: create a new token lock ───────────────────────────────────────────
  // Builds the Jupiter Lock createVestingEscrow tx entirely client-side.
  // Jupiter Lock program: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
  // No backend SDK needed — raw instruction encoding via @solana/web3.js.
  const doCreateLock = async () => {
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet not connected."); return; }
    const { mint, cliffDays, vestingDays, recipient } = lockCfg;
    const amount = lockCfg.amount;
    if (!mint || !amount || parseFloat(amount) <= 0) return;
    // SOL (native) cannot be locked — the Jupiter Lock program requires an SPL token ATA.
    // Use USDC, JUP, or any other SPL token instead.
    if (mint === "So11111111111111111111111111111111111111112") {
      push("ai", "Note: Native SOL cannot be locked directly. Please use an SPL token like **USDC** or **JUP** instead.");
      setLockStatus(null);
      return;
    }
    setLockStatus("signing");
    try {
      const { Transaction, VersionedTransaction, Connection } = await import("@solana/web3.js");

      const cliff   = Math.max(Math.floor(parseFloat(cliffDays   || 0)   * 86400), 0);
      const vesting = Math.max(Math.floor(parseFloat(vestingDays || 1)   * 86400), 86400);
      const dec     = tokenDecimalsRef.current[lockCfg.token?.toUpperCase()] || 9;
      const amtRaw  = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, dec)));

      // Call the Vercel API route which uses the server-side SOLANA_RPC env var
      const apiRes = await fetch("/api/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:     "create",
          funder:     walletFull,
          recipient:  recipient?.trim() || "",
          mint,
          amount:     amtRaw.toString(),
          cliffSecs:  cliff,
          vestingSecs: vesting,
        }),
      });
      const apiData = await apiRes.json();
      if (apiData.error) throw new Error(apiData.error);

      const { transaction: txB64, escrow: escrowPDA, blockhash, lastValidBlockHeight } = apiData;

      // Deserialize, user signs, then send
      const txBytes = Uint8Array.from(atob(txB64), c => c.charCodeAt(0));
      let tx;
      try { tx = Transaction.from(Buffer.from(txBytes)); }
      catch (_) { tx = VersionedTransaction.deserialize(txBytes); }
      const signed = await provider.signTransaction(tx);

      const RPC_URL    = import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(RPC_URL, "confirmed");
      const sig        = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });

      push("ai", `Confirming lock on-chain… ⏳`);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      // Check if the tx actually succeeded on-chain (confirmed ≠ succeeded)
      const txResult = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (txResult?.meta?.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(txResult.meta.err)}`);
      }

      setLockStatus("done");
      setLockResult({ lockId: escrowPDA, txSig: sig });
      push("ai", `**Lock created ✓**\n\n**${amount} ${lockCfg.token}** locked for **${recipient?.trim() ? `\`${recipient.trim().slice(0,12)}…\`` : "your wallet"}**\n\nCliff: ${cliffDays} days · Vesting: ${vestingDays} days total\nEscrow: \`${escrowPDA.slice(0,20)}…\`\n\nTx: [View on Solscan →](https://solscan.io/tx/${sig})`);
      setShowLock(false);
    } catch (err) {
      setLockStatus("error");
      push("ai", `Lock creation failed: ${err?.message}`);
      setLockStatus(null);
    }
  };

  // ── Lock: claim vested tokens ────────────────────────────────────────────────
  // Builds claim tx client-side — no backend needed.
  const doClaimLock = async (lockId, lockPubkey) => {
    const provider = getActiveProvider();
    if (!provider || !walletFull) { push("ai", "Wallet not connected."); return; }
    const escrowAddr = lockId || lockPubkey;
    setClaimingLock(escrowAddr);
    try {
      const { PublicKey, SystemProgram, Transaction, TransactionInstruction, Connection } = await import("@solana/web3.js");
      const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");

      const LOCK_PROGRAM = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");
      const RPC_URL      = import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
      const connection   = new Connection(RPC_URL, "confirmed");

      const recipientKey = new PublicKey(walletFull);
      const escrowKey    = new PublicKey(escrowAddr);

      // Fetch escrow account data to get mint (offset: 8 disc + 32 base + 32 mint = at byte 40)
      const acctInfo = await connection.getAccountInfo(escrowKey);
      if (!acctInfo) throw new Error("Escrow account not found on-chain");
      const mintKey = new PublicKey(acctInfo.data.slice(40, 72));

      const escrowATA    = await getAssociatedTokenAddress(mintKey, escrowKey,    true,  TOKEN_PROGRAM_ID);
      const recipientATA = await getAssociatedTokenAddress(mintKey, recipientKey, false, TOKEN_PROGRAM_ID);

      // Anchor event authority PDA — required by ALL Jupiter Lock instructions
      // Omitting this causes Custom error: 101 (InstructionFallbackNotFound)
      const [eventAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("__event_authority")],
        LOCK_PROGRAM
      );

      // Discriminator for claim = sha256("global:claim")[0..8]
      const discriminator = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]);
      // max_amount = u64::MAX (claim all available)
      const maxAmount = Buffer.alloc(8);
      maxAmount.writeBigUInt64LE(BigInt("18446744073709551615"), 0);
      const data = Buffer.concat([discriminator, maxAmount]);

      const keys = [
        { pubkey: escrowKey,               isSigner: false, isWritable: true  },
        { pubkey: escrowATA,               isSigner: false, isWritable: true  },
        { pubkey: recipientKey,            isSigner: true,  isWritable: false },
        { pubkey: recipientATA,            isSigner: false, isWritable: true  },
        { pubkey: mintKey,                 isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        // FIX: Anchor event CPI accounts — REQUIRED by Jupiter Lock claim
        // Without these, Anchor can't emit the ClaimEvent and rejects with error 101
        { pubkey: eventAuthority,          isSigner: false, isWritable: false },
        { pubkey: LOCK_PROGRAM,            isSigner: false, isWritable: false },
      ];

      const claimIx = new TransactionInstruction({ programId: LOCK_PROGRAM, keys, data });

      // Create recipient ATA if needed
      const createRecipientAtaIx = createAssociatedTokenAccountInstruction(
        recipientKey, recipientATA, recipientKey, mintKey,
        TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      // Try to add ATA creation; if it already exists the tx will just have one ix
      try { tx.add(createRecipientAtaIx); } catch (_) {}
      tx.add(claimIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = recipientKey;

      const signed = await provider.signTransaction(tx);
      const sig    = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });

      push("ai", `Confirming claim on-chain… ⏳`);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      push("ai", `Vested tokens claimed ✓\n\nTx: [View on Solscan →](https://solscan.io/tx/${sig})`);
      await fetchLocks();
    } catch (err) {
      push("ai", `Claim failed: ${err?.message}`);
    }
    setClaimingLock(null);
  };

  // ── Route Inspector: fetch Jupiter v1 quote with full route breakdown ────────
  const fetchRouteBreakdown = async (fromSym, toSym, amount) => {
    setRouteLoading(true);
    setRouteData(null);
    setShowRoute(false);
    try {
      const fromMint = tokenCacheRef.current[fromSym?.toUpperCase()] || TOKEN_MINTS[fromSym?.toUpperCase()];
      const toMint   = tokenCacheRef.current[toSym?.toUpperCase()]   || TOKEN_MINTS[toSym?.toUpperCase()];
      if (!fromMint || !toMint) {
        // Try to resolve unknown tokens
        const rF = fromMint ? null : await resolveToken(fromSym);
        const rT = toMint   ? null : await resolveToken(toSym);
        if (!fromMint && !rF?.mint) { push("ai", `Could not find mint for **${fromSym}**.`); setRouteLoading(false); return; }
        if (!toMint   && !rT?.mint) { push("ai", `Could not find mint for **${toSym}**.`);   setRouteLoading(false); return; }
      }
      const fMint = fromMint || (await resolveToken(fromSym))?.mint;
      const tMint = toMint   || (await resolveToken(toSym))?.mint;
      const dec   = tokenDecimalsRef.current[fromSym?.toUpperCase()] || 6;
      const amtRaw = Math.floor(parseFloat(amount || 1) * Math.pow(10, dec)).toString();

      const data = await jupFetch(`${JUP_ROUTE_API}?inputMint=${fMint}&outputMint=${tMint}&amount=${amtRaw}&slippageBps=50`);
      if (!data || data.error) throw new Error(data?.error?.message || "No route data returned.");
      setRouteData({ ...data, fromSym: fromSym?.toUpperCase(), toSym: toSym?.toUpperCase(), amount });
      setShowRoute(true);
    } catch (err) {
      push("ai", `Could not fetch route: ${err?.message}`);
    }
    setRouteLoading(false);
  };

  // ── Predictions — GET /prediction/v1/events ──────────────────────────────
  // Real schema (Jupiter docs): { data: [ { eventId, category, volumeUsd,
  //   metadata:{title,closeTime,subtitle}, markets:[ { marketId, status,
  //   metadata:{title,isTeamMarket}, pricing:{buyYesPriceUsd,buyNoPriceUsd} } ] } ] }
  const fetchPredictionMarkets = async (category = null, searchQuery = null) => {
    const extractEvents = (raw) => {
      if (Array.isArray(raw)) return raw;
      if (Array.isArray(raw?.data)) return raw.data;
      if (Array.isArray(raw?.events)) return raw.events;
      return [];
    };
    const clientFilter = (events, q) => {
      const lq = q.toLowerCase();
      return events.filter(e =>
        e.metadata?.title?.toLowerCase().includes(lq) ||
        e.title?.toLowerCase().includes(lq) ||
        e.category?.toLowerCase().includes(lq) ||
        (e.markets||[]).some(mk => mk.metadata?.title?.toLowerCase().includes(lq))
      );
    };
    if (searchQuery) {
      try {
        const data = await predFetch(`${JUP_PRED_API}/events/search?query=${encodeURIComponent(searchQuery)}&limit=50&includeMarkets=true`);
        const events = extractEvents(data);
        if (events.length > 0) return { markets: events, source: "search" };
      } catch {}
      try {
        const p = new URLSearchParams({ includeMarkets: "true", sortBy: "volume", sortDirection: "desc", end: "200" });
        const data = await predFetch(`${JUP_PRED_API}/events?${p.toString()}`);
        const all = extractEvents(data);
        const filtered = clientFilter(all, searchQuery);
        if (filtered.length > 0) return { markets: filtered, source: "client-filter" };
        if (all.length > 0) return { markets: all, source: "api-fallback" };
      } catch {}
    }
    try {
      const p = new URLSearchParams({ includeMarkets: "true", sortBy: "volume", sortDirection: "desc", end: "100" });
      if (category && category !== "null") p.set("category", category.toLowerCase());
      const data = await predFetch(`${JUP_PRED_API}/events?${p.toString()}`);
      const events = extractEvents(data);
      if (events.length > 0) return { markets: events, source: "api" };
    } catch {}
    try {
      const p = new URLSearchParams({ includeMarkets: "true", sortBy: "volume", sortDirection: "desc", end: "100" });
      const data = await predFetch(`${JUP_PRED_API}/events?${p.toString()}`);
      const events = extractEvents(data);
      if (events.length > 0) return { markets: events, source: "api-all" };
    } catch {}
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
          // Jupiter Earn API returns rates as percentage strings (e.g. "4.8" = 4.8%)
          // Guard: if value > 100 it was encoded as bps (e.g. 480 = 4.80%) — divide by 100
          const parseRate = (raw) => {
            const n = parseFloat(raw || 0);
            if (!n || n <= 0) return 0;
            return n > 100 ? n / 100 : n;   // bps → percent  OR  already percent
          };
          const totalRateRaw   = parseRate(v.totalRate);
          const supplyRateRaw  = parseRate(v.supplyRate);
          const rewardsRateRaw = parseRate(v.rewardsRate);
          const apyVal = totalRateRaw || supplyRateRaw;

          // Format cleanly — always show one decimal (e.g. 4.8%)
          const fmtApy = (r) => {
            if (!r || r <= 0) return "N/A";
            if (r >= 10) return r.toFixed(1) + "%";
            return r.toFixed(2) + "%";
          };

          const decimals = v.asset?.decimals ?? v.decimals ?? 6;
          // token_exchange_price (scaled 1e12): shares → underlying. liquidity_exchange_price excludes rewards.
          const tokenExchangePrice   = parseFloat(v.tokenExchangePrice  || v.token_exchange_price  || 0);
          const liquidityExchangePrice = parseFloat(v.liquidityExchangePrice || v.liquidity_exchange_price || 0);
          // Utilization: how much of TVL is borrowed (0–100%)
          const totalAssets  = parseFloat(v.totalAssets  || v.total_assets  || 0);
          const totalBorrows = parseFloat(v.totalBorrows || v.total_borrows || 0);
          const utilization  = totalAssets > 0 ? Math.min(100, Math.round((totalBorrows / totalAssets) * 100)) : null;
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
            tvl:          totalAssets > 0 ? (totalAssets / Math.pow(10, decimals)) : 0,
            utilization,
            tokenExchangePrice,
            liquidityExchangePrice,
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

  // ── Fetch user's earn positions to show balances on vault cards ───────────────
  const fetchEarnUserPositions = async () => {
    if (!walletFull) return;
    try {
      // Direct fetch — same pattern as fetchPortfolioData (NOT jupFetch proxy)
      const earnRes = await fetch(`${JUP_EARN_API}/positions?wallets=${walletFull}`);
      const earnRaw = await earnRes.json();
      let earnArr = Array.isArray(earnRaw) ? earnRaw
        : earnRaw?.data || earnRaw?.positions || earnRaw?.earnPositions
        || earnRaw?.result || earnRaw?.items || earnRaw?.balances || [];
      if (!Array.isArray(earnArr)) {
        earnArr = Object.values(earnRaw).filter(v => v && typeof v === "object" && !Array.isArray(v));
      }
      const map = {};
      earnArr.forEach(e => {
        const sym = (e.asset?.symbol || e.assetSymbol || e.symbol || "").toUpperCase();
        if (!sym) return;
        const dec = e.asset?.decimals ?? e.decimals ?? 6;
        const ua  = parseFloat(e.underlyingAssets || e.underlying_assets || e.amount || e.balance || e.depositedAmount || 0);
        const amount = ua > 1e6 ? ua / Math.pow(10, dec) : ua;
        const shares = parseFloat(e.shares || 0);
        if (amount > 0 || shares > 0) {
          map[sym] = { amount, amountRaw: ua, shares, decimals: dec };
        }
      });
      setEarnUserPositions(map);
    } catch {}
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
        body: { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [bytesToB64(signedBytes), { encoding: "base64", skipPreflight: true }] },
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

  // ── Earn withdraw — POST /lend/v1/earn/withdraw ────────────────────────────
  const doEarnWithdraw = async () => {
    const { vault, amount } = earnWithdraw;
    if (!amount || parseFloat(amount) <= 0) return;
    if (!walletFull) { push("ai", "Connect your wallet first to withdraw."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    const assetMint = vault.assetMint;
    if (!assetMint) { push("ai", `Could not resolve asset mint for **${vault.name}**. Please try again.`); return; }
    const decimals = vault.assetDecimals || 6;
    const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, decimals)).toString();

    setShowEarnWithdraw(false);
    push("ai", `Preparing withdrawal of **${amount} ${vault.token}** from **${vault.name}**…`);
    try {
      const res = await jupFetch(`${JUP_EARN_API}/withdraw`, {
        method: "POST",
        body: { asset: assetMint, amount: amountRaw, signer: walletFull },
      });
      if (res.error) throw new Error(typeof res.error === "object" ? JSON.stringify(res.error) : res.error);
      if (!res.transaction) throw new Error("No transaction returned from Jupiter Lend withdraw.");

      const binaryStr = atob(res.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing.");
      const signedTx = await provider.signTransaction(tx);

      const signedBytes = signedTx.serialize();
      const rpcRes = await jupFetch(SOLANA_RPC, {
        method: "POST",
        body: { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [bytesToB64(signedBytes), { encoding: "base64", skipPreflight: true }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Transaction failed to send.");

      push("ai", `Withdrawal submitted ✓\n\n**${amount} ${vault.token}** withdrawn from **${vault.name}**\n\nTransaction: \`${signature.slice(0, 20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
      const updated = await fetchSolanaBalances(walletFull);
      setPortfolio(updated);
    } catch (err) {
      push("ai", `Withdrawal failed: ${err?.message || "Unknown error"}. Please check your earn balance and try again.`);
    }
  };

  // ── Send — real onchain tx via POST /send/v1/craft-send ─────────────────────
  // Jupiter Send creates a keypair-based invite link. The recipient claims it
  // without needing a wallet upfront. Sender signs; tokens locked until claimed or clawed back.
  //
  // Flow per Jupiter docs:
  //  1. Generate a 12-char invite code client-side
  //  2. Derive a Keypair from SHA-256 of invite code → this is the inviteSigner
  //  3. POST craft-send with inviteSigner + sender + amount + mint
  //  4. Partially sign tx with inviteKeypair, then wallet signs
  //  5. Broadcast; share invite link so recipient claims via Jupiter Mobile
  const generateInviteCode = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const arr   = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => chars[b % chars.length]).join("");
  };
  const inviteCodeToKeypair = async (code) => {
    // Jupiter derives the invite keypair from SHA-256("invite:" + code)
    const data       = new TextEncoder().encode("invite:" + code);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Keypair.fromSeed(new Uint8Array(hashBuffer));
  };

  const doSend = async () => {
    const { token, amount, mint } = sendCfg;
    if (!amount || parseFloat(amount) <= 0) return;
    if (!walletFull) { push("ai", "Connect your wallet first to send tokens."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }
    if (!mint) { push("ai", `Could not resolve mint for **${token}**. Try searching the token first.`); return; }

    const decimals  = token === "SOL" ? 9 : (tokenDecimalsRef.current[token.toUpperCase()] ?? 6);
    const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, decimals)).toString();

    // Generate invite code HERE (client-side) so the link we share is guaranteed
    // to match the keypair the server derives — no mismatch / "fake code" errors.
    const inviteCode = generateInviteCode();

    setSendStatus("signing");
    setShowSend(false);
    push("ai", `Crafting invite link to send **${amount} ${token}**…`);
    try {
      // Server receives our inviteCode, derives Keypair.fromSeed(SHA-256("invite:"+code)),
      // calls Jupiter /send/v1/craft-send with that signer pubkey, partially signs,
      // and returns the partially-signed tx. We already hold the code so no round-trip mismatch.
      const serverRes = await fetch("/api/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sender: walletFull, amount: amountRaw, mint, inviteCode }),
      });
      const serverData = await serverRes.json();
      if (serverData.error) throw new Error(serverData.error);
      const { partiallySignedTx } = serverData;

      // Step 4: wallet adds its own signature to the already-partially-signed tx.
      // Reown's adapter only sees its own signature slot being filled — no crash.
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing.");
      const tx       = VersionedTransaction.deserialize(b64ToBytes(partiallySignedTx));
      const signedTx = await provider.signTransaction(tx);

      // Step 5: broadcast
      const rpcRes = await jupFetch(SOLANA_RPC, {
        method: "POST",
        body: { jsonrpc:"2.0", id:1, method:"sendTransaction", params:[bytesToB64(signedTx.serialize()), { encoding:"base64", skipPreflight:true }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Transaction failed to send.");

      const inviteLink = `https://jup.ag/send?code=${inviteCode}`;
      setSendLink(inviteLink);
      setSendStatus("done");
      push("ai",
        `Send submitted ✓\n\n**${amount} ${token}** locked and ready to claim.\n\n` +
        `**Invite link:**\n\`${inviteLink}\`\n\n` +
        `Share this link — recipient claims via **Jupiter Mobile** (no wallet needed upfront). ` +
        `Tokens auto-return to you on expiry if unclaimed.\n\n` +
        `Transaction: \`${signature.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`
      );
      const updated = await fetchSolanaBalances(walletFull);
      setPortfolio(updated);
    } catch (err) {
      setSendStatus("error");
      push("ai", `Send failed: ${err?.message || "Unknown error"}. Please check your balance and try again.`);
    }
  };

  // ── Direct Send — transfer SOL or any SPL token straight to a wallet address ──
  const doDirectSend = async () => {
    const { token, amount, mint } = sendCfg;
    const recipient = sendRecipient.trim();
    if (!recipient) { push("ai", "Please enter a recipient wallet address."); return; }
    if (!walletFull) { push("ai", "Connect your wallet first."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    let recipientPubkey;
    try { recipientPubkey = new PublicKey(recipient); } catch {
      push("ai", "Invalid recipient address. Please check and try again."); return;
    }

    const amtNum = parseFloat(amount);
    if (!amtNum || amtNum <= 0) { push("ai", "Enter a valid amount greater than 0."); return; }

    setSendStatus("signing");
    setSendTxSig("");
    push("ai", `Preparing to send **${amount} ${token}** to \`${recipient.slice(0,6)}…${recipient.slice(-4)}\`…`);

    try {
      const connection = new Connection(SOLANA_RPC, "confirmed");
      const senderPubkey = new PublicKey(walletFull);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: senderPubkey });

      if (token === "SOL") {
        const lamports = Math.round(amtNum * LAMPORTS_PER_SOL);
        tx.add(SystemProgram.transfer({ fromPubkey: senderPubkey, toPubkey: recipientPubkey, lamports }));
      } else {
        // SPL token transfer — dynamically import spl-token to keep bundle light
        const spl = await import("@solana/spl-token");
        const mintPubkey = new PublicKey(mint);
        const decimalsInfo = await connection.getParsedAccountInfo(mintPubkey);
        const decimals = decimalsInfo?.value?.data?.parsed?.info?.decimals ?? tokenDecimalsRef.current[token] ?? 6;
        const rawAmt = BigInt(Math.round(amtNum * Math.pow(10, decimals)));

        const senderATA   = await spl.getAssociatedTokenAddress(mintPubkey, senderPubkey);
        const recipientATA = await spl.getAssociatedTokenAddress(mintPubkey, recipientPubkey);

        // Create recipient ATA if it doesn't exist
        const recipientATAInfo = await connection.getAccountInfo(recipientATA);
        if (!recipientATAInfo) {
          tx.add(spl.createAssociatedTokenAccountInstruction(senderPubkey, recipientATA, recipientPubkey, mintPubkey));
        }
        tx.add(spl.createTransferInstruction(senderATA, recipientATA, senderPubkey, rawAmt));
      }

      const signedTx = await provider.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      setSendTxSig(sig);
      setSendStatus("done");
      push("ai",
        `**Sent ${amount} ${token}** to \`${recipient.slice(0,6)}…${recipient.slice(-4)}\`\n\n` +
        `[View on Solscan →](https://solscan.io/tx/${sig})`
      );
    } catch (err) {
      setSendStatus("error");
      push("ai", `Direct send failed: ${err?.message || "Unknown error"}. Check your balance and try again.`);
    }
  };

  // ── Clawback — reclaim unclaimed Jupiter Send invite tokens ──────────────────
  // Calls /api/send?action=clawback which hits Jupiter /send/v1/craft-clawback,
  // partially signs with the invite keypair (derived from invite code), then
  // returns the partially-signed tx for the wallet to co-sign and broadcast.
  const doClawback = async (inviteCode) => {
    if (!inviteCode) { push("ai", "No invite code provided for clawback."); return; }
    if (!walletFull) { push("ai", "Connect your wallet first to claw back tokens."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    push("ai", `⏳ Crafting clawback transaction…`);
    try {
      const serverRes = await fetch("/api/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "clawback", inviteCode, sender: walletFull }),
      });
      const serverData = await serverRes.json();
      if (serverData.error) throw new Error(serverData.error);

      const { partiallySignedTx } = serverData;
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing.");
      const tx       = VersionedTransaction.deserialize(b64ToBytes(partiallySignedTx));
      const signedTx = await provider.signTransaction(tx);

      const rpcRes = await jupFetch(SOLANA_RPC, {
        method: "POST",
        body: { jsonrpc:"2.0", id:1, method:"sendTransaction", params:[bytesToB64(signedTx.serialize()), { encoding:"base64", skipPreflight:true }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Clawback transaction failed.");

      push("ai",
        `Clawback submitted ✓\n\nUnclaimed tokens are being returned to your wallet.\n\n` +
        `Transaction: \`${signature.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`
      );
      const updated = await fetchSolanaBalances(walletFull);
      setPortfolio(updated);
    } catch (err) {
      push("ai", `Clawback failed: ${err?.message || "Unknown error"}. Please try again.`);
    }
  };

  // ── Close Perps Position — POST /perps/v1/close ──────────────────────────────
  const doClosePerp = async (position) => {
    if (!walletFull) { push("ai", "Connect your wallet first."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    const posKey = position.positionKey || position.publicKey || position.id;
    setClosingPerp(posKey);
    push("ai", `Closing perps position **${(position.side||"").toUpperCase()} ${position.market || position.symbol || ""}**…`);
    try {
      // POST /perps/v1/close → returns base64 unsigned transaction
      const res = await jupFetch(`${JUP_PERPS_API}/close`, {
        method: "POST",
        body: { wallet: walletFull, positionKey: posKey, market: position.market || position.symbol },
      });
      if (res.error) throw new Error(typeof res.error === "object" ? JSON.stringify(res.error) : res.error);
      if (!res.transaction) throw new Error("No transaction returned from Jupiter Perps.");

      const binaryStr = atob(res.transaction);
      const txBytes   = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing.");
      const signedTx = await provider.signTransaction(tx);

      const signedBytes = signedTx.serialize();
      const rpcRes = await jupFetch(SOLANA_RPC, {
        method: "POST",
        body: { jsonrpc:"2.0", id:1, method:"sendTransaction", params:[bytesToB64(signedBytes), { encoding:"base64", skipPreflight:true }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Transaction failed to send.");

      setClosingPerp(null);
      // Remove closed position from local state
      setPerpPositions(prev => prev.filter(p => (p.positionKey||p.publicKey||p.id) !== posKey));
      push("ai", `Position closed ✓\n\nTransaction: \`${signature.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
    } catch (err) {
      setClosingPerp(null);
      push("ai", `Close failed: ${err?.message || "Unknown error"}. Try again or close at [jup.ag/perps](https://jup.ag/perps).`);
    }
  };

  // ── Prediction on-chain bet — POST /prediction/v1/orders ────────────────────
  const doPredictionBet = async () => {
    if (!betMarket || !betSide || !betAmount || parseFloat(betAmount) < 5) return;
    if (!walletFull) { push("ai", "Connect your wallet first to place a prediction bet."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    // depositAmount as integer (1 USDC = 1_000_000 lamports)
    const depositAmount = Math.floor(parseFloat(betAmount) * 1_000_000);
    const isYes = betSide === "yes";

    if (!betMarket?.marketId) {
      push("ai", "Market ID not found for this event. Please refresh the prediction markets and try again.");
      setBetStatus(null);
      return;
    }

    setBetStatus("signing");
    setShowBet(false);
    push("ai", `Placing **${betSide.toUpperCase()}** bet of **$${betAmount} USDC** on: _${betMarket.title}_…`);

    // Try USDC first, then JupUSD as fallback
    const tryMints = [USDC_MINT, JUPUSD_MINT];
    const placeOrder = (mint) => predFetch(`${JUP_PRED_API}/orders`, {
      method: "POST",
      body: {
        ownerPubkey:  walletFull,
        marketId:     betMarket.marketId,
        isYes,
        isBuy:        true,
        depositAmount,
        depositMint:  mint,
      },
    });

    try {
      let orderRes = null;
      let usedMint = USDC_MINT;
      for (const mint of tryMints) {
        const res = await placeOrder(mint);
        // Success = has transaction field
        if (res?.transaction) { orderRes = res; usedMint = mint; break; }
        // Store last response for error reporting
        orderRes = res;
      }
      if (!orderRes?.transaction) {
        // Show the full raw API response so we know exactly what Jupiter said
        const raw = JSON.stringify(orderRes).slice(0, 300);
        throw new Error(`Jupiter API response: ${raw}`);
      }

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
        body: { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [bytesToB64(signedBytes), { encoding: "base64", skipPreflight: true }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Transaction failed to send.");

      const orderPubkey = orderRes?.order?.orderPubkey;
      const contracts   = orderRes?.order?.contracts;
      setBetStatus("done");
      push("ai", `Prediction order submitted ✓\n\n**${betSide.toUpperCase()}** on _${betMarket.title}_\nAmount: **$${betAmount} USDC**${contracts ? `  ·  Contracts: **${contracts}**` : ""}\n\nTransaction: \`${signature.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})${orderPubkey ? `\n\nOrder account: \`${orderPubkey.slice(0,20)}…\`` : ""}`);
    } catch (err) {
      setBetStatus("error");
      const msg = err?.message || "Unknown error";
      if (msg.includes("unsupported_region") || msg.includes("Trading is not available in your region") || msg.includes("geo") || msg.includes("region")) {
        push("ai", `Note: Jupiter Prediction markets returned a **geo-restriction error**.\n\nThis can happen if the ChatFi server (not your device) is deployed in a restricted region. If you've successfully used prediction markets before or know your country is supported, this is a server-side issue.\n\n**Try:**\n• Reconnect your wallet and try again\n• If the issue persists, the server may need to be re-deployed to a US/EU region\n\n*Note: Jupiter supports US, UK, EU and most regions — this is rarely a user restriction.*`);
      } else {
        push("ai", `Prediction bet failed. Details: ${msg}`);
      }
    }
    setBetStatus(null);
  };

  // ── Safe API fetch — always returns JSON, never throws on HTML error pages ──
  const safeApiFetch = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    const text = await res.text();
    try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
    catch { return { ok: false, status: res.status, data: { error: `Server error (${res.status}): ${text.slice(0, 200)}` } }; }
  };

  // ── Safe base64 decode → Uint8Array (atob+charCodeAt breaks on large txs) ────
  const b64ToBytes = (b64) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  // Safe Uint8Array → base64 (spread crashes on large arrays > 65k bytes)
  const bytesToB64 = (bytes) => {
    let s = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk)
      s += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(s);
  };

  // ── Resolve real on-chain vaultId from mint addresses ───────────────────────
  // MULTIPLY_VAULTS has hardcoded IDs that may be wrong. The server fetches real IDs
  // via getVaultConfig, so we pass the MULTIPLY_VAULTS id but the server validates it.
  // Additionally, at mount we fetch GET /api/multiply to get the real map so the UI
  // shows the correct vaultId if it ever differs.
  const getRealVaultId = (vault) => {
    const colMint  = TOKEN_MINTS[vault.collateral.toUpperCase()] || "";
    const debtMint = TOKEN_MINTS[vault.debt.toUpperCase()] || "";
    const key = colMint + "/" + debtMint;
    return realVaultMap[key] ?? vault.vaultId; // prefer real, fall back to hardcoded
  };

  // ── Jupiter Multiply — calls /api/multiply serverless → signs → sends ────────
  const doMultiply = async () => {
    const { vault, colAmount, leverage } = multiplyPos;
    if (!vault || !colAmount || parseFloat(colAmount) <= 0) return;
    if (!walletFull) { push("ai", "Connect your wallet first to open a Multiply position."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }
    if (!provider.signTransaction) { push("ai", "Your wallet does not support transaction signing."); return; }

    const colDecimals  = vault.colDecimals  ?? 9;
    const debtDecimals = vault.debtDecimals ?? 6;
    const colRaw  = Math.floor(parseFloat(colAmount) * Math.pow(10, colDecimals));
    // targetLeverage passed as integer multiplier × 100 (e.g. 2x → 200, 3x → 300)
    // debtAmount is NOT pre-calculated here — the server uses targetLeverage to derive it via getOperateIx
    const targetLeverageBps = Math.round(parseFloat(leverage) * 100); // e.g. 200 for 2x

    setMultiplyStatus("signing");
    setShowMultiplyForm(false);
    push("ai", `Opening **${leverage}x ${vault.collateral}/${vault.debt}** Multiply position with **${colAmount} ${vault.collateral}**…`);

    try {
      // 1. Get unsigned transaction from backend
      const { ok: mOk, data } = await safeApiFetch("/api/multiply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:              "open",
          vaultId:             getRealVaultId(vault),
          positionId:          0,
          initialColAmount:    colRaw.toString(),
          targetLeverageBps:   targetLeverageBps,
          signer:              walletFull,
        }),
      });
      if (data.error) throw new Error(data.error);
      if (!data.transaction) throw new Error("No transaction returned from multiply API.");

      // 2a. Send setup tx first (ATA creation + position init — legacy format)
      if (data.setupTransaction) {
        push("ai", "Setting up position accounts…");
        const setupBytes = b64ToBytes(data.setupTransaction);
        // Setup tx is a legacy Transaction (not versioned) — deserialize accordingly
        let setupTx;
        try {
          setupTx = Transaction.from(setupBytes);
        } catch {
          setupTx = VersionedTransaction.deserialize(setupBytes);
        }
        const signedSetup = await provider.signTransaction(setupTx);
        const setupSerialized = signedSetup.serialize ? signedSetup.serialize() : signedSetup.serialize();
        const setupRes = await jupFetch("SOLANA_RPC", {
          method: "POST",
          body: { jsonrpc:"2.0", id:1, method:"sendTransaction", params:[bytesToB64(setupSerialized), { encoding:"base64", skipPreflight:false }] },
        });
        const setupSig = setupRes?.result;
        if (!setupSig) throw new Error(setupRes?.error?.message || "Setup transaction failed.");
        // Wait for setup tx to confirm on-chain before sending main multiply tx
        await new Promise(r => setTimeout(r, 4000));
      }

      // 2b. Deserialize + sign main multiply tx
      const tx = VersionedTransaction.deserialize(b64ToBytes(data.transaction));
      const signedTx = await provider.signTransaction(tx);

      // 3. Send via RPC — use skipPreflight:true for multiply (simulation misreads atomic flashloan)
      const rpcRes = await jupFetch("SOLANA_RPC", {
        method: "POST",
        body: { jsonrpc:"2.0", id:1, method:"sendTransaction", params:[bytesToB64(signedTx.serialize()), { encoding:"base64", skipPreflight:false }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Transaction failed to send.");

      // Verify tx landed on-chain before confirming success
      await new Promise(r => setTimeout(r, 3000));
      const confirmRes = await jupFetch("SOLANA_RPC", {
        method: "POST",
        body: { jsonrpc:"2.0", id:1, method:"getSignatureStatuses", params:[[signature],{searchTransactionHistory:true}] },
      });
      const txStatus = confirmRes?.result?.value?.[0];
      if (txStatus?.err) {
        // Transaction landed but failed on-chain — treat as error, NOT success
        throw new Error("On-chain error: " + JSON.stringify(txStatus.err));
      }
      // Only reach here if tx actually succeeded
      setMultiplyStatus("done");
      push("ai", `Multiply position opened\n\n**${leverage}x ${vault.collateral}/${vault.debt}**\nCollateral: **${colAmount} ${vault.collateral}**\n\nTransaction: \`${signature.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})\n\nNote:️ Monitor your position at [jup.ag/lend/multiply](https://jup.ag/lend/multiply) — your Position NFT is in your wallet.`);
      const updated = await fetchSolanaBalances(walletFull);
      setPortfolio(updated);
    } catch (err) {
      setMultiplyStatus("error");
      const msg = err?.message || "Unknown error";
      // Decode Jupiter Lend on-chain error codes
      const LEND_ERRORS = {
        6011: "InvalidPositionId — the position account doesn't exist yet. Open your first position at jup.ag/lend/multiply first.",
        6025: "SlippageExceeded — the flashloan swap exceeded slippage tolerance. Try a lower leverage or smaller amount.",
        6001: "InsufficientCollateral — not enough collateral for this leverage level.",
        6003: "BorrowCapExceeded — vault borrow cap reached. Try a smaller amount.",
        6010: "InvalidVaultId — vault configuration mismatch. Please refresh and try again.",
        6015: "PositionNotHealthy — position would be under-collateralised at this leverage.",
      };
      // Match decimal code from InstructionError JSON: {"Custom":6025}
      const customMatch = msg.match(/"Custom"\s*:\s*(\d+)/);
      // Also match hex or plain error codes
      const codeMatch = customMatch || msg.match(/custom program error: (0x[0-9a-f]+)|Error Code: (\d+)|error code.*?(\d{4})/i);
      let decodedErr = msg;
      if (codeMatch) {
        const raw = codeMatch[1];
        const code = raw?.startsWith("0x") ? parseInt(raw, 16) : parseInt(raw || codeMatch[2] || codeMatch[3]);
        if (LEND_ERRORS[code]) decodedErr = `Error ${code}: ${LEND_ERRORS[code]}`;
      }
      // Fallback: scan raw message for known code numbers
      if (decodedErr === msg) {
        for (const code of Object.keys(LEND_ERRORS).map(Number)) {
          if (msg.includes(String(code))) { decodedErr = `Error ${code}: ${LEND_ERRORS[code]}`; break; }
        }
      }
      let multiplyHint = "\n\nOpen [jup.ag/lend/multiply](https://jup.ag/lend/multiply) to check your positions.";
      if (msg.includes("6011") || msg.includes("InvalidPositionId")) {
        multiplyHint = "\n\nTip: This vault requires opening your first position directly at [jup.ag/lend/multiply](https://jup.ag/lend/multiply). Once the position NFT is created, you can manage it here.";
      } else if (msg.includes("6025") || msg.includes("SlippageExceeded")) {
        multiplyHint = "\n\nTip: Slippage exceeded during the flashloan swap. Try reducing leverage (e.g. 2x instead of 3x), a smaller collateral amount, or wait for calmer market conditions.";
      } else if (msg.includes("6001") || msg.includes("insufficient") || msg.includes("balance") || msg.includes("funds")) {
        multiplyHint = "\n\nTip: Insufficient balance. Make sure you have enough of the collateral token in your wallet.";
      } else if (msg.includes("rent") || msg.includes("fee") || msg.includes("lamport")) {
        multiplyHint = "\n\nTip: Not enough SOL for transaction fees. You need at least 0.01 SOL.";
      }
      push("ai", `Multiply failed: ${decodedErr}${multiplyHint}`);
    }
    setMultiplyStatus(null);
  };

  // ── Fetch open Lend positions ─────────────────────────────────────────────────
  // Earn positions: MUST use direct fetch() — jupFetch proxy strips/transforms earn response.
  // Borrow/Multiply positions: Jupiter Borrow REST API is "Coming Soon" (SDK-only for now).
  const fetchLendPositions = async () => {
    if (!walletFull) { push("ai", "Connect your wallet first to view your Lend positions."); return; }
    setLendPosLoading(true);
    setShowLendPos(true);

    // 1. Earn positions — direct fetch (same pattern as fetchPortfolioData, NOT through proxy)
    let earnPositions = [];
    try {
      const earnRes = await fetch(`${JUP_EARN_API}/positions?wallets=${walletFull}`);
      const earnRaw = await earnRes.json();
      let earnArr = Array.isArray(earnRaw) ? earnRaw
        : earnRaw?.data || earnRaw?.positions || earnRaw?.earnPositions
        || earnRaw?.result || earnRaw?.items || earnRaw?.balances || [];
      if (!Array.isArray(earnArr)) {
        const vals = Object.values(earnRaw).filter(v => v && typeof v === "object" && !Array.isArray(v));
        earnArr = vals.length > 0 ? vals : [];
      }
      earnPositions = earnArr
        .filter(e => parseFloat(e.underlyingAssets || e.underlying_assets || e.amount || e.balance || e.depositedAmount || e.value || e.shares || 0) > 0)
        .map(e => ({ ...e, _type: "earn" }));
    } catch {}

    // 1b. Portfolio API fallback — same source the portfolio panel uses for earn positions
    if (!earnPositions.length) {
      try {
        const portRes = await fetch(`${JUP_PORTFOLIO}/positions/${walletFull}`);
        const portData = await portRes.json();
        const allEl = Array.isArray(portData) ? portData : (portData?.data || portData?.elements || portData?.positions || []);
        const earnEls = allEl.filter(el => {
          const s = ((el.label || "") + (el.platformId || "") + (el.name || "")).toLowerCase();
          return s.includes("earn") || s.includes("lend") || s.includes("vault") || s.includes("yield");
        });
        earnPositions = earnEls.flatMap(el => {
          const assets = el.data?.assets || el.data?.positions || [];
          if (!assets.length) return [{ _type:"earn", _fromPortfolio:true,
            symbol: el.name || el.label || "Token", underlyingAssets: el.value, value: el.value, asset:{ decimals:6 } }];
          return assets.map(a => ({ _type:"earn", _fromPortfolio:true,
            symbol: a.symbol || a.name || el.name || "Token",
            underlyingAssets: a.underlyingAssets || a.amount || a.value,
            value: a.value ?? el.value, asset:{ decimals: a.decimals ?? 6 } }));
        }).filter(e => parseFloat(e.value || e.underlyingAssets || 0) > 0);
      } catch {}
    }

    // 2. Borrow/Multiply positions — via /api/lend-positions (uses @jup-ag/lend-read SDK)
    let borrowPositions = [];
    try {
      const res = await fetch(`/api/lend-positions?wallet=${walletFull}`);
      const txt = await res.text();
      try {
        const data = JSON.parse(txt);
        if (data.positions) borrowPositions = data.positions.map(p => ({ ...p, _type: "borrow" }));
      } catch {}
    } catch {}

    const all = [...borrowPositions, ...earnPositions];
    setLendPositions(all);
    setLendPosLoading(false);

    if (all.length === 0) {
      push("ai",
        "No open Jupiter Lend positions found for your wallet.\n\n" +
        "Use **Borrow** to open a collateral position or **Multiply** for leveraged looping.\n" +
        "View all positions at [jup.ag/lend](https://jup.ag/lend)."
      );
      setShowLendPos(false);
    }
  };

  // ── Borrow — deposit collateral + borrow in one tx via /api/borrow ───────────
  // Uses getOperateIx from @jup-ag/lend/borrow on the server (same pattern as /api/multiply).
  // positionId:0 → SDK auto-creates position + deposits + borrows atomically (versioned tx v0 + ALTs).
  const doBorrow = async () => {
    if (!walletFull) { push("ai", "Connect your wallet first to borrow."); return; }
    const provider = getActiveProvider();
    if (!provider?.signTransaction) { push("ai", "Wallet does not support signing."); return; }
    const { vaultId, collateral, debt, colDecimals, debtDecimals, colAmount, borrowAmount } = borrowCfg;
    if (!colAmount || parseFloat(colAmount) <= 0 || !borrowAmount || parseFloat(borrowAmount) <= 0) return;

    const colRaw  = Math.floor(parseFloat(colAmount)    * Math.pow(10, colDecimals  ?? 9)).toString();
    const debtRaw = Math.floor(parseFloat(borrowAmount) * Math.pow(10, debtDecimals ?? 6)).toString();

    setBorrowStatus("signing");
    push("ai", `Depositing **${colAmount} ${collateral}** as collateral and borrowing **${borrowAmount} ${debt}**…`);

    try {
      // 1. Build transactions on server
      const { ok, data } = await safeApiFetch("/api/borrow", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action:"operate", vaultId, positionId:0, colAmount:colRaw, debtAmount:debtRaw, signer:walletFull }),
      });
      if (!ok || data.error) throw new Error(data.error || "Borrow API error");
      if (!data.transaction) throw new Error("No transaction returned from borrow API.");

      // 2. If setupTransaction exists — sign + send it first (creates position NFT)
      if (data.setupTransaction) {
        const setupBytes  = b64ToBytes(data.setupTransaction);
        const setupTx     = Transaction.from(setupBytes);
        const signedSetup = await provider.signTransaction(setupTx);
        const setupRes    = await jupFetch(SOLANA_RPC, {
          method: "POST",
          body: { jsonrpc:"2.0", id:1, method:"sendTransaction", params:[bytesToB64(signedSetup.serialize()), { encoding:"base64", skipPreflight:false }] },
        });
        const setupSig = setupRes?.result;
        if (!setupSig) throw new Error(setupRes?.error?.message || "Setup transaction (create position) failed to send.");
        // Wait for position to be confirmed before operating
        await new Promise(r => setTimeout(r, 4000));
      }

      // 3. Sign + send operate transaction (deposit + borrow)
      const bytes     = b64ToBytes(data.transaction);
      const tx        = VersionedTransaction.deserialize(bytes);
      const signedTx  = await provider.signTransaction(tx);
      const rpcRes    = await jupFetch(SOLANA_RPC, {
        method: "POST",
        body: { jsonrpc:"2.0", id:1, method:"sendTransaction", params:[bytesToB64(signedTx.serialize()), { encoding:"base64", skipPreflight:true }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Transaction failed to send.");

      await new Promise(r => setTimeout(r, 2500));
      setBorrowStatus("done");
      setShowBorrow(false);
      push("ai",
        "Borrow successful\n\n" +
        "Deposited: **" + colAmount + " " + collateral + "** deposited as collateral\n" +
        "Borrowed: **" + borrowAmount + " " + debt + "** borrowed to your wallet\n\n" +
        "Position NFT is in your wallet.\nTx: `" + signature.slice(0,20) + "…`\n" +
        "[View on Solscan →](https://solscan.io/tx/" + signature + ")\n\n" +
        "Note: Monitor your LTV at [jup.ag/lend](https://jup.ag/lend) to avoid liquidation."
      )
      try { const updated = await fetchSolanaBalances(walletFull); setPortfolio(updated); } catch {}
    } catch (err) {
      setBorrowStatus("error");
      const msg = err?.message || "Unknown error";
      const LEND_ERRORS = {
        6011: "InvalidPositionId — position not found on-chain.",
        6025: "SlippageExceeded — market moved. Try a smaller borrow amount.",
        6001: "InsufficientCollateral",
        6003: "BorrowCapExceeded — vault cap reached. Try a smaller amount.",
        6015: "PositionNotHealthy — would be under-collateralised. Reduce borrow amount.",
      };
      let decodedErr = msg;
      const rawCodes = Object.keys(LEND_ERRORS).map(Number);
      for (const code of rawCodes) {
        if (msg.includes(String(code))) { decodedErr = `Error ${code}: ${LEND_ERRORS[code]}`; break; }
      }
      let hint = "\n\nManage positions at [jup.ag/lend](https://jup.ag/lend).";
      if (msg.includes("insufficient") || msg.includes("balance")) hint = "\n\nTip: Insufficient balance — make sure you hold the collateral token.";
      else if (msg.includes("SOL") || msg.includes("fee") || msg.includes("rent")) hint = "\n\nTip: Not enough SOL for fees. You need at least 0.01 SOL.";
      else if (msg.includes("LTV") || msg.includes("liquidat")) hint = "\n\nTip: Borrow amount exceeds your collateral LTV limit. Reduce the borrow amount.";
      push("ai", "Borrow failed: " + decodedErr + hint);
    }
    setBorrowStatus(null);
  };

  // ── Unwind (close) a Lend position ───────────────────────────────────────────
  const doUnwind = async (pos, partial = false, partialColAmount = null) => {
    if (!walletFull) { push("ai", "Connect your wallet first."); return; }
    const provider = getActiveProvider();
    if (!provider?.signTransaction) { push("ai", "Wallet does not support signing."); return; }

    const vaultMeta = MULTIPLY_VAULTS.find(v => v.vaultId === pos.vaultId);
    const colSym    = vaultMeta?.collateral || "collateral";
    const debtSym   = vaultMeta?.debt       || "debt";

    setUnwindStatus(pos.positionId);
    setShowLendPos(false);
    push("ai", `${partial ? "Partially closing" : "Closing"} position #${pos.positionId} (${colSym}/${debtSym}, vault ${pos.vaultId}) via flashloan…`);

    try {
      const body = {
        action:     "unwind",
        vaultId:    pos.vaultId,
        positionId: pos.positionId,
        signer:     walletFull,
      };
      if (partial && partialColAmount) body.withdrawAmount = partialColAmount;

      const { data } = await safeApiFetch("/api/multiply", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      if (data.error) throw new Error(data.error);
      if (!data.transaction) throw new Error("No transaction returned.");

      const bytes    = b64ToBytes(data.transaction);
      const tx       = VersionedTransaction.deserialize(bytes);
      const signedTx = await provider.signTransaction(tx);
      const rpcRes   = await jupFetch("SOLANA_RPC", {
        method:"POST",
        body:{ jsonrpc:"2.0", id:1, method:"sendTransaction", params:[bytesToB64(signedTx.serialize()), { encoding:"base64", skipPreflight:true }] },
      });
      const signature = rpcRes?.result;
      if (!signature) throw new Error(rpcRes?.error?.message || "Transaction failed.");

      setUnwindStatus("done");
      push("ai", `Position #${pos.positionId} ${partial ? "partially closed" : "fully closed"} ✓\n\nThe flashloan was repaid atomically — your ${colSym || "collateral"} is back in your wallet.\n\nTransaction: \`${signature.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
      // Refresh positions
      await fetchLendPositions();
    } catch (err) {
      push("ai", `Unwind failed: ${err?.message}\n\nCheck your position at [jup.ag/lend](https://jup.ag/lend).`);
    } finally { setUnwindStatus(null); }
  };

  // ── Claim prediction payouts — POST /prediction/v1/positions/{pubkey}/claim ─
  const doClaimPayouts = async (introText = "") => {
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet not connected. Please connect to claim payouts."); return; }

    push("ai", (introText ? introText + "\n\n" : "") + "Checking for claimable prediction positions…");
    try {
      const res = await predFetch(`${JUP_PRED_API}/positions?ownerPubkey=${walletFull}`);
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
          const claimRes = await predFetch(`${JUP_PRED_API}/positions/${pos.pubkey}/claim`, {
            method: "POST",
            body: { ownerPubkey: walletFull },
          });
          if (!claimRes.transaction) throw new Error("No transaction in claim response.");

          const bytes = b64ToBytes(claimRes.transaction);
          const tx = VersionedTransaction.deserialize(bytes);
          if (!provider.signTransaction) throw new Error("Wallet cannot sign.");
          const signed = await provider.signTransaction(tx);
          const signedBytes = signed.serialize();
          const rpcRes = await jupFetch(SOLANA_RPC, {
            method: "POST",
            body: { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [bytesToB64(signedBytes), { encoding: "base64", skipPreflight: true }] },
          });
          const sig = rpcRes?.result;
          if (!sig) throw new Error(rpcRes?.error?.message || "Send failed.");
          const payoutUsd = (parseInt(pos.payoutUsd || 0) / 1_000_000).toFixed(2);
          const title = pos.marketMetadata?.title || pos.marketId || "market";
          push("ai", `Claimed **$${payoutUsd} USDC** from _${title.slice(0, 50)}_\n[View on Solscan →](https://solscan.io/tx/${sig})`);
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

    // ── Also check ASR governance rewards ──────────────────────────────────
    try {
      const asrRes = await fetch(`https://vote.jup.ag/api/asr/claimable?wallet=${walletFull}`).then(r => r.json()).catch(() => null);
      const asrArr = Array.isArray(asrRes) ? asrRes : (asrRes ? [asrRes] : []);
      const claimableAsr = asrArr.filter(a => a && (a.claimable || parseFloat(a.amount || 0) > 0));
      if (claimableAsr.length > 0) {
        const totalAsr = claimableAsr.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
        const token = claimableAsr[0]?.token || "JUP";
        // Try to get claim tx from Jupiter vote API
        let asrClaimed = 0;
        for (const asr of claimableAsr) {
          try {
            const claimRes = await fetch(`https://vote.jup.ag/api/asr/claim`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ wallet: walletFull, epoch: asr.epoch }),
            }).then(r => r.json()).catch(() => null);
            if (claimRes?.transaction) {
              const provider = getActiveProvider();
              const bytes  = b64ToBytes(claimRes.transaction);
              const tx     = VersionedTransaction.deserialize(bytes);
              const signed = await provider.signTransaction(tx);
              const rpcRes = await jupFetch(SOLANA_RPC, {
                method: "POST",
                body: { jsonrpc:"2.0", id:1, method:"sendTransaction", params:[bytesToB64(signed.serialize()), { encoding:"base64", skipPreflight:true }] },
              });
              const sig = rpcRes?.result;
              if (sig) {
                push("ai", `Claimed ASR reward: **${parseFloat(asr.amount || 0).toFixed(4)} ${token}**\n[View on Solscan →](https://solscan.io/tx/${sig})`);
                asrClaimed++;
              }
            } else {
              // No on-chain tx available — inform user
              push("ai", `You have **${totalAsr.toFixed(4)} ${token}** in unclaimed JUP ASR (Active Staking Rewards).\n\nClaim them at [vote.jup.ag/asr](https://vote.jup.ag/asr) — connect your wallet there to claim.`);
              break;
            }
          } catch { /* skip individual ASR epoch errors */ }
        }
        if (asrClaimed > 0) {
          const updated = await fetchSolanaBalances(walletFull);
          setPortfolio(updated);
        }
      }
    } catch { /* ASR check non-fatal */ }
  };

  // ── Swap quote ──────────────────────────────────────────────────────────────
  const fetchSwapQuote = useCallback(async () => {
    const { fromMint, fromDecimals, toMint, amount } = swapCfg;
    if (!amount || parseFloat(amount) <= 0 || fromMint === toMint) return;
    if (!fromMint || !toMint) return;
    const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, fromDecimals || 9));
    setQF(true); setSwapQuote(null);
    try {
      const data = await jupFetch(`${JUP_SWAP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&taker=${walletFull || ""}&referral=${CHATFI_REFERRAL}`);
      if (data && !data.error && data.outAmount) setSwapQuote(data);
      else setSwapQuote(null);
    } catch { setSwapQuote(null); }
    setQF(false);
  }, [swapCfg, walletFull]);

  // ── Solana balances ─────────────────────────────────────────────────────────
  const fetchSolanaBalances = async (pubkey) => {
    // Known mint → symbol map so USDC/USDT/JupUSD always resolve even if not in cache
    const KNOWN_MINTS = {
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
      "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD":  "JUPUSD",
      "So11111111111111111111111111111111111111112":   "SOL",
      "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
      "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
    };
    try {
      const solJson = await jupFetch(SOLANA_RPC, { method:"POST", body:{ jsonrpc:"2.0", id:1, method:"getBalance", params:[pubkey,{ commitment:"confirmed" }] } });
      const sol = (solJson.result?.value || 0) / 1e9;
      const splJson = await jupFetch(SOLANA_RPC, { method:"POST", body:{ jsonrpc:"2.0", id:2, method:"getTokenAccountsByOwner", params:[pubkey,{ programId:SPL_PROGRAM },{ encoding:"jsonParsed", commitment:"confirmed" }] } });
      const balances = { SOL: sol };
      for (const acc of (splJson.result?.value || [])) {
        const info = acc.account.data.parsed.info;
        // Try cache first, then known mints map
        const sym = Object.entries(tokenCacheRef.current).find(([, v]) => v === info.mint)?.[0]
                 || KNOWN_MINTS[info.mint];
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
        name: "ChatFi",
        description: "ChatFi — Your personal AI tools",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`, "https://jup.ag/favicon.ico"],
      },
    });
    wcClientRef.current = client;
    return client;
  };

  // WalletConnect deep link schemes — correct format per WalletConnect docs:
  // custom scheme: walletname://wc?uri=<encoded_wc_uri>
  // universal link: https://wallet.domain/wc?uri=<encoded_wc_uri>
  // Phantom uses their own encrypted deeplink system (not WC URI compatible),
  // so for Phantom/Jupiter on mobile we open their in-app browser instead.
  const getMobileWcDeepLink = (walletName, uri) => {
    const enc = encodeURIComponent(uri);
    // These are last-resort WC URI deep links — used only if the user somehow
    // ends up in the WC waiting state. The browse-in-app approach is preferred.
    switch (walletName) {
      case "Phantom":
        return `https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`;
      case "Solflare":
        return `solflare://wc?uri=${enc}`;
      case "Backpack":
        return `backpack://wc?uri=${enc}`;
      case "Jupiter":
        // Jupiter Mobile supports WalletConnect via its universal link
        return `https://jup.ag/wc?uri=${enc}`;
      default:
        return `https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`;
    }
  };

  // Fallback universal links (if app scheme fails / not installed)
  const getMobileWcUniversalLink = (walletName, uri) => {
    const enc = encodeURIComponent(uri);
    switch (walletName) {
      case "Phantom":  return `https://phantom.app/ul/v1/connect?app_url=${encodeURIComponent(window.location.origin)}&redirect_link=${encodeURIComponent(window.location.href)}&cluster=mainnet-beta`;
      case "Solflare": return `https://solflare.com/ul/v1/connect?app_url=${encodeURIComponent(window.location.origin)}&redirect_link=${encodeURIComponent(window.location.href)}&cluster=mainnet-beta`;
      case "Backpack": return `https://backpack.app/wc?uri=${enc}`;
      case "Jupiter":  return `https://jup.ag/wc?uri=${enc}`;
      default:         return `https://phantom.app/ul/v1/connect?app_url=${encodeURIComponent(window.location.origin)}&redirect_link=${encodeURIComponent(window.location.href)}&cluster=mainnet-beta`;
    }
  };

  // Build the direct WC deep link for a wallet given a WC URI.
  // These links open the wallet app straight to its WalletConnect approve screen.
  // Build the WC deep link that opens a wallet app straight to its approve/confirm screen.
  // Each wallet has a different scheme — custom URI schemes (phantom://, solflare://) are the
  // most reliable because Chrome passes them directly to the installed app without opening a
  // browser page first. Universal links (https://) are used as fallback where custom schemes
  // are unavailable.
  const getWcDirectLink = (walletName, wcUriStr) => {
    const enc     = encodeURIComponent(wcUriStr);
    const pageUrl = encodeURIComponent(window.location.href);
    const appUrl  = encodeURIComponent(window.location.origin);
    switch (walletName) {
      case "Phantom":
        // phantom:// custom scheme — Chrome hands this off directly to Phantom app,
        // which opens straight to the WalletConnect approve screen.
        return `phantom://wc?uri=${enc}`;
      case "Solflare":
        // solflare:// custom scheme — opens the WC approve dialog in Solflare.
        return `solflare://wc?uri=${enc}`;
      case "Jupiter":
        // Jupiter Mobile has no wc:// endpoint. Open the current page inside Jupiter's
        // in-app browser — the WC relay session is still waiting so it auto-connects.
        return `https://jup.ag/ul/browse/${pageUrl}?ref=${appUrl}`;
      case "Backpack":
        return `backpack://wc?uri=${enc}`;
      case "OKX":
        // OKX universal link wrapping their custom scheme.
        return `https://www.okx.com/download?deeplink=${encodeURIComponent("okx://wallet/dapp/url?dappUrl=" + pageUrl)}`;
      case "Trust Wallet":
        return `https://link.trustwallet.com/wc?uri=${enc}`;
      case "Coin98":
        return `coin98://wc?uri=${enc}`;
      default:
        return `phantom://wc?uri=${enc}`;
    }
  };

  const initWalletConnect = async (preferredWallet = null) => {
    setWcStatus("loading");
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    try {
      const client = await getWCSignClient();

      // Clean up stale pairings
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
      if (preferredWallet) setWcPreferredWallet(preferredWallet);

      // ── Direct open: if a wallet was chosen, immediately deep-link into its
      // WalletConnect approve screen. No QR needed — the URI is embedded in the link.
      // We use a hidden <a> click to preserve the user-gesture context so Chrome
      // doesn't block the navigation to an external app URL.
      if (preferredWallet && isMobile) {
        const directLink = getWcDirectLink(preferredWallet, uri);
        // Custom URI schemes (phantom://, solflare://, backpack://) MUST use location.href —
        // Chrome blocks window.open() for custom schemes but allows location.href.
        // Universal https:// links (Jupiter, OKX, Trust) use a hidden <a> click instead
        // so they open in a new tab and don't navigate away from this page.
        if (directLink.startsWith("https://")) {
          const a = document.createElement("a");
          a.href = directLink;
          a.target = "_blank";
          a.rel = "noreferrer";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          // Custom scheme: location.href passes control to the OS which opens the wallet app.
          // The WC relay continues running — when the user approves, approval() resolves here.
          window.location.href = directLink;
        }
      }

      // Await wallet approval — relay stays open while user approves in their wallet
      const session = await approval();
      wcSessionRef.current = session;

      const accounts = session.namespaces?.solana?.accounts || [];
      if (!accounts.length) throw new Error("No Solana account returned from session");
      const address = accounts[0].split(":").pop();

      const wcProvider = {
        publicKey: { toString: () => address },
        connect: async () => ({ publicKey: { toString: () => address } }),
        signTransaction: async (tx) => {
          const raw = tx.serialize();
          const base64 = bytesToB64(raw);
          // For sign requests on mobile: use location.href with custom scheme.
          // This opens the wallet app without unloading the page (OS intercepts custom scheme).
          if (isMobile && preferredWallet) {
            const signDeepLink = getMobileWcDeepLink(preferredWallet, uri);
            window.location.href = signDeepLink;
          }
          const result = await client.request({
            topic: session.topic,
            chainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            request: { method: "solana_signTransaction", params: { transaction: base64 } },
          });
          if (!result?.transaction) throw new Error("No signed transaction returned from wallet");
          const signed = b64ToBytes(result.transaction);
          return VersionedTransaction.deserialize(signed);
        },
        isWalletConnect: true,
        walletName: preferredWallet,
      };

      setShowWalletModal(false);
      setWcStatus("idle");
      setWcUri("");
      setWcMode("qr");
      setWcCopied(false);
      setWcPreferredWallet(null);

      connectedProviderRef.current = wcProvider;
      const display = `${address.slice(0,4)}…${address.slice(-4)}`;
      setWallet(display);
      setWalletFull(address);
      setConnectedWalletName(preferredWallet || "WalletConnect");
      const balances = await fetchSolanaBalances(address);
      setPortfolio(balances);
      const live = await fetchPrices();
      const solUSD = balances.SOL && live.SOL ? ` (~$${(balances.SOL * live.SOL).toFixed(2)})` : "";
      push("ai", `Wallet connected via WalletConnect ✓\n\nBalance: **${(balances.SOL||0).toFixed(4)} SOL**${solUSD}${Object.entries(balances).filter(([k])=>k!=="SOL").map(([k,v])=>`\n${k}: ${v<1?v.toFixed(6):v.toFixed(2)}`).join("")}\n\nWhat would you like to do?`);
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
    setWcMode("qr");
    setWcCopied(false);
    setWcPreferredWallet(null);
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
    "OKX":          (url) => `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
    "Coin98":       (url) => `https://coin98.com/dapp/${encodeURIComponent(url)}`,
    // Jupiter: no browser deep link — WC QR flow handles Jupiter
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
        icon:      sw.icon || "",
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
      let icon = "";
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

    // 4. On desktop: show extension install/download links for wallets NOT yet detected
    // (runs even if some wallets were found — lets users install additional ones)
    if (!isMobile) {
      const DESKTOP_INSTALLS = [
        { name:"Phantom",  icon: WALLET_LOGOS["Phantom"],  url:"https://phantom.com/download" },
        { name:"Solflare", icon: WALLET_LOGOS["Solflare"], url:"https://solflare.com/download" },
        { name:"Backpack", icon: WALLET_LOGOS["Backpack"], url:"https://backpack.app/downloads" },
        { name:"OKX",      icon: WALLET_LOGOS["OKX"],      url:"https://www.okx.com/web3/wallet" },
        { name:"Jupiter",  icon: WALLET_LOGOS["Jupiter"],  url:"https://jup.ag/wallet" },
      ];
      const detectedNames = new Set(list.map(l => l.name.toLowerCase()));
      for (const w of DESKTOP_INSTALLS) {
        if (!detectedNames.has(w.name.toLowerCase())) {
          list.push({ name: w.name, icon: w.icon, detected: false, deepLink: w.url, type: "download" });
        }
      }
    }

    // 5. On mobile: always add Jupiter Wallet download at the bottom
    if (isMobile && !list.some(l => l.type === "download")) {
      list.push({ name:"Get Jupiter Wallet", icon: WALLET_LOGOS["Get Jupiter Wallet"], detected:false, deepLink:"https://jup.ag/mobile", type:"download" });
    }

    return list;
  };

  const [walletList, setWalletList] = useState([]);
  const [mobileHint, setMobileHint] = useState(null);
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
  // Opens our custom modal which shows social login + external wallets
  const connectWallet = (pendingSwap) => {
    pendingSwapRef.current = pendingSwap || null;
    setShowWalletModal(true);
  };

  // Connect via Privy social login (email / Google / Twitter / Discord)
  const connectWithPrivy = () => {
    if (!privyReady) {
      console.warn("Privy not ready yet — try again in a moment");
      return;
    }
    setShowWalletModal(false);
    privyLogin();
  };

  // Connect via Reown (Phantom, Backpack, WalletConnect, etc.)
  const connectWithReown = () => {
    setShowWalletModal(false);
    reownOpen();
  };

  const disconnectWallet = () => {
    if (privyMode) {
      privyLogout();
    } else {
      reownDisconnect();
    }
  };

  // ── Get active provider for signing ─────────────────────────────────────────
  // Used by swap/bet/deposit/claim — returns the connected provider or best fallback
  const getActiveProvider = () => {
    if (reownConnected && reownProvider && !privyMode) {
      return {
        signTransaction: async (tx) => {
          if (typeof reownProvider.signTransaction === "function") return reownProvider.signTransaction(tx);
          const inj = window?.phantom?.solana || window?.backpack?.solana || window?.solflare || window?.solana || null;
          if (inj?.signTransaction) return inj.signTransaction(tx);
          throw new Error("Wallet does not support signTransaction. Please reconnect.");
        },
        signAllTransactions: async (txs) => {
          if (typeof reownProvider.signAllTransactions === "function") return reownProvider.signAllTransactions(txs);
          const inj = window?.phantom?.solana || window?.backpack?.solana || window?.solflare || window?.solana || null;
          if (inj?.signAllTransactions) return inj.signAllTransactions(txs);
          if (inj?.signTransaction) { const r=[]; for (const tx of txs) r.push(await inj.signTransaction(tx)); return r; }
          throw new Error("Wallet does not support signAllTransactions. Please reconnect.");
        },
        isReown: true,
      };
    }
    if (connectedProviderRef.current) return connectedProviderRef.current;
    const stdWallets = getStandardWallets();
    if (stdWallets.length > 0) return wrapStandardWallet(stdWallets[0]);
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
      if (!fromMint && !toMint) {
        push("ai", `Could not resolve token addresses for **${from}** and **${to}**. Use the search dropdowns to find them on Jupiter.`);
      } else if (!fromMint) {
        push("ai", `Could not resolve token address for **${from}**. Use the "Search any token…" dropdown to find it on Jupiter, then try again.`);
      } else {
        push("ai", `Could not resolve token address for **${to}**. Use the "Search any token…" dropdown to find it on Jupiter, then try again.`);
      }
      return;
    }
    const provider = getActiveProvider();
    if (!provider) { push("ai","Wallet provider not found. Please reconnect."); return; }

    setSwapStatus("signing"); setSwapTxid(null);
    try {
      const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, fromDecimals || 9));
      // v2 /order: no slippageBps = auto RTSE slippage + auto gasless if <0.01 SOL
      const orderData = await jupFetch(`${JUP_SWAP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&taker=${walletFull}&referral=${CHATFI_REFERRAL}`);
      if (orderData.error) throw new Error(typeof orderData.error==="object"?JSON.stringify(orderData.error):orderData.error);
      if (!orderData.transaction) throw new Error("No transaction returned from Jupiter — check your balance.");

      const binaryStr = atob(orderData.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i=0;i<binaryStr.length;i++) txBytes[i]=binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      try {
        const _rpc = import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
        const { blockhash } = await new Connection(_rpc, "confirmed").getLatestBlockhash("confirmed");
        tx.message.recentBlockhash = blockhash;
      } catch { /* non-fatal */ }
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing");
      const signedTx = await provider.signTransaction(tx);

      const signedBase64 = bytesToB64(signedTx.serialize());
      let execResult = await jupFetch(JUP_SWAP_EXEC, { method:"POST", body:{ signedTransaction:signedBase64, requestId:orderData.requestId } });
      if (execResult?.error && JSON.stringify(execResult.error).includes("3O05")) {
        push("ai", "Blockhash expired — refreshing and retrying…");
        const retryOrder = await jupFetch(`${JUP_SWAP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&taker=${walletFull}`);
        if (retryOrder?.transaction && !retryOrder?.error) {
          const retryTx = VersionedTransaction.deserialize(b64ToBytes(retryOrder.transaction));
          const retrySignedTx = await provider.signTransaction(retryTx);
          execResult = await jupFetch(JUP_SWAP_EXEC, { method:"POST", body:{ signedTransaction: bytesToB64(retrySignedTx.serialize()), requestId: retryOrder.requestId } });
        }
      }
      if (execResult.error) throw new Error(typeof execResult.error==="object"?JSON.stringify(execResult.error):execResult.error);

      const signature = execResult.signature || execResult.txid || execResult.transaction;
      if (!signature) throw new Error("No signature returned from execute");

      // Stop spinner immediately, then poll confirmation in background
      setSwapStatus("confirming"); setSwapTxid(signature); setShowSwap(false);
      const _rpcUrl = import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
      const _conn   = new Connection(_rpcUrl, "confirmed");
      const _start  = Date.now();
      while (Date.now() - _start < 30000) {
        const _res = await _conn.getSignatureStatuses([signature], { searchTransactionHistory: true });
        const _st  = _res?.value?.[0];
        if (_st?.err) throw new Error("Transaction failed on-chain: " + JSON.stringify(_st.err));
        if (_st?.confirmationStatus === "confirmed" || _st?.confirmationStatus === "finalized") break;
        await new Promise(r => setTimeout(r, 1500));
      }
      setSwapStatus("done");
      // v2 outAmount field
      const outAmt = orderData?.outAmount ? (parseInt(orderData.outAmount)/Math.pow(10,toDecimals||6)).toFixed(4) : "?";
      const feeBps = orderData?.feeBps ? ` · Fee: ${orderData.feeBps}bps` : "";
      push("ai", `[swap-card|${from}|${to}|${amount}|~${outAmt}|${orderData?.feeBps ? orderData.feeBps+"bps" : ""}|${signature}|ok]`);
      logTrade({ type: "swap", from, to, amount, out: outAmt, tx: signature });
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
      const signedBase64=bytesToB64(signedTx.serialize());
      const execRes=await jupFetch(JUP_TRIGGER_EXEC,{method:"POST",body:{signedTransaction:signedBase64,requestId:orderRes.requestId}});
      if (execRes.error) throw new Error(typeof execRes.error==="object"?JSON.stringify(execRes.error):execRes.error);
      const signature=execRes.signature||execRes.txid||orderRes.order;
      setShowTrig(false);
      push("ai",`Limit order placed ✓\n\nWill ${direction==="below"?"buy":"sell"} **${amount} ${direction==="below"?"USDC worth of "+token:token}** when price hits **$${targetPrice}**\n\nTransaction: \`${signature?.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
      logTrade({ type: "limit", token, amount, targetPrice, direction, tx: signature });
    } catch (err) {
      push("ai",`Limit order failed: ${err?.message||"Unknown error"}. Please try again.`);
    }
  };

  // ── Trigger v2: authenticate (challenge → sign message → JWT) ───────────────
  // POST /trigger/v2/auth/challenge  { walletPubkey, type:"message" }
  // POST /trigger/v2/auth/verify     { type, walletPubkey, signature (bs58) }
  const trigV2Authenticate = async () => {
    const provider = getActiveProvider();
    if (!provider) throw new Error("Wallet provider not found.");
    // Request challenge
    const chalRes = await jupFetch(`${JUP_TV2}/auth/challenge`, {
      method: "POST",
      body: { walletPubkey: walletFull, type: "message" },
    });
    if (chalRes.error) throw new Error("Auth challenge failed: " + (chalRes.error?.message || chalRes.error));
    // Sign the challenge message client-side
    const encoded = new TextEncoder().encode(chalRes.challenge);
    // signMessage: Phantom returns { signature: Uint8Array }, Solflare returns Uint8Array directly
    // Some mobile wallets don't expose signMessage at all — throw a clear error in that case
    if (!provider.signMessage) {
      throw new Error(
        "Your wallet does not support message signing required for Trigger orders. " +
        "Try Phantom or Solflare browser extension, or use a Limit order via a supported wallet."
      );
    }
    const sigRaw  = await provider.signMessage(encoded);
    // Normalise: unwrap { signature } if present
    const sigBytes = sigRaw?.signature instanceof Uint8Array ? sigRaw.signature
                   : sigRaw instanceof Uint8Array             ? sigRaw
                   : new Uint8Array(Object.values(sigRaw?.signature || sigRaw || {}));
    // bs58-encode the signature — inline without dependency
    const B58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const encodeB58 = (buf) => {
      const digits = [0];
      for (const byte of buf) {
        let carry = byte;
        for (let i = 0; i < digits.length; i++) { carry += digits[i] << 8; digits[i] = carry % 58; carry = (carry / 58) | 0; }
        while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
      }
      let result = "";
      for (let i = 0; i < buf.length && buf[i] === 0; i++) result += "1";
      for (let i = digits.length - 1; i >= 0; i--) result += B58_CHARS[digits[i]];
      return result;
    };
    const sigB58 = encodeB58(sigBytes);
    // Exchange signature for JWT
    const verRes = await jupFetch(`${JUP_TV2}/auth/verify`, {
      method: "POST",
      body: { type: "message", walletPubkey: walletFull, signature: sigB58 },
    });
    if (!verRes.token) throw new Error("Auth verify failed: " + (verRes.error?.message || JSON.stringify(verRes)));
    trigJwtRef.current = verRes.token;
    return verRes.token;
  };

  // Ensure we have a valid JWT — re-authenticate if missing or forced
  const getOrRefreshTrigJwt = async (force = false) => {
    if (!force && trigJwtRef.current) return trigJwtRef.current;
    trigJwtRef.current = null; // clear stale token before re-auth
    return trigV2Authenticate();
  };

  // jupFetch wrapper that injects JWT Bearer header
  // If Jupiter returns 401/Unauthorized, clears the token and retries once with fresh auth
  const trigV2Fetch = async (url, opts = {}) => {
    const jwt = await getOrRefreshTrigJwt();
    const payload = { url, method: (opts.method || "GET").toUpperCase(), triggerJwt: jwt };
    if (opts.body !== undefined) payload.body = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
    const res = await fetch("/api/jupiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    // If unauthorized, clear JWT and retry once with fresh auth
    if (data?.error === "Unauthorized" || res.status === 401) {
      const freshJwt = await getOrRefreshTrigJwt(true);
      payload.triggerJwt = freshJwt;
      const retry = await fetch("/api/jupiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return retry.json();
    }
    return data;
  };

  // ── Trigger v2: get or register vault ────────────────────────────────────────
  const trigV2GetVault = async () => {
    let v = await trigV2Fetch(`${JUP_TV2}/vault`);
    if (v?.vaultPubkey) return v;
    // First-time — register (POST, not GET)
    v = await trigV2Fetch(`${JUP_TV2}/vault/register`, { method: "POST" });
    if (!v?.vaultPubkey) throw new Error("Could not register vault: " + JSON.stringify(v));
    return v;
  };

  // ── Trigger v2: full create flow ─────────────────────────────────────────────
  // 1. Get vault  2. Craft deposit tx  3. Sign  4. POST /orders/price
  const doTriggerV2 = async () => {
    const cfg = trigV2Cfg;
    if (!cfg.amount || !cfg.triggerPriceUsd) return;
    if (!walletFull) { push("ai", "Connect your wallet first to place a trigger order."); return; }
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found."); return; }
    if (cfg.orderType === "oco" && (!cfg.tpPriceUsd || !cfg.slPriceUsd)) {
      push("ai", "OCO orders require both take-profit and stop-loss prices."); return;
    }
    if (cfg.orderType === "otoco" && (!cfg.tpPriceUsd || !cfg.slPriceUsd)) {
      push("ai", "OTOCO orders require trigger, take-profit, and stop-loss prices."); return;
    }
    setTrigV2Status("authing");
    try {
      // Step 1: vault
      await trigV2GetVault();
      // Step 2: craft deposit
      const amountRaw = Math.floor(parseFloat(cfg.amount) * Math.pow(10, cfg.fromDecimals || 6)).toString();
      const depRes = await trigV2Fetch(`${JUP_TV2}/deposit/craft`, {
        method: "POST",
        body: { inputMint: cfg.fromMint, outputMint: cfg.toMint, userAddress: walletFull, amount: amountRaw },
      });
      if (depRes.error) throw new Error("Deposit craft failed: " + (depRes.error?.message || depRes.error));
      if (!depRes.transaction) throw new Error("No deposit transaction returned.");
      // Step 3: sign deposit tx
      setTrigV2Status("signing");
      const binaryStr = atob(depRes.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      const signedTx = await provider.signTransaction(tx);
      const depositSignedTx = bytesToB64(signedTx.serialize());
      // Step 4: create order
      const expiresAt = Date.now() + parseInt(cfg.expiryDays || 7) * 86400000;
      const orderBody = {
        orderType: cfg.orderType,
        depositRequestId: depRes.requestId,
        depositSignedTx,
        userPubkey: walletFull,
        inputMint: cfg.fromMint,
        inputAmount: amountRaw,
        outputMint: cfg.toMint,
        triggerMint: cfg.toMint,      // monitor output token price
        expiresAt,
      };
      if (cfg.orderType === "single") {
        orderBody.triggerCondition = cfg.triggerCondition;
        orderBody.triggerPriceUsd  = parseFloat(cfg.triggerPriceUsd);
        if (cfg.slippageBps) orderBody.slippageBps = parseInt(cfg.slippageBps);
      } else if (cfg.orderType === "oco") {
        orderBody.tpPriceUsd    = parseFloat(cfg.tpPriceUsd);
        orderBody.slPriceUsd    = parseFloat(cfg.slPriceUsd);
        if (cfg.slippageBps) { orderBody.tpSlippageBps = parseInt(cfg.slippageBps); orderBody.slSlippageBps = parseInt(cfg.slippageBps); }
      } else if (cfg.orderType === "otoco") {
        orderBody.triggerCondition = cfg.triggerCondition;
        orderBody.triggerPriceUsd  = parseFloat(cfg.triggerPriceUsd);
        orderBody.tpPriceUsd       = parseFloat(cfg.tpPriceUsd);
        orderBody.slPriceUsd       = parseFloat(cfg.slPriceUsd);
        if (cfg.slippageBps) { orderBody.slippageBps = parseInt(cfg.slippageBps); orderBody.tpSlippageBps = parseInt(cfg.slippageBps); orderBody.slSlippageBps = parseInt(cfg.slippageBps); }
      }
      const orderRes = await trigV2Fetch(`${JUP_TV2}/orders/price`, { method: "POST", body: orderBody });
      if (orderRes.error) throw new Error("Order creation failed: " + (orderRes.error?.message || orderRes.error));
      setTrigV2Status("done");
      setShowTrigV2(false);
      const typeLabel = { single: "Limit order", oco: "OCO (TP/SL)", otoco: "OTOCO (entry + TP/SL)" }[cfg.orderType];
      const dirLabel  = cfg.triggerCondition === "below" ? "below" : "above";
      let summary = `**${typeLabel} placed ✓**\n${cfg.amount} ${cfg.from} → ${cfg.to}\n`;
      if (cfg.orderType === "single")  summary += `Trigger: ${cfg.from} price ${dirLabel} **$${cfg.triggerPriceUsd}**\n`;
      if (cfg.orderType !== "single")  summary += `TP: $${cfg.tpPriceUsd}  ·  SL: $${cfg.slPriceUsd}\n`;
      if (cfg.orderType === "otoco")   summary += `Entry trigger: ${dirLabel} $${cfg.triggerPriceUsd}\n`;
      summary += `Expires in ${cfg.expiryDays || 7} days\nOrder ID: \`${(orderRes.id || "").slice(0, 18)}…\``;
      push("ai", summary);
    } catch (err) {
      setTrigV2Status("error");
      const msg = err?.message || "Unknown error";
      let hint = "";
      if (msg.includes("message signing") || msg.includes("signMessage")) {
        hint = "\n\nTip: Trigger orders require wallet message signing for JWT auth. Use Phantom or Solflare browser extension. Alternatively, swap first then set a limit order once funds are in your wallet.";
      } else if (msg.includes("vault") || msg.includes("deposit")) {
        hint = "\n\nTip: Your trigger vault may need to be funded first. The system tried to deposit automatically.";
      }
      push("ai", "Trigger order failed: " + msg + hint);
    }
    setTrigV2Status(null);
  };

  // ── Trigger v2: fetch order history (active | past) ───────────────────────
  const fetchTrigV2Orders = async (state = "active") => {
    if (!walletFull) { push("ai", "Connect your wallet first."); return; }
    setTrigOrdersLoading(true);
    try {
      const data = await trigV2Fetch(`${JUP_TV2}/orders/history?state=${state}&limit=30&offset=0`);
      const orders = Array.isArray(data?.orders) ? data.orders : [];
      setTrigV2Orders(orders);
      setShowTrigOrders(true);
      if (!orders.length) push("ai", `No ${state} trigger orders found.`);
    } catch (err) {
      push("ai", "Could not fetch trigger orders: " + (err?.message || "Unknown error"));
    }
    setTrigOrdersLoading(false);
  };

  // ── Trigger v2: cancel order (2-step: initiate → sign withdrawal → confirm) ─
  const cancelTrigV2Order = async (orderId) => {
    if (!orderId || !walletFull) return;
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found."); return; }
    try {
      // Step 1: initiate cancellation (moves order to ready_to_cancel)
      const cancelRes = await trigV2Fetch(`${JUP_TV2}/orders/price/cancel/${orderId}`, { method: "POST" });
      if (cancelRes.error) throw new Error(cancelRes.error?.message || cancelRes.error);
      if (!cancelRes.transaction) throw new Error("No withdrawal transaction returned.");
      // Step 2: sign withdrawal tx
      const binaryStr = atob(cancelRes.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      const signedTx = await provider.signTransaction(tx);
      const signedB64 = bytesToB64(signedTx.serialize());
      // Step 3: confirm cancellation
      const confirmRes = await trigV2Fetch(`${JUP_TV2}/orders/price/confirm-cancel/${orderId}`, {
        method: "POST",
        body: { signedTransaction: signedB64, cancelRequestId: cancelRes.requestId },
      });
      if (confirmRes.error) throw new Error(confirmRes.error?.message || confirmRes.error);
      push("ai", `Order cancelled ✓  Funds returned to vault.\n[View on Solscan →](https://solscan.io/tx/${confirmRes.txSignature})`);
      setTrigV2Orders(prev => prev.filter(o => o.id !== orderId));
    } catch (err) {
      push("ai", "Cancel failed: " + (err?.message || "Unknown error"));
    }
  };

  // ── Recurring / DCA order — create & execute ────────────────────────────────
  // POST /recurring/v1/createOrder → { requestId, transaction }
  // POST /recurring/v1/execute     → { status, signature, order }
  const doRecurring = async () => {
    const { fromMint, fromDecimals, toMint, amountPerCycle, numberOfOrders, intervalSecs } = recurringCfg;
    if (!amountPerCycle || !numberOfOrders || !intervalSecs) return;
    if (!walletFull) { push("ai", "Connect your wallet first to set up a recurring order."); return; }
    if (!fromMint || !toMint) { push("ai", "Could not resolve token mints. Use the dropdowns to select tokens."); return; }

    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    // Jupiter requires: minimum $50 USD per cycle AND $100 USD total (numberOfOrders * amountPerCycle)
    // For stablecoins, use price=1 exactly to avoid floating point rejections (e.g. USDC at $0.9998)
    const MIN_CYCLE_USD  = 50;
    const MIN_TOTAL_USD  = 100;
    const amtNum = parseFloat(amountPerCycle);
    const fromSymUpper = recurringCfg.from?.toUpperCase() || "USDC";
    const isStable = ["USDC","USDT","JUPUSD","DAI","BUSD","USDH","UXD"].includes(fromSymUpper);
    const tokenPriceUSD = isStable ? 1 : (prices[fromSymUpper] || null);
    const cycleValueUSD = tokenPriceUSD ? amtNum * tokenPriceUSD : amtNum;
    const totalValueUSD = cycleValueUSD * parseInt(numberOfOrders || 1);
    if (cycleValueUSD < MIN_CYCLE_USD) {
      setRecurringStatus("error");
      push("ai", `Jupiter requires at least **$${MIN_CYCLE_USD} per order** for recurring orders.\n\nYou entered **${amtNum} ${fromSymUpper}** per order (~$${cycleValueUSD.toFixed(2)}). Please increase to at least $${MIN_CYCLE_USD} worth.`);
      setRecurringStatus(null);
      return;
    }
    if (totalValueUSD < MIN_TOTAL_USD) {
      setRecurringStatus("error");
      push("ai", `Jupiter requires a **minimum $${MIN_TOTAL_USD} total** across all orders.\n\nYour total is ~$${totalValueUSD.toFixed(2)} (${numberOfOrders} orders × $${cycleValueUSD.toFixed(2)}). Add more orders or increase the amount per order.`);
      setRecurringStatus(null);
      return;
    }

    setRecurringStatus("signing");
    try {
      // Jupiter's inAmount = TOTAL deposit. It divides by numberOfOrders internally for per-cycle amount.
      const numOrders = parseInt(numberOfOrders);
      const totalAmount = parseFloat(amountPerCycle) * numOrders;
      const amountRaw = Math.floor(totalAmount * Math.pow(10, fromDecimals || 6));
      const orderRes = await jupFetch(`${JUP_RECUR_BASE}/createOrder`, {
        method: "POST",
        body: {
          user: walletFull,
          inputMint: fromMint,
          outputMint: toMint,
          params: {
            time: {
              inAmount: amountRaw,
              numberOfOrders: numOrders,
              interval: parseInt(intervalSecs),
            }
          }
        }
      });
      if (orderRes.error) throw new Error(typeof orderRes.error === "object" ? JSON.stringify(orderRes.error) : orderRes.error);
      if (!orderRes.transaction) throw new Error("No transaction returned from Jupiter Recurring API.");

      const binaryStr = atob(orderRes.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing.");
      const signedTx = await provider.signTransaction(tx);
      const signedBase64 = bytesToB64(signedTx.serialize());

      const execRes = await jupFetch(`${JUP_RECUR_BASE}/execute`, {
        method: "POST",
        body: { requestId: orderRes.requestId, signedTransaction: signedBase64 }
      });
      if (execRes.error) throw new Error(typeof execRes.error === "object" ? JSON.stringify(execRes.error) : execRes.error);
      if (execRes.status === "Failed") throw new Error("Transaction failed on-chain.");

      const sig = execRes.signature;
      const totalSpend = (parseFloat(amountPerCycle) * parseInt(numberOfOrders)).toFixed(2);
      const intervalLabel = { "60":"minute","300":"5 min","3600":"hour","86400":"day","604800":"week","2592000":"month" }[intervalSecs] || `${intervalSecs}s`;
      setRecurringStatus("done");
      setShowRecurring(false);
      push("ai", `Recurring order created ✓

**${recurringCfg.from} → ${recurringCfg.to}**
${amountPerCycle} ${recurringCfg.from} every ${intervalLabel} × ${numberOfOrders} times
Total spend: **${totalSpend} ${recurringCfg.from}**

Transaction: \`${sig?.slice(0,20)}…\`

[View on Solscan →](https://solscan.io/tx/${sig})`);
    } catch (err) {
      setRecurringStatus("error");
      push("ai", `Recurring order failed: ${err?.message || "Unknown error"}. Please check your balance and try again.`);
    }
    setRecurringStatus(null);
  };

  // ── Fetch open/history recurring orders ─────────────────────────────────────
  // GET /recurring/v1/getRecurringOrders?user=&recurringType=time&orderStatus=active
  const fetchRecurringOrders = async (status = "active") => {
    if (!walletFull) { push("ai", "Connect your wallet first to view recurring orders."); return; }
    setRecurringOrdersLoading(true);
    try {
      const data = await jupFetch(`${JUP_RECUR_BASE}/getRecurringOrders?user=${walletFull}&recurringType=time&orderStatus=${status}&page=1&includeFailedTx=false`);
      const orders = Array.isArray(data?.time) ? data.time : [];
      setRecurringOrders(orders);
      setShowRecurringOrders(true);
      if (!orders.length) push("ai", `No ${status} recurring orders found for your wallet.`);
    } catch (err) {
      push("ai", `Could not fetch recurring orders: ${err?.message || "Unknown error"}.`);
    }
    setRecurringOrdersLoading(false);
  };

  // ── Cancel a recurring order ─────────────────────────────────────────────────
  // POST /recurring/v1/cancelOrder → { requestId, transaction }
  // POST /recurring/v1/execute     → { status, signature }
  const cancelRecurringOrder = async (orderKey) => {
    if (!walletFull || !orderKey) return;
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }
    try {
      const cancelRes = await jupFetch(`${JUP_RECUR_BASE}/cancelOrder`, {
        method: "POST",
        body: { order: orderKey, recurringType: "time", user: walletFull }
      });
      if (cancelRes.error) throw new Error(typeof cancelRes.error === "object" ? JSON.stringify(cancelRes.error) : cancelRes.error);
      if (!cancelRes.transaction) throw new Error("No transaction returned for cancellation.");

      const binaryStr = atob(cancelRes.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      const signedTx = await provider.signTransaction(tx);
      const signedBase64 = bytesToB64(signedTx.serialize());

      const execRes = await jupFetch(`${JUP_RECUR_BASE}/execute`, {
        method: "POST",
        body: { requestId: cancelRes.requestId, signedTransaction: signedBase64 }
      });
      if (execRes.error) throw new Error(typeof execRes.error === "object" ? JSON.stringify(execRes.error) : execRes.error);
      if (execRes.status === "Failed") throw new Error("Cancellation transaction failed.");

      push("ai", `Recurring order cancelled ✓

Order: \`${orderKey.slice(0,20)}…\`
[View on Solscan →](https://solscan.io/tx/${execRes.signature})`);
      // Refresh the orders list
      setRecurringOrders(prev => prev.filter(o => o.orderKey !== orderKey));
    } catch (err) {
      push("ai", `Cancel failed: ${err?.message || "Unknown error"}.`);
    }
  };

  // ── Push message helper ─────────────────────────────────────────────────────
  const push = (role, text, extra={}) => {
    const id = Date.now() + Math.random();
    setMsgs(m => {
      const next = [...m, { id, role, text, ...extra }];
      try { sessionStorage.setItem("chatfi-msgs", JSON.stringify(next.slice(-80))); } catch {}
      return next;
    });
    return id;
  };

  // ── Reown connection sync ────────────────────────────────────────────────────
  // Keeps local wallet/walletFull state in sync with Reown's connected account.
  useEffect(() => {
    if (privyMode) return; // Privy is active — Reown changes should not override
    if (reownConnected && reownAddress) {
      const justConnected = !prevConnectedRef.current;
      prevConnectedRef.current = true;
      const display = reownAddress.slice(0,4) + "…" + reownAddress.slice(-4);
      setWallet(display);
      setWalletFull(reownAddress);
      if (reownProvider) connectedProviderRef.current = reownProvider;
      // Capture connected wallet name for logo display in header
      const wName = reownProvider?.walletInfo?.name || reownProvider?.name || reownProvider?.walletName || null;
      setConnectedWalletName(wName);
      fetchSolanaBalances(reownAddress).then(balances => {
        setPortfolio(balances);
        if (justConnected) {
          fetchPrices().then(live => {
            const solUSD = balances.SOL && live.SOL
              ? ` (~$${(balances.SOL * live.SOL).toFixed(2)})`
              : "";
            push("ai",
              `Wallet connected ✓\n\nBalance: **${(balances.SOL||0).toFixed(4)} SOL**${solUSD}` +
              Object.entries(balances).filter(([k])=>k!=="SOL")
                .map(([k,v])=>`\n${k}: ${v<1?v.toFixed(6):v.toFixed(2)}`).join("") +
              "\n\nWhat would you like to do?"
            );
          }).catch(()=>{});
        }
      }).catch(()=>{});
    } else if (!reownConnected && prevConnectedRef.current) {
      prevConnectedRef.current = false;
      connectedProviderRef.current = null;
      setWallet(null);
      setWalletFull(null);
      setConnectedWalletName(null);
      setPortfolio({});
      push("ai", "Wallet disconnected. Connect again anytime to access your portfolio and trading features.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reownConnected, reownAddress, reownProvider, privyMode]);

  // ── Privy connection sync ─────────────────────────────────────────────────
  useEffect(() => {
    if (!privyReady) return;
    // If authenticated but no Solana wallet found yet, silently wait —
    // Privy creates it async; privyWallets will update and re-trigger this effect.
    if (privyAuthed && !privyEmbeddedWallet) {
      return;
    }
    if (privyAuthed && privyEmbeddedWallet) {
      const address = privyEmbeddedWallet.address;
      const justConnected = !privyMode;
      setPrivyMode(true);
      prevConnectedRef.current = true;
      const provider = privyUser?.google?.email ? "google" : privyUser?.twitter?.username ? "twitter" : privyUser?.discord?.username ? "discord" : "email";
      setPrivyProvider(provider);
      const display = address.slice(0,4) + "…" + address.slice(-4);
      setWallet(display);
      setWalletFull(address);
      setConnectedWalletName(privyUser?.email?.address || privyUser?.google?.email || privyUser?.twitter?.username || "Social Account");
      // Build provider shim using Privy embedded wallet's sign methods
      const privyProvider = {
        signTransaction: async (tx) => privyEmbeddedWallet.signTransaction(tx),
        signAllTransactions: async (txs) => Promise.all(txs.map(tx => privyEmbeddedWallet.signTransaction(tx))),
        // signMessage needed for Jupiter Trigger v2 JWT auth
        signMessage: async (msg) => {
          const result = await privyEmbeddedWallet.signMessage(msg);
          // Privy returns { signature: Uint8Array } — normalise to match Phantom's shape
          return result?.signature instanceof Uint8Array ? result : { signature: result };
        },
        publicKey: { toBytes: () => new PublicKey(privyEmbeddedWallet.address).toBytes() },
      };
      connectedProviderRef.current = privyProvider;
      fetchSolanaBalances(address).then(balances => {
        setPortfolio(balances);
        if (justConnected) {
          fetchPrices().then(live => {
            const solUSD = balances.SOL && live.SOL ? (balances.SOL * live.SOL).toFixed(2) : null;
            const emailLabel = privyUser?.email?.address || privyUser?.google?.email || privyUser?.twitter?.username || "your account";
            const provider = privyUser?.google?.email ? "google" : privyUser?.twitter?.username ? "twitter" : privyUser?.discord?.username ? "discord" : "email";
            const tokens = Object.entries(balances).filter(([k])=>k!=="SOL").map(([k,v])=>({ symbol:k, amount: v<1?v.toFixed(6):v.toFixed(2) }));
            push("ai", "", {
              walletCard: {
                emailLabel,
                address,
                display,
                provider,
                solBalance: (balances.SOL||0).toFixed(4),
                solUSD,
                tokens,
              }
            });
          }).catch(()=>{});
        }
      }).catch(()=>{});
    } else if (privyMode && !privyAuthed) {
      setPrivyMode(false);
      setPrivyProvider(null);
      prevConnectedRef.current = false;
      connectedProviderRef.current = null;
      setWallet(null);
      setWalletFull(null);
      setConnectedWalletName(null);
      setPortfolio({});
      push("ai", "Signed out. Connect again anytime.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privyReady, privyAuthed, privyEmbeddedWallet, privyUser]);

  // ── Send message to Claude ──────────────────────────────────────────────────
  // ── Mirror-trade event: triggered by Copy Trade "Mirror" button ─────────────
  useEffect(() => {
    const handler = (e) => {
      const { from, to, amount } = e.detail || {};
      if (from && to && amount) {
        send(`Swap ${amount} ${from} to ${to}`);
      }
    };
    window.addEventListener("chatfi-mirror-trade", handler);
    return () => window.removeEventListener("chatfi-mirror-trade", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // ── POWER COMMANDS — parallel multi-API orchestrator ─────────────────────
  // Each command fires 3-4 Jupiter API calls via Promise.allSettled, then asks
  // Claude to synthesise the results into one sharp message + action buttons.
  // ══════════════════════════════════════════════════════════════════════════

  const POWER_COMMANDS = [
    { trigger: /^(smart[\s-]?entry|best[\s-]?entry|how[\s-]?(should|do)[\s-]?i[\s-]?buy|best[\s-]?way[\s-]?(to[\s-]?)?enter|best[\s-]?way[\s-]?(to[\s-]?)?buy)\s+(\w+)/i, id: "SMART_ENTRY" },
    { trigger: /^(exit[\s-]?(my\s+)?|best[\s-]?way[\s-]?(to[\s-]?)?exit\s+|exit[\s-]?strategy[\s-]?)(\w+)/i,                                                               id: "EXIT_STRATEGY" },
    { trigger: /^(deep[\s-]?dive|full[\s-]?analysis|research|analyse|analyze|tell[\s-]?me[\s-]?everything[\s-]?about|breakdown)\s+(\w+)/i,                                  id: "DEEP_DIVE" },
    { trigger: /^(morning[\s-]?brief(ing)?|portfolio[\s-]?pulse|how[\s-]?(is|'?s)[\s-]?my[\s-]?portfolio(\s+doing)?|daily[\s-]?brief)/i,                                   id: "PORTFOLIO_PULSE" },
  ];

  const POWER_STOP_WORDS = new Set(["my","all","i","the","me","to","best","way","enter","exit","should","do","full","about","everything","how","is","analysis","research","brief","briefing","morning","daily","portfolio","pulse","analyse","analyze","strategy","doing"]);

  const detectPowerCommand = (raw) => {
    for (const cmd of POWER_COMMANDS) {
      const m = raw.match(cmd.trigger);
      if (m) {
        const sym = [...m].reverse().find(g => g && /^[A-Za-z]{2,10}$/.test(g) && !POWER_STOP_WORDS.has(g.toLowerCase()));
        return { id: cmd.id, token: sym?.toUpperCase() || null };
      }
    }
    return null;
  };

  const executePowerCommand = async (cmdId, token, rawMsg) => {
    setTyping(true);
    push("user", rawMsg);
    setInput("");
    histRef.current = [...histRef.current, { role:"user", content:rawMsg }];

    // Resolve token mint
    let mint = token ? (tokenCacheRef.current[token] || TOKEN_MINTS[token]) : null;
    if (token && !mint) {
      const r = await resolveToken(token);
      if (r) { mint = r.mint; tokenCacheRef.current[token] = r.mint; tokenDecimalsRef.current[token] = r.decimals; }
    }

    try {
      let gathered = {};

      // ── SMART ENTRY: price + metadata + trending rank + swap quote ────────
      if (cmdId === "SMART_ENTRY" && token) {
        const [priceRes, tokenRes, trendRes, quoteRes] = await Promise.allSettled([
          fetch(`${JUP_PRICE_API}?ids=${mint||token}&showExtraInfo=true`).then(r=>r.json()),
          fetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(token)}&limit=1`).then(r=>r.json()),
          fetch(`${JUP_TOKEN_CAT}/toptrending/24h?limit=50`).then(r=>r.json()),
          (() => {
            const toMint = mint || TOKEN_MINTS[token] || "";
            if (!toMint) return Promise.resolve(null);
            return fetch(`${JUP_SWAP_ORDER}?inputMint=${TOKEN_MINTS.USDC}&outputMint=${toMint}&amount=${100*1e6}&taker=${walletFull||""}`).then(r=>r.json());
          })(),
        ]);

        const priceData  = priceRes.status==="fulfilled"  ? priceRes.value  : null;
        const tokenArr   = tokenRes.status==="fulfilled"  ? (Array.isArray(tokenRes.value) ? tokenRes.value : tokenRes.value?.tokens||tokenRes.value?.data||[]) : [];
        const trendArr   = trendRes.status==="fulfilled"  ? (Array.isArray(trendRes.value) ? trendRes.value : trendRes.value?.tokens||trendRes.value?.data||[]) : [];
        const quoteData  = quoteRes.status==="fulfilled"  ? quoteRes.value  : null;

        const priceInfo  = priceData?.[mint] || priceData?.[Object.keys(priceData||{})[0]] || null;
        const meta       = tokenArr[0] || null;
        const trendRank  = trendArr.findIndex(t=>t.symbol?.toUpperCase()===token||t.mint===mint)+1||null;
        const outDecimals = tokenDecimalsRef.current[token]||9;
        const outAmt     = quoteData?.outAmount ? (parseInt(quoteData.outAmount)/Math.pow(10,outDecimals)).toFixed(4) : null;

        gathered = {
          type:"SMART_ENTRY", token,
          price:       priceInfo?.usdPrice || priceInfo?.price,
          change24h:   priceInfo?.priceChange24h ?? priceInfo?.extraInfo?.priceChange24h,
          isVerified:  meta?.isVerified,
          organicScore:meta?.organicScore,
          isSus:       meta?.audit?.isSus,
          trendRank,   trendTotal: trendArr.length,
          outAmt,      quoteValid: !!quoteData && !quoteData.error,
        };
      }

      // ── EXIT STRATEGY: price + trending + sell quote + route breakdown ────
      else if (cmdId === "EXIT_STRATEGY" && token) {
        const userBal    = portfolio[token]||0;
        const inDecimals = tokenDecimalsRef.current[token]||9;
        const amtRaw     = userBal>0 ? Math.floor(userBal*Math.pow(10,inDecimals)) : Math.pow(10,inDecimals);
        const fromMint   = mint || TOKEN_MINTS[token] || "";

        const [priceRes, trendRes, quoteRes, routeRes] = await Promise.allSettled([
          fetch(`${JUP_PRICE_API}?ids=${mint||token}&showExtraInfo=true`).then(r=>r.json()),
          fetch(`${JUP_TOKEN_CAT}/toptrading/24h?limit=50`).then(r=>r.json()),
          fromMint ? fetch(`${JUP_SWAP_ORDER}?inputMint=${fromMint}&outputMint=${TOKEN_MINTS.USDC}&amount=${amtRaw}&taker=${walletFull||""}`).then(r=>r.json()) : Promise.resolve(null),
          fromMint ? fetch(`${JUP_ROUTE_API}?inputMint=${fromMint}&outputMint=${TOKEN_MINTS.USDC}&amount=${Math.pow(10,inDecimals)}&slippageBps=50`).then(r=>r.json()) : Promise.resolve(null),
        ]);

        const priceData  = priceRes.status==="fulfilled" ? priceRes.value : null;
        const trendArr   = trendRes.status==="fulfilled" ? (Array.isArray(trendRes.value) ? trendRes.value : trendRes.value?.tokens||trendRes.value?.data||[]) : [];
        const quoteData  = quoteRes.status==="fulfilled" ? quoteRes.value : null;
        const routeData  = routeRes.status==="fulfilled" ? routeRes.value : null;

        const priceInfo  = priceData?.[mint]||priceData?.[Object.keys(priceData||{})[0]]||null;
        const price      = priceInfo?.usdPrice||priceInfo?.price;
        const trendRank  = trendArr.findIndex(t=>t.symbol?.toUpperCase()===token||t.mint===mint)+1||null;
        const usdcOut    = quoteData?.outAmount ? (parseInt(quoteData.outAmount)/1e6).toFixed(2) : null;
        const priceImpact= routeData?.priceImpactPct ? (parseFloat(routeData.priceImpactPct)*100).toFixed(3) : null;
        const dexPath    = routeData?.routePlan?.map(r=>r.swapInfo?.label||r.swapInfo?.ammKey?.slice(0,8)).filter(Boolean).join(" → ")||null;

        gathered = {
          type:"EXIT_STRATEGY", token, price,
          change24h:   priceInfo?.priceChange24h ?? priceInfo?.extraInfo?.priceChange24h,
          userBal, usdcOut, trendRank, priceImpact, dexPath,
          limitSuggestion: price ? (price*1.03).toFixed(4) : null,
          quoteValid: !!quoteData && !quoteData.error,
        };
      }

      // ── DEEP DIVE: metadata + price + organic rank + route/liquidity ──────
      else if (cmdId === "DEEP_DIVE" && token) {
        const [infoRes, priceRes, trendRes, routeRes] = await Promise.allSettled([
          fetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(token)}&limit=1`).then(r=>r.json()),
          fetch(`${JUP_PRICE_API}?ids=${mint||token}&showExtraInfo=true`).then(r=>r.json()),
          fetch(`${JUP_TOKEN_CAT}/toporganicscore/24h?limit=100`).then(r=>r.json()),
          (() => {
            const toMint = mint||TOKEN_MINTS[token]||"";
            if (!toMint) return Promise.resolve(null);
            return fetch(`${JUP_ROUTE_API}?inputMint=${TOKEN_MINTS.USDC}&outputMint=${toMint}&amount=${100*1e6}&slippageBps=50`).then(r=>r.json());
          })(),
        ]);

        const tokenArr   = infoRes.status==="fulfilled"  ? (Array.isArray(infoRes.value) ? infoRes.value : infoRes.value?.tokens||infoRes.value?.data||[]) : [];
        const priceData  = priceRes.status==="fulfilled"  ? priceRes.value  : null;
        const trendArr   = trendRes.status==="fulfilled"  ? (Array.isArray(trendRes.value) ? trendRes.value : trendRes.value?.tokens||trendRes.value?.data||[]) : [];
        const routeData  = routeRes.status==="fulfilled"  ? routeRes.value  : null;

        const meta       = tokenArr[0]||null;
        const priceInfo  = priceData?.[mint]||priceData?.[Object.keys(priceData||{})[0]]||null;
        const price      = priceInfo?.usdPrice||priceInfo?.price;
        const organicRank= trendArr.findIndex(t=>t.symbol?.toUpperCase()===token||t.mint===mint)+1||null;
        const priceImpact= routeData?.priceImpactPct ? (parseFloat(routeData.priceImpactPct)*100).toFixed(3) : null;
        const dexPath    = routeData?.routePlan?.map(r=>r.swapInfo?.label).filter(Boolean).join(" → ")||null;

        gathered = {
          type:"DEEP_DIVE", token, price,
          change24h:   priceInfo?.priceChange24h,
          isVerified:  meta?.isVerified,
          organicScore:meta?.organicScore,
          isSus:       meta?.audit?.isSus,
          freezeAuth:  !!meta?.freezeAuthority,
          mintAuth:    !!meta?.mint_authority,
          holders:     meta?.holderCount,
          liquidity:   meta?.liquidity,
          mcap:        meta?.market_cap,
          fdv:         meta?.fdv,
          dailyVol:    meta?.daily_volume,
          buys24h:     meta?.numBuys24h,
          sells24h:    meta?.numSells24h,
          organicRank, totalInRank: trendArr.length,
          priceImpact, dexPath,
          tags:        meta?.tags||[],
        };

        // Open token card alongside
        if (meta) { setTokenCardData({ ...meta, usdPrice:price, priceChange24h:priceInfo?.priceChange24h }); setShowTokenCard(true); }
      }

      // ── PORTFOLIO PULSE: portfolio + earn positions + open DCA orders ─────
      else if (cmdId === "PORTFOLIO_PULSE") {
        if (!walletFull) {
          push("ai","Connect your wallet first — then ask for your portfolio pulse.");
          setTyping(false);
          return;
        }

        const [portRes, earnRes, recurRes] = await Promise.allSettled([
          fetch(`${JUP_PORTFOLIO}/positions/${walletFull}`).then(r=>r.json()),
          fetch(`${JUP_EARN_API}/positions?wallets=${walletFull}`).then(r=>r.json()),
          fetch(`${JUP_RECUR_BASE}/getRecurringOrders?user=${walletFull}&orderStatus=active`).then(r=>r.json()),
        ]);

        const portItems  = portRes.status==="fulfilled"  ? (Array.isArray(portRes.value) ? portRes.value : portRes.value?.data||portRes.value?.elements||[]) : [];
        const earnArr    = earnRes.status==="fulfilled"  ? (Array.isArray(earnRes.value) ? earnRes.value : earnRes.value?.data||earnRes.value?.positions||[]) : [];
        const recurArr   = recurRes.status==="fulfilled" ? (Array.isArray(recurRes.value) ? recurRes.value : recurRes.value?.data||recurRes.value?.orders||[]) : [];

        const totalUSD   = portItems.reduce((s,el)=>s+(parseFloat(el.value)||0),0);
        const activeEarn = earnArr.filter(e=>parseFloat(e.underlyingAssets||e.amount||e.value||0)>0);
        const spotTokens = Object.entries(portfolio)
          .filter(([,v])=>v>0)
          .map(([sym,amt])=>({ sym, amt, usd:prices[sym]?(amt*prices[sym]).toFixed(2):null }))
          .sort((a,b)=>parseFloat(b.usd||0)-parseFloat(a.usd||0))
          .slice(0,6);
        const idleTotal  = (portfolio.USDC||0)+(portfolio.USDT||0);

        gathered = {
          type:"PORTFOLIO_PULSE",
          totalUSD:    totalUSD.toFixed(2),
          spotTokens,
          activeEarn:  activeEarn.length,
          openDCA:     recurArr.length,
          idleStable:  idleTotal>5 ? idleTotal.toFixed(2) : null,
        };
      }

      // ── Claude synthesis: turn raw data into one sharp message ─────────────
      const synthPrompt = buildPowerSynthesisPrompt(cmdId, gathered, token);
      const synthRes = await fetch("/api/claude", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:500,
          system:`You are ChatFi, a sharp DeFi AI on Jupiter/Solana. Write a concise synthesis of live data pulled from Jupiter's APIs. Use **bold** for numbers and token names. Use bullet points sparingly. Max 180 words. No hype. No emojis. Plain text only — no JSON.`,
          messages:[{ role:"user", content:synthPrompt }],
        }),
      });
      const synthData = await synthRes.json();
      const synthesis = synthData?.content?.[0]?.text || "Here's what I found:";

      histRef.current = [...histRef.current, { role:"assistant", content:synthesis }];
      try { sessionStorage.setItem("chatfi-hist", JSON.stringify(histRef.current.slice(-40))); } catch {}

      push("ai", synthesis, { powerCommand:{ id:cmdId, token, gathered } });

    } catch(err) {
      push("ai", `Power command failed: ${err?.message||"Unknown error"}. Try again.`);
    }
    setTyping(false);
  };

  const buildPowerSynthesisPrompt = (cmdId, d, token) => {
    if (cmdId==="SMART_ENTRY") return `
Live Jupiter data for ${token} smart entry:
- Price: ${d.price!=null?`$${Number(d.price).toFixed(d.price<1?6:4)}`:"unavailable"}
- 24h change: ${d.change24h!=null?`${d.change24h>0?"+":""}${d.change24h.toFixed(2)}%`:"unavailable"}
- Jupiter verified: ${d.isVerified?"Yes":"No"}
- Organic score: ${d.organicScore!=null?d.organicScore:"unavailable"}
- Suspicious flags: ${d.isSus?"Yes — caution":"None"}
- Trending rank: ${d.trendRank?`#${d.trendRank} of ${d.trendTotal} trending`:"not in top 50"}
- $100 USDC buys: ${d.outAmt?`${d.outAmt} ${token}`:"quote unavailable"}

Write a sharp smart entry analysis (max 150 words). Should they market buy, set a limit order below current price, or DCA? Give a concrete recommendation. End with: "Options: market buy now · set a limit order · DCA in"`;

    if (cmdId==="EXIT_STRATEGY") return `
Live Jupiter data for ${token} exit strategy:
- Price: ${d.price!=null?`$${Number(d.price).toFixed(d.price<1?6:4)}`:"unavailable"}
- 24h momentum: ${d.change24h!=null?`${d.change24h>0?"+":""}${d.change24h.toFixed(2)}%`:"unavailable"}
- User holds: ${d.userBal>0?`${d.userBal.toFixed(4)} ${token}`:"unknown / zero"}
- Market sell value: ${d.usdcOut?`$${d.usdcOut} USDC`:"unavailable"}
- Price impact: ${d.priceImpact?`${d.priceImpact}%`:"unavailable"}
- Route: ${d.dexPath||"unavailable"}
- Trending rank: ${d.trendRank?`#${d.trendRank} in top traded`:"not trending"}
- Limit sell suggestion (+3%): ${d.limitSuggestion?`$${d.limitSuggestion}`:"unavailable"}

Write a sharp exit analysis (max 150 words). Is momentum good or bad? Market sell, limit sell at a higher price, or hold? End with: "Options: market sell · limit sell +3% · OCO bracket"`;

    if (cmdId==="DEEP_DIVE") return `
Full Jupiter data for ${token} deep dive:
- Price: ${d.price!=null?`$${Number(d.price).toFixed(d.price<1?6:4)}`:"N/A"} | 24h: ${d.change24h!=null?`${d.change24h>0?"+":""}${d.change24h.toFixed(2)}%`:"N/A"}
- Verified: ${d.isVerified?"Yes":"No"} | Suspicious: ${d.isSus?"Yes — caution!":"No"}
- Freeze authority: ${d.freezeAuth?"Active (risk)":"Disabled"} | Mint authority: ${d.mintAuth?"Active (risk)":"Disabled"}
- Organic score: ${d.organicScore!=null?`${d.organicScore}/100`:"N/A"} | Organic rank: ${d.organicRank?`#${d.organicRank} of ${d.totalInRank}`:"outside top 100"}
- Liquidity: ${d.liquidity?`$${Number(d.liquidity).toLocaleString()}`:"N/A"}
- Market cap: ${d.mcap?`$${Number(d.mcap).toLocaleString()}`:"N/A"} | FDV: ${d.fdv?`$${Number(d.fdv).toLocaleString()}`:"N/A"}
- 24h volume: ${d.dailyVol?`$${Number(d.dailyVol).toLocaleString()}`:"N/A"}
- Holders: ${d.holders?Number(d.holders).toLocaleString():"N/A"}
- Buys/Sells 24h: ${d.buys24h||"N/A"} / ${d.sells24h||"N/A"}
- Price impact ($100): ${d.priceImpact?`${d.priceImpact}%`:"N/A"} via ${d.dexPath||"N/A"}
- Tags: ${d.tags.join(", ")||"none"}

Write a sharp, honest deep dive (max 170 words). Cover safety verdict, price momentum, liquidity health, and overall verdict (Buy / Watch / Avoid). End with: "Options: buy · set price alert · show swap route"`;

    if (cmdId==="PORTFOLIO_PULSE") return `
Live portfolio snapshot for connected wallet:
- Estimated DeFi value: $${d.totalUSD}
- Top holdings: ${d.spotTokens.map(t=>`${t.sym} ${Number(t.amt).toFixed?Number(t.amt).toFixed(2):t.amt}${t.usd?` ($${t.usd})`:""}`).join(", ")||"none"}
- Active earn positions: ${d.activeEarn}
- Open DCA orders: ${d.openDCA}
- Idle stablecoins: ${d.idleStable?`$${d.idleStable} USDC/USDT sitting idle`:"none detected"}

Write a sharp portfolio pulse (max 150 words): total value, biggest positions, orders status, idle capital. If idle stables detected, flag it as an opportunity. End with: "Options: deposit idle to earn · view full portfolio · check open orders"`;

    return `Summarise this live data for the user in 100 words: ${JSON.stringify(d)}`;
  };

  const send = async (override) => {
    const raw = (override ?? input).trim();
    if (!raw || typing) return;

    // ── Power Command intercept (runs before Claude call) ────────────────────
    const powerCmd = detectPowerCommand(raw);
    if (powerCmd) {
      await executePowerCommand(powerCmd.id, powerCmd.token, raw);
      return;
    }

    // ── Keyword shortcuts — handled client-side, never sent to Claude ─────────
    const lower = raw.toLowerCase().trim();

    // "refresh" / "reload" — save chat then reload page
    if (lower === "refresh" || lower === "reload" || lower === "refresh page" || lower === "reload page") {
      setInput("");
      push("user", raw);
      push("ai", "Refreshing the page now… Your chat will be restored. <svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:middle;margin-left:3px'><path d='M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'/><path d='M21 3v5h-5'/><path d='M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'/><path d='M8 16H3v5'/></svg>");
      setTimeout(() => window.location.reload(), 800);
      return;
    }

    // "delete chat" / "clear chat" / "new chat" — wipe chat history
    if (lower === "delete chat" || lower === "clear chat" || lower === "new chat" || lower === "clear conversation" || lower === "delete conversation" || lower === "delete messages" || lower === "clear messages" || lower === "delete all messages" || lower === "clear all messages") {
      setInput("");
      push("user", raw);
      histRef.current = [];
      try { sessionStorage.removeItem("chatfi-msgs"); } catch {}
      setMsgs([INITIAL_MSG]);
      return;
    }

    // "disconnect wallet" / "disconnect" / "sign out"
    if (lower === "disconnect wallet" || lower === "disconnect" || lower === "sign out" || lower === "signout" || lower === "logout" || lower === "log out") {
      setInput("");
      push("user", raw);
      disconnectWallet();
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    setInput("");
    push("user", raw);
    setTyping(true);
    setShowSwap(false); setShowPred(false); setShowTrig(false); setShowTrigV2(false); setShowTrigOrders(false); setShowRecurring(false); setShowRecurringOrders(false);
    setShowPredList(false); setShowEarn(false); setShowEarnDeposit(false); setShowBet(false); setShowMultiply(false); setShowBorrow(false);
    setShowSend(false); setShowPortfolio(false); setShowPerpsPos(false); setShowPerps(false);
    setShowTokenCard(false); setTokenCardData(null);

    histRef.current = [...histRef.current, { role:"user", content:raw }];
    try { sessionStorage.setItem("chatfi-hist", JSON.stringify(histRef.current.slice(-40))); } catch {}

    try {
      const res = await fetch("/api/claude", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: jupDocs
            ? `## Jupiter Official API Documentation (llms-full.txt)\n\n${jupDocs}\n\n---\n\n${SYSTEM_PROMPT}`
            : SYSTEM_PROMPT,
          messages: histRef.current,
        }),
      });
      const data = await res.json();
      const rawText = data?.content?.[0]?.text || '{"text":"Sorry, something went wrong.","action":null,"actionData":{}}';

      let parsed;
      try {
        const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        parsed = JSON.parse(cleanText);
      }
      catch { parsed = { text:rawText, action:null, actionData:{} }; }

      const { text, action, actionData } = parsed;
      histRef.current = [...histRef.current, { role:"assistant", content:rawText }];
      try { sessionStorage.setItem("chatfi-hist", JSON.stringify(histRef.current.slice(-40))); } catch {}

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
          push("ai", text);
          setTokenCardData(info);
          setShowTokenCard(true);
        }

      } else if (action === "FETCH_PORTFOLIO") {
        const addr = actionData?.wallet === "address_or_connected" ? walletFull : actionData?.wallet;
        if (!addr) {
          push("ai", text + "\n\nConnect your wallet first so I can pull your portfolio.");
        } else {
          push("ai", text);
          setPortfolioLoading(true);
          setShowPortfolio(true);
          setPortfolioData(null);
          const pData = await fetchPortfolioData(addr);
          // Merge reliable known logos (TOKEN_LOGO_URLS) with any logos fetched by the API
          const mergedLogoMap = { ...TOKEN_LOGO_URLS, ...(pData?.logoMap || {}) };
          setPortfolioData({ ...pData, wallet: addr, walletBalances: pData?.walletBalances || portfolio, solBalance: pData?.walletBalances || portfolio, logoMap: mergedLogoMap, mintMap: pData?.mintMap || {}, prices });
          setPortfolioLoading(false);
        }

      } else if (action === "SHOW_SWAP") {
        const fromSym = (actionData?.from || "SOL").toUpperCase();
        const toSym   = (actionData?.to   || "JUP").toUpperCase();

        // Resolve a portion string ("all","half","quarter","25%","10%") → token amount using portfolio balance
        const resolvePortion = (portion, sym) => {
          const bal = portfolio[sym] ?? 0;
          if (!bal || bal <= 0) return "";
          const p = (portion || "").toLowerCase().trim();
          if (p === "all")     return bal.toString();
          if (p === "half")    return (bal / 2).toFixed(6).replace(/\.?0+$/, "");
          if (p === "quarter") return (bal / 4).toFixed(6).replace(/\.?0+$/, "");
          // percentage like "25%" or "10%"
          const pctMatch = p.match(/^(\d+(?:\.\d+)?)%$/);
          if (pctMatch) return (bal * parseFloat(pctMatch[1]) / 100).toFixed(6).replace(/\.?0+$/, "");
          return "";
        };

        // Resolve mints — use cache first, fallback to search
        const resolveAndSet = async () => {
          let fromMint = tokenCacheRef.current[fromSym] || TOKEN_MINTS[fromSym];
          let toMint   = tokenCacheRef.current[toSym]   || TOKEN_MINTS[toSym];
          if (!fromMint) {
            const r = await resolveToken(fromSym);
            if (r) { fromMint = r.mint; tokenCacheRef.current[fromSym]=r.mint; tokenDecimalsRef.current[fromSym]=r.decimals; }
          }
          if (!toMint) {
            const r = await resolveToken(toSym);
            if (r) { toMint = r.mint; tokenCacheRef.current[toSym]=r.mint; tokenDecimalsRef.current[toSym]=r.decimals; }
          }
          // Autofill amount — priority: portion > amount > amountUSD
          let autoAmount = "";
          if (actionData?.portion) {
            autoAmount = resolvePortion(actionData.portion, fromSym);
          } else if (actionData?.amount && parseFloat(actionData.amount) > 0) {
            autoAmount = actionData.amount;
          } else if (actionData?.amountUSD && parseFloat(actionData.amountUSD) > 0 && prices[fromSym] > 0) {
            autoAmount = (parseFloat(actionData.amountUSD) / prices[fromSym]).toFixed(6).replace(/\.?0+$/, "");
          } else if (actionData?.amountUSD && parseFloat(actionData.amountUSD) > 0) {
            autoAmount = actionData.amountUSD;
          }
          setSwapCfg({
            from: fromSym, fromMint: fromMint||null, fromDecimals: tokenDecimalsRef.current[fromSym]||9,
            to:   toSym,   toMint:   toMint||null,   toDecimals:   tokenDecimalsRef.current[toSym]||6,
            amount: autoAmount,
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
          // Resolve portion for trigger amount too
          const trigSym = (actionData?.token || "SOL").toUpperCase();
          const trigBal = portfolio[trigSym] ?? 0;
          const trigPortion = actionData?.portion ? (() => {
            const p = actionData.portion.toLowerCase().trim();
            if (p === "all")     return trigBal.toString();
            if (p === "half")    return (trigBal / 2).toFixed(6).replace(/\.?0+$/, "");
            if (p === "quarter") return (trigBal / 4).toFixed(6).replace(/\.?0+$/, "");
            const m = p.match(/^(\d+(?:\.\d+)?)%$/);
            if (m) return (trigBal * parseFloat(m[1]) / 100).toFixed(6).replace(/\.?0+$/, "");
            return "";
          })() : "";
          setTrigCfg(c => ({
            ...c,
            token:       trigSym,
            direction:   actionData?.direction   || "below",
            targetPrice: actionData?.targetPrice || c.targetPrice || "",
            amount:      trigPortion || actionData?.amount || c.amount || "",
          }));
          setShowTrig(true);
          push("ai", text);
        }

      } else if (action === "SHOW_PREDICTION") {
        setPred(actionData);
        setPick(null);
        setShowPred(true);
        push("ai", text);
        // Auto-fetch the live market for this match so the bet panel appears too
        const matchQuery = actionData?.searchQuery
          || [actionData?.teamA, actionData?.teamB].filter(Boolean).join(" ")
          || actionData?.league || null;
        if (matchQuery) {
          const result = await fetchPredictionMarkets(null, matchQuery);
          if (result.markets?.length > 0) {
            setPredMarkets(result.markets);
            setPredCategory(matchQuery);
            setShowPredList(true);
          }
        }

      } else if (action === "FETCH_PREDICTIONS") {
        push("ai", text + "\n\nFetching prediction markets…");
        const cat = actionData?.sport || actionData?.category || null;
        const query = actionData?.query || null; // for specific league/competition search
        const result = await fetchPredictionMarkets(cat, query);
        if (result.markets?.length === 0 && result.source !== "empty") {
          // Could be a region issue — show helpful message
        }
        setPredMarkets(result.markets);
        setPredCategory(cat || query || null);
        setShowPredList(true);
        if (result.markets?.length === 0) {
          push("ai", "Note: No prediction markets returned. This may be a server-region issue (the ChatFi proxy may be in a restricted region). The markets API itself is working — try again or check [jup.ag/prediction](https://jup.ag/prediction) directly.");
        }

      } else if (action === "FETCH_EARN") {
        push("ai", text + "\n\nFetching earn vaults…");
        await fetchEarnVaults();
        if (walletFull) fetchEarnUserPositions();
        setShowEarn(true);
        // If AI specified a vault + amount/portion, auto-open deposit panel
        if (actionData?.vault) {
          const vaultSym = actionData.vault.toUpperCase();
          // Wait briefly for earnVaults state to populate, then find and open vault
          setTimeout(() => {
            setEarnVaults(vaults => {
              const match = vaults.find(v => v.token?.toUpperCase() === vaultSym || v.name?.toUpperCase().includes(vaultSym));
              if (match) {
                // Resolve portion or amount
                let autoAmt = "";
                if (actionData?.portion) {
                  const bal = portfolio[vaultSym] ?? 0;
                  const p = actionData.portion.toLowerCase().trim();
                  if (p === "all")     autoAmt = bal.toString();
                  else if (p === "half")    autoAmt = (bal / 2).toFixed(6).replace(/\.?0+$/, "");
                  else if (p === "quarter") autoAmt = (bal / 4).toFixed(6).replace(/\.?0+$/, "");
                  else {
                    const m = p.match(/^(\d+(?:\.\d+)?)%$/);
                    if (m) autoAmt = (bal * parseFloat(m[1]) / 100).toFixed(6).replace(/\.?0+$/, "");
                  }
                } else if (actionData?.amount && parseFloat(actionData.amount) > 0) {
                  autoAmt = actionData.amount;
                }
                setEarnDeposit({ vault: match, amount: autoAmt });
                setShowEarnDeposit(true);
              }
              return vaults;
            });
          }, 800);
        }

      } else if (action === "SHOW_BORROW") {
        // Pre-fill vault from collateral token or default SOL→USDC
        const colSym  = (actionData?.collateral || "SOL").toUpperCase();
        const debtSym = (actionData?.debt || "USDC").toUpperCase();
        const vault   = MULTIPLY_VAULTS.find(v =>
          v.collateral.toUpperCase() === colSym && v.debt.toUpperCase() === debtSym
        ) || MULTIPLY_VAULTS.find(v => v.collateral.toUpperCase() === colSym)
          || MULTIPLY_VAULTS[0]; // SOL→USDC fallback
        setBorrowCfg(c => ({
          ...c,
          vaultId:      vault.vaultId,
          collateral:   vault.collateral,
          debt:         vault.debt,
          colDecimals:  vault.colDecimals,
          debtDecimals: vault.debtDecimals,
          colAmount:    actionData?.colAmount    || c.colAmount,
          borrowAmount: actionData?.borrowAmount || c.borrowAmount,
        }));
        setShowBorrow(true);
        push("ai", text);

      } else if (action === "SHOW_MULTIPLY") {
        setMultiplyFilter(actionData?.asset?.toUpperCase() || null);
        setShowMultiply(true);
        push("ai", text);

      } else if (action === "SHOW_LEND_POSITIONS") {
        push("ai", text);
        fetchLendPositions();
      } else if (action === "CLAIM_PAYOUTS") {
        if (!walletFull) { push("ai", text + "\n\nConnect your wallet first to check for claimable payouts."); }
        else { await doClaimPayouts(text); }

      } else if (action === "SHOW_TRIGGER_V2") {
        if (!walletFull) { push("ai", text + "\n\nConnect your wallet first to place a trigger order."); }
        else if (getActiveProvider()?.isWalletConnect) {
          push("ai", `Note: **Trigger orders require wallet message signing**, which isn't supported by WalletConnect on mobile.\n\n**Alternatives:**\n• Use a **Limit order** instead (same price trigger, no message signing needed)\n• Use **Phantom or Solflare browser extension** on desktop for full trigger support\n\nWould you like to set up a Limit order instead?`);
        }
        else {
          const fromSym = (actionData?.from || "USDC").toUpperCase();
          const toSym   = (actionData?.to   || "SOL").toUpperCase();
          const rFrom   = await resolveToken(fromSym);
          const rTo     = await resolveToken(toSym);
          // Handle portion-based amount
          const tSym = fromSym;
          const tBal = portfolio[tSym] ?? 0;
          const portion = actionData?.portion;
          let resolvedAmt = actionData?.amount || "";
          if (portion && tBal > 0) {
            const p = portion.toLowerCase().trim();
            if (p === "all")     resolvedAmt = tBal.toString();
            else if (p === "half")    resolvedAmt = (tBal / 2).toFixed(6).replace(/\.?0+$/, "");
            else if (p === "quarter") resolvedAmt = (tBal / 4).toFixed(6).replace(/\.?0+$/, "");
            else { const m = p.match(/^(\d+(?:\.\d+)?)%$/); if (m) resolvedAmt = (tBal * parseFloat(m[1]) / 100).toFixed(6).replace(/\.?0+$/, ""); }
          }
          setTrigV2Cfg(c => ({
            ...c,
            orderType:        actionData?.orderType        || "single",
            from: fromSym,    fromMint: rFrom?.mint || TOKEN_MINTS[fromSym] || c.fromMint,
            fromDecimals: rFrom?.decimals ?? TOKEN_DECIMALS[fromSym] ?? c.fromDecimals,
            to:   toSym,      toMint:   rTo?.mint   || TOKEN_MINTS[toSym]   || c.toMint,
            toDecimals: rTo?.decimals   ?? TOKEN_DECIMALS[toSym]   ?? c.toDecimals,
            amount:           resolvedAmt || c.amount,
            triggerCondition: actionData?.triggerCondition || c.triggerCondition,
            triggerPriceUsd:  actionData?.triggerPriceUsd  || c.triggerPriceUsd,
            tpPriceUsd:       actionData?.tpPriceUsd        || c.tpPriceUsd,
            slPriceUsd:       actionData?.slPriceUsd        || c.slPriceUsd,
            slippageBps:      actionData?.slippageBps       || c.slippageBps,
            expiryDays:       actionData?.expiryDays        || c.expiryDays,
          }));
          setShowTrigV2(true);
          push("ai", text);
        }

      } else if (action === "FETCH_TRIGGER_ORDERS") {
        const state = actionData?.state === "past" ? "past" : "active";
        push("ai", text);
        await fetchTrigV2Orders(state);

      } else if (action === "SHOW_RECURRING") {
        // Pre-populate config from AI actionData
        const fromSym = (actionData?.from || "USDC").toUpperCase();
        const toSym   = (actionData?.to   || "SOL").toUpperCase();
        const rFrom   = await resolveToken(fromSym);
        const rTo     = await resolveToken(toSym);
        setRecurringCfg(c => ({
          ...c,
          from: fromSym, fromMint: rFrom?.mint || TOKEN_MINTS[fromSym] || c.fromMint,
          fromDecimals: rFrom?.decimals ?? TOKEN_DECIMALS[fromSym] ?? c.fromDecimals,
          to:   toSym,   toMint:   rTo?.mint   || TOKEN_MINTS[toSym]   || c.toMint,
          toDecimals: rTo?.decimals   ?? TOKEN_DECIMALS[toSym]   ?? c.toDecimals,
          amountPerCycle: actionData?.amountPerCycle || c.amountPerCycle,
          numberOfOrders: actionData?.numberOfOrders || c.numberOfOrders,
          intervalSecs:   actionData?.intervalSecs   || c.intervalSecs,
        }));
        setShowRecurring(true);
        push("ai", text);

      } else if (action === "FETCH_RECURRING_ORDERS") {
        const status = actionData?.status === "history" ? "history" : "active";
        push("ai", text);
        await fetchRecurringOrders(status);

      } else if (action === "FETCH_TOKEN_TAG") {
        const tag   = (actionData?.tag || "verified").toLowerCase();
        const limit = Math.min(Math.max(parseInt(actionData?.limit) || 20, 1), 100);
        const tokens = await fetchTokensByTag(tag);
        if (!tokens.length) {
          push("ai", text + `\n\nNo tokens found for tag **${tag}**.`);
        } else {
          const label = tag === "lst" ? "Liquid Staking Tokens (LST)" : "Verified Tokens";
          push("ai", text + `\n\n**${label}** (${tokens.length} found, showing top ${Math.min(limit, tokens.length)}):\n${fmtTokenList(tokens, limit)}`);
        }

      } else if (action === "FETCH_TOKEN_CATEGORY") {
        const cat      = actionData?.category || "toptrending";
        const interval = actionData?.interval || "24h";
        const limit    = Math.min(Math.max(parseInt(actionData?.limit) || 20, 1), 100);
        const tokens   = await fetchTokensByCategory(cat, interval, limit);
        if (!tokens.length) {
          push("ai", text + `\n\nNo data returned for category **${cat}** / **${interval}**.`);
        } else {
          const catLabel = { toptrending: "Top Trending", toptraded: "Top Traded", toporganicscore: "Highest Organic Score" }[cat] || cat;
          push("ai", text + `\n\n**${catLabel}** — ${interval} (showing ${Math.min(tokens.length, limit)}):\n${fmtTokenList(tokens, limit)}`);
        }

      } else if (action === "FETCH_TOKEN_RECENT") {
        const limit  = Math.min(Math.max(parseInt(actionData?.limit) || 30, 1), 100);
        const tokens = await fetchRecentTokens(limit);
        if (!tokens.length) {
          push("ai", text + "\n\nCould not fetch recently listed tokens right now.");
        } else {
          push("ai", text + `\n\n**Recently Listed Tokens** (${tokens.length} found, newest first):\n${fmtTokenList(tokens, limit)}`);
        }

      } else if (action === "FETCH_XSTOCKS") {
        const limit  = Math.min(Math.max(parseInt(actionData?.limit) || 15, 1), 50);
        const tokens = await fetchXStocks(limit);
        if (!tokens.length) {
          push("ai", text + "\n\nCould not fetch xStock tokens right now. Try searching a specific one like **SPYx** or **QQQx**.");
        } else {
          const lines = tokens.map((t, i) => {
            const sym   = t.symbol || "?";
            const name  = t.name ? ` — ${t.name.slice(0,28)}` : "";
            const price = t.usdPrice ? ` $${t.usdPrice < 1 ? t.usdPrice.toFixed(4) : t.usdPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "";
            const chg   = t.stats24h?.priceChange != null ? ` (${t.stats24h.priceChange > 0 ? "+" : ""}${t.stats24h.priceChange.toFixed(2)}%)` : "";
            const vol   = t.stats24h ? ` · vol $${((t.stats24h.buyVolume||0)+(t.stats24h.sellVolume||0)).toLocaleString("en-US",{maximumFractionDigits:0})}` : "";
            const ver   = t.isVerified ? " ✓" : "";
            const logo  = t.icon || t.logoURI || (t.id ? `https://img.jup.ag/tokens/${t.id}` : "");
            const logoTag = logo ? `[img:${logo}]` : "";
            return `${i+1}. ${logoTag}**${sym}**${name}${ver}${price}${chg}${vol}`;
          }).join("\n");
          push("ai", text + `\n\n**Tokenized Stocks (xStocks)** on Solana — ${tokens.length} found:\n${lines}`);
        }

      } else if (action === "CHECK_TOKEN_VERIFY") {
        const sym  = actionData?.symbol;
        const info = await fetchTokenInfo(sym);
        if (!info?.address) {
          push("ai", text + `\n\nCould not find **${sym || "that token"}** on Jupiter to check eligibility.`);
        } else {
          const result = await checkVerifyEligibility(info.address);
          if (!result) {
            push("ai", text + `\n\nCould not retrieve verification status for **${sym}**. Try again shortly.`);
          } else {
            let vText = `\n\n**${sym?.toUpperCase()} — Express Verification Status**`;
            vText += `\nToken exists on-chain: ${result.tokenExists ? "Yes" : "No"}`;
            vText += `\nAlready verified: ${result.isVerified ? "Yes" : "No"}`;
            vText += `\nCan submit verification: ${result.canVerify ? "Yes" : "No"}`;
            vText += `\nCan update metadata: ${result.canMetadata ? "Yes" : "No"}`;
            if (result.verificationError) vText += `\nVerify blocked: ${result.verificationError}`;
            if (result.metadataError)     vText += `\nMetadata blocked: ${result.metadataError}`;
            if (result.canVerify) vText += `\n\nTo proceed, use the Jupiter token verification portal: https://developers.jup.ag/docs/tokens/verification`;
            push("ai", text + vText);
          }
        }

      } else if (action === "SHOW_SEND") {
        const { token = "SOL", amount = "" } = actionData || {};
        if (!walletFull) {
          push("ai", text + "\n\nPlease **connect your wallet** first to send tokens.");
        } else {
          const upperTok = token.toUpperCase();
          const mint = tokenCacheRef.current[upperTok] || TOKEN_MINTS[upperTok] || TOKEN_MINTS.SOL;
          setSendCfg({ token: upperTok, amount, mint });
          setSendStatus(null);
          setSendLink("");
          setSendRecipient("");
          setSendTxSig("");
          setSendMode(privyMode ? "direct" : "invite");
          setShowSend(true);
          push("ai", text);
        }

      } else if (action === "FETCH_SEND_HISTORY") {
        const { type = "pending" } = actionData || {};
        const addr = walletFull;
        if (!addr) {
          push("ai", text + "\n\nPlease **connect your wallet** first to view send history.");
        } else {
          try {
            const endpoint = type === "pending"
              ? `${JUP_SEND_API}/pending-invites?wallet=${addr}`
              : `${JUP_SEND_API}/invite-history?wallet=${addr}`;
            const data = await jupFetch(endpoint);
            const items = data?.invites || data?.history || data || [];
            if (!items.length) {
              push("ai", text + `\n\nNo ${type === "pending" ? "pending unclaimed invites" : "send history"} found for your wallet.`);
            } else {
              const lines = items.slice(0, 10).map((inv, i) => {
                const amt    = inv.amount || inv.tokenAmount || "?";
                const tok    = inv.token  || inv.mint        || "token";
                const status = inv.status || (type === "pending" ? "Unclaimed" : inv.claimed ? "Claimed" : "Clawed back");
                return `${i+1}. **${amt} ${tok}** — ${status}`;
              }).join("\n");
              // For pending invites, also attach clawback buttons as structured data
              const clawbackItems = type === "pending"
                ? items.slice(0, 10).map(inv => ({
                    code:   inv.inviteCode || inv.code || null,
                    amount: inv.amount || inv.tokenAmount || "?",
                    token:  inv.token  || inv.mint        || "token",
                  })).filter(i => i.code)
                : [];
              push("ai", text + `\n\n**${type === "pending" ? "Pending Invites" : "Send History"}**\n${lines}`, {
                clawbackItems,
              });
            }
          } catch {
            push("ai", text + "\n\nCould not fetch send history right now. Try again shortly.");
          }
        }

      } else if (action === "SHOW_PERPS") {
        const { market = "SOL-PERP", side = "long", collateral = "", leverage = "10" } = actionData || {};
        push("ai", text);
        setPerpCfg({ market, side, collateral, leverage });
        setShowPerps(true);

      } else if (action === "FETCH_PERPS_POSITIONS") {
        if (!walletFull) {
          push("ai", text + "\n\nPlease **connect your wallet** first to view perps positions.");
        } else {
          push("ai", text);
          setPerpsLoading(true);
          setShowPerpsPos(true);
          setPerpPositions([]);
          try {
            // Portfolio API returns elements[] — perps show as PortfolioElementLeverage
            // with platformId "jupiter-perps". Filter those out.
            const data = await jupFetch(`${JUP_PORTFOLIO}/positions/${walletFull}?platforms=jupiter-perps`);
            const elements = data?.elements || [];
            const perpsElements = elements.filter(el =>
              el.platformId === "jupiter-perps" || el.name?.toLowerCase().includes("perp")
            );
            // Flatten assets inside each leverage element into position-like objects
            const positions = perpsElements.flatMap(el => {
              const assets = el.data?.assets || el.data?.borrows || [];
              return assets.map(asset => ({
                market:   asset.data?.symbol || el.name || "PERP",
                side:     el.data?.side || asset.data?.side || "long",
                sizeUsd:  asset.value ?? el.value ?? null,
                entryPrice: asset.data?.price ?? null,
                unrealizedPnlUsd: el.data?.pnl ?? asset.data?.pnl ?? null,
                leverage:   el.data?.leverage ?? null,
                liquidationPrice: el.data?.liquidationPrice ?? null,
                positionKey: el.id || asset.data?.address || Math.random().toString(),
              }));
            });
            setPerpPositions(positions);
          } catch {
            push("ai", "Could not fetch perps positions. Try again shortly.");
          }
          setPerpsLoading(false);
        }

      } else if (action === "SHOW_STUDIO") {
        setStudioCfg(c => ({
          ...c,
          name:        actionData?.name        || c.name,
          symbol:      actionData?.symbol      || c.symbol,
          description: actionData?.description || c.description,
          website:     actionData?.website     || c.website,
          twitter:     actionData?.twitter     || c.twitter,
        }));
        setStudioImage(null);
        setStudioStatus(null);
        setStudioResult(null);
        setShowStudio(true);
        push("ai", text);

      } else if (action === "FETCH_STUDIO_FEES") {
        push("ai", text);
        await fetchStudioFees();

      } else if (action === "SHOW_LOCK") {
        const tokSym = (actionData?.token || "JUP").toUpperCase();
        const resolvedTok = await resolveToken(tokSym);
        setLockCfg(c => ({
          ...c,
          token:       tokSym,
          mint:        resolvedTok?.mint || TOKEN_MINTS[tokSym] || c.mint,
          amount:      actionData?.amount      || c.amount,
          cliffDays:   actionData?.cliffDays   || c.cliffDays,
          vestingDays: actionData?.vestingDays || c.vestingDays,
          recipient:   actionData?.recipient   || c.recipient,
        }));
        if (resolvedTok?.decimals) tokenDecimalsRef.current[tokSym] = resolvedTok.decimals;
        setLockStatus(null);
        setLockResult(null);
        setShowLock(true);
        push("ai", text);

      } else if (action === "FETCH_LOCKS") {
        push("ai", text);
        await fetchLocks();

      } else if (action === "SHOW_ROUTE") {
        push("ai", text);
        const from = actionData?.from || "SOL";
        const to   = actionData?.to   || "USDC";
        const amt  = actionData?.amount || "1";
        await fetchRouteBreakdown(from, to, amt);

      // ── SET_PRICE_ALERT ────────────────────────────────────────────────────
      } else if (action === "SET_PRICE_ALERT") {
        const alertToken = (actionData?.token || "SOL").toUpperCase();
        const alertCond  = actionData?.condition === "below" ? "below" : "above";
        const alertPrice = parseFloat(actionData?.price);
        if (!alertPrice || isNaN(alertPrice)) {
          push("ai", "Please specify a valid price for the alert, e.g. *alert me when SOL hits $200*.");
        } else {
          const newAlert = { token: alertToken, condition: alertCond, target: alertPrice, triggered: false, id: Date.now() };
          const updated = [...priceAlerts, newAlert];
          setPriceAlerts(updated);
          try { localStorage.setItem("chatfi-alerts", JSON.stringify(updated)); } catch {}
          push("ai", text + `\n\nAlert set: **${alertToken}** ${alertCond} **$${alertPrice.toLocaleString()}**\nI'll notify you in chat when it triggers. You can set multiple alerts.`);
        }

      // ── SHOW_TRADE_JOURNAL ─────────────────────────────────────────────────
      } else if (action === "SHOW_TRADE_JOURNAL") {
        const period = actionData?.period || "all";
        const now = Date.now();
        const cutoff = period === "today" ? now - 86400000 : period === "week" ? now - 604800000 : 0;
        const trades = tradeJournal.filter(t => t.ts >= cutoff);
        if (!trades.length) {
          push("ai", text + "\n\nNo trades recorded yet. Your swaps and limit orders will appear here automatically.");
        } else {
          const lines = trades.slice(0, 50).map((t, i) => {
            const d = new Date(t.ts).toLocaleDateString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
            if (t.type === "swap") return `${i+1}. **${t.from}→${t.to}** — ${t.amount} ${t.from} → ~${t.out} ${t.to}  ·  ${d}`;
            if (t.type === "limit") return `${i+1}. **Limit** ${t.direction === "below" ? "buy" : "sell"} ${t.amount} ${t.token} @ $${t.targetPrice}  ·  ${d}`;
            if (t.type === "basket") return `${i+1}. **Basket** — ${t.summary}  ·  ${d}`;
            return `${i+1}. ${t.type} — ${d}`;
          }).join("\n");
          push("ai", text + `\n\n**Trade Journal** (${trades.length} trades${period !== "all" ? `, ${period}` : ""}):\n${lines}`);
        }

      // ── BASKET_SWAP ────────────────────────────────────────────────────────
      } else if (action === "BASKET_SWAP") {
        const basketTrades = actionData?.trades || [];
        if (!basketTrades.length) { push("ai", "No trades found in basket. Try: *buy $100 each of SOL, JUP, and BONK* or *swap 5.4 JUP and all my BONK to USDC*."); }
        else if (!walletFull) { push("ai", "Connect your wallet first to execute a basket swap."); }
        else {
          push("ai", (text || "") + `\n\nPreparing **${basketTrades.length} swaps** — you'll approve all at once…`);
          const provider = getActiveProvider();
          if (!provider) { push("ai", "Wallet not connected. Please connect your wallet first."); return; }
          let done = 0, failed = 0;
          const summary = [];

          // ── Phase 1: resolve mints + fetch all orders in parallel ─────────────
          const BASKET_SLIPPAGE_BPS = 50; // 0.5% — enough room for sequential pool impacts

          // ── Pre-process trades: resolve portion → native amount, parse k/M suffixes ──
          // This runs before mint-resolution so amounts are concrete numbers by Phase 1.
          const resolvedTrades = basketTrades.map(t => {
            const fromSym = (t.from || "USDC").toUpperCase();
            let amount    = t.amount;
            let amountUSD = t.amountUSD;

            // Parse numeric suffix shorthand: "158.4k" → 158400, "1.5m" → 1500000
            if (typeof amount === "string") {
              const kMatch = amount.match(/^([\d.]+)[kK]$/);
              const mMatch = amount.match(/^([\d.]+)[mM]$/);
              if (kMatch)      amount = String(parseFloat(kMatch[1]) * 1_000);
              else if (mMatch) amount = String(parseFloat(mMatch[1]) * 1_000_000);
            }

            // Resolve portion ("all"/"max"/"half"/"quarter"/"N%") → native wallet balance
            if (t.portion && !amount) {
              const p   = (t.portion || "").toLowerCase().trim();
              const bal = portfolio[fromSym] ?? 0;
              if (bal > 0) {
                if      (p === "all" || p === "max") amount = String(bal);
                else if (p === "half")                amount = (bal / 2).toFixed(9).replace(/\.?0+$/, "");
                else if (p === "quarter")             amount = (bal / 4).toFixed(9).replace(/\.?0+$/, "");
                else {
                  const pct = p.match(/^(\d+(?:\.\d+)?)%$/);
                  if (pct) amount = (bal * parseFloat(pct[1]) / 100).toFixed(9).replace(/\.?0+$/, "");
                }
                if (amount) amountUSD = null; // use native amount path, not price-lookup path
              }
            }
            return { ...t, amount, amountUSD };
          });

          // Pre-resolve any symbols not already cached (e.g. PENGU, FARTCOIN)
          // resolveToken() hits Jupiter's search API and populates tokenCacheRef automatically.
          const _allBasketSyms = [...new Set(resolvedTrades.flatMap(t => [
            (t.from || "USDC").toUpperCase(),
            (t.to   || "SOL").toUpperCase(),
          ]))];
          const _unknownSyms = _allBasketSyms.filter(s => !tokenCacheRef.current[s] && !TOKEN_MINTS[s]);
          if (_unknownSyms.length > 0) {
            await Promise.all(_unknownSyms.map(s => resolveToken(s).catch(() => null)));
          }

          const tradeMeta = resolvedTrades.map(t => {
            const fromSym  = (t.from || "USDC").toUpperCase();
            const toSym    = (t.to   || "SOL").toUpperCase();
            const fromMint = tokenCacheRef.current[fromSym] || TOKEN_MINTS[fromSym];
            const toMint   = tokenCacheRef.current[toSym]   || TOKEN_MINTS[toSym];
            const fromDec  = tokenDecimalsRef.current[fromSym] ?? TOKEN_DECIMALS[fromSym] ?? 6;
            const toDec    = tokenDecimalsRef.current[toSym]   ?? TOKEN_DECIMALS[toSym]   ?? 9;
            const usd      = parseFloat(t.amountUSD) || 0;
            return { fromSym, toSym, fromMint, toMint, fromDec, toDec, usd, needsPrice: !!t.amountUSD, rawAmt: parseFloat(t.amount || String(usd)) };
          });

          // Single batch price call for all unique fromMints that need USD conversion
          const mintsNeedingPrice = [...new Set(tradeMeta.filter(m => m.needsPrice && m.fromMint).map(m => m.fromMint))];
          const priceMap = {};
          if (mintsNeedingPrice.length > 0) {
            try {
              const pr = await fetch(`${JUP_PRICE_API}?ids=${mintsNeedingPrice.join(",")}`).then(r=>r.json()).catch(()=>({}));
              mintsNeedingPrice.forEach(mint => { priceMap[mint] = pr?.data?.[mint]?.price || 1; });
            } catch { mintsNeedingPrice.forEach(mint => { priceMap[mint] = 1; }); }
          }

          // Compute amounts for each trade
          const tradeAmounts = tradeMeta.map(m => ({
            ...m,
            inUnits:   m.needsPrice ? m.usd / (priceMap[m.fromMint] || 1) : m.rawAmt,
            atomicAmt: 0, // set below
          }));
          tradeAmounts.forEach(m => { m.atomicAmt = Math.floor(m.inUnits * Math.pow(10, m.fromDec)); });

          // Helper: fetch a fresh order for one trade
          const fetchOrder = async (m) => {
            if (!m.fromMint || !m.toMint) throw new Error("unknown token");
            const orderRes = await jupFetch(`${JUP_SWAP_ORDER}?inputMint=${m.fromMint}&outputMint=${m.toMint}&amount=${m.atomicAmt}&taker=${walletFull}&slippageBps=${BASKET_SLIPPAGE_BPS}`);
            if (orderRes?.error) throw new Error(typeof orderRes.error === "object" ? JSON.stringify(orderRes.error) : orderRes.error);
            if (!orderRes?.transaction) throw new Error(`No transaction — ${JSON.stringify(orderRes).slice(0,120)}`);
            return orderRes; // { transaction, requestId, outAmount, … }
          };

          // Initial order fetch — all in parallel to save time
          const initialOrders = await Promise.all(tradeAmounts.map(async m => {
            try   { return { ok: true, order: await fetchOrder(m), meta: m }; }
            catch(e) { return { ok: false, err: e?.message || "order failed", meta: m }; }
          }));

          const invalid = initialOrders.filter(o => !o.ok);
          invalid.forEach(o => { failed++; push("ai", `Failed: ${o.meta.fromSym}→${o.meta.toSym}: ${o.err}`); });
          const validOrders = initialOrders.filter(o => o.ok);

          if (validOrders.length === 0) {
            push("ai", `**Basket done** — ${done} succeeded, ${failed} failed`);
            return;
          }

          // ── Phase 2: sign all txs at once (one wallet approval for the batch) ──
          // We sign first, then re-sign individually if stale — but we need one
          // initial batch approval so user sees all txs at once in their wallet.
          push("ai", `Requesting wallet approval for **${validOrders.length} swaps**…`);
          let batchSignedTxs = [];
          const batchTxObjects = validOrders.map(o =>
            VersionedTransaction.deserialize(Uint8Array.from(atob(o.order.transaction), c=>c.charCodeAt(0)))
          );
          try {
            if (provider.signAllTransactions) {
              batchSignedTxs = await provider.signAllTransactions(batchTxObjects);
            } else {
              for (const tx of batchTxObjects) batchSignedTxs.push(await provider.signTransaction(tx));
            }
          } catch(e) {
            validOrders.forEach(o => { failed++; push("ai", `Failed: ${o.meta.fromSym}→${o.meta.toSym}: ${e?.message || "signing cancelled"}`); });
            push("ai", `**Basket done** — ${done} succeeded, ${failed} failed`);
            setTyping(false);
            return;
          }

          // ── Phase 3: execute sequentially — sign+execute each one just-in-time ─
          // Key insight: signing all at once is fine for UX, but executing sequentially
          // with a fresh blockhash per tx prevents stale blockhash (3O05) on later swaps.
          // If a tx is stale we re-fetch the order and ask the wallet to re-sign just that one.
          const RPC_URL_EXEC = import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
          const connExec = new Connection(RPC_URL_EXEC, "confirmed");

          setTyping(false); // show results as cards in real time

          const waitConfirmed = async (sig, maxMs = 30000) => {
            const start = Date.now();
            while (Date.now() - start < maxMs) {
              const res = await connExec.getSignatureStatuses([sig], { searchTransactionHistory: true });
              const st  = res?.value?.[0];
              if (st?.err) throw new Error("On-chain error: " + JSON.stringify(st.err));
              if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return st;
              await new Promise(r => setTimeout(r, 1500));
            }
            throw new Error("Timeout — check Solscan for status");
          };

          for (let i = 0; i < validOrders.length; i++) {
            const o   = validOrders[i];
            const m   = o.meta;
            if (i > 0) await new Promise(r => setTimeout(r, 1200)); // let previous pool settle

            // Stamp a fresh blockhash onto the pre-signed tx bytes before sending
            let stx = batchSignedTxs[i];
            let currentOrder = o.order;

            try {
              let execRes = await jupFetch(JUP_SWAP_EXEC, { method:"POST", body:{ signedTransaction: bytesToB64(stx.serialize()), requestId: currentOrder.requestId } });
              const errStr = execRes?.error ? JSON.stringify(execRes.error) : "";

              // Auto-retry on stale blockhash (3O05) or Whirlpool slippage (6O23)
              if (errStr.includes("3O05") || errStr.includes("6O23") || errStr.includes("6023")) {
                try {
                  currentOrder = await fetchOrder(m);
                  const freshTx = VersionedTransaction.deserialize(Uint8Array.from(atob(currentOrder.transaction), c=>c.charCodeAt(0)));
                  stx = await provider.signTransaction(freshTx);
                  execRes = await jupFetch(JUP_SWAP_EXEC, { method:"POST", body:{ signedTransaction: bytesToB64(stx.serialize()), requestId: currentOrder.requestId } });
                } catch { /* fall through to error below */ }
              }

              if (execRes?.error) throw new Error(typeof execRes.error === "object" ? JSON.stringify(execRes.error) : execRes.error);
              const sig = execRes?.signature || execRes?.txid;
              if (!sig) throw new Error("No signature returned");

              await waitConfirmed(sig);
              done++;

              // Jupiter v2 execute returns outAmount (atomic units) — try all field names
              const rawOut = execRes?.outAmount ?? execRes?.outputAmount ?? execRes?.out_amount ?? currentOrder?.outAmount ?? null;
              const outAmt = rawOut != null ? (Number(rawOut) / Math.pow(10, m.toDec)).toFixed(4) : "?";
              push("ai", `[swap-card|${m.fromSym}|${m.toSym}|${m.inUnits.toFixed(4)}|~${outAmt}|${execRes?.feeBps ? execRes.feeBps+"bps" : ""}|${sig}|ok]`);
              logTrade({ type:"swap", from:m.fromSym, to:m.toSym, amount:m.inUnits.toFixed(4), out:outAmt, tx:sig });
            } catch(e) {
              failed++;
              push("ai", `[swap-card|${m.fromSym}|${m.toSym}|${m.inUnits?.toFixed(4)||"?"}|—|—|—|err]\nFailed: ${m.fromSym}→${m.toSym}: ${e?.message || "failed"}`);
            }
          }
          const summaryStr = basketTrades.map(t=>`${t.from||"USDC"}→${t.to}`).join(", ");
          logTrade({ type:"basket", summary: summaryStr });
          push("ai", `**Basket done** — ${done} succeeded, ${failed} failed`);
        }

      // ── COPY_TRADE ──────────────────────────────────────────────────────────
      } else if (action === "COPY_TRADE") {
        const ctWallet = actionData?.wallet;
        const ctLimit  = parseInt(actionData?.limit) || 5;
        if (!ctWallet) {
          push("ai", "Please provide a wallet address, e.g. *copy trades from ABC...XYZ*.");
        } else {
          push("ai", text + `\n\nFetching last ${ctLimit} swaps from \`${ctWallet.slice(0,8)}…${ctWallet.slice(-4)}\`…`);
          try {
            const trades = await fetchWalletTrades(ctWallet, ctLimit);
            if (!trades?.length) {
              push("ai", `No recent swaps found for \`${ctWallet.slice(0,8)}…\``);
            } else {
              setCopyTradeData({ wallet: ctWallet, trades });
              setShowCopyTrade(true);
              const lines = trades.map((t, i) =>
                `${i+1}. **${t.fromSymbol}→${t.toSymbol}** — ${t.fromAmount} ${t.fromSymbol} → ${t.toAmount} ${t.toSymbol}  ·  ${new Date(t.timestamp).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`
              ).join("\n");
              push("ai", `**Last ${trades.length} swaps** from \`${ctWallet.slice(0,8)}…${ctWallet.slice(-4)}\`:\n${lines}\n\nUse the **Mirror** buttons below to copy any trade.`);
            }
          } catch(e) {
            push("ai", `Could not fetch trades: ${e?.message || "unknown error"}. Check the wallet address and try again.`);
          }
        }

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
    <div style={{ display:"flex", height:"100dvh", background:T.bg, fontFamily:T.body, color:T.text1, overflow:"hidden" }}>

      {/* Sidebar — fullscreen overlay on mobile, fixed panel on desktop */}
      {sidebarOpen && (
        <div style={{
          position: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? "fixed" : "relative",
          inset: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 0 : "auto",
          zIndex: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 300 : "auto",
          width: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? "100%" : 240,
          background:T.sidebar, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", flexShrink:0
        }}>
          <div style={{ padding:"18px 16px 12px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontFamily:T.serif, fontSize:18, fontWeight:500, color:T.text1, letterSpacing:"-0.3px" }}>ChatFi</div>
              <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>Your personal AI tools</div>
            </div>
            {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && (
              <button onClick={() => setSidebarOpen(false)}
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:T.text2, padding:"4px 8px", lineHeight:1 }}>✕</button>
            )}
          </div>
          <div style={{ padding:"10px 8px" }}>
            <button onClick={() => { histRef.current=[]; try{sessionStorage.removeItem("chatfi-msgs");}catch{} setMsgs([INITIAL_MSG]); setChatHistory(h=>[{id:Date.now(),title:"New conversation",active:true},...h.map(c=>({...c,active:false}))]); }}
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
                <button onClick={disconnectWallet} className="hov-btn"
                  style={{ marginTop:8, width:"100%", padding:"7px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.red, fontSize:12, fontWeight:500, cursor:"pointer" }}>
                  Disconnect Wallet
                </button>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <button onClick={connectWithPrivy} className="hov-btn"
                  style={{ width:"100%", padding:"8px 12px", background:T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  Sign In (Email / Google)
                </button>
                <button onClick={connectWithReown} className="hov-btn"
                  style={{ width:"100%", padding:"7px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:12, cursor:"pointer" }}>
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main chat */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, position:"relative" }}>

        {/* ── Jupiter-style Transparent Nav ── */}
        {(() => {
          const socials = [
            { label:"Twitter / X", icon:<SvgTwitterX size={15} color="currentColor"/>, url:"https://x.com/JupiterExchange" },
            { label:"Discord",     icon:<SvgDiscord size={15} color="currentColor"/>,  url:"https://discord.gg/jup" },
            { label:"Telegram",    icon:<SvgTelegram size={15} color="currentColor"/>, url:"https://t.me/jupiter_exchange" },
            { label:"GitHub",      icon:<SvgGithub size={15} color="currentColor"/>,   url:"https://github.com/jup-ag" },
          ];
          return (
            <>
              <div style={{
                position:"absolute", top:0, left:0, right:0, zIndex:200,
                padding:"0 16px",
                display:"flex", alignItems:"center", justifyContent:"space-between",
                height:58,
                background:"linear-gradient(180deg, rgba(13,17,23,0.85) 0%, rgba(13,17,23,0) 100%)",
                backdropFilter:"blur(2px)",
              }}>
                {/* Left: hamburger + logo */}
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <button onClick={() => setSidebarOpen(o=>!o)}
                    style={{ background:"none", border:"none", cursor:"pointer", color:T.text2, fontSize:20, padding:"4px 6px", lineHeight:1, borderRadius:8 }}
                    className="hov-btn" style={{ fontSize:18, fontFamily:"monospace" }}>&#9776;</button>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontFamily:T.serif, fontSize:15, fontWeight:600, color:T.text1, letterSpacing:"-0.2px" }}>ChatFi</span>
                  </div>
                </div>

                {/* Right: nav items */}
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  {/* How It Works */}
                  <button onClick={() => { setShowHowItWorks(h=>!h); setShowSocialsNav(false); }}
                    style={{ padding:"5px 11px", background:"none", border:`1px solid ${showHowItWorks ? T.accent+"66" : T.border+"88"}`, borderRadius:20, color: showHowItWorks ? T.accent : T.text2, fontSize:11, fontWeight:500, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.15s" }}
                    className="hov-btn">How it works</button>

                  {/* Social */}
                  <div style={{ position:"relative" }}>
                    <button onClick={() => { setShowSocialsNav(s=>!s); setShowHowItWorks(false); }}
                      style={{ padding:"5px 11px", background:"none", border:`1px solid ${showSocialsNav ? T.accent+"66" : T.border+"88"}`, borderRadius:20, color: showSocialsNav ? T.accent : T.text2, fontSize:11, fontWeight:500, cursor:"pointer", transition:"all 0.15s" }}
                      className="hov-btn">Social</button>

                    {/* Social popup */}
                    {showSocialsNav && (
                      <div style={{
                        position:"absolute", top:"calc(100% + 8px)", right:0, zIndex:400,
                        background:T.surface, border:`1px solid ${T.border}`, borderRadius:14,
                        padding:"8px 6px", minWidth:180,
                        boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
                        animation:"fadeUp 0.18s ease",
                      }}>
                        <div style={{ fontSize:10, color:T.text3, padding:"4px 10px 6px", textTransform:"uppercase", letterSpacing:"0.08em" }}>Follow Jupiter</div>
                        {socials.map(s => (
                          <a key={s.label} href={s.url} target="_blank" rel="noreferrer"
                            style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:9, color:T.text1, textDecoration:"none", fontSize:13, transition:"background 0.12s" }}
                            className="hov-row">
                            <span style={{ fontSize:15, width:20, textAlign:"center" }}>{s.icon}</span>
                            <span>{s.label}</span>
                          </a>
                        ))}
                        <div style={{ height:1, background:T.border, margin:"6px 10px" }}/>
                        <button onClick={() => { setShowSocialsNav(false); setBlogPostIndex(null); setShowBlog(true); }}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:9, color:T.text1, fontSize:13, background:"none", border:"none", cursor:"pointer", width:"100%", transition:"background 0.12s" }}
                          className="hov-row">
                          <span style={{ fontSize:15, width:20, textAlign:"center" }}><SvgBlog size={15} color="currentColor"/></span>
                          <span>Blog</span>
                          <span style={{ marginLeft:"auto", fontSize:10, color:T.accent, fontWeight:700, background:`${T.accent}22`, padding:"2px 7px", borderRadius:5 }}>{BLOG_POSTS.length} posts</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Connected Wallet — logo + address pill with ✕ to disconnect */}
                  {wallet ? (
                    <div
                      style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:T.green, fontWeight:600,
                        background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:20,
                        padding:"4px 8px 4px 5px", maxWidth:145, overflow:"hidden", whiteSpace:"nowrap",
                        cursor:"default",
                      }}
                    >
                      {/* Wallet logo — show provider icon for Privy, live icon from Reown, or fallback green dot */}
                      {privyMode && privyProvider ? (
                        privyProvider === "google" ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" flexShrink="0"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        ) : privyProvider === "twitter" ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill={T.text1} style={{flexShrink:0}}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.743l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        ) : privyProvider === "discord" ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#5865F2" style={{flexShrink:0}}><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                        ) : (
                          /* email */
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2" style={{flexShrink:0}}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        )
                      ) : (connectedWalletIcon || (connectedWalletName && WALLET_LOGOS[connectedWalletName])) ? (
                        <img
                          src={connectedWalletIcon || WALLET_LOGOS[connectedWalletName]}
                          alt={connectedWalletName || "Wallet"}
                          title={connectedWalletName || "Wallet"}
                          style={{ width:16, height:16, borderRadius:4, flexShrink:0, objectFit:"cover" }}
                          onError={e => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        /* fallback green dot */
                        <span style={{ width:7, height:7, borderRadius:"50%", background:T.green, flexShrink:0, display:"inline-block" }}/>
                      )}
                      {/* Truncated address */}
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", flex:1 }}>{wallet}</span>
                      {/* ✕ disconnect — replaces the separate "Out" button */}
                      <button
                        onClick={disconnectWallet}
                        title="Disconnect wallet"
                        className="hov-btn"
                        style={{ marginLeft:3, background:"none", border:"none", color:T.text3,
                          fontSize:12, lineHeight:1, cursor:"pointer", padding:"0 1px",
                          flexShrink:0, display:"flex", alignItems:"center" }}
                      >✕</button>
                    </div>
                  ) : (
                    <div style={{ position:"relative" }}>
                      <button onClick={() => setShowSignInDropdown(v => !v)} className="hov-btn"
                        style={{ padding:"6px 14px", background:T.accent, border:"none", borderRadius:20, color:"#0d1117", fontSize:12, fontWeight:700, cursor:"pointer", boxShadow:`0 0 12px ${T.accent}44`, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5 }}>
                        Sign In
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0d1117" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                      {showSignInDropdown && (
                        <>
                          <div onClick={() => setShowSignInDropdown(false)} style={{ position:"fixed", inset:0, zIndex:300 }}/>
                          <div style={{
                            position:"absolute", top:"calc(100% + 8px)", right:0, zIndex:301,
                            background:T.surface, border:`1px solid ${T.border}`, borderRadius:14,
                            padding:6, minWidth:200, boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
                            animation:"fadeUp 0.15s ease",
                          }}>
                            {/* Google / Email via Privy */}
                            <button onClick={() => { setShowSignInDropdown(false); privyLogin(); }} className="hov-btn"
                              style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"none", border:"none", borderRadius:10, cursor:"pointer", marginBottom:4, transition:"background 0.12s" }}
                              onMouseEnter={e => e.currentTarget.style.background=T.accentBg}
                              onMouseLeave={e => e.currentTarget.style.background="none"}>
                              <div style={{ width:28, height:28, borderRadius:8, background:T.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#0d1117"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                              </div>
                              <div style={{ textAlign:"left" }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.text1 }}>Google / Email</div>
                                <div style={{ fontSize:10, color:T.text3 }}>Auto-creates embedded wallet</div>
                              </div>
                            </button>
                            {/* Divider */}
                            <div style={{ height:1, background:T.border, margin:"2px 8px 6px" }}/>
                            {/* Connect Wallet via Reown */}
                            <button onClick={() => { setShowSignInDropdown(false); connectWithReown(); }} className="hov-btn"
                              style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"none", border:"none", borderRadius:10, cursor:"pointer", transition:"background 0.12s" }}
                              onMouseEnter={e => e.currentTarget.style.background=T.accentBg}
                              onMouseLeave={e => e.currentTarget.style.background="none"}>
                              <div style={{ width:28, height:28, borderRadius:8, background:`${T.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <SvgWallet size={14} color={T.text1}/>
                              </div>
                              <div style={{ textAlign:"left" }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.text1 }}>Connect Wallet</div>
                                <div style={{ fontSize:10, color:T.text3 }}>Phantom, Backpack, Solflare…</div>
                              </div>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* How It Works dropdown — full width panel below nav */}
              {showHowItWorks && (
                <div style={{
                  position:"absolute", top:58, left:0, right:0, zIndex:199,
                  background:T.surface, borderBottom:`1px solid ${T.border}`,
                  padding:"20px 24px", animation:"fadeUp 0.2s ease",
                  boxShadow:"0 8px 32px rgba(0,0,0,0.4)",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:600, color:T.text1 }}>How ChatFi Works</div>
                    <button onClick={() => setShowHowItWorks(false)} style={{ background:"none", border:"none", color:T.text3, fontSize:18, cursor:"pointer", lineHeight:1 }}>✕</button>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:10 }}>
                    {[
                      { icon:<SvgChat size={20} color="currentColor"/>, title:"Ask Anything", desc:"Prices, swaps, predictions, yields — just type naturally." },
                      { icon:<SvgWallet size={20} color="currentColor"/>, title:"Connect Wallet", desc:"Tap Connect Wallet to swap, earn, or trade directly in-chat." },
                      { icon:<SvgZap size={20} color="currentColor"/>, title:"Execute On-Chain", desc:"Transactions happen via Jupiter APIs — no copy-paste needed." },
                      { icon:<SvgBarChart size={20} color="currentColor"/>, title:"Track Portfolio", desc:"Ask for your balances, positions, or PnL anytime." },
                    ].map(step => (
                      <div key={step.title} style={{ padding:"12px 14px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10 }}>
                        <div style={{ fontSize:20, marginBottom:6 }}>{step.icon}</div>
                        <div style={{ fontSize:13, fontWeight:600, color:T.text1, marginBottom:4 }}>{step.title}</div>
                        <div style={{ fontSize:11, color:T.text3, lineHeight:1.5 }}>{step.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:12, fontSize:11, color:T.text3, textAlign:"center" }}>
                    Powered by <a href="https://jup.ag" target="_blank" rel="noreferrer" style={{ color:T.accent, textDecoration:"none", fontWeight:600 }}>Jupiter Exchange</a> — the #1 Solana DEX aggregator
                  </div>
                </div>
              )}

              {/* Overlay to close popups on outside click */}
              {(showSocialsNav || showHowItWorks) && (
                <div onClick={() => { setShowSocialsNav(false); setShowHowItWorks(false); }}
                  style={{ position:"fixed", inset:0, zIndex:198 }}/>
              )}

              {/* ── Full-screen Blog Panel ───────────────────────────────────── */}
              {showBlog && (
                <div style={{
                  position:"fixed", inset:0, zIndex:500,
                  background:"rgba(0,0,0,0.75)", backdropFilter:"blur(6px)",
                  display:"flex", flexDirection:"column",
                  animation:"fadeUp 0.2s ease",
                }} onClick={() => { setShowBlog(false); setBlogPostIndex(null); }}>
                  <div style={{
                    position:"absolute", inset:0, top: 0,
                    background:T.bg, display:"flex", flexDirection:"column",
                    maxWidth:600, margin:"0 auto", width:"100%",
                  }} onClick={e => e.stopPropagation()}>

                    {/* Blog header */}
                    <div style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"16px 18px", borderBottom:`1px solid ${T.border}`,
                      flexShrink:0, background:T.surface,
                    }}>
                      {blogPostIndex !== null ? (
                        <button onClick={() => setBlogPostIndex(null)}
                          style={{ background:"none", border:"none", color:T.accent, fontSize:13, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                          ← All Posts
                        </button>
                      ) : (
                        <div>
                          <div style={{ fontSize:16, fontWeight:700, color:T.text1, fontFamily:T.serif }}>ChatFi Blog</div>
                          <div style={{ fontSize:11, color:T.text3, marginTop:1 }}>Guides, features & what you need to know</div>
                        </div>
                      )}
                      <button onClick={() => { setShowBlog(false); setBlogPostIndex(null); }}
                        style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:"50%", width:28, height:28, color:T.text2, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
                    </div>

                    {/* Blog list */}
                    {blogPostIndex === null && (
                      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 32px" }}>

                        {/* Privy wallet status card in blog */}
                        {privyMode && walletFull && (
                          <div style={{
                            background:T.surface, border:`1px solid ${T.accent}44`,
                            borderRadius:14, padding:"12px 14px", marginBottom:16,
                            display:"flex", alignItems:"center", gap:12,
                          }}>
                            <div style={{ width:34, height:34, borderRadius:10, background:`${T.accent}22`, border:`1px solid ${T.accent}44`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              {privyProvider === "google" ? (
                                <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                              ) : privyProvider === "twitter" ? (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill={T.text1}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.743l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                              ) : privyProvider === "discord" ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                              ) : (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                              )}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:12, fontWeight:600, color:T.text1, marginBottom:1 }}>{connectedWalletName}</div>
                              <div style={{ fontSize:10, color:T.text3, fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{walletFull}</div>
                            </div>
                            <button onClick={() => { navigator.clipboard.writeText(walletFull).catch(()=>{}); }}
                              style={{ flexShrink:0, background:`${T.accent}22`, border:`1px solid ${T.accent}44`, borderRadius:8, padding:"5px 9px", cursor:"pointer", color:T.accent, fontSize:11, fontWeight:600 }}>
                              Copy
                            </button>
                          </div>
                        )}

                        {BLOG_POSTS.map((post, idx) => (
                          <div key={post.id} onClick={() => setBlogPostIndex(idx)}
                            style={{
                              background:T.surface, border:`1px solid ${T.border}`,
                              borderRadius:14, padding:"16px", marginBottom:12,
                              cursor:"pointer", transition:"border-color 0.15s, transform 0.12s",
                            }}
                            className="hov-btn">
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                              <span style={{ fontSize:10, fontWeight:700, color:T.accent, background:`${T.accent}22`, padding:"2px 9px", borderRadius:20, letterSpacing:"0.06em", textTransform:"uppercase" }}>{post.category}</span>
                              <span style={{ fontSize:10, color:T.text3 }}>{post.readTime}</span>
                              <span style={{ fontSize:10, color:T.text3, marginLeft:"auto" }}>{post.date}</span>
                            </div>
                            <div style={{ fontSize:14, fontWeight:700, color:T.text1, lineHeight:1.4, marginBottom:6 }}>{post.title}</div>
                            <div style={{ fontSize:12, color:T.text3, lineHeight:1.6 }}>{post.summary}</div>
                            <div style={{ marginTop:10, fontSize:11, color:T.accent, fontWeight:600 }}>Read more →</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Blog post detail */}
                    {blogPostIndex !== null && (() => {
                      const post = BLOG_POSTS[blogPostIndex];
                      return (
                        <div style={{ flex:1, overflowY:"auto", padding:"20px 18px 40px" }}>
                          {/* Post meta */}
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                            <span style={{ fontSize:10, fontWeight:700, color:T.accent, background:`${T.accent}22`, padding:"2px 9px", borderRadius:20, letterSpacing:"0.06em", textTransform:"uppercase" }}>{post.category}</span>
                            <span style={{ fontSize:10, color:T.text3 }}>{post.readTime}</span>
                            <span style={{ fontSize:10, color:T.text3 }}>&middot; {post.date}</span>
                          </div>

                          {/* Title */}
                          <div style={{ fontSize:19, fontWeight:800, color:T.text1, lineHeight:1.35, fontFamily:T.serif, marginBottom:10 }}>{post.title}</div>

                          {/* Summary */}
                          <div style={{ fontSize:13, color:T.accent, lineHeight:1.65, marginBottom:20, padding:"10px 14px", background:`${T.accent}11`, borderRadius:10, borderLeft:`3px solid ${T.accent}` }}>{post.summary}</div>

                          {/* Sections */}
                          {post.sections.map((sec, i) => (
                            <div key={i} style={{ marginBottom:20 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:T.text1, marginBottom:6, fontFamily:T.serif }}>{sec.heading}</div>
                              <div style={{ fontSize:13, color:T.text2, lineHeight:1.75 }}>{sec.body}</div>
                            </div>
                          ))}

                          {/* Tips callout */}
                          {post.tips?.length > 0 && (
                            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"14px 16px", marginTop:8 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Tip: Quick Tips</div>
                              {post.tips.map((tip, i) => (
                                <div key={i} style={{ display:"flex", gap:8, marginBottom: i < post.tips.length - 1 ? 8 : 0 }}>
                                  <span style={{ color:T.accent, fontWeight:700, flexShrink:0, fontSize:13 }}>→</span>
                                  <span style={{ fontSize:12, color:T.text2, lineHeight:1.6 }}>{tip}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Navigation between posts */}
                          <div style={{ display:"flex", gap:10, marginTop:24 }}>
                            {blogPostIndex > 0 && (
                              <button onClick={() => setBlogPostIndex(i => i - 1)}
                                style={{ flex:1, padding:"10px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.text2, fontSize:12, cursor:"pointer", textAlign:"left" }}>
                                ← {BLOG_POSTS[blogPostIndex - 1].title.split(":")[0]}
                              </button>
                            )}
                            {blogPostIndex < BLOG_POSTS.length - 1 && (
                              <button onClick={() => setBlogPostIndex(i => i + 1)}
                                style={{ flex:1, padding:"10px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.text2, fontSize:12, cursor:"pointer", textAlign:"right" }}>
                                {BLOG_POSTS[blogPostIndex + 1].title.split(":")[0]} →
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Messages */}
        <div ref={chatContainerRef} style={{ flex:1, overflowY:"auto", padding:"74px 20px 24px", backgroundImage:"radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize:"24px 24px" }}>
          {msgs.map(m => (
            <div key={m.id} className="msg-enter" style={{ marginBottom:20, display:"flex", gap:12, justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
              {m.role==="ai" && (
                <div style={{ width:32, height:32, borderRadius:"50%", overflow:"hidden", border:`1px solid ${T.border}`, flexShrink:0, marginTop:2 }}>
                <img src={CHATFI_AVATAR} alt="ChatFi" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
              </div>
              )}
              <div style={{ maxWidth:"72%", padding:m.role==="user"?"10px 16px":"12px 16px", borderRadius:m.role==="user"?"18px 18px 4px 18px":"4px 18px 18px 18px", background:m.role==="user"?T.accent:T.surface, color:m.role==="user"?"#0d1117":T.text1, border:m.role==="ai"?`1px solid ${T.border}`:"none", fontSize:14, lineHeight:1.6 }}>
                {m.walletCard ? (() => {
                  const wc = m.walletCard;
                  const providerIcon = wc.provider === "google"
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    : wc.provider === "twitter"
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill={T.text1}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.743l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    : wc.provider === "discord"
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;

                  // Token logo map for common tokens
                  const TOKEN_LOGOS_WC = {
                    SOL:  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
                    USDC: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
                    USDT: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
                    JUP:  "https://static.jup.ag/jup/icon.png",
                    BONK: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q89kGzNb39cE",
                    WIF:  "https://bafkreibk3covs5ltyqxa272uodhkulxv5vdrdebf7m5b6vc6qoibkqhzm.ipfs.nftstorage.link",
                  };
                  const addrShort = wc.address ? wc.address.slice(0,6) + "…" + wc.address.slice(-6) : "";
                  const providerLabel = wc.provider ? wc.provider.charAt(0).toUpperCase() + wc.provider.slice(1) : "Social";

                  return (
                    <div style={{ width:"100%" }}>

                      {/* ── Premium wallet card ─────────────────────────── */}
                      <div style={{
                        borderRadius:16,
                        overflow:"hidden",
                        border:`1px solid ${T.accent}33`,
                        marginBottom:10,
                        background:`linear-gradient(135deg, #0e1c0e 0%, #111d11 40%, #0d1a18 100%)`,
                        boxShadow:`0 0 32px ${T.accent}18, 0 2px 8px rgba(0,0,0,0.5)`,
                        position:"relative",
                      }}>
                        {/* Decorative glow rings */}
                        <div style={{ position:"absolute", top:-40, right:-40, width:120, height:120, borderRadius:"50%", background:`${T.accent}08`, pointerEvents:"none" }}/>
                        <div style={{ position:"absolute", bottom:-30, left:-20, width:90, height:90, borderRadius:"50%", background:`${T.accent}06`, pointerEvents:"none" }}/>

                        {/* Card top: provider badge + status */}
                        <div style={{ padding:"12px 16px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(0,0,0,0.3)", borderRadius:20, padding:"4px 10px 4px 6px", border:`1px solid ${T.accent}22` }}>
                            <div style={{ width:18, height:18, borderRadius:"50%", background:`${T.accent}22`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              {providerIcon}
                            </div>
                            <span style={{ fontSize:10, fontWeight:700, color:T.text2, textTransform:"uppercase", letterSpacing:"0.07em" }}>{providerLabel}</span>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:5, background:`${T.accent}18`, borderRadius:20, padding:"4px 10px", border:`1px solid ${T.accent}44` }}>
                            <div style={{ width:6, height:6, borderRadius:"50%", background:T.accent, boxShadow:`0 0 6px ${T.accent}` }}/>
                            <span style={{ fontSize:10, fontWeight:700, color:T.accent, letterSpacing:"0.05em" }}>ACTIVE</span>
                          </div>
                        </div>

                        {/* Main balance area */}
                        <div style={{ padding:"14px 16px 12px" }}>
                          {/* SOL logo + balance */}
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                            <img src={TOKEN_LOGOS_WC.SOL} alt="SOL"
                              style={{ width:32, height:32, borderRadius:"50%", border:`2px solid ${T.accent}33`, flexShrink:0 }}
                              onError={e => e.currentTarget.style.display="none"} />
                            <div>
                              <div style={{ fontSize:26, fontWeight:800, color:T.text1, letterSpacing:"-0.5px", lineHeight:1.1 }}>
                                {wc.solBalance} <span style={{ fontSize:14, fontWeight:600, color:T.text3 }}>SOL</span>
                              </div>
                              {wc.solUSD && (
                                <div style={{ fontSize:12, color:T.text3, marginTop:1 }}>≈ <span style={{ color:T.accent, fontWeight:600 }}>${wc.solUSD}</span></div>
                              )}
                            </div>
                          </div>

                          {/* Email */}
                          <div style={{ fontSize:11, color:T.text3, marginTop:6 }}>
                            <span style={{ color:T.text2 }}>{wc.emailLabel}</span>
                          </div>
                        </div>

                        {/* Divider */}
                        <div style={{ height:1, background:`linear-gradient(90deg, transparent, ${T.accent}33, transparent)` }}/>

                        {/* Wallet address row */}
                        <div style={{ padding:"10px 16px", display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:9, color:T.text3, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:3 }}>Embedded Solana Wallet</div>
                            <div style={{ fontFamily:"monospace", fontSize:11, color:T.text2, letterSpacing:"0.02em" }}>{addrShort}</div>
                          </div>
                          <button onClick={() => navigator.clipboard.writeText(wc.address).catch(()=>{})}
                            style={{ flexShrink:0, background:"rgba(0,0,0,0.3)", border:`1px solid ${T.accent}33`, borderRadius:8, padding:"5px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:T.accent, fontSize:10, fontWeight:700, whiteSpace:"nowrap", transition:"all 0.15s" }}
                            className="hov-btn">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            Copy
                          </button>
                          <a href={`https://solscan.io/account/${wc.address}`} target="_blank" rel="noreferrer"
                            style={{ flexShrink:0, background:"rgba(0,0,0,0.3)", border:`1px solid ${T.border}`, borderRadius:8, padding:"5px 10px", textDecoration:"none", display:"flex", alignItems:"center", gap:5, color:T.text3, fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            Explorer
                          </a>
                        </div>

                        {/* Token holdings row */}
                        {wc.tokens?.length > 0 && (<>
                          <div style={{ height:1, background:`linear-gradient(90deg, transparent, ${T.border}, transparent)` }}/>
                          <div style={{ padding:"10px 16px", display:"flex", flexWrap:"wrap", gap:6 }}>
                            {wc.tokens.map(t => (
                              <div key={t.symbol} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(0,0,0,0.3)", border:`1px solid ${T.border}`, borderRadius:8, padding:"4px 10px" }}>
                                {TOKEN_LOGOS_WC[t.symbol] && (
                                  <img src={TOKEN_LOGOS_WC[t.symbol]} alt={t.symbol}
                                    style={{ width:14, height:14, borderRadius:"50%", flexShrink:0 }}
                                    onError={e => e.currentTarget.style.display="none"} />
                                )}
                                <span style={{ fontSize:11, fontWeight:700, color:T.text1 }}>{t.amount}</span>
                                <span style={{ fontSize:10, color:T.text3 }}>{t.symbol}</span>
                              </div>
                            ))}
                          </div>
                        </>)}
                      </div>

                      {/* Quick action buttons */}
                      <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                        {[
                          { label:"Send", icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>, action:"send tokens" },
                          { label:"Swap", icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>, action:"swap tokens" },
                          { label:"Portfolio", icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, action:"my portfolio" },
                          { label:"Earn", icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>, action:"earn yield" },
                        ].map(btn => (
                          <button key={btn.label}
                            onClick={() => {
                              const inputEl = document.querySelector("input[placeholder*='prices']") || document.querySelector("textarea");
                              if (inputEl) { inputEl.value = btn.action; inputEl.dispatchEvent(new Event("input", {bubbles:true})); }
                            }}
                            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 4px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, cursor:"pointer", color:T.text2, fontSize:10, fontWeight:600, transition:"all 0.15s" }}
                            className="hov-btn">
                            {btn.icon}
                            {btn.label}
                          </button>
                        ))}
                      </div>

                      <div style={{ fontSize:11, color:T.text3, textAlign:"center", paddingTop:2 }}>What would you like to do?</div>
                    </div>
                  );
                })() : <div dangerouslySetInnerHTML={{ __html:fmt(m.text) }} />}
                {m.showConnectBtn && !wallet && (
                  <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:8 }}>
                    {/* ── Social / email login via Privy ── */}
                    <button onClick={connectWithPrivy}
                      style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"10px 16px", background:T.accent, border:"none", borderRadius:10, color:"#0d1117", fontSize:13, fontWeight:700, cursor:"pointer", width:"100%" }}>
                      {/* Mail icon */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d1117" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      Sign in with Email / Google
                    </button>
                    {/* ── External wallet (Phantom, Backpack, etc.) via Reown ── */}
                    <button onClick={connectWithReown}
                      style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:10, color:T.text1, fontSize:13, fontWeight:600, cursor:"pointer", width:"100%" }}>
                      <SvgLink size={14} color={T.text1}/> Connect Wallet
                    </button>
                  </div>
                )}
                {m.clawbackItems?.length > 0 && (
                  <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:6 }}>
                    {m.clawbackItems.map((inv, idx) => (
                      <div key={idx} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"7px 10px" }}>
                        <span style={{ fontSize:12, color:T.text2, display:"flex", alignItems:"center", gap:5 }}><SvgArrowReturn size={12} color={T.text2}/> {inv.amount} {inv.token}</span>
                        <button onClick={() => doClawback(inv.code)}
                          style={{ padding:"5px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:7, color:T.text2, fontSize:11, cursor:"pointer", whiteSpace:"nowrap" }}>
                          Claw Back
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {m.powerCommand && (() => {
                  const { id, token, gathered } = m.powerCommand;
                  const btns = [];
                  if (id==="SMART_ENTRY" && token) {
                    btns.push({ label:`Buy ${token} now`,          action:()=>send(`swap $100 USDC to ${token}`) });
                    btns.push({ label:`Limit order ${token}`,      action:()=>send(`limit order buy ${token} below ${gathered.price?(gathered.price*0.98).toFixed(gathered.price<1?6:4):"market"}`) });
                    btns.push({ label:`DCA into ${token}`,         action:()=>send(`DCA $20 USDC into ${token} daily for 5 days`) });
                  }
                  if (id==="EXIT_STRATEGY" && token) {
                    btns.push({ label:`Market sell ${token}`,      action:()=>send(`swap all my ${token} to USDC`) });
                    btns.push({ label:`Limit sell +3%`,            action:()=>send(`limit order sell ${token} above ${gathered.limitSuggestion||"current price"}`) });
                    btns.push({ label:`OCO bracket`,               action:()=>send(`OCO on ${token} TP ${gathered.limitSuggestion} SL ${gathered.price?(gathered.price*0.95).toFixed(gathered.price<1?6:4):"market"}`) });
                  }
                  if (id==="DEEP_DIVE" && token) {
                    btns.push({ label:`Buy ${token}`,              action:()=>send(`swap $100 USDC to ${token}`) });
                    btns.push({ label:`Price alert`,               action:()=>send(`alert me when ${token} is above ${gathered.price?(gathered.price*1.1).toFixed(gathered.price<1?6:4):"current price"}`) });
                    btns.push({ label:`Show swap route`,           action:()=>send(`show route USDC to ${token}`) });
                  }
                  if (id==="PORTFOLIO_PULSE") {
                    if (gathered.idleStable) btns.push({ label:`Earn yield on idle $${gathered.idleStable}`, action:()=>send("show earn vaults") });
                    btns.push({ label:`Full portfolio`,            action:()=>send("my portfolio") });
                    btns.push({ label:`Open DCA orders`,           action:()=>send("my recurring orders") });
                  }
                  if (!btns.length) return null;
                  return (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginTop:12 }}>
                      {btns.map((b,i) => (
                        <button key={i} onClick={b.action}
                          style={{ fontSize:12, fontWeight:600, color:T.accent, background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:20, padding:"6px 14px", cursor:"pointer", transition:"all 0.15s", whiteSpace:"nowrap" }}
                          onMouseEnter={e=>{ e.currentTarget.style.background=T.accent; e.currentTarget.style.color="#0d1117"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.background=T.accentBg; e.currentTarget.style.color=T.accent; }}>
                          {b.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}

          {typing && (
            <div style={{ display:"flex", gap:12, marginBottom:20 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", overflow:"hidden", border:`1px solid ${T.border}` }}>
              <img src={CHATFI_AVATAR} alt="ChatFi" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
            </div>
              <div style={{ padding:"12px 16px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:"4px 18px 18px 18px", display:"flex", gap:5, alignItems:"center" }}>
                <span className="dot1"/><span className="dot2"/><span className="dot3"/>
              </div>
            </div>
          )}

          {/* ── Token Info Card ───────────────────────────────────────────── */}
          {showTokenCard && tokenCardData && (() => {
            const info = tokenCardData;
            const mint = info.address || info.id || info.mint || "";
            const fmtUSD = (n, dp=2) => n != null && n > 0 ? `$${Number(n) >= 1e9 ? (Number(n)/1e9).toFixed(1)+"B" : Number(n) >= 1e6 ? (Number(n)/1e6).toFixed(2)+"M" : Number(n) >= 1e3 ? (Number(n)/1e3).toFixed(1)+"K" : Number(n).toLocaleString(undefined,{maximumFractionDigits:dp})}` : null;
            const fmtNum = (n) => n != null ? Number(n).toLocaleString() : null;
            const price   = info.usdPrice != null ? (info.usdPrice < 0.0001 ? `$${info.usdPrice.toExponential(4)}` : info.usdPrice < 1 ? `$${info.usdPrice.toFixed(6)}` : `$${info.usdPrice.toFixed(4)}`) : null;
            const chgRaw  = info.priceChange24h;
            const chg24h  = chgRaw != null ? `${chgRaw > 0 ? "+" : ""}${chgRaw.toFixed(2)}%` : null;
            const chgUp   = chgRaw != null && chgRaw >= 0;
            const mcap    = fmtUSD(info.market_cap || info.mcap, 0);
            const fdv     = fmtUSD(info.fdv, 0);
            const liq     = fmtUSD(info.liquidity, 0);
            const vol     = fmtUSD(info.daily_volume, 0);
            const holders = info.holderCount ? fmtNum(info.holderCount) : null;
            const circ    = info.circSupply ? fmtNum(Math.round(info.circSupply)) : null;
            const buys    = info.numBuys24h ? fmtNum(info.numBuys24h) : null;
            const sells   = info.numSells24h ? fmtNum(info.numSells24h) : null;
            const traders = info.numTraders24h ? fmtNum(info.numTraders24h) : null;
            const buyVol  = fmtUSD(info.buyVolume24h, 0);
            const sellVol = fmtUSD(info.sellVolume24h, 0);
            const poolAge = info.firstPoolAt ? (() => {
              const days = Math.floor((Date.now() - new Date(info.firstPoolAt)) / 86400000);
              return days < 1 ? "< 1 day" : days === 1 ? "1 day" : days < 365 ? `${days}d` : `${(days/365).toFixed(1)}y`;
            })() : null;
            const verified    = info.isVerified || info.tags?.includes("verified");
            const isSus       = info.audit?.isSus;
            const hasFreeze   = info.freezeAuthority || info.audit?.freezeAuthorityDisabled === false;
            const hasMintAuth = info.mint_authority  || info.audit?.mintAuthorityDisabled === false;
            const organicScore = info.organicScore != null ? Math.round(info.organicScore) : null;
            const organicColor = organicScore >= 80 ? T.green : organicScore >= 50 ? "#f6ad55" : T.red;
            const logoUrl = info.icon || info.logoURI || info.logo_url || TOKEN_LOGO_URLS[info.symbol?.toUpperCase()] || (mint ? `https://img.jup.ag/tokens/${mint}` : null);

            return (
              <div style={{ margin:"0 0 20px 44px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:"hidden" }}>

                {/* ── Hero header with logo + name + price ── */}
                <div style={{ padding:"16px", background:`linear-gradient(135deg, #161e27 0%, #1a2535 100%)`, borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      {/* Logo */}
                      <div style={{ width:48, height:48, borderRadius:14, overflow:"hidden", flexShrink:0, background:"linear-gradient(135deg, #1e2d3d, #253545)", border:`1.5px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:T.text2, position:"relative" }}>
                        {logoUrl
                          ? <img src={logoUrl} alt={info.symbol} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e => e.target.style.display="none"} />
                          : <span>{(info.symbol||"?").slice(0,2)}</span>
                        }
                      </div>
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                          <span style={{ fontFamily:T.serif, fontSize:17, fontWeight:700, color:T.text1 }}>{info.name || info.symbol}</span>
                          {verified && (
                            <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:10, fontWeight:700, color:T.accent, background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:20, padding:"1px 7px" }}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Verified
                            </span>
                          )}
                          {isSus && <span style={{ fontSize:10, fontWeight:700, color:T.red, background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:20, padding:"1px 7px" }}>Sus</span>}
                        </div>
                        <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>{info.symbol} · <span style={{ fontFamily:"monospace", fontSize:11 }}>{mint.slice(0,8)}…{mint.slice(-4)}</span></div>
                      </div>
                    </div>
                    <button onClick={() => setShowTokenCard(false)} style={{ background:"none", border:"none", color:T.text3, fontSize:18, cursor:"pointer", lineHeight:1, padding:"4px 6px", alignSelf:"flex-start" }}>✕</button>
                  </div>

                  {/* Price + 24h change */}
                  {price && (
                    <div style={{ display:"flex", alignItems:"flex-end", gap:10 }}>
                      <div style={{ fontSize:28, fontWeight:800, color:T.text1, lineHeight:1 }}>{price}</div>
                      {chg24h && (
                        <div style={{ fontSize:13, fontWeight:700, color: chgUp ? T.green : T.red, background: chgUp ? T.greenBg : T.redBg, border:`1px solid ${chgUp ? T.greenBd : T.redBd}`, borderRadius:8, padding:"3px 9px", lineHeight:1.4, marginBottom:2 }}>
                          {chgUp ? "▲" : "▼"} {chg24h}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ padding:14, display:"flex", flexDirection:"column", gap:12 }}>

                  {/* ── Price Chart ── */}
                  {mint && <TokenMiniChart mint={mint} T={T} />}

                  {/* ── Market Data Grid ── */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {[
                      { label:"Mkt Cap",   value:mcap },
                      { label:"FDV",       value:fdv },
                      { label:"Liquidity", value:liq },
                      { label:"24h Vol",   value:vol },
                      { label:"Holders",   value:holders },
                      { label:"Age",       value:poolAge ? poolAge + " old" : null },
                    ].filter(r => r.value).map(({ label, value }) => (
                      <div key={label} style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10 }}>
                        <div style={{ fontSize:10, color:T.text3, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:3 }}>{label}</div>
                        <div style={{ fontSize:14, fontWeight:700, color:T.text1 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── 24h Trading Activity ── */}
                  {(buys || sellVol) && (
                    <div style={{ padding:"12px 14px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:12 }}>
                      <div style={{ fontSize:10, color:T.text3, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>24h Trading Activity</div>
                      <div style={{ display:"flex", gap:8 }}>
                        {(buys || sells) && (
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:10, color:T.text3, marginBottom:3 }}>Buys / Sells</div>
                            <div style={{ fontSize:13, fontWeight:600 }}>
                              <span style={{ color:T.green }}>{buys||"—"}</span>
                              <span style={{ color:T.text3 }}> / </span>
                              <span style={{ color:T.red }}>{sells||"—"}</span>
                            </div>
                            {traders && <div style={{ fontSize:10, color:T.text3, marginTop:2 }}>{traders} traders</div>}
                          </div>
                        )}
                        {(buyVol || sellVol) && (
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:10, color:T.text3, marginBottom:3 }}>Buy / Sell Vol</div>
                            <div style={{ fontSize:13, fontWeight:600 }}>
                              <span style={{ color:T.green }}>{buyVol||"—"}</span>
                              <span style={{ color:T.text3 }}> / </span>
                              <span style={{ color:T.red }}>{sellVol||"—"}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Buy vs Sell pressure bar */}
                      {info.buyVolume24h > 0 && info.sellVolume24h > 0 && (() => {
                        const total = info.buyVolume24h + info.sellVolume24h;
                        const buyPct = Math.round((info.buyVolume24h / total) * 100);
                        return (
                          <div style={{ marginTop:10 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3, marginBottom:3 }}>
                              <span style={{ color:T.green }}>Buy {buyPct}%</span>
                              <span style={{ color:T.red }}>Sell {100-buyPct}%</span>
                            </div>
                            <div style={{ height:5, borderRadius:5, background:T.redBg, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${buyPct}%`, background:T.green, borderRadius:5, transition:"width 0.5s" }}/>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── Organic Score + Safety ── */}
                  {(organicScore != null || hasFreeze || hasMintAuth || info.topHoldersPercentage != null) && (
                    <div style={{ padding:"12px 14px", background: isSus ? T.redBg : T.bg, border:`1px solid ${isSus ? T.redBd : T.border}`, borderRadius:12 }}>
                      <div style={{ fontSize:10, color:T.text3, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Safety & Trust</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {organicScore != null && (
                          <div style={{ flex:1, minWidth:120 }}>
                            <div style={{ fontSize:10, color:T.text3, marginBottom:4 }}>Organic Score</div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ flex:1, height:5, borderRadius:5, background:T.border, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${organicScore}%`, background:organicColor, borderRadius:5 }}/>
                              </div>
                              <span style={{ fontSize:13, fontWeight:800, color:organicColor }}>{organicScore}</span>
                            </div>
                            {info.organicScoreLabel && <div style={{ fontSize:10, color:organicColor, marginTop:2 }}>{info.organicScoreLabel}</div>}
                          </div>
                        )}
                        <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
                          {verified && <span style={{ fontSize:11, color:T.green }}>✓ Verified</span>}
                          {hasFreeze && <span style={{ fontSize:11, color:"#f6ad55" }}>Freeze auth</span>}
                          {hasMintAuth && <span style={{ fontSize:11, color:"#f6ad55" }}>Mint auth</span>}
                          {isSus && <span style={{ fontSize:11, color:T.red, fontWeight:700 }}>Flagged suspicious</span>}
                          {info.topHoldersPercentage != null && <span style={{ fontSize:11, color:T.text3 }}>Top holders: {info.topHoldersPercentage.toFixed(1)}%</span>}
                          {info.devMints != null && <span style={{ fontSize:11, color:T.text3 }}>Dev mints: {info.devMints}</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Supply ── */}
                  {circ && (
                    <div style={{ display:"flex", gap:8 }}>
                      <div style={{ flex:1, padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10 }}>
                        <div style={{ fontSize:10, color:T.text3, marginBottom:3 }}>Circ Supply</div>
                        <div style={{ fontSize:13, fontWeight:600, color:T.text1 }}>{circ}</div>
                      </div>
                      {info.totalSupply && Math.round(info.totalSupply) !== Math.round(info.circSupply) && (
                        <div style={{ flex:1, padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10 }}>
                          <div style={{ fontSize:10, color:T.text3, marginBottom:3 }}>Total Supply</div>
                          <div style={{ fontSize:13, fontWeight:600, color:T.text1 }}>{fmtNum(Math.round(info.totalSupply))}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Token metadata ── */}
                  {(info.launchpad || info.graduatedAt || info.decimals !== undefined || info.tags?.length) && (
                    <div style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, display:"flex", flexWrap:"wrap", gap:"4px 14px", fontSize:11, color:T.text3 }}>
                      {info.launchpad && <span>Launchpad: <span style={{color:T.text2}}>{info.launchpad}</span></span>}
                      {info.graduatedAt && <span>Graduated: <span style={{color:T.text2}}>{new Date(info.graduatedAt).toLocaleDateString()}</span></span>}
                      {info.decimals !== undefined && <span>Decimals: <span style={{color:T.text2}}>{info.decimals}</span></span>}
                      {info.tags?.slice(0,5).map(tag => (
                        <span key={tag} style={{ padding:"1px 7px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.text2, fontWeight:500 }}>{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* ── Social links ── */}
                  {(info.twitter || info.website || info.telegram || info.discord) && (
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {[
                        { key:"twitter",  label:"Twitter / X", icon:"𝕏", url:info.twitter },
                        { key:"website",  label:"Website",     icon:"Web", url:info.website },
                        { key:"telegram", label:"Telegram",    icon:"Telegram", url:info.telegram },
                        { key:"discord",  label:"Discord",     icon:"Discord", url:info.discord },
                      ].filter(s => s.url).map(s => (
                        <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer"
                          style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 13px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, color:T.text2, textDecoration:"none", fontSize:12, fontWeight:500 }}>
                          <span>{s.icon}</span> {s.label}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* ── Action buttons ── */}
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => { setShowTokenCard(false); send(`Swap SOL to ${info.symbol}`); }}
                      style={{ flex:1, padding:"10px", background:T.accent, border:"none", borderRadius:10, color:"#0d1117", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      Swap → {info.symbol}
                    </button>
                    <a href={`https://jup.ag/swap/SOL-${mint}`} target="_blank" rel="noopener noreferrer"
                      style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"10px", background:"none", border:`1px solid ${T.border}`, borderRadius:10, color:T.text2, fontSize:13, fontWeight:500, textDecoration:"none" }}>
                      View on Jupiter ↗
                    </a>
                  </div>
                </div>
              </div>
            );
          })()}

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
                  Note: Token not found in popular list — use "Search any token…" dropdown to find it on Jupiter.
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
                  style={{ flex:1, padding:"10px", background:T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:14, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
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
          {/* ── Trigger v2 order panel ─────────────────────────────────────── */}
          {showTrigV2 && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:4, color:T.text1 }}>Trigger Order (v2 · USD price)</div>
              <div style={{ fontSize:11, color:T.text3, marginBottom:14 }}>Private off-chain orders · vault-based · OCO/OTOCO supported · min $10</div>

              {/* Order type tabs */}
              <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                {[["single","Limit"],["oco","OCO TP/SL"],["otoco","OTOCO"]].map(([t,label]) => (
                  <button key={t} onClick={() => setTrigV2Cfg(c=>({...c, orderType:t}))}
                    style={{ flex:1, padding:"7px 4px", fontSize:12, fontWeight:600, borderRadius:8, border:"none", cursor:"pointer",
                      background: trigV2Cfg.orderType===t ? T.purple : T.bg,
                      color: trigV2Cfg.orderType===t ? "#fff" : T.text2 }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Order type description */}
              <div style={{ fontSize:11, color:T.text3, background:T.bg, borderRadius:8, padding:"7px 10px", marginBottom:12 }}>
                {{ single:"Single price trigger — buy or sell when the market crosses your target.",
                   oco:"One-Cancels-Other — take-profit + stop-loss sharing one deposit. When one fills, the other cancels.",
                   otoco:"Entry trigger fires first, then activates a TP/SL pair on the output automatically." }[trigV2Cfg.orderType]}
              </div>

              {/* From / To tokens */}
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Spend</div>
                  <TokenPicker value={trigV2Cfg.from} jupFetch={jupFetch}
                    onSelect={({symbol,mint,decimals}) => setTrigV2Cfg(c=>({...c,from:symbol,fromMint:mint,fromDecimals:decimals}))} />
                </div>
                <div style={{ display:"flex", alignItems:"center", paddingTop:18, color:T.text3, fontSize:18 }}>→</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Receive</div>
                  <TokenPicker value={trigV2Cfg.to} jupFetch={jupFetch}
                    onSelect={({symbol,mint,decimals}) => setTrigV2Cfg(c=>({...c,to:symbol,toMint:mint,toDecimals:decimals}))} />
                </div>
              </div>

              {/* Amount */}
              <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Amount ({trigV2Cfg.from})</div>
              <input type="number" min="0" placeholder="e.g. 100"
                value={trigV2Cfg.amount}
                onChange={e => setTrigV2Cfg(c=>({...c, amount:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:10 }}
              />

              {/* Single: trigger direction + price */}
              {(trigV2Cfg.orderType === "single" || trigV2Cfg.orderType === "otoco") && (
                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Direction</div>
                    <select value={trigV2Cfg.triggerCondition}
                      onChange={e => setTrigV2Cfg(c=>({...c, triggerCondition:e.target.value}))}
                      style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}>
                      <option value="below">Buy when price is below</option>
                      <option value="above">Sell when price is above</option>
                    </select>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>
                      {trigV2Cfg.orderType === "otoco" ? "Entry price (USD)" : "Trigger price (USD)"}
                    </div>
                    <input type="number" min="0" placeholder="e.g. 150"
                      value={trigV2Cfg.triggerPriceUsd}
                      onChange={e => setTrigV2Cfg(c=>({...c, triggerPriceUsd:e.target.value}))}
                      onBlur={() => setTimeout(() => setDirectTokenOpen(false), 180)}
                      style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                    />
                  </div>
                </div>
              )}

              {/* OCO / OTOCO: TP + SL prices */}
              {(trigV2Cfg.orderType === "oco" || trigV2Cfg.orderType === "otoco") && (
                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:T.accent, marginBottom:4 }}>Take-profit ($)</div>
                    <input type="number" min="0" placeholder="e.g. 200"
                      value={trigV2Cfg.tpPriceUsd}
                      onChange={e => setTrigV2Cfg(c=>({...c, tpPriceUsd:e.target.value}))}
                      style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.greenBd}`, borderRadius:8, background:T.bg, color:T.accent, fontSize:13 }}
                    />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:T.red, marginBottom:4 }}>Stop-loss ($)</div>
                    <input type="number" min="0" placeholder="e.g. 120"
                      value={trigV2Cfg.slPriceUsd}
                      onChange={e => setTrigV2Cfg(c=>({...c, slPriceUsd:e.target.value}))}
                      style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.redBd}`, borderRadius:8, background:T.bg, color:T.red, fontSize:13 }}
                    />
                  </div>
                </div>
              )}

              {/* Slippage + expiry row */}
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Slippage (bps)</div>
                  <input type="number" min="0" max="10000" placeholder="100"
                    value={trigV2Cfg.slippageBps}
                    onChange={e => setTrigV2Cfg(c=>({...c, slippageBps:e.target.value}))}
                    style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                  />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Expires in (days)</div>
                  <select value={trigV2Cfg.expiryDays}
                    onChange={e => setTrigV2Cfg(c=>({...c, expiryDays:e.target.value}))}
                    style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}>
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                  </select>
                </div>
              </div>

              {/* Auth note */}
              <div style={{ fontSize:11, color:T.text3, marginBottom:10 }}>
                Placing will prompt a message-sign for authentication, then a deposit transaction.
              </div>

              <div style={{ display:"flex", gap:8 }}>
                <button onClick={doTriggerV2}
                  disabled={!trigV2Cfg.amount || trigV2Status === "authing" || trigV2Status === "signing"}
                  className="hov-btn"
                  style={{ flex:1, padding:"10px", background: trigV2Status ? T.border : T.purple, border:"none", borderRadius:8, color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  {trigV2Status === "authing" ? "Authenticating…" : trigV2Status === "signing" ? "Sign deposit tx…" : "Place Trigger Order"}
                </button>
                <button onClick={() => setShowTrigV2(false)}
                  style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Trigger orders list panel ──────────────────────────────────── */}
          {showTrigOrders && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>My Trigger Orders</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => fetchTrigV2Orders("active")}
                    style={{ padding:"5px 12px", fontSize:12, background:T.purpleBg, border:`1px solid ${T.purple}`, borderRadius:6, color:T.purple, cursor:"pointer" }}>
                    Active
                  </button>
                  <button onClick={() => fetchTrigV2Orders("past")}
                    style={{ padding:"5px 12px", fontSize:12, background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, color:T.text2, cursor:"pointer" }}>
                    History
                  </button>
                  <button onClick={() => setShowTrigOrders(false)}
                    style={{ padding:"5px 10px", fontSize:12, background:"none", border:`1px solid ${T.border}`, borderRadius:6, color:T.text3, cursor:"pointer" }}>
                    ✕
                  </button>
                </div>
              </div>

              {trigOrdersLoading && <div style={{ textAlign:"center", padding:20, color:T.text3, fontSize:13 }}>Loading…</div>}
              {!trigOrdersLoading && trigV2Orders.length === 0 && <div style={{ textAlign:"center", padding:20, color:T.text3, fontSize:13 }}>No orders found.</div>}

              {!trigOrdersLoading && trigV2Orders.map((o, i) => {
                const inSym  = Object.entries(TOKEN_MINTS).find(([,v])=>v===o.inputMint)?.[0]  || o.inputMint?.slice(0,6)  || "?";
                const outSym = Object.entries(TOKEN_MINTS).find(([,v])=>v===o.outputMint)?.[0] || o.outputMint?.slice(0,6) || "?";
                const stateColor = { open:T.accent, filled:T.green, cancelled:T.text3, expired:T.text3, failed:T.red, executing:T.teal }[o.orderState] || T.text3;
                const typeLabel  = { single:"Limit", oco:"OCO", otoco:"OTOCO" }[o.orderType] || o.orderType;
                const isCancellable = o.orderState === "open";
                const created = o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—";
                const expires = o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : "—";
                // Pull price fields
                const trigPx  = o.triggerPriceUsd != null ? `$${Number(o.triggerPriceUsd).toFixed(4)}` : null;
                const tpPx    = o.tpPriceUsd      != null ? `$${Number(o.tpPriceUsd).toFixed(4)}`      : null;
                const slPx    = o.slPriceUsd      != null ? `$${Number(o.slPriceUsd).toFixed(4)}`      : null;
                return (
                  <div key={o.id || i} style={{ padding:14, border:`1px solid ${T.border}`, borderRadius:10, marginBottom:10, background:T.bg }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                      <div>
                        <span style={{ fontWeight:600, fontSize:13, color:T.text1 }}>{inSym} → {outSym}</span>
                        <span style={{ marginLeft:8, fontSize:11, color:T.text3 }}>{typeLabel}</span>
                      </div>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, fontWeight:600, background:T.surface, color:stateColor }}>
                        {o.orderState}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:T.text3, display:"flex", flexWrap:"wrap", gap:"4px 14px", marginBottom:8 }}>
                      {o.initialInputAmount && <span>Size: {(parseInt(o.initialInputAmount)/1e6).toFixed(2)} {inSym}</span>}
                      {trigPx && <span>Trigger: {o.triggerCondition} {trigPx}</span>}
                      {tpPx   && <span style={{color:T.accent}}>TP: {tpPx}</span>}
                      {slPx   && <span style={{color:T.red}}>SL: {slPx}</span>}
                      <span>Created: {created}</span>
                      <span>Expires: {expires}</span>
                      {o.id && <span style={{fontFamily:"monospace"}}>ID: {o.id.slice(0,10)}…</span>}
                    </div>
                    {/* Fill info if filled */}
                    {o.orderState === "filled" && o.outputAmount && (
                      <div style={{ fontSize:11, color:T.accent, marginBottom:8 }}>
                        Filled — received {o.outputAmount} {outSym}{o.fillPercent ? ` (${Math.round(o.fillPercent*100)}%)` : ""}
                      </div>
                    )}
                    {isCancellable && (
                      <button onClick={() => cancelTrigV2Order(o.id)} className="hov-btn"
                        style={{ padding:"7px 16px", fontSize:12, background:"none", border:`1px solid ${T.red}`, borderRadius:8, color:T.red, cursor:"pointer", fontWeight:500 }}>
                        Cancel &amp; Withdraw
                      </button>
                    )}
                    {o.orderState === "filled" && o.events?.find(e=>e.type==="fill")?.txSignature && (
                      <a href={`https://solscan.io/tx/${o.events.find(e=>e.type==="fill").txSignature}`} target="_blank" rel="noreferrer"
                        style={{ fontSize:11, color:T.teal }}>View fill tx →</a>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Recurring / DCA order panel ──────────────────────────────────── */}
          {showRecurring && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:4, color:T.text1 }}>Recurring Order (DCA)</div>
              <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>Time-based: buys a fixed amount on a set schedule</div>

              {/* From / To token row */}
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Spend token</div>
                  <TokenPicker value={recurringCfg.from} jupFetch={jupFetch}
                    onSelect={({symbol,mint,decimals}) => setRecurringCfg(c=>({...c, from:symbol, fromMint:mint, fromDecimals:decimals}))} />
                </div>
                <div style={{ display:"flex", alignItems:"center", paddingTop:18, color:T.text3, fontSize:18 }}>→</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Receive token</div>
                  <TokenPicker value={recurringCfg.to} jupFetch={jupFetch}
                    onSelect={({symbol,mint,decimals}) => setRecurringCfg(c=>({...c, to:symbol, toMint:mint, toDecimals:decimals}))} />
                </div>
              </div>

              {/* Amount per cycle */}
              <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Amount per order ({recurringCfg.from})</div>
              <input type="number" min="0" placeholder="e.g. 10"
                value={recurringCfg.amountPerCycle}
                onChange={e => setRecurringCfg(c=>({...c, amountPerCycle:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:10 }}
              />

              {/* Interval selector */}
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Frequency</div>
                  <select value={recurringCfg.intervalSecs}
                    onChange={e => setRecurringCfg(c=>({...c, intervalSecs:e.target.value}))}
                    style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}>
                    <option value="60">Every minute</option>
                    <option value="300">Every 5 minutes</option>
                    <option value="3600">Every hour</option>
                    <option value="86400">Every day</option>
                    <option value="604800">Every week</option>
                    <option value="2592000">Every month</option>
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Number of orders</div>
                  <input type="number" min="1" max="999" placeholder="e.g. 10"
                    value={recurringCfg.numberOfOrders}
                    onChange={e => setRecurringCfg(c=>({...c, numberOfOrders:e.target.value}))}
                    style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                  />
                </div>
              </div>

              {/* Summary line */}
              {recurringCfg.amountPerCycle && recurringCfg.numberOfOrders && (
                <div style={{ fontSize:12, color:T.accent, background:T.accentBg, border:`1px solid ${T.greenBd}`, borderRadius:8, padding:"8px 12px", marginBottom:12 }}>
                  Total: <strong>{(parseFloat(recurringCfg.amountPerCycle||0)*parseInt(recurringCfg.numberOfOrders||0)).toFixed(2)} {recurringCfg.from}</strong> spent over{" "}
                  {{ "60":"minutes","300":"minutes","3600":"hours","86400":"days","604800":"weeks","2592000":"months" }[recurringCfg.intervalSecs] || "periods"}
                  {" "}({recurringCfg.numberOfOrders}× {recurringCfg.amountPerCycle} {recurringCfg.from})
                </div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                <button onClick={doRecurring}
                  disabled={!recurringCfg.amountPerCycle || !recurringCfg.numberOfOrders || recurringStatus === "signing"}
                  className="hov-btn"
                  style={{ flex:1, padding:"10px", background: recurringStatus==="signing" ? T.border : T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  {recurringStatus === "signing" ? "Signing…" : "Create Recurring Order"}
                </button>
                <button onClick={() => setShowRecurring(false)}
                  style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Recurring orders list panel ───────────────────────────────────── */}
          {showRecurringOrders && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>My Recurring Orders</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => fetchRecurringOrders("active")}
                    style={{ padding:"5px 12px", fontSize:12, background:T.accentBg, border:`1px solid ${T.greenBd}`, borderRadius:6, color:T.accent, cursor:"pointer" }}>
                    Active
                  </button>
                  <button onClick={() => fetchRecurringOrders("history")}
                    style={{ padding:"5px 12px", fontSize:12, background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, color:T.text2, cursor:"pointer" }}>
                    History
                  </button>
                  <button onClick={() => setShowRecurringOrders(false)}
                    style={{ padding:"5px 10px", fontSize:12, background:"none", border:`1px solid ${T.border}`, borderRadius:6, color:T.text3, cursor:"pointer" }}>
                    ✕
                  </button>
                </div>
              </div>

              {recurringOrdersLoading && (
                <div style={{ textAlign:"center", padding:20, color:T.text3, fontSize:13 }}>Loading orders…</div>
              )}

              {!recurringOrdersLoading && recurringOrders.length === 0 && (
                <div style={{ textAlign:"center", padding:20, color:T.text3, fontSize:13 }}>No orders found.</div>
              )}

              {!recurringOrdersLoading && recurringOrders.map((o, i) => {
                // Resolve symbol labels from mint addresses
                const inSym  = Object.entries(TOKEN_MINTS).find(([,v])=>v===o.inputMint)?.[0]  || o.inputMint?.slice(0,6)  || "?";
                const outSym = Object.entries(TOKEN_MINTS).find(([,v])=>v===o.outputMint)?.[0] || o.outputMint?.slice(0,6) || "?";
                const freq   = o.cycleFrequency;
                const freqLabel = freq <= 60 ? "1 min" : freq <= 300 ? "5 min" : freq <= 3600 ? "1 hr" : freq <= 86400 ? "1 day" : freq <= 604800 ? "1 wk" : "1 mo";
                const deposited  = parseFloat(o.inDeposited  || 0);
                const used       = parseFloat(o.inUsed       || 0);
                const received   = parseFloat(o.outReceived  || 0);
                const withdrawn  = parseFloat(o.outWithdrawn || 0);
                const pctDone    = deposited > 0 ? Math.round((used / deposited) * 100) : 0;
                const tradeCount = Array.isArray(o.trades) ? o.trades.length : 0;
                const created    = o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—";
                const isClosed   = o.userClosed || !!o.closeTx;

                return (
                  <div key={o.orderKey || i}
                    style={{ padding:14, border:`1px solid ${isClosed ? T.border : T.greenBd}`, borderRadius:10, marginBottom:10, background:T.bg }}>

                    {/* Header row */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                      <div>
                        <span style={{ fontWeight:600, fontSize:13, color:T.text1 }}>{inSym} → {outSym}</span>
                        <span style={{ marginLeft:8, fontSize:11, color:T.text3 }}>{o.inAmountPerCycle} {inSym} / {freqLabel}</span>
                      </div>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, fontWeight:600,
                        background: isClosed ? T.border : T.accentBg,
                        color: isClosed ? T.text3 : T.accent }}>
                        {isClosed ? "Closed" : "Active"}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {!isClosed && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:T.text3, marginBottom:3 }}>
                          <span>{used} / {deposited} {inSym} spent ({pctDone}%)</span>
                          <span>{tradeCount} trade{tradeCount!==1?"s":""}</span>
                        </div>
                        <div style={{ height:4, borderRadius:4, background:T.border }}>
                          <div style={{ height:"100%", width:`${pctDone}%`, borderRadius:4, background:T.accent, transition:"width 0.3s" }} />
                        </div>
                      </div>
                    )}

                    {/* Stats */}
                    <div style={{ fontSize:11, color:T.text3, display:"flex", flexWrap:"wrap", gap:"4px 16px", marginBottom:isClosed?0:10 }}>
                      <span>Received: {received} {outSym}</span>
                      {withdrawn > 0 && <span>Withdrawn: {withdrawn} {outSym}</span>}
                      <span>Created: {created}</span>
                      {o.orderKey && <span style={{ fontFamily:"monospace" }}>ID: {o.orderKey.slice(0,10)}…</span>}
                    </div>

                    {/* Cancel button — only for active */}
                    {!isClosed && (
                      <button onClick={() => cancelRecurringOrder(o.orderKey)} className="hov-btn"
                        style={{ padding:"7px 16px", fontSize:12, background:"none", border:`1px solid ${T.red}`, borderRadius:8, color:T.red, cursor:"pointer", fontWeight:500 }}>
                        Cancel Order
                      </button>
                    )}

                    {/* Closed tx link */}
                    {isClosed && o.closeTx && (
                      <a href={`https://solscan.io/tx/${o.closeTx}`} target="_blank" rel="noreferrer"
                        style={{ fontSize:11, color:T.teal }}>View close tx →</a>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Prediction markets list ───────────────────────────────────── */}
          {showPredList && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:4, color:T.text1 }}>
                Prediction Markets{predCategory && predCategory !== "null" ? ` — ${predCategory}` : ""}
              </div>
              {predMarkets.length > 0 ? (
                <>
                  <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>{predMarkets.length} event{predMarkets.length!==1?"s":""} found</div>
                  {predMarkets.slice(0,20).map((evt, i) => {
                    // ── Real Jupiter API schema (from docs Apr 2026) ──────────────────
                    // Event fields: eventId, category, volumeUsd, metadata.title,
                    //   metadata.closeTime, metadata.subtitle
                    // markets[]: each market IS one outcome — marketId, status, metadata.title,
                    //   metadata.isTeamMarket, pricing.buyYesPriceUsd, pricing.buyNoPriceUsd
                    const evtTitle  = evt.metadata?.title  || evt.title  || evt.name  || "Prediction Event";
                    const evtSubtitle = evt.metadata?.subtitle || evt.subtitle || "";
                    const closeTs   = evt.metadata?.closeTime || evt.closeTime || evt.endTime;
                    const cat       = evt.category || predCategory || "";
                    const vol       = parseFloat(evt.volumeUsd || evt.volume || 0);
                    const volFmt    = vol > 0 ? (vol >= 1_000_000 ? `$${(vol/1_000_000).toFixed(1)}M` : `$${(vol/1_000).toFixed(0)}K`) : null;
                    const closeSoon = closeTs && (() => {
                      const ms = typeof closeTs === "number" ? closeTs * 1000 : new Date(closeTs).getTime();
                      return ms - Date.now() < 86400000 * 3;
                    })();

                    // All markets for this event — each is one outcome option
                    const allMarkets = Array.isArray(evt.markets) ? evt.markets : (evt.market ? [evt.market] : []);
                    // Only tradeable markets
                    const openMarkets = allMarkets.filter(mk => mk.status === "open" || !mk.status);
                    const displayMarkets = (openMarkets.length > 0 ? openMarkets : allMarkets)
                      // Sort by YES price desc (highest probability first)
                      .sort((a, b) => (b.pricing?.buyYesPriceUsd ?? 0) - (a.pricing?.buyYesPriceUsd ?? 0));

                    return (
                      <div key={evt.eventId || i}
                        style={{ padding:"14px", border:`1px solid ${T.border}`, borderRadius:10, marginBottom:10, background:T.bg }}>
                        {/* Event title */}
                        <div style={{ fontWeight:600, fontSize:13, color:T.text1, marginBottom:3, lineHeight:1.4 }}>{evtTitle}</div>
                        {evtSubtitle && <div style={{ fontSize:11, color:T.text3, marginBottom:5, fontStyle:"italic" }}>{evtSubtitle}</div>}
                        {/* Meta row */}
                        <div style={{ fontSize:11, color:T.text3, display:"flex", flexWrap:"wrap", gap:10, marginBottom:10 }}>
                          {cat && <span>{cat}</span>}
                          {closeTs && (
                            <span style={{ color: closeSoon ? T.red : T.text3 }}>
                              {closeSoon ? "Closes " : ""}{new Date(typeof closeTs==="number"?closeTs*1000:closeTs).toLocaleDateString()}
                            </span>
                          )}
                          {volFmt && <span>{volFmt} vol</span>}
                        </div>
                        {/* One row per market/outcome — each has its own YES + NO price */}
                        {displayMarkets.length > 0 ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            {displayMarkets.map((mk, mi) => {
                              // Market title = the outcome name (e.g. "Gavin Newsom", "Arsenal wins")
                              const outcomeLabel = mk.metadata?.title || mk.title || mk.name || `Option ${mi+1}`;
                              const marketId     = mk.marketId || mk.id || mk.pubkey;
                              const yesRaw       = mk.pricing?.buyYesPriceUsd;
                              const noRaw        = mk.pricing?.buyNoPriceUsd;
                              const yesPr        = yesRaw != null ? `$${(yesRaw/1_000_000).toFixed(2)}` : null;
                              const noPr         = noRaw  != null ? `$${(noRaw /1_000_000).toFixed(2)}` : null;
                              // Probability = YES price / $1.00
                              const pct          = yesRaw != null ? Math.round(yesRaw / 10_000) : null;
                              const isClosed     = mk.status && mk.status !== "open";
                              return (
                                <div key={marketId || mi} style={{ border:`1px solid ${T.border}`, borderRadius:7, overflow:"hidden", opacity: isClosed ? 0.5 : 1 }}>
                                  {/* Outcome name + probability bar */}
                                  <div style={{ padding:"6px 10px 4px", background:T.surface }}>
                                    <div style={{ fontWeight:600, fontSize:12, color:T.text1, lineHeight:1.3 }}>{outcomeLabel}</div>
                                    {pct != null && (
                                      <div style={{ marginTop:3 }}>
                                        <div style={{ height:3, borderRadius:3, background:T.border, overflow:"hidden" }}>
                                          <div style={{ height:"100%", width:`${Math.min(pct,100)}%`, background:`linear-gradient(90deg,${T.green},${T.greenBd})`, borderRadius:3 }}/>
                                        </div>
                                        <div style={{ fontSize:10, color:T.text3, marginTop:1 }}>{pct}%</div>
                                      </div>
                                    )}
                                  </div>
                                  {/* YES / NO buttons */}
                                  {!isClosed && marketId ? (
                                    <div style={{ display:"flex" }}>
                                      <button onClick={() => {
                                        setBetMarket({ marketId, title: evtTitle, outcomeLabel, priceDisplay: yesPr, yesPrice: yesRaw != null ? (yesRaw/1_000_000).toFixed(2) : null });
                                        setBetSide("yes"); setBetAmount("5"); setShowBet(true); setShowPredList(false);
                                      }} className="hov-btn"
                                        style={{ flex:1, padding:"7px 6px", background:T.greenBg, border:"none", borderTop:`1px solid ${T.greenBd}`, borderRight:`1px solid ${T.greenBd}`, color:T.green, fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"center" }}>
                                        YES {yesPr || ""}
                                      </button>
                                      <button onClick={() => {
                                        setBetMarket({ marketId, title: evtTitle, outcomeLabel: `NO: ${outcomeLabel}`, priceDisplay: noPr, yesPrice: noRaw != null ? (noRaw/1_000_000).toFixed(2) : null });
                                        setBetSide("no"); setBetAmount("5"); setShowBet(true); setShowPredList(false);
                                      }} className="hov-btn"
                                        style={{ flex:1, padding:"7px 6px", background:T.redBg, border:"none", borderTop:`1px solid ${T.redBd}`, color:T.red, fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"center" }}>
                                        NO {noPr || ""}
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ padding:"6px 10px", fontSize:10, color:T.text3, fontStyle:"italic" }}>
                                      {isClosed ? "Closed" : "Not tradeable"}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize:11, color:T.text3, fontStyle:"italic" }}>No open markets for this event</div>
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
                Note: This is AI analysis. To place a real on-chain bet, ask <em>"Show prediction markets"</em> and pick from live Jupiter markets below.
              </div>
              <button onClick={() => { setShowPred(false); send("Show prediction markets"); }}
                style={{ padding:"8px 16px", background:T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:13, fontWeight:500, cursor:"pointer", marginRight:8 }} className="hov-btn">
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
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, minWidth:0, overflow:"hidden" }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:8, color:T.text1 }}>Place Prediction Bet</div>
              <div style={{ fontSize:13, color:T.text2, marginBottom:14, padding:"8px 12px", background:T.bg, borderRadius:8, lineHeight:1.5 }}>{betMarket.title}</div>

              {/* Token selector + live balances */}
              {(() => {
                const usdcBal   = portfolio.USDC   ?? 0;
                const jupusdBal = portfolio.JUPUSD ?? 0;
                const noBalance = usdcBal < 5 && jupusdBal < 5;
                return (<>
                  <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                    {["USDC","JUPUSD"].map(m => (
                      <button key={m} onClick={() => setBetMint(m)} className="hov-btn"
                        style={{ padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", border:`1px solid ${betMint===m?T.accent:T.border}`, background:betMint===m?T.accentBg:"transparent", color:betMint===m?T.accent:T.text2 }}>
                        {m} · ${m==="USDC" ? usdcBal.toFixed(2) : jupusdBal.toFixed(2)}
                      </button>
                    ))}
                  </div>
                  {noBalance && (
                    <div style={{ fontSize:12, color:T.red, background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, padding:"8px 12px", marginBottom:12 }}>
                      Note: You need at least $5 USDC or JupUSD to place a bet.
                      <button onClick={() => { setShowBet(false); send("Swap SOL to USDC"); }}
                        style={{ marginLeft:8, padding:"3px 10px", background:T.accent, border:"none", borderRadius:6, color:"#0d1117", fontSize:11, cursor:"pointer" }}>
                        Swap SOL → USDC →
                      </button>
                    </div>
                  )}
                </>);
              })()}

              <div style={{ fontSize:12, color:T.text3, marginBottom:10 }}>
                {betMarket.outcomeLabel ? "Selected outcome:" : "Choose outcome:"}
              </div>
              {betMarket.outcomeLabel ? (
                <div style={{ padding:"12px 14px", background:T.greenBg, border:`2px solid ${T.greenBd}`, borderRadius:10, marginBottom:16 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:T.green }}>{betMarket.outcomeLabel}</div>
                  {betMarket.priceDisplay && (
                    <div style={{ fontSize:12, color:T.green, opacity:0.85, marginTop:4 }}>
                      Price: {betMarket.priceDisplay}
                      {betMarket.yesPrice && betAmount && parseFloat(betAmount) >= 5
                        ? ` · Est. win: $${(parseFloat(betAmount) / parseFloat(betMarket.yesPrice)).toFixed(2)}`
                        : ""}
                    </div>
                  )}
                  <button onClick={() => { setShowBet(false); setShowPredList(true); }}
                    style={{ marginTop:8, fontSize:11, background:"none", border:`1px solid ${T.greenBd}`, borderRadius:6, color:T.green, padding:"3px 10px", cursor:"pointer" }}>
                    ← Pick a different outcome
                  </button>
                </div>
              ) : (
                <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                  {[
                    { side:"yes", label:"YES", sublabel: betMarket.yesOutcome || "", price:betMarket.yesPrice, bg:T.greenBg, bd:T.greenBd, col:T.green },
                    { side:"no",  label:"NO",  sublabel: betMarket.noOutcome  || "", price:betMarket.noPrice,  bg:T.redBg,  bd:T.redBd,  col:T.red  },
                  ].map(({ side, label, sublabel, price, bg, bd, col }) => {
                    const prob = price ? Math.round(parseFloat(price) * 100) + "%" : null;
                    const payout = price && betAmount && parseFloat(betAmount) >= 5
                      ? `Win $${(parseFloat(betAmount) / parseFloat(price)).toFixed(2)}`
                      : null;
                    return (
                      <button key={side} onClick={() => setBetSide(side)} className="hov-pick"
                        style={{ flex:1, padding:"12px 8px", border:`2px solid ${betSide===side?col:T.border}`, borderRadius:10, background:betSide===side?bg:T.bg, color:betSide===side?col:T.text2, fontSize:13, fontWeight:betSide===side?700:400, cursor:"pointer", transition:"all 0.15s", textAlign:"center" }}>
                        <div style={{ fontSize:15, fontWeight:700 }}>{label}</div>
                        {sublabel && <div style={{ fontSize:11, opacity:0.85, marginTop:1, lineHeight:1.3 }}>{sublabel}</div>}
                        {price && <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>${price} · {prob}</div>}
                        {payout && betSide===side && <div style={{ fontSize:11, color:col, marginTop:2 }}>{payout}</div>}
                      </button>
                    );
                  })}
                </div>
              )}
              <div style={{ marginBottom:8 }}>
                <input type="number" placeholder="Amount (USDC, min $5)" value={betAmount}
                  onChange={e => setBetAmount(e.target.value)}
                  style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, boxSizing:"border-box" }}
                />
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
                <button onClick={doPredictionBet}
                  disabled={!betSide || !betAmount || parseFloat(betAmount) < 5 || betStatus === "signing"} className="hov-btn"
                  style={{ flex:1, padding:"9px 12px", background:betSide==="yes"?T.green:betSide==="no"?T.red:T.text3, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", opacity:(!betSide||parseFloat(betAmount)<5)?0.5:1 }}>
                  {betStatus === "signing" ? <><span className="spinner"/> Signing…</> : `Confirm ${betSide ? betSide.toUpperCase() : "Pick"}`}
                </button>
                <button onClick={() => setShowBet(false)}
                  style={{ flex:"0 0 auto", padding:"9px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer", whiteSpace:"nowrap" }}>
                  Cancel
                </button>
              </div>
              {parseFloat(betAmount) < 5 && betAmount !== "" && <div style={{ fontSize:11, color:T.red }}>Minimum bet is $5 USDC</div>}
              <div style={{ fontSize:11, color:T.text3, marginTop:8 }}>
                Pays out $1 per winning contract · No fees · Min bet $5
              </div>
            </div>
          )}

          {/* ── Earn / Lend vaults panel ──────────────────────────────────── */}
          {showEarn && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Jupiter Earn Vaults</div>
                <div style={{ fontSize:11, background:T.tealBg, border:`1px solid ${T.teal}20`, borderRadius:10, padding:"2px 8px", color:T.teal }}>Live yield</div>
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

              {!earnLoading && earnVaults.map((v) => {
                const userPos = earnUserPositions[v.token?.toUpperCase()];
                const hasPosition = userPos && userPos.amount > 0;
                return (
                <div key={v.id} className="vault-card"
                  style={{ padding:"14px 16px", border:`1px solid ${hasPosition ? T.green+"55" : T.border}`, borderRadius:10, marginBottom:10, background: hasPosition ? `${T.green}08` : T.bg, transition:"all 0.15s", cursor:"default" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        {v.logoUrl && <img src={v.logoUrl} alt={v.token} style={{ width:20, height:20, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} onError={e=>e.target.style.display="none"} />}
                        <div style={{ fontWeight:600, fontSize:14, color:T.text1 }}>{v.token} Earn Vault</div>
                        {hasPosition && <span style={{ fontSize:10, background:`${T.green}22`, color:T.green, border:`1px solid ${T.green}44`, borderRadius:6, padding:"1px 6px", fontWeight:600 }}>Deposited</span>}
                      </div>
                      <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>
                        by Jupiter Lend
                        {v.tvl > 0 && <span style={{ marginLeft:8 }}>· TVL: ${Number(v.tvl).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                        {v.utilization !== null && v.utilization !== undefined && (
                          <span style={{ marginLeft:8 }}>· Util: {v.utilization}%</span>
                        )}
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
                      {/* ── User position row ── */}
                      {hasPosition && (
                        <div style={{ marginTop:8, padding:"6px 10px", background:`${T.green}12`, border:`1px solid ${T.green}33`, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <span style={{ fontSize:11, color:T.text3 }}>Your position</span>
                          <span style={{ fontSize:13, fontWeight:700, color:T.green }}>
                            {userPos.amount.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:4 })} {v.token}
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                      <div style={{ fontSize:22, fontWeight:800, color:T.green, lineHeight:1 }}>{v.apyDisplay}</div>
                      <div style={{ fontSize:10, color:T.text3, marginBottom:8, marginTop:2 }}>Total APY</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
                        <button
                          onClick={() => { setEarnDeposit({ vault:v, amount:"" }); setShowEarnDeposit(true); }} className="hov-btn"
                          style={{ padding:"6px 16px", background:T.accent, border:"none", borderRadius:6, color:"#0d1117", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                          Deposit
                        </button>
                        <button
                          onClick={() => { setEarnWithdraw({ vault:v, amount:"", positionAmount: userPos?.amount || 0 }); setShowEarnWithdraw(true); }} className="hov-btn"
                          style={{ padding:"5px 14px", background:"none", border:`1px solid ${hasPosition ? T.green+"66" : T.border}`, borderRadius:6, color: hasPosition ? T.green : T.text2, fontSize:11, cursor:"pointer" }}>
                          Withdraw
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}

              <button onClick={() => setShowEarn(false)}
                style={{ marginTop:4, padding:"6px 14px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          )}

          {/* ── Borrow panel ─────────────────────────────────────────────── */}
          {showBorrow && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Borrow from Jupiter Lend</div>
                <span style={{ fontSize:10, padding:"2px 7px", background:T.tealBg, border:`1px solid ${T.teal}33`, borderRadius:10, color:T.teal, fontWeight:600 }}>COLLATERAL</span>
                <span style={{ fontSize:10, padding:"2px 7px", background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:10, color:T.accent, fontWeight:600 }}>COMING SOON</span>
              </div>
              <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>Deposit collateral → borrow against it. Up to 95% LTV. Position is an NFT on-chain.</div>

              {/* Vault selector */}
              <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Select vault</div>
              <select value={borrowCfg.vaultId}
                onChange={e => {
                  const v = MULTIPLY_VAULTS.find(x => x.vaultId === parseInt(e.target.value));
                  if (v) setBorrowCfg(c => ({ ...c, vaultId:v.vaultId, collateral:v.collateral, debt:v.debt, colDecimals:v.colDecimals, debtDecimals:v.debtDecimals }));
                }}
                style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:10 }}>
                {MULTIPLY_VAULTS.map(v => (
                  <option key={v.vaultId} value={v.vaultId}>{v.collateral} → {v.debt} · LTV {v.ltv} · {v.risk} risk</option>
                ))}
              </select>

              {/* Amounts row */}
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Collateral to deposit ({borrowCfg.collateral})</div>
                  <input type="number" min="0" placeholder="e.g. 10"
                    value={borrowCfg.colAmount}
                    onChange={e => setBorrowCfg(c => ({ ...c, colAmount:e.target.value }))}
                    style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                  />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Amount to borrow ({borrowCfg.debt})</div>
                  <input type="number" min="0" placeholder="e.g. 200"
                    value={borrowCfg.borrowAmount}
                    onChange={e => setBorrowCfg(c => ({ ...c, borrowAmount:e.target.value }))}
                    style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                  />
                </div>
              </div>

              {/* Info box */}
              {borrowCfg.colAmount && (
                <div style={{ fontSize:12, color:T.teal, background:T.tealBg, border:`1px solid ${T.teal}33`, borderRadius:8, padding:"8px 12px", marginBottom:12, lineHeight:1.7 }}>
                  Deposit <strong>{borrowCfg.colAmount} {borrowCfg.collateral}</strong> · Borrow <strong>{borrowCfg.borrowAmount || "?"} {borrowCfg.debt}</strong><br/>
                  <span style={{ fontSize:11, color:T.text3 }}>Max LTV: {(MULTIPLY_VAULTS.find(v=>v.vaultId===borrowCfg.vaultId)||MULTIPLY_VAULTS[0]).ltv} · Position NFT created automatically · positionId:0</span>
                </div>
              )}

              {/* Warning */}
              <div style={{ fontSize:11, color:T.text3, background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, padding:"7px 10px", marginBottom:12 }}>
                Note: Borrowing accrues interest. Keep LTV below the liquidation threshold or your collateral may be sold.
              </div>

              {/* Coming Soon notice */}
              <div style={{ background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:10, padding:"14px 16px", marginBottom:12, textAlign:"center" }}>
                <div style={{ fontSize:13, fontWeight:700, color:T.accent, marginBottom:4 }}>In-App Borrow — Coming Soon</div>
                <div style={{ fontSize:11, color:T.text2, marginBottom:12, lineHeight:1.6 }}>
                  The Jupiter Lend Borrow API is not yet publicly available.<br/>
                  Use the Jupiter app to open or manage borrow positions.
                </div>
                <a href={`https://jup.ag/lend`} target="_blank" rel="noreferrer"
                  style={{ display:"inline-block", padding:"9px 22px", background:T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:13, fontWeight:700, textDecoration:"none" }}>
                  Open Jupiter Lend ↗
                </a>
              </div>

              <button onClick={() => setShowBorrow(false)}
                style={{ width:"100%", padding:"9px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          )}

          {/* ── Send panel ────────────────────────────────────────────── */}
          {showSend && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Send Tokens</div>
              </div>

              {/* Mode toggle */}
              <div style={{ display:"flex", gap:4, background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:3, marginBottom:14 }}>
                {[["invite","Invite Link"],["direct","Direct Transfer"]].map(([mode, label]) => (
                  <button key={mode} onClick={() => { setSendMode(mode); setSendStatus(null); setSendLink(""); setSendTxSig(""); }}
                    style={{ flex:1, padding:"7px", borderRadius:8, border:"none", background: sendMode===mode ? T.accent : "none", color: sendMode===mode ? "#0d1117" : T.text2, fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}>
                    {label}
                  </button>
                ))}
              </div>

              {sendMode === "invite" ? (<>
                <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>
                  Send tokens to anyone — recipient doesn't need a wallet. They claim via the link. You can claw back unclaimed tokens anytime.
                </div>
                <div style={{ fontSize:11, color:"#f6ad55", background:"#2e1f0a", border:"1px solid #f6ad5544", borderRadius:8, padding:"7px 10px", marginBottom:10 }}>
                  Note: Jupiter Send only supports <strong>SOL</strong> and <strong>USDC</strong>. Other tokens will fail at the claim step.
                </div>
                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Token</div>
                    <select value={sendCfg.token}
                      onChange={e => {
                        const sym = e.target.value;
                        const mint = sym === "SOL" ? TOKEN_MINTS.SOL : TOKEN_MINTS.USDC;
                        const decimals = sym === "SOL" ? 9 : 6;
                        tokenCacheRef.current[sym] = mint;
                        tokenDecimalsRef.current[sym] = decimals;
                        setSendCfg(c => ({ ...c, token: sym, mint }));
                      }}
                      style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, cursor:"pointer" }}>
                      <option value="SOL">SOL</option>
                      <option value="USDC">USDC</option>
                    </select>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Amount</div>
                    <input type="number" min="0" placeholder="e.g. 1"
                      value={sendCfg.amount}
                      onChange={e => setSendCfg(c => ({ ...c, amount:e.target.value }))}
                      onBlur={() => setTimeout(() => setDirectTokenOpen(false), 180)}
                      style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                    />
                  </div>
                </div>
                {sendCfg.amount && (
                  <div style={{ fontSize:12, color:T.teal, background:T.tealBg, border:`1px solid ${T.teal}33`, borderRadius:8, padding:"8px 12px", marginBottom:12, lineHeight:1.7 }}>
                    Sending <strong>{sendCfg.amount} {sendCfg.token}</strong> via invite link<br/>
                    <span style={{ fontSize:11, color:T.text3 }}>From: {walletFull?.slice(0,4)}…{walletFull?.slice(-4)} · Unclaimed tokens auto-clawable</span>
                  </div>
                )}
                <div style={{ fontSize:11, color:T.text3, background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:8, padding:"7px 10px", marginBottom:12 }}>
                  The invite link is generated on-chain. Share it via any app — the recipient creates a wallet when claiming.
                </div>
                <button onClick={doSend}
                  disabled={!sendCfg.amount || parseFloat(sendCfg.amount) <= 0 || sendStatus === "signing"}
                  style={{ width:"100%", padding:"11px", background: (!sendCfg.amount || sendStatus==="signing") ? T.border : T.accent, border:"none", borderRadius:10, color:"#0d1117", fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:8 }}>
                  {sendStatus === "signing" ? <><span className="spinner" style={{ borderTopColor:"#0d1117", display:"inline-block", marginRight:6 }}/> Signing…</> : `Send ${sendCfg.amount||""} ${sendCfg.token} via Invite Link`}
                </button>
                {sendStatus === "done" && sendLink && (
                  <div style={{ marginTop:4, marginBottom:8, background:T.tealBg, border:`1px solid ${T.teal}44`, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:T.teal, marginBottom:6 }}>Invite link ready — share to recipient</div>
                    <div style={{ fontSize:11, color:T.text2, wordBreak:"break-all", background:T.bg, borderRadius:6, padding:"6px 10px", marginBottom:8, fontFamily:"monospace" }}>
                      {sendLink}
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={() => navigator.clipboard.writeText(sendLink)}
                        style={{ flex:1, padding:"8px", background:T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        Copy Link
                      </button>
                      <button onClick={() => { const code = sendLink.split("code=")[1]; if (code) doClawback(code); }}
                        style={{ flex:1, padding:"8px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:12, cursor:"pointer" }}>
                        Claw Back
                      </button>
                    </div>
                  </div>
                )}
              </>) : (<>
                {/* Direct Transfer */}
                <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>
                  Send any token directly to a Solana wallet address. The transaction settles on-chain immediately.
                </div>

                {/* Recipient */}
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Recipient Wallet Address</div>
                  <input placeholder="Solana wallet address (e.g. 7xKX…)"
                    value={sendRecipient}
                    onChange={e => setSendRecipient(e.target.value)}
                    style={{ width:"100%", padding:"9px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:12, fontFamily:"monospace" }}
                  />
                </div>

                {/* Token + Amount */}
                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <div style={{ flex:1, position:"relative" }}>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Token</div>
                    <input
                      value={directTokenQuery}
                      placeholder="Search any token…"
                      onFocus={() => {
                        setDirectTokenOpen(true);
                        if (directTokenQuery) {
                          // trigger search on focus
                          clearTimeout(directTokenTimerRef.current);
                          directTokenTimerRef.current = setTimeout(async () => {
                            setDirectTokenLoading(true);
                            try {
                              const q = directTokenQuery;
                              const [v2raw, v1raw] = await Promise.allSettled([
                                fetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(q)}`).then(r=>r.json()),
                                fetch(`${JUP_BASE}/tokens/v1/search?query=${encodeURIComponent(q)}&limit=50`).then(r=>r.json()),
                              ]);
                              const toList = (r) => { const d = r.status==="fulfilled"?r.value:[]; return Array.isArray(d)?d:(d?.tokens||d?.data||[]); };
                              const v2list = toList(v2raw).map(t=>({...t,address:t.id||t.address}));
                              const v1list = toList(v1raw).map(t=>({...t,address:t.address||t.id}));
                              const seen = new Set(v2list.map(t=>t.address).filter(Boolean));
                              const merged = [...v2list, ...v1list.filter(t=>t.address&&!seen.has(t.address))];
                              const upper = q.trim().toUpperCase();
                              merged.sort((a,b)=>{
                                const as=(a.symbol||"").toUpperCase()===upper?0:1, bs=(b.symbol||"").toUpperCase()===upper?0:1;
                                if(as!==bs) return as-bs;
                                return 0;
                              });
                              setDirectTokenResults(merged.slice(0,8));
                            } catch { setDirectTokenResults([]); }
                            setDirectTokenLoading(false);
                          }, 0);
                        }
                      }}
                      onChange={e => {
                        const q = e.target.value;
                        setDirectTokenQuery(q);
                        setDirectTokenOpen(true);
                        clearTimeout(directTokenTimerRef.current);
                        if (!q) { setDirectTokenResults([]); return; }
                        directTokenTimerRef.current = setTimeout(async () => {
                          setDirectTokenLoading(true);
                          try {
                            const [v2raw, v1raw] = await Promise.allSettled([
                              fetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(q)}`).then(r=>r.json()),
                              fetch(`${JUP_BASE}/tokens/v1/search?query=${encodeURIComponent(q)}&limit=50`).then(r=>r.json()),
                            ]);
                            const toList = (r) => { const d = r.status==="fulfilled"?r.value:[]; return Array.isArray(d)?d:(d?.tokens||d?.data||[]); };
                            const v2list = toList(v2raw).map(t=>({...t,address:t.id||t.address}));
                            const v1list = toList(v1raw).map(t=>({...t,address:t.address||t.id}));
                            const seen = new Set(v2list.map(t=>t.address).filter(Boolean));
                            const merged = [...v2list, ...v1list.filter(t=>t.address&&!seen.has(t.address))];
                            const upper = q.trim().toUpperCase();
                            merged.sort((a,b)=>{
                              const as=(a.symbol||"").toUpperCase()===upper?0:1, bs=(b.symbol||"").toUpperCase()===upper?0:1;
                              if(as!==bs) return as-bs;
                              return 0;
                            });
                            setDirectTokenResults(merged.slice(0,8));
                          } catch { setDirectTokenResults([]); }
                          setDirectTokenLoading(false);
                        }, 350);
                      }}
                      onBlur={() => setTimeout(() => setDirectTokenOpen(false), 180)}
                      style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                    />
                    {directTokenOpen && (directTokenResults.length > 0 || directTokenLoading) && (
                      <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:200, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, marginTop:2, maxHeight:220, overflowY:"auto", boxShadow:"0 4px 16px rgba(0,0,0,0.4)" }}>
                        {directTokenLoading && <div style={{ padding:"8px 12px", fontSize:12, color:T.text3 }}>Searching…</div>}
                        {directTokenResults.map(t => (
                          <button key={t.address} onClick={() => {
                            setSendCfg(c => ({ ...c, token: t.symbol, mint: t.address }));
                            tokenCacheRef.current[t.symbol] = t.address;
                            tokenDecimalsRef.current[t.symbol] = t.decimals ?? 6;
                            setDirectTokenQuery(t.symbol);
                            setDirectTokenOpen(false);
                          }}
                            style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 12px", background:"none", border:"none", borderBottom:`1px solid ${T.border}44`, cursor:"pointer", textAlign:"left" }}
                            className="hov-btn">
                            {t.logoURI && <img src={t.logoURI} alt="" style={{ width:22, height:22, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} onError={e=>e.currentTarget.style.display="none"}/>}
                            <div>
                              <div style={{ fontSize:13, fontWeight:600, color:T.text1 }}>{t.symbol}</div>
                              <div style={{ fontSize:10, color:T.text3 }}>{(t.name||"").slice(0,28)}</div>
                            </div>
                            {t.tags?.includes("verified") && <span style={{ marginLeft:"auto", fontSize:9, color:T.green, border:`1px solid ${T.green}44`, borderRadius:4, padding:"1px 5px" }}>verified</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Amount</div>
                    <input type="number" min="0" placeholder="e.g. 1"
                      value={sendCfg.amount}
                      onChange={e => setSendCfg(c => ({ ...c, amount:e.target.value }))}
                      onBlur={() => setTimeout(() => setDirectTokenOpen(false), 180)}
                      style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                    />
                  </div>
                </div>

                {/* Preview */}
                {sendCfg.amount && sendRecipient && (
                  <div style={{ fontSize:12, color:T.teal, background:T.tealBg, border:`1px solid ${T.teal}33`, borderRadius:8, padding:"8px 12px", marginBottom:12, lineHeight:1.7 }}>
                    Sending <strong>{sendCfg.amount} {sendCfg.token}</strong> directly to<br/>
                    <span style={{ fontFamily:"monospace", fontSize:11, color:T.text2, wordBreak:"break-all" }}>{sendRecipient}</span>
                  </div>
                )}

                <button onClick={doDirectSend}
                  disabled={!sendCfg.amount || !sendRecipient || parseFloat(sendCfg.amount) <= 0 || sendStatus === "signing"}
                  style={{ width:"100%", padding:"11px", background:(!sendCfg.amount || !sendRecipient || sendStatus==="signing") ? T.border : T.accent, border:"none", borderRadius:10, color:"#0d1117", fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:8 }}>
                  {sendStatus === "signing" ? <><span className="spinner" style={{ borderTopColor:"#0d1117", display:"inline-block", marginRight:6 }}/> Signing…</> : `Send ${sendCfg.amount||""} ${sendCfg.token} Directly`}
                </button>

                {sendStatus === "done" && sendTxSig && (
                  <div style={{ marginBottom:8, background:T.tealBg, border:`1px solid ${T.teal}44`, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:T.teal, marginBottom:6 }}>Transfer confirmed on-chain</div>
                    <div style={{ fontSize:11, color:T.text2, wordBreak:"break-all", fontFamily:"monospace", background:T.bg, borderRadius:6, padding:"6px 10px", marginBottom:8 }}>{sendTxSig}</div>
                    <button onClick={() => window.open(`https://solscan.io/tx/${sendTxSig}`, "_blank")}
                      style={{ width:"100%", padding:"8px", background:T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      View on Solscan
                    </button>
                  </div>
                )}

                {sendStatus === "error" && (
                  <div style={{ fontSize:12, color:T.red, background:`${T.red}18`, border:`1px solid ${T.red}44`, borderRadius:8, padding:"8px 12px", marginBottom:8 }}>
                    Transaction failed. Check your balance and recipient address.
                  </div>
                )}
              </>)}

              <button onClick={() => { setShowSend(false); setSendStatus(null); setSendTxSig(""); }}
                style={{ width:"100%", padding:"9px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                Cancel
              </button>
            </div>
          )}

          {/* ── Portfolio panel ───────────────────────────────────────── */}
          {showPortfolio && (
            <div style={{ margin:"0 0 20px 44px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:"hidden" }}>
              {/* Header */}
              <div style={{ padding:"16px 16px 12px", borderBottom:`1px solid ${T.border}`, background:`linear-gradient(135deg, #161e27 0%, #1a2535 100%)` }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg, ${T.accent}22, ${T.accent}44)`, border:`1px solid ${T.accent}44`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <SvgBarChart size={18} color={T.accent}/>
                    </div>
                    <div>
                      <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:600, color:T.text1 }}>Portfolio</div>
                      <div style={{ fontSize:10, color:T.text3, fontFamily:"monospace", marginTop:1 }}>{walletFull?.slice(0,6)}…{walletFull?.slice(-6)}</div>
                    </div>
                  </div>
                  <button onClick={() => setShowPortfolio(false)} style={{ background:"none", border:"none", color:T.text3, fontSize:18, cursor:"pointer", lineHeight:1, padding:"4px 6px" }}>✕</button>
                </div>
              </div>

              {portfolioLoading ? (
                <div style={{ padding:20, fontSize:12, color:T.text3, display:"flex", alignItems:"center", gap:8 }}>
                  <span className="spinner" style={{ borderTopColor:T.accent }}/> Loading portfolio…
                </div>
              ) : !portfolioData ? (
                <div style={{ padding:20, fontSize:12, color:T.text3 }}>No data available.</div>
              ) : (
                <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>

                  {/* ── Net Worth Banner ── */}
                  {(() => {
                    const walletUsd = Object.entries(portfolioData.walletBalances || {}).reduce((sum, [sym, bal]) => {
                      return sum + (portfolioData.prices?.[sym] ? bal * portfolioData.prices[sym] : 0);
                    }, 0);
                    const perpUsd = (portfolioData.perpPositions || []).reduce((sum, p) => sum + parseFloat(p.sizeUsd || 0), 0);
                    const earnUsd = (portfolioData.earnPositions || []).reduce((sum, e) => {
                      const ua = parseFloat(e.underlyingAssets || e.underlying_assets || 0);
                      const sym = e.asset?.symbol || e.assetSymbol || "?";
                      return sum + (ua > 1e6 ? ua / Math.pow(10, e.asset?.decimals ?? 6) : ua) * (portfolioData.prices?.[sym] || 0);
                    }, 0);
                    const lpUsd = (portfolioData.lpPositions || []).reduce((sum, p) => sum + parseFloat(p.value || 0), 0);
                    const stakedUsd = (() => {
                      const s = portfolioData.stakedJup;
                      if (!s) return 0;
                      const amt = parseFloat(s.totalStaked || s.stakedAmount || s.amount || 0);
                      return amt * (portfolioData.prices?.["JUP"] || 0);
                    })();
                    const netWorth = walletUsd + perpUsd + earnUsd + lpUsd + stakedUsd;
                    if (netWorth <= 0) return null;
                    return (
                      <div style={{ padding:"14px 16px", background:`linear-gradient(135deg, ${T.accent}11, ${T.accent}22)`, border:`1px solid ${T.accent}33`, borderRadius:12 }}>
                        <div style={{ fontSize:10, color:T.text3, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Total Net Worth</div>
                        <div style={{ fontSize:28, fontWeight:800, color:T.accent, lineHeight:1 }}>${netWorth.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", marginTop:8, fontSize:11, color:T.text3 }}>
                          {walletUsd > 0 && <span>Wallet <span style={{ color:T.text2 }}>${walletUsd.toFixed(2)}</span></span>}
                          {perpUsd > 0   && <span>Perps <span style={{ color:T.text2 }}>${perpUsd.toFixed(2)}</span></span>}
                          {earnUsd > 0   && <span>Earn <span style={{ color:T.text2 }}>${earnUsd.toFixed(2)}</span></span>}
                          {lpUsd > 0     && <span>LP <span style={{ color:T.text2 }}>${lpUsd.toFixed(2)}</span></span>}
                          {stakedUsd > 0 && <span>Staked <span style={{ color:T.text2 }}>${stakedUsd.toFixed(2)}</span></span>}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Token Balances with real logos ── */}
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                      <SvgCoin size={13} color={T.accent}/>
                      <span style={{ fontSize:11, fontWeight:700, color:T.accent, letterSpacing:"0.08em", textTransform:"uppercase" }}>Token Balances</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {Object.entries(portfolioData.walletBalances || portfolioData.solBalance || {}).length === 0 ? (
                        <div style={{ fontSize:12, color:T.text3 }}>No balances found.</div>
                      ) : (
                        Object.entries(portfolioData.walletBalances || portfolioData.solBalance || {})
                          .sort(([,a], [,b]) => {
                            const aUsd = portfolioData.prices?.[Object.keys(portfolioData.walletBalances||{})[0]] ? a * (portfolioData.prices?.[Object.keys(portfolioData.walletBalances||{})[0]]||0) : a;
                            const bUsd = portfolioData.prices?.[Object.keys(portfolioData.walletBalances||{})[1]] ? b * (portfolioData.prices?.[Object.keys(portfolioData.walletBalances||{})[1]]||0) : b;
                            return bUsd - aUsd;
                          })
                          .map(([sym, bal]) => {
                          const usdVal  = portfolioData.prices?.[sym] ? (bal * portfolioData.prices[sym]) : null;
                          const logoUrl = portfolioData.logoMap?.[sym] || null;
                          return (
                            <div key={sym} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", background:T.bg, border:"1px solid " + T.border, borderRadius:10 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <div style={{ width:30, height:30, borderRadius:"50%", overflow:"hidden", flexShrink:0, background:"linear-gradient(135deg, #1e2d3d, #253545)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:T.text2, position:"relative" }}>
                                  {logoUrl
                                    ? <>
                                        <img src={logoUrl} alt={sym} style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", top:0, left:0 }}
                                          onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }} />
                                        <span style={{ display:"none", width:"100%", height:"100%", alignItems:"center", justifyContent:"center" }}>{sym.slice(0,2)}</span>
                                      </>
                                    : sym.slice(0,2)
                                  }
                                </div>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:700, color:T.text1 }}>{sym}</div>
                                  {portfolioData.prices?.[sym] && <div style={{ fontSize:10, color:T.text3 }}>${portfolioData.prices[sym] < 1 ? portfolioData.prices[sym].toFixed(4) : portfolioData.prices[sym].toFixed(2)}</div>}
                                </div>
                              </div>
                              <div style={{ textAlign:"right" }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.text1 }}>{typeof bal === "number" ? (bal < 1 ? bal.toFixed(6) : bal.toFixed(4)) : String(bal)}</div>
                                {usdVal != null && <div style={{ fontSize:11, color:usdVal > 10 ? T.accent : T.text3, marginTop:1, fontWeight: usdVal > 10 ? 600 : 400 }}>{"$" + usdVal.toFixed(2)}</div>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* ── Active Trigger / Limit Orders ── */}
                  {(portfolioData.triggerOrders||[]).length > 0 && (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                        <SvgZap size={13} color={T.purple}/>
                        <span style={{ fontSize:11, fontWeight:700, color:T.purple, letterSpacing:"0.08em", textTransform:"uppercase" }}>Limit / Trigger Orders</span>
                        <span style={{ fontSize:10, color:T.text3, background:T.border, borderRadius:8, padding:"1px 6px" }}>{portfolioData.triggerOrders.length}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {portfolioData.triggerOrders.map((o, i) => {
                          const typeLabel = o.orderType === "oco" ? "OCO" : o.orderType === "otoco" ? "OTOCO" : "Limit";
                          const inSym  = o.inputMint  ? (Object.entries(TOKEN_MINTS).find(([,v])=>v===o.inputMint)?.[0]  || o.inputMint.slice(0,6))  : "—";
                          const outSym = o.outputMint ? (Object.entries(TOKEN_MINTS).find(([,v])=>v===o.outputMint)?.[0] || o.outputMint.slice(0,6)) : "—";
                          const trigPrice = o.triggerPriceUsd ? `$${parseFloat(o.triggerPriceUsd).toFixed(4)}` : (o.price ? `$${parseFloat(o.price).toFixed(4)}` : null);
                          const tpPrice   = o.tpPriceUsd  ? `TP $${parseFloat(o.tpPriceUsd).toFixed(4)}`   : null;
                          const slPrice   = o.slPriceUsd  ? `SL $${parseFloat(o.slPriceUsd).toFixed(4)}`   : null;
                          const inAmt     = o.inAmount || o.makingAmount ? ((parseInt(o.inAmount||o.makingAmount||0)) / 1e6).toFixed(2) : null;
                          const expiry    = o.expiredAt ? new Date(o.expiredAt * 1000).toLocaleDateString() : null;
                          const orderId   = o.id || o.orderKey || o.publicKey;
                          // Use TOKEN_LOGO_URLS for known tokens, fall back to img.jup.ag for unknowns
                          const inLogo  = TOKEN_LOGO_URLS[inSym]  || (o.inputMint  ? `https://img.jup.ag/tokens/${o.inputMint}`  : null);
                          const outLogo = TOKEN_LOGO_URLS[outSym] || (o.outputMint ? `https://img.jup.ag/tokens/${o.outputMint}` : null);
                          return (
                            <div key={orderId||i} style={{ padding:"12px", background:T.bg, border:`1px solid #2d1f4d`, borderRadius:12, fontSize:12 }}>
                              {/* Header row */}
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                  {inLogo  && <img src={inLogo}  onError={e=>e.target.style.display="none"} style={{width:18,height:18,borderRadius:"50%",objectFit:"cover"}} />}
                                  <span style={{ color:T.text1, fontWeight:700 }}>{inSym}</span>
                                  <span style={{ color:T.text3, fontSize:10 }}>→</span>
                                  {outLogo && <img src={outLogo} onError={e=>e.target.style.display="none"} style={{width:18,height:18,borderRadius:"50%",objectFit:"cover"}} />}
                                  <span style={{ color:T.text1, fontWeight:700 }}>{outSym}</span>
                                </div>
                                <span style={{ fontSize:10, padding:"2px 8px", background:T.purpleBg, borderRadius:6, color:T.purple, fontWeight:700 }}>{typeLabel}</span>
                              </div>
                              {/* Details */}
                              <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 12px", color:T.text3, fontSize:11, marginBottom:8 }}>
                                {inAmt     && <span>Amount: <span style={{color:T.text2}}>{inAmt} {inSym}</span></span>}
                                {trigPrice && <span>Trigger: <span style={{color:T.accent}}>{trigPrice}</span></span>}
                                {tpPrice   && <span style={{color:T.green}}>{tpPrice}</span>}
                                {slPrice   && <span style={{color:T.red}}>{slPrice}</span>}
                                {expiry    && <span>Expires: {expiry}</span>}
                                {orderId   && <span style={{fontFamily:T.mono, fontSize:10}}>#{String(orderId).slice(0,8)}…</span>}
                              </div>
                              {/* Cancel button */}
                              {orderId && (
                                <button onClick={() => cancelTrigV2Order(orderId)} className="hov-btn"
                                  style={{ width:"100%", padding:"6px", background:"transparent", border:`1px solid ${T.redBd}`, borderRadius:8, color:T.red, fontSize:11, fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}>
                                  Cancel Order
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Recurring / DCA Orders ── */}
                  {(portfolioData.recurringOrders||[]).length > 0 && (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                        <SvgArrowReturn size={13} color={T.teal}/>
                        <span style={{ fontSize:11, fontWeight:700, color:T.teal, letterSpacing:"0.08em", textTransform:"uppercase" }}>Recurring / DCA</span>
                        <span style={{ fontSize:10, color:T.text3, background:T.border, borderRadius:8, padding:"1px 6px" }}>{portfolioData.recurringOrders.length}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {portfolioData.recurringOrders.map((o, i) => {
                          const inSym  = o.inputMint  ? (Object.entries(TOKEN_MINTS).find(([,v])=>v===o.inputMint)?.[0]  || o.inputMint.slice(0,6))  : "—";
                          const outSym = o.outputMint ? (Object.entries(TOKEN_MINTS).find(([,v])=>v===o.outputMint)?.[0] || o.outputMint.slice(0,6)) : "—";
                          const cycleAmt   = o.inAmountPerCycle ? (parseInt(o.inAmountPerCycle) / 1e6).toFixed(2) : "?";
                          const cycleLabel = o.cycleFrequency ? (o.cycleFrequency >= 2592000 ? "monthly" : o.cycleFrequency >= 604800 ? "weekly" : "daily") : "";
                          const filled     = o.numberOfFilled != null && o.numberOfOrders != null ? `${o.numberOfFilled}/${o.numberOfOrders} filled` : null;
                          const inLogo  = TOKEN_LOGO_URLS[inSym]  || (o.inputMint  ? `https://img.jup.ag/tokens/${o.inputMint}`  : null);
                          const outLogo = TOKEN_LOGO_URLS[outSym] || (o.outputMint ? `https://img.jup.ag/tokens/${o.outputMint}` : null);
                          const orderKey = o.orderKey || o.id;
                          return (
                            <div key={orderKey||i} style={{ padding:"12px", background:T.bg, border:`1px solid #0f3333`, borderRadius:12, fontSize:12 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                  {inLogo  && <img src={inLogo}  onError={e=>e.target.style.display="none"} style={{width:18,height:18,borderRadius:"50%",objectFit:"cover"}} />}
                                  <span style={{ color:T.text1, fontWeight:700 }}>{inSym}</span>
                                  <span style={{ color:T.text3, fontSize:10 }}>→</span>
                                  {outLogo && <img src={outLogo} onError={e=>e.target.style.display="none"} style={{width:18,height:18,borderRadius:"50%",objectFit:"cover"}} />}
                                  <span style={{ color:T.text1, fontWeight:700 }}>{outSym}</span>
                                </div>
                                <span style={{ color:T.teal, fontWeight:700 }}>${cycleAmt} {cycleLabel}</span>
                              </div>
                              {filled && <div style={{ color:T.text3, fontSize:11, marginBottom:8 }}>{filled}</div>}
                              {orderKey && (
                                <button onClick={() => cancelRecurringOrder(orderKey)} className="hov-btn"
                                  style={{ width:"100%", padding:"6px", background:"transparent", border:`1px solid ${T.redBd}`, borderRadius:8, color:T.red, fontSize:11, fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}>
                                  Cancel DCA
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── DeFi Positions ── */}
                  {portfolioData.defi?.positions?.length > 0 && (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                        <SvgZap size={13} color="#63b3ed"/>
                        <span style={{ fontSize:11, fontWeight:700, color:"#63b3ed", letterSpacing:"0.08em", textTransform:"uppercase" }}>DeFi Positions</span>
                        <span style={{ fontSize:10, color:T.text3, background:T.border, borderRadius:8, padding:"1px 6px" }}>{portfolioData.defi.positions.length}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {portfolioData.defi.positions.slice(0,5).map((p, i) => (
                          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12 }}>
                            <span style={{ color:T.text2 }}>{p.platform || p.type || "Position"}</span>
                            <span style={{ fontWeight:600, color:T.text1 }}>{p.value ? `$${parseFloat(p.value).toFixed(2)}` : "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Earn Positions ── */}
                  {(() => {
                    const earnPos = (portfolioData.earnPositions||[]).filter(e => {
                      const ua  = parseFloat(e.underlyingAssets || e.underlying_assets || e.amount || e.balance || e.depositedAmount || 0);
                      const sh  = parseFloat(e.shares || 0);
                      const val = parseFloat(e.value || 0);
                      return ua > 0 || sh > 0 || val > 0;
                    });
                    return earnPos.length > 0 ? (
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                          <SvgBarChart size={13} color="#68d391"/>
                          <span style={{ fontSize:11, fontWeight:700, color:"#68d391", letterSpacing:"0.08em", textTransform:"uppercase" }}>Earn Positions</span>
                          <span style={{ fontSize:10, color:T.text3, background:T.border, borderRadius:8, padding:"1px 6px" }}>{earnPos.length}</span>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                          {earnPos.slice(0,5).map((e, i) => {
                            const sym = e.asset?.symbol || e.assetSymbol || e.symbol || "Token";
                            const ua  = parseFloat(e.underlyingAssets || e.underlying_assets || e.amount || e.balance || e.depositedAmount || 0);
                            const dec = e.asset?.decimals ?? e.decimals ?? 6;
                            const amt = ua > 1e6 ? (ua/Math.pow(10,dec)).toFixed(4)
                                      : ua > 0   ? ua.toFixed(4)
                                      : parseFloat(e.value||0).toFixed(2);
                            const label = e.label ? ` · ${e.label}` : "";
                            return (
                              <div key={i} style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12 }}>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                                  <span style={{ color:T.text2 }}>{sym} <span style={{ fontSize:10, color:T.text3 }}>Earn{label}</span></span>
                                  <span style={{ fontWeight:600, color:"#68d391" }}>{amt}</span>
                                </div>
                                <button onClick={() => { setShowPortfolio(false); setInput("show my earn positions"); setTimeout(() => send(), 80); }} className="hov-btn"
                                  style={{ width:"100%", padding:"5px", background:"rgba(104,211,145,0.08)", border:`1px solid rgba(104,211,145,0.25)`, borderRadius:7, color:"#68d391", fontSize:11, fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}>
                                  ⬇ Withdraw
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* ── Prediction Positions ── */}
                  {(portfolioData.predPositions||[]).length > 0 && (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                        <SvgZap size={13} color="#f6ad55"/>
                        <span style={{ fontSize:11, fontWeight:700, color:"#f6ad55", letterSpacing:"0.08em", textTransform:"uppercase" }}>Predictions</span>
                        <span style={{ fontSize:10, color:T.text3, background:T.border, borderRadius:8, padding:"1px 6px" }}>{portfolioData.predPositions.length}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {portfolioData.predPositions.slice(0,5).map((p, i) => {
                          const title = p.marketMetadata?.title || p.marketId || "Market";
                          const side  = p.isYes ? "YES" : "NO";
                          const cost  = p.totalCostUsd ? `$${(parseInt(p.totalCostUsd)/1_000_000).toFixed(2)}` : "";
                          const claimable = p.claimable && !p.claimed;
                          const payout = p.payoutUsd ? `$${(parseInt(p.payoutUsd)/1_000_000).toFixed(2)}` : "";
                          return (
                            <div key={i} style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${claimable ? T.greenBd : T.border}`, borderRadius:10, fontSize:12 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                                <span style={{ fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:6, background: side==="YES" ? T.greenBg : T.redBg, color: side==="YES" ? T.green : T.red }}>{side}</span>
                                <span style={{ fontWeight:600, color: claimable ? T.green : T.text3 }}>{claimable ? `${payout || "Claimable"}` : cost}</span>
                              </div>
                              <div style={{ color:T.text2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom: claimable ? 6 : 0 }}>{title.slice(0,42)}</div>
                              {claimable && (
                                <button onClick={() => doClaimPayouts()} className="hov-btn"
                                  style={{ width:"100%", padding:"6px", background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:8, color:T.green, fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}>
                                  Claim Payout
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* ── Perps Positions ── */}
                  {(portfolioData.perpPositions||[]).length > 0 && (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                        <SvgZap size={13} color={T.red}/>
                        <span style={{ fontSize:11, fontWeight:700, color:T.red, letterSpacing:"0.08em", textTransform:"uppercase" }}>Perps Positions</span>
                        <span style={{ fontSize:10, color:T.text3, background:T.border, borderRadius:8, padding:"1px 6px" }}>{portfolioData.perpPositions.length}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {portfolioData.perpPositions.map((p, i) => {
                          const side = p.side || "long";
                          const mkt  = p.market || "PERP";
                          const pnlRaw = parseFloat(p.unrealizedPnlUsd ?? 0);
                          const pnlColor = pnlRaw >= 0 ? T.green : T.red;
                          return (
                            <div key={i} style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                                <span style={{ fontWeight:700, color:T.text1 }}>{side==="long"?"Long":"Short"} {side.toUpperCase()} {mkt}</span>
                                {p.sizeUsd && <span style={{ fontWeight:700, color:T.text1 }}>${parseFloat(p.sizeUsd).toFixed(2)}</span>}
                              </div>
                              <div style={{ display:"flex", flexWrap:"wrap", gap:"3px 10px", color:T.text3, fontSize:11 }}>
                                {p.entryPrice && <span>Entry: <span style={{color:T.text2}}>${parseFloat(p.entryPrice).toFixed(2)}</span></span>}
                                {p.leverage && <span>Lev: <span style={{color:T.text2}}>{parseFloat(p.leverage).toFixed(1)}x</span></span>}
                                {p.liquidationPrice && <span>Liq: <span style={{color:T.red}}>${parseFloat(p.liquidationPrice).toFixed(2)}</span></span>}
                                {p.unrealizedPnlUsd != null && <span>PnL: <span style={{color:pnlColor, fontWeight:700}}>{pnlRaw>=0?"+":""}${pnlRaw.toFixed(2)}</span></span>}
                              </div>
                              <button onClick={() => doClosePerp(p)} disabled={!!closingPerp} className="hov-btn"
                                style={{ marginTop:8, width:"100%", padding:"5px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:7, color:T.red, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                                {closingPerp === p.positionKey ? <><span className="spinner" style={{borderTopColor:T.red, display:"inline-block", marginRight:4}}/> Closing…</> : "Close Position"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── LP / Liquidity Positions ── */}
                  {(portfolioData.lpPositions||[]).length > 0 && (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                        <SvgCoin size={13} color="#a78bfa"/>
                        <span style={{ fontSize:11, fontWeight:700, color:"#a78bfa", letterSpacing:"0.08em", textTransform:"uppercase" }}>LP Positions</span>
                        <span style={{ fontSize:10, color:T.text3, background:T.border, borderRadius:8, padding:"1px 6px" }}>{portfolioData.lpPositions.length}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {portfolioData.lpPositions.map((lp, i) => (
                          <div key={i} style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <div>
                                <div style={{ fontWeight:600, color:T.text1 }}>{lp.name}</div>
                                <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>{lp.platform}</div>
                              </div>
                              {lp.value != null && <span style={{ fontWeight:700, color:T.text1 }}>${parseFloat(lp.value).toFixed(2)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Staked JUP ── */}
                  {portfolioData.stakedJup && (() => {
                    const s = portfolioData.stakedJup;
                    const amt = parseFloat(s.totalStaked || s.stakedAmount || s.amount || 0);
                    const jupPrice = portfolioData.prices?.["JUP"] || 0;
                    const usdVal = amt * jupPrice;
                    const voteWeight = s.voteWeight || s.votingPower || null;
                    if (amt <= 0) return null;
                    return (
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                          <SvgLock size={13} color="#f6ad55"/>
                          <span style={{ fontSize:11, fontWeight:700, color:"#f6ad55", letterSpacing:"0.08em", textTransform:"uppercase" }}>Staked JUP</span>
                        </div>
                        <div style={{ padding:"12px 14px", background:T.bg, border:`1px solid #f6ad5533`, borderRadius:10, fontSize:12 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <img src="https://static.jup.ag/jup/icon.png" alt="JUP" style={{ width:22, height:22, borderRadius:"50%" }} onError={e=>e.target.style.display="none"} />
                              <span style={{ fontWeight:700, color:T.text1 }}>{amt.toFixed(2)} JUP</span>
                            </div>
                            {jupPrice > 0 && <span style={{ fontWeight:700, color:"#f6ad55" }}>${usdVal.toFixed(2)}</span>}
                          </div>
                          {voteWeight && <div style={{ fontSize:11, color:T.text3 }}>Vote weight: {parseFloat(voteWeight).toFixed(2)}</div>}
                          <a href="https://vote.jup.ag" target="_blank" rel="noopener noreferrer"
                            style={{ display:"inline-block", marginTop:6, fontSize:11, color:"#f6ad55", textDecoration:"none" }}>
                            Manage at vote.jup.ag ↗
                          </a>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── JUP ASR (Active Staking Rewards) ── */}
                  {(portfolioData.asrRewards||[]).length > 0 && (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                        <SvgCoin size={13} color="#f6ad55"/>
                        <span style={{ fontSize:11, fontWeight:700, color:"#f6ad55", letterSpacing:"0.08em", textTransform:"uppercase" }}>JUP Governance Rewards</span>
                        <span style={{ fontSize:10, fontWeight:700, color:"#0d1117", background:"#f6ad55", borderRadius:8, padding:"1px 7px" }}>ASR</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {portfolioData.asrRewards.map((asr, i) => {
                          const amt   = parseFloat(asr.amount || asr.claimableAmount || 0);
                          const token = asr.token || asr.symbol || "JUP";
                          const epoch = asr.epoch ? `Epoch ${asr.epoch}` : "";
                          return (
                            <div key={i} style={{ padding:"10px 12px", background:T.bg, border:`1.5px solid #f6ad5555`, borderRadius:10, fontSize:12 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                                <span style={{ fontWeight:700, color:"#f6ad55" }}>{amt > 0 ? amt.toFixed(4) : "—"} {token}</span>
                                {epoch && <span style={{ fontSize:10, color:T.text3 }}>{epoch}</span>}
                              </div>
                              <button onClick={() => { setShowPortfolio(false); setInput("claim my JUP ASR governance rewards"); setTimeout(() => send(), 80); }} className="hov-btn"
                                style={{ width:"100%", padding:"6px", background:"rgba(246,173,85,0.1)", border:`1px solid rgba(246,173,85,0.35)`, borderRadius:8, color:"#f6ad55", fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}>
                                Claim ASR Reward
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Lock / Vesting Positions ── */}
                  {(portfolioData.lockPositions||[]).length > 0 && (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                        <SvgLock size={13} color={T.teal}/>
                        <span style={{ fontSize:11, fontWeight:700, color:T.teal, letterSpacing:"0.08em", textTransform:"uppercase" }}>Locked / Vesting</span>
                        <span style={{ fontSize:10, color:T.text3, background:T.border, borderRadius:8, padding:"1px 6px" }}>{portfolioData.lockPositions.length}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {portfolioData.lockPositions.map((lk, i) => {
                          const claimable = parseFloat(lk.claimableAmount || 0) > 0;
                          const lockId = lk.lockId || lk.pubkey || lk.id;
                          const cliffNotPassed = lk.cliff && !lk.cliffPassed;
                          const cliffDate = lk.cliff ? new Date(lk.cliff * 1000).toLocaleDateString() : null;
                          return (
                            <div key={i} style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${claimable ? T.greenBd : cliffNotPassed ? T.border : T.border}`, borderRadius:10, fontSize:12 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                                <span style={{ fontWeight:700, color:T.text1 }}>{lk.totalAmount} {lk.symbol}</span>
                                <span style={{ fontSize:10, padding:"2px 7px", background: claimable ? T.greenBg : cliffNotPassed ? T.redBg : T.border, borderRadius:6, color: claimable ? T.green : cliffNotPassed ? T.red : T.text3, fontWeight:700 }}>
                                  {cliffNotPassed ? "Locked" : `${lk.vestedPercent}% vested`}
                                </span>
                              </div>
                              {claimable && (
                                <div style={{ color:T.green, fontWeight:600, marginBottom:4 }}>
                                  ✓ {lk.claimableAmount} {lk.symbol} ready to claim
                                </div>
                              )}
                              {cliffNotPassed && cliffDate && (
                                <div style={{ color:T.text3, fontSize:11, marginBottom:4 }}>
                                  Unlocks after: <span style={{ color:T.text2 }}>{cliffDate}</span>
                                </div>
                              )}
                              {!cliffNotPassed && cliffDate && !claimable && (
                                <div style={{ color:T.text3, fontSize:11, marginBottom:4 }}>
                                  Cliff passed: {cliffDate}
                                </div>
                              )}
                              {claimable && lockId && (
                                <button onClick={() => doClaimLock(lockId)} disabled={claimingLock === lockId} className="hov-btn"
                                  style={{ width:"100%", marginTop:4, padding:"6px", background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:8, color:T.green, fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}>
                                  {claimingLock === lockId ? <><span className="spinner" style={{borderTopColor:T.green,display:"inline-block",marginRight:4}}/> Claiming…</> : `⬇ Claim ${lk.claimableAmount} ${lk.symbol}`}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Airdrops (claimed + unclaimed) ── */}
                  {(portfolioData.airdrops||[]).length > 0 && (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                        <SvgRocket size={13} color="#c7f284"/>
                        <span style={{ fontSize:11, fontWeight:700, color:"#c7f284", letterSpacing:"0.08em", textTransform:"uppercase" }}>Airdrops</span>
                        {(portfolioData.airdrops).filter(a => !a.claimed && !a.isClaimed).length > 0 && (
                          <span style={{ fontSize:10, fontWeight:700, color:"#0d1117", background:"#c7f284", borderRadius:8, padding:"1px 7px" }}>
                            {(portfolioData.airdrops).filter(a => !a.claimed && !a.isClaimed).length} unclaimed
                          </span>
                        )}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {(portfolioData.airdrops).filter(a => !a.claimed && !a.isClaimed).map((a, i) => {
                          const name     = a.name || a.tokenSymbol || a.symbol || (a.mint ? a.mint.slice(0,8) : "Airdrop");
                          const amount   = a.amount || a.claimableAmount || a.totalAmount || "";
                          const amtFmt   = amount ? " - " + parseFloat(amount).toFixed(2) : "";
                          const claimUrl = a.claimUrl || a.url || "https://jup.ag/portfolio";
                          const expiry   = a.expiresAt || a.expiry;
                          return (
                            <div key={i} style={{ padding:"10px 12px", background:T.bg, border:"1.5px solid #c7f284", borderRadius:10, fontSize:12 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                                <span style={{ fontWeight:700, color:"#c7f284" }}>{"Airdrop: " + name + amtFmt}</span>
                                <a href={claimUrl} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize:11, fontWeight:700, color:"#0d1117", background:"#c7f284", borderRadius:6, padding:"2px 9px", textDecoration:"none" }}>Claim</a>
                              </div>
                              {expiry ? <div style={{ color:T.text3, fontSize:11 }}>{"Expires: " + new Date(expiry).toLocaleDateString()}</div> : null}
                            </div>
                          );
                        })}
                        {(portfolioData.airdrops).filter(a => a.claimed || a.isClaimed).slice(0,3).map((a, i) => {
                          const name   = a.name || a.tokenSymbol || a.symbol || (a.mint ? a.mint.slice(0,8) : "Airdrop");
                          const amount = a.amount || a.claimableAmount || a.totalAmount || "";
                          const amtFmt = amount ? " - " + parseFloat(amount).toFixed(2) : "";
                          return (
                            <div key={i} style={{ padding:"9px 12px", background:T.bg, border:"1px solid " + T.border, borderRadius:10, fontSize:12, opacity:0.6 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                <span style={{ color:T.text2 }}>{"Claimed: " + name + amtFmt}</span>
                                <span style={{ fontSize:10, color:T.text3 }}>Done</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}

              <div style={{ padding:"0 16px 16px" }}>
                <button onClick={() => setShowPortfolio(false)}
                  style={{ width:"100%", padding:"10px", background:"none", border:"1px solid " + T.border, borderRadius:10, color:T.text2, fontSize:13, cursor:"pointer", letterSpacing:"0.02em" }}>
                  Close
                </button>
              </div>
            </div>
          )}

          {/* ── Perps Trade panel (SHOW_PERPS) ──────────────────────────── */}
          {showPerps && (() => {
            const markets = ["SOL-PERP","BTC-PERP","ETH-PERP"];
            const marketLabel = perpCfg.market.replace("-PERP","");
            const posSize = perpCfg.collateral && perpCfg.leverage
              ? `$${(parseFloat(perpCfg.collateral||0) * parseFloat(perpCfg.leverage||1)).toFixed(0)}`
              : "—";
            const jupUrl = `https://jup.ag/perps/${marketLabel.toLowerCase()}`;
            return (
              <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1, marginBottom:4 }}>
                  Jupiter Perps
                </div>
                <div style={{ fontSize:11, color:T.text3, marginBottom:16 }}>Up to 100x leverage · SOL, BTC, ETH</div>

                {/* Market selector */}
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:6 }}>Market</div>
                  <div style={{ display:"flex", gap:8 }}>
                    {markets.map(m => (
                      <button key={m} onClick={() => setPerpCfg(c=>({...c,market:m}))}
                        style={{ flex:1, padding:"8px 4px", background: perpCfg.market===m ? T.accent : T.bg, border:`1px solid ${perpCfg.market===m ? T.accent : T.border}`, borderRadius:8, color: perpCfg.market===m ? "#0d1117" : T.text2, fontSize:12, fontWeight:perpCfg.market===m?700:400, cursor:"pointer" }}>
                        {m.replace("-PERP","")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Side selector */}
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:6 }}>Side</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => setPerpCfg(c=>({...c,side:"long"}))}
                      style={{ flex:1, padding:"8px", background: perpCfg.side==="long" ? T.greenBg : T.bg, border:`1px solid ${perpCfg.side==="long" ? T.greenBd : T.border}`, borderRadius:8, color: perpCfg.side==="long" ? T.green : T.text2, fontSize:13, fontWeight:perpCfg.side==="long"?700:400, cursor:"pointer" }}>
                      Long
                    </button>
                    <button onClick={() => setPerpCfg(c=>({...c,side:"short"}))}
                      style={{ flex:1, padding:"8px", background: perpCfg.side==="short" ? T.redBg : T.bg, border:`1px solid ${perpCfg.side==="short" ? T.redBd : T.border}`, borderRadius:8, color: perpCfg.side==="short" ? T.red : T.text2, fontSize:13, fontWeight:perpCfg.side==="short"?700:400, cursor:"pointer" }}>
                      Short
                    </button>
                  </div>
                </div>

                {/* Collateral input */}
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:6 }}>Collateral (USD)</div>
                  <input type="number" min="0" placeholder="e.g. 5" value={perpCfg.collateral}
                    onChange={e => setPerpCfg(c=>({...c,collateral:e.target.value}))}
                    style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                  />
                </div>

                {/* Leverage slider */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:T.text3, marginBottom:6 }}>
                    <span>Leverage</span>
                    <span style={{ color:T.accent, fontWeight:700 }}>{perpCfg.leverage}x</span>
                  </div>
                  <input type="range" min="1" max="100" step="1" value={perpCfg.leverage}
                    onChange={e => setPerpCfg(c=>({...c,leverage:e.target.value}))}
                    style={{ width:"100%", accentColor:T.accent }}
                  />
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3, marginTop:2 }}>
                    <span>1x</span><span>25x</span><span>50x</span><span>100x</span>
                  </div>
                </div>

                {/* Summary */}
                <div style={{ padding:"10px 14px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:14, fontSize:12, color:T.text3 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span>Market</span><strong style={{ color:T.text1 }}>{perpCfg.market}</strong>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span>Side</span>
                    <strong style={{ color: perpCfg.side==="long" ? T.green : T.red }}>
                      {perpCfg.side.toUpperCase()}
                    </strong>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span>Collateral</span><strong style={{ color:T.text1 }}>{perpCfg.collateral ? `$${perpCfg.collateral} USDC` : "—"}</strong>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span>Est. Position Size</span><strong style={{ color:T.accent }}>{posSize}</strong>
                  </div>
                </div>

                <div style={{ fontSize:11, color:"#f59e0b", marginBottom:12 }}>
                  Note: Perps carry liquidation risk. At {perpCfg.leverage}x, a ~{(100/parseFloat(perpCfg.leverage||1)).toFixed(0)}% move against you triggers liquidation.
                </div>

                <div style={{ display:"flex", gap:8 }}>
                  <a href={jupUrl} target="_blank" rel="noopener noreferrer"
                    style={{ flex:1, padding:"10px", background:T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:13, fontWeight:700, cursor:"pointer", textDecoration:"none", textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                    Open on Jupiter Perps ↗
                  </a>
                  <button onClick={() => setShowPerps(false)}
                    style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ── Perps Positions panel ─────────────────────────────────── */}
          {showPerpsPos && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1, marginBottom:4 }}>Open Position Open Perps Positions</div>
              {perpsLoading ? (
                <div style={{ fontSize:12, color:T.text3 }}>Loading positions…</div>
              ) : perpPositions.length === 0 ? (
                <div style={{ fontSize:12, color:T.text3 }}>
                  No open perps positions found for your wallet.<br/>
                  <a href="https://jup.ag/perps" target="_blank" rel="noopener noreferrer"
                    style={{ color:T.accent, textDecoration:"none", fontWeight:600 }}>
                    Open a position on Jupiter Perps ↗
                  </a>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {perpPositions.map((p, i) => {
                    const side   = p.side || "long";
                    const mkt    = p.market || p.symbol || "SOL-PERP";
                    const size   = p.sizeUsd   ? `$${parseFloat(p.sizeUsd).toFixed(2)}`   : "—";
                    const pnlRaw = parseFloat(p.unrealizedPnlUsd ?? p.pnlUsd ?? 0);
                    const pnl    = p.unrealizedPnlUsd != null || p.pnlUsd != null
                      ? `${pnlRaw >= 0 ? "+" : ""}$${pnlRaw.toFixed(2)}` : "—";
                    const liq    = p.liquidationPrice ? `$${parseFloat(p.liquidationPrice).toFixed(2)}` : "—";
                    const entryP = p.entryPrice ? `$${parseFloat(p.entryPrice).toFixed(2)}` : "—";
                    const lev    = p.leverage ? `${parseFloat(p.leverage).toFixed(1)}x` : "—";
                    const icon   = side === "long" ? "Long" : "Short";
                    const pnlColor = pnlRaw >= 0 ? T.green : T.red;
                    const posKey = p.positionKey || p.publicKey || p.id || i;
                    const isClosing = closingPerp === posKey;
                    return (
                      <div key={i} style={{ padding:"12px 14px", border:`1px solid ${T.border}`, borderRadius:10, background:T.bg }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text1 }}>{icon} {side.toUpperCase()} {mkt}</div>
                          <span style={{ fontSize:12, fontWeight:700, color:pnlColor }}>{pnl}</span>
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:10, fontSize:11, color:T.text3, marginBottom:10 }}>
                          <span>Size: <strong style={{ color:T.text1 }}>{size}</strong></span>
                          <span>Entry: <strong style={{ color:T.text1 }}>{entryP}</strong></span>
                          <span>Lev: <strong style={{ color:T.text1 }}>{lev}</strong></span>
                          <span>Liq: <strong style={{ color:T.red }}>{liq}</strong></span>
                        </div>
                        <button onClick={() => doClosePerp(p)} disabled={!!closingPerp} className="hov-btn"
                          style={{ width:"100%", padding:"8px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, color:T.red, fontSize:12, fontWeight:700, cursor: closingPerp ? "default" : "pointer" }}>
                          {isClosing ? <><span className="spinner" style={{ borderTopColor:T.red, display:"inline-block", marginRight:6 }}/> Closing…</> : "Close Position"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button onClick={() => setShowPerpsPos(false)}
                style={{ marginTop:12, width:"100%", padding:"8px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:12, cursor:"pointer" }}>
                Close
              </button>
            </div>
          )}

          {/* ── Lend Positions panel ──────────────────────────────────── */}
          {showLendPos && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1, marginBottom:4 }}>My Jupiter Lend Positions</div>
              {lendPosLoading ? (
                <div style={{ fontSize:12, color:T.text3 }}>Loading positions…</div>
              ) : lendPositions.length === 0 ? (
                <div style={{ fontSize:12, color:T.text3 }}>No open positions found.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {/* ── Earn deposits ── */}
                  {lendPositions.filter(p => p._type === "earn").map((pos, i) => {
                    const sym = pos.asset?.symbol || pos.assetSymbol || pos.symbol || "Token";
                    const dec = pos.asset?.decimals ?? pos.decimals ?? 6;
                    const ua  = parseFloat(pos.underlyingAssets || pos.underlying_assets || pos.amount || pos.balance || pos.depositedAmount || 0);
                    const amt = ua > 1e6 ? (ua / Math.pow(10, dec)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})
                              : ua > 0   ? ua.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})
                              : parseFloat(pos.value||0).toFixed(2);
                    // Find matching vault in earnVaults for APY + withdraw
                    const matchVault = earnVaults.find(v => v.token?.toUpperCase() === sym.toUpperCase());
                    return (
                      <div key={`earn-${i}`} style={{ padding:"12px 14px", border:`1px solid ${T.green}44`, borderRadius:10, background:`${T.green}08` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text1 }}>
                            {sym} Earn Deposit
                          </div>
                          {matchVault && <span style={{ fontSize:12, fontWeight:700, color:T.green }}>{matchVault.apyDisplay} APY</span>}
                        </div>
                        <div style={{ padding:"8px 12px", background:`${T.green}12`, border:`1px solid ${T.green}33`, borderRadius:8, marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontSize:11, color:T.text3 }}>Deposited balance</span>
                          <span style={{ fontSize:14, fontWeight:700, color:T.green }}>{amt} {sym}</span>
                        </div>
                        <button
                          onClick={() => {
                            const posAmt = ua > 1e6 ? ua / Math.pow(10, dec) : ua;
                            const vault = matchVault || { name:`Jupiter Lend ${sym}`, token:sym, apyDisplay:"—", tvl:0 };
                            setEarnWithdraw({ vault, amount:"", positionAmount: posAmt });
                            setShowEarnWithdraw(true);
                            setShowLendPos(false);
                          }}
                          className="hov-btn"
                          style={{ width:"100%", padding:"8px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, color:T.red, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          ⬇ Withdraw
                        </button>
                      </div>
                    );
                  })}

                  {/* ── Borrow / Multiply positions ── */}
                  {lendPositions.filter(p => p._type === "borrow").map((pos, i) => {
                    const vaultMeta   = MULTIPLY_VAULTS.find(v => v.vaultId === pos.vaultId);
                    const colDec      = vaultMeta?.colDecimals  ?? 9;
                    const debtDec     = vaultMeta?.debtDecimals ?? 6;
                    const supplyNum   = parseFloat(pos.supply) / Math.pow(10, colDec);
                    const borrowNum   = parseFloat(pos.borrow) / Math.pow(10, debtDec);
                    const riskPct    = Math.round((pos.riskRatio || 0) * 100);
                    const ltPct      = pos.liquidationThreshold ? Math.round(pos.liquidationThreshold * 100) : null;
                    const riskColor  = riskPct > 80 ? T.red : riskPct > 60 ? "#f59e0b" : T.green;
                    const isUnwinding = unwindStatus === pos.positionId;
                    return (
                      <div key={`borrow-${i}`} style={{ padding:"12px 14px", border:`1px solid ${T.border}`, borderRadius:10, background:T.bg }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text1 }}>Position #{pos.positionId} · Vault {pos.vaultId}</div>
                          {pos.isLiquidated && <span style={{ fontSize:10, color:T.red, fontWeight:700 }}>LIQUIDATED</span>}
                        </div>
                        <div style={{ fontSize:11, color:T.text3, marginBottom:8, display:"flex", flexWrap:"wrap", gap:10 }}>
                          <span>Collateral: <strong style={{ color:T.text1 }}>{supplyNum.toFixed(4)}</strong></span>
                          <span>Debt: <strong style={{ color:T.red }}>{borrowNum.toFixed(4)}</strong></span>
                        </div>
                        <div style={{ marginBottom:10 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                            <span style={{ color:T.text3 }}>Risk ratio</span>
                            <span style={{ color:riskColor, fontWeight:700 }}>{riskPct}%{ltPct ? ` / ${ltPct}% LT` : ""}</span>
                          </div>
                          <div style={{ height:4, borderRadius:4, background:T.border, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${Math.min(riskPct, 100)}%`, background:riskColor, borderRadius:4 }}/>
                          </div>
                        </div>
                        {!pos.isLiquidated && (
                          <div style={{ display:"flex", gap:8 }}>
                            <button onClick={() => doUnwind(pos, false)} disabled={!!unwindStatus} className="hov-btn"
                              style={{ flex:1, padding:"8px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, color:T.red, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              {isUnwinding ? <><span className="spinner" style={{ borderTopColor:T.red }}/> Closing…</> : "Close Full Position"}
                            </button>
                            <button onClick={() => { setMultiplyPos({ vault: MULTIPLY_VAULTS.find(v=>v.vaultId===pos.vaultId)||{vaultId:pos.vaultId}, colAmount:"", leverage:"2" }); setShowMultiplyForm(true); setShowLendPos(false); }} className="hov-btn"
                              style={{ padding:"8px 12px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:12, cursor:"pointer" }}>
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <button onClick={() => setShowLendPos(false)}
                style={{ marginTop:12, width:"100%", padding:"8px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:12, cursor:"pointer" }}>
                Close
              </button>
            </div>
          )}

                    {/* ── Multiply (Leverage) panel ─────────────────────────────── */}
          {showMultiply && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              {/* Header */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Jupiter Multiply</div>
                <span style={{ fontSize:10, padding:"2px 7px", background:T.purpleBg, border:`1px solid ${T.purple}33`, borderRadius:10, color:T.purple, fontWeight:600 }}>LEVERAGE</span>
              </div>
              {/* How it works box */}
              <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:"12px 14px", marginBottom:14, fontSize:12, color:T.text2, lineHeight:1.7 }}>
                <div style={{ fontWeight:600, color:T.text1, marginBottom:6 }}>How Multiply works</div>
                <div>Multiply uses <strong>zero-fee Jupiter Flashloans</strong> to loop your position in a single atomic Solana transaction. <a href="https://developers.jup.ag/docs/lend/advanced/multiply" target="_blank" rel="noreferrer" style={{ color:T.teal, fontSize:11 }}>Docs ↗</a></div>
                <div style={{ margin:"6px 0 0 0", color:T.text3, fontSize:11 }}>
                  1. Deposit collateral (e.g. JupSOL)<br/>
                  2. Flash-loan borrows the debt asset (e.g. SOL)<br/>
                  3. Borrowed SOL is swapped back to JupSOL<br/>
                  4. Looped collateral deposited — position closed atomically<br/>
                  5. You now hold 3x–10x amplified exposure to yield
                </div>
                <div style={{ marginTop:8, padding:"6px 10px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:6, color:T.red, fontSize:11 }}>
                  Risk: Liquidation if LTV breached. High borrow rate may erode yield. Start conservative at 2x–3x. Monitor at jup.ag/lend.
                </div>
              </div>
              {/* Coming Soon notice */}
              <div style={{ background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:10, padding:"14px 16px", marginBottom:14, textAlign:"center" }}>
                <div style={{ fontSize:13, fontWeight:700, color:T.accent, marginBottom:4 }}>In-App Multiply — Coming Soon</div>
                <div style={{ fontSize:11, color:T.text2, marginBottom:12, lineHeight:1.6 }}>
                  The Jupiter Multiply API is not yet publicly available for in-app transactions.<br/>
                  Use the vault links below to open or manage positions directly on Jupiter.
                </div>
                <a href="https://jup.ag/lend/multiply" target="_blank" rel="noreferrer"
                  style={{ display:"inline-block", padding:"9px 22px", background:T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:13, fontWeight:700, textDecoration:"none" }}>
                  Open Jupiter Multiply ↗
                </a>
              </div>

              {/* Filter tabs */}
              <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
                {["All", "Low Risk", "SOL", "BTC", "Stable"].map(f => (
                  <button key={f} onClick={() => setMultiplyFilter(f === "All" ? null : f)}
                    style={{ padding:"4px 10px", borderRadius:16, fontSize:11, fontWeight:600, cursor:"pointer", border:`1px solid ${(multiplyFilter||"All")===f ? T.accent : T.border}`, background:(multiplyFilter||"All")===f ? T.accentBg : "transparent", color:(multiplyFilter||"All")===f ? T.accent : T.text3 }}>
                    {f}
                  </button>
                ))}
              </div>
              {/* Vault cards */}
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {MULTIPLY_VAULTS.filter(v => {
                  if (!multiplyFilter) return true;
                  if (multiplyFilter === "Low Risk") return v.risk === "Low";
                  if (multiplyFilter === "Stable") return ["USDC","USDT","USDG","USDS"].some(s => v.collateral.includes(s));
                  return v.collateral.toUpperCase().includes(multiplyFilter) || v.debt.toUpperCase().includes(multiplyFilter);
                }).map(v => (
                  <div key={v.id} style={{ padding:"12px 14px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                      <div>
                        <span style={{ fontWeight:600, fontSize:13, color:T.text1 }}>{v.collateral} / {v.debt}</span>
                        <span style={{ marginLeft:8, fontSize:11, color: v.risk==="Low"?T.green : v.risk==="Medium"?T.accent : T.red, fontWeight:600, background: v.risk==="Low"?T.greenBg : v.risk==="Medium"?T.accentBg : T.redBg, border:`1px solid ${v.risk==="Low"?T.greenBd : v.risk==="Medium"?T.accent+"44" : T.redBd}`, borderRadius:6, padding:"1px 6px" }}>{v.risk} Risk</span>
                      </div>
                      <span style={{ fontSize:12, color:T.purple, fontWeight:700 }}>Up to {v.maxLev}</span>
                    </div>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:8, lineHeight:1.5 }}>{v.desc}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11, color:T.text3 }}>Max LTV: {v.ltv}</span>
                      <div style={{ display:"flex", gap:6 }}>
                        <a href={v.url} target="_blank" rel="noreferrer"
                          style={{ padding:"6px 14px", background:T.accent, border:"none", borderRadius:6, color:"#0d1117", fontSize:12, fontWeight:700, textDecoration:"none", display:"flex", alignItems:"center", gap:4 }}>
                          Open on Jupiter ↗
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowMultiply(false)}
                style={{ marginTop:12, padding:"6px 14px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          )}

          {/* ── Multiply position form — deep link to Jupiter ──────────── */}
          {showMultiplyForm && multiplyPos.vault && (() => {
            const v = multiplyPos.vault;
            const bal = portfolio[v.collateral] ?? 0;
            const lev = parseFloat(multiplyPos.leverage);
            const col = parseFloat(multiplyPos.colAmount) || 0;
            const exposure = col * lev;
            const debt = col * (lev - 1);
            return (
              <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:2, color:T.text1, display:"flex", alignItems:"center", gap:10 }}>
                  {v.collateral}/{v.debt} Multiply
                  <span style={{ fontSize:10, padding:"2px 7px", background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:10, color:T.accent, fontWeight:600 }}>COMING SOON</span>
                </div>
                <div style={{ fontSize:11, color:T.text3, marginBottom:14 }}>
                  Max {v.maxLev} · {v.risk} Risk · Max LTV {v.ltv}
                </div>

                {/* Leverage slider */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:T.text2, marginBottom:6 }}>
                    <span>Leverage</span>
                    <span style={{ fontWeight:700, color:T.accent }}>{multiplyPos.leverage}x</span>
                  </div>
                  <input type="range" min="1.1" max={parseFloat(v.maxLev)} step="0.1"
                    value={multiplyPos.leverage}
                    onChange={e => setMultiplyPos(p => ({ ...p, leverage: parseFloat(e.target.value).toFixed(1) }))}
                    style={{ width:"100%", accentColor:T.accent }}
                  />
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3 }}>
                    <span>1x</span><span>{v.maxLev} max</span>
                  </div>
                </div>

                {/* Collateral input */}
                {bal > 0 && (
                  <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                    {[["25%",0.25],["50%",0.5],["75%",0.75],["Max",1]].map(([label,frac]) => (
                      <button key={label} onClick={() => setMultiplyPos(p => ({ ...p, colAmount:(bal*frac).toFixed(6).replace(/\.?0+$/,"") }))}
                        style={{ flex:1, padding:"5px 0", background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, color:T.text2, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <input type="number" placeholder={`Amount (${v.collateral}${bal>0?` · bal: ${bal.toFixed(4)}`:""})`}
                  value={multiplyPos.colAmount}
                  onChange={e => setMultiplyPos(p => ({ ...p, colAmount:e.target.value }))}
                  style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:12 }}
                />

                {/* Position preview */}
                {col > 0 && (
                  <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:12, color:T.text2, lineHeight:1.8 }}>
                    <div>Collateral: <strong style={{ color:T.text1 }}>{col.toFixed(4)} {v.collateral}</strong></div>
                    <div>Total exposure: <strong style={{ color:T.accent }}>{exposure.toFixed(4)} {v.collateral}</strong></div>
                    <div>Debt to borrow: <strong style={{ color:T.red }}>{debt.toFixed(4)} {v.debt}</strong></div>
                    <div style={{ fontSize:10, color:T.text3, marginTop:4 }}>Note: Position tracked as NFT. Monitor at jup.ag/lend.</div>
                  </div>
                )}

                {/* Deep link CTA */}
                <div style={{ background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:12, color:T.text2, marginBottom:8, lineHeight:1.5 }}>
                    Ready to open? Jupiter handles the flashloan transaction securely. Tap below to open your position directly on Jupiter Lend.
                  </div>
                  <a href={v.url} target="_blank" rel="noreferrer"
                    style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, width:"100%", padding:"11px", background:T.accent, borderRadius:8, color:"#0d1117", fontSize:14, fontWeight:700, textDecoration:"none" }}>
                    Open {multiplyPos.leverage}x Position on Jupiter ↗
                  </a>
                </div>

                <button onClick={() => setShowMultiplyForm(false)}
                  style={{ width:"100%", padding:"8px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            );
          })()}

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
              {/* Quick % fill buttons */}
              {(() => {
                const tok = earnDeposit.vault?.token?.toUpperCase() || "";
                const bal = portfolio[tok] ?? 0;
                return bal > 0 ? (
                  <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                    {[["25%", 0.25], ["50%", 0.5], ["75%", 0.75], ["All", 1]].map(([label, frac]) => (
                      <button key={label} onClick={() => setEarnDeposit(d => ({ ...d, amount: (bal * frac).toFixed(6).replace(/\.?0+$/, "") }))}
                        style={{ flex:1, padding:"5px 0", background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, color:T.text2, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
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

          {/* ── Earn Withdraw modal ──────────────────────────────────── */}
          {showEarnWithdraw && earnWithdraw.vault && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:4, color:T.text1 }}>
                Withdraw from {earnWithdraw.vault.name}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:16, fontWeight:700, color:T.green }}>{earnWithdraw.vault.apyDisplay} APY</span>
                {earnWithdraw.vault.tvl > 0 && <span style={{ fontSize:12, color:T.text3 }}>· TVL ${Number(earnWithdraw.vault.tvl).toLocaleString()}</span>}
              </div>

              {/* Position summary */}
              {earnWithdraw.positionAmount > 0 && (
                <div style={{ padding:"10px 14px", background:`${T.green}10`, border:`1px solid ${T.green}33`, borderRadius:8, marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:12, color:T.text3 }}>Your deposited balance</span>
                  <span style={{ fontSize:14, fontWeight:700, color:T.green }}>
                    {earnWithdraw.positionAmount.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:4 })} {earnWithdraw.vault.token}
                  </span>
                </div>
              )}

              <div style={{ fontSize:11, color:T.text3, marginBottom:10 }}>
                Enter the amount of <strong style={{ color:T.text2 }}>{earnWithdraw.vault.token}</strong> to withdraw. Withdrawals are subject to the Automated Debt Ceiling — large amounts may be smoothed over blocks.
              </div>

              {/* % quick-fill buttons — only shown when position is known */}
              {earnWithdraw.positionAmount > 0 && (
                <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                  {[25, 50, 75, 100].map(pct => {
                    const fillAmt = (earnWithdraw.positionAmount * pct / 100);
                    const display = fillAmt.toFixed(4).replace(/\.?0+$/, "");
                    const isSelected = parseFloat(earnWithdraw.amount) === parseFloat(display) ||
                      (pct === 100 && parseFloat(earnWithdraw.amount) >= earnWithdraw.positionAmount * 0.9999);
                    return (
                      <button key={pct}
                        onClick={() => setEarnWithdraw(d => ({ ...d, amount: display }))}
                        className="hov-btn"
                        style={{
                          flex:1, padding:"6px 0", fontSize:12, fontWeight:600,
                          borderRadius:7, cursor:"pointer", transition:"all 0.15s",
                          background: isSelected ? T.green : `${T.green}15`,
                          border: `1px solid ${isSelected ? T.green : T.green+"44"}`,
                          color: isSelected ? "#0d1117" : T.green,
                        }}>
                        {pct === 100 ? "MAX" : `${pct}%`}
                      </button>
                    );
                  })}
                </div>
              )}

              <input type="number" placeholder={`Amount (${earnWithdraw.vault.token})`} value={earnWithdraw.amount}
                onChange={e => setEarnWithdraw(d=>({...d,amount:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:12 }}
              />

              {/* Percentage indicator below input */}
              {earnWithdraw.positionAmount > 0 && earnWithdraw.amount && parseFloat(earnWithdraw.amount) > 0 && (
                <div style={{ fontSize:11, color:T.text3, marginTop:-8, marginBottom:12, textAlign:"right" }}>
                  {Math.min(100, (parseFloat(earnWithdraw.amount) / earnWithdraw.positionAmount * 100)).toFixed(1)}% of your position
                </div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                <button
                  onClick={doEarnWithdraw}
                  disabled={!earnWithdraw.amount||parseFloat(earnWithdraw.amount)<=0} className="hov-btn"
                  style={{ flex:1, padding:"10px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, color:T.red, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  Confirm Withdraw
                </button>
                <button onClick={() => setShowEarnWithdraw(false)}
                  style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Jupiter Studio — Token Creation Panel ──────────────── */}
          {showStudio && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><SvgPalette size={16} color={T.accent}/><span style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Jupiter Studio — Create Token</span></div>
                <button onClick={() => setShowStudio(false)} style={{ background:"none", border:"none", color:T.text3, fontSize:16, cursor:"pointer" }}>✕</button>
              </div>
              <div style={{ fontSize:11, color:T.text3, marginBottom:14, lineHeight:1.5 }}>
                Launch a token with a Dynamic Bonding Curve — tradeable on Jupiter from day 1. Earn creator fees on every trade.
              </div>

              {/* Preset selector */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:T.text3, marginBottom:6 }}>Launch Preset</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[
                    { id:"meme", label:"Meme", desc:"16K→69K MC, raises ~18K USDC" },
                    { id:"indie", label:"Indie", desc:"32K→240K MC, raises ~58K USDC + vesting" },
                  ].map(p => (
                    <button key={p.id} onClick={() => setStudioCfg(c=>({...c,preset:p.id}))}
                      style={{ flex:1, padding:"8px 10px", borderRadius:8, border:`1px solid ${studioCfg.preset===p.id ? T.accent : T.border}`, background: studioCfg.preset===p.id ? T.accentBg : T.bg, color: studioCfg.preset===p.id ? T.accent : T.text2, fontSize:12, cursor:"pointer", textAlign:"left" }}>
                      <div style={{ fontWeight:600 }}>{p.label}</div>
                      <div style={{ fontSize:10, color:T.text3, marginTop:2 }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Name + Symbol */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Token Name *</div>
                  <input value={studioCfg.name} onChange={e => setStudioCfg(c=>({...c,name:e.target.value}))}
                    placeholder="e.g. My Token"
                    style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}/>
                </div>
                <div>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Symbol *</div>
                  <input value={studioCfg.symbol} onChange={e => setStudioCfg(c=>({...c,symbol:e.target.value.toUpperCase()}))}
                    placeholder="e.g. MTK"
                    style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}/>
                </div>
              </div>

              {/* Token Image upload */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Token Image * <span style={{ color:T.text3 }}>(JPG/PNG/GIF, shown on jup.ag)</span></div>
                <label style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", border:`1px dashed ${studioImage ? T.accent : T.border}`, borderRadius:8, cursor:"pointer", background:T.bg }}>
                  {studioImage ? (
                    <>
                      <img src={studioImage.dataUrl} alt="token" style={{ width:40, height:40, borderRadius:8, objectFit:"cover" }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, color:T.text1 }}>{studioImage.file.name}</div>
                        <div style={{ fontSize:10, color:T.text3 }}>Click to change</div>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize:12, color:T.text3, display:"flex", alignItems:"center", gap:6 }}><SvgUpload size={14} color={T.text3}/> Click to upload token image</div>
                  )}
                  <input type="file" accept="image/*" style={{ display:"none" }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => setStudioImage({ file, dataUrl: ev.target.result, type: file.type || "image/jpeg" });
                      reader.readAsDataURL(file);
                    }}/>
                </label>
              </div>

              {/* Description */}
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Description</div>
                <textarea value={studioCfg.description} onChange={e => setStudioCfg(c=>({...c,description:e.target.value}))}
                  placeholder="Brief description of your token (optional)"
                  rows={2}
                  style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, resize:"none" }}/>
              </div>

              {/* Website + Twitter */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Website</div>
                  <input value={studioCfg.website} onChange={e => setStudioCfg(c=>({...c,website:e.target.value}))}
                    placeholder="https://..."
                    style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}/>
                </div>
                <div>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Twitter / X</div>
                  <input value={studioCfg.twitter} onChange={e => setStudioCfg(c=>({...c,twitter:e.target.value}))}
                    placeholder="@handle"
                    style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}/>
                </div>
              </div>

              {/* Status banners */}
              {studioStatus === "signing" && (
                <div style={{ padding:"10px 12px", background:T.accentBg, border:`1px solid ${T.accent}`, borderRadius:8, marginBottom:12, fontSize:12, color:T.accent }}>
                  ⏳ Uploading metadata &amp; signing transaction…
                </div>
              )}
              {studioStatus === "done" && studioResult && (
                <div style={{ padding:"14px", background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:10, marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <span style={{ fontSize:13, fontWeight:700, color:T.green }}>Token launched successfully!</span>
                  </div>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:3 }}>Mint Address</div>
                  <div style={{ fontSize:12, color:T.text1, fontFamily:"monospace", wordBreak:"break-all", background:T.bg, padding:"6px 8px", borderRadius:6, marginBottom:10 }}>{studioResult.mintAddress}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <a href={`https://jup.ag/studio/${studioResult.mintAddress}`} target="_blank" rel="noreferrer"
                      style={{ flex:1, padding:"7px", background:T.accent, borderRadius:8, color:"#0d1117", fontSize:12, fontWeight:700, textDecoration:"none", textAlign:"center" }}>
                      View on Jupiter
                    </a>
                    <a href={`https://solscan.io/token/${studioResult.mintAddress}`} target="_blank" rel="noreferrer"
                      style={{ flex:1, padding:"7px", background:"none", border:`1px solid ${T.greenBd}`, borderRadius:8, color:T.green, fontSize:12, textDecoration:"none", textAlign:"center" }}>
                      Solscan
                    </a>
                  </div>
                </div>
              )}
              {studioStatus === "error" && (
                <div style={{ padding:"10px 12px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, marginBottom:12, fontSize:12, color:T.red }}>
                  Creation failed. Check wallet has enough SOL (~0.05–0.1 SOL for pool creation).
                </div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                {studioStatus === "done" ? (
                  <button onClick={() => { setShowStudio(false); setStudioStatus(null); setStudioResult(null); }}
                    style={{ flex:1, padding:"10px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                    Close
                  </button>
                ) : (
                  <>
                    <button onClick={doCreateToken}
                      disabled={!studioCfg.name.trim() || !studioCfg.symbol.trim() || !studioImage || studioStatus==="signing" || !walletFull}
                      className="hov-btn"
                      style={{ flex:1, padding:"10px", background: (!studioCfg.name.trim()||!studioCfg.symbol.trim()||!studioImage||studioStatus==="signing"||!walletFull)?T.border:T.accentBg, border:`1px solid ${(!studioCfg.name.trim()||!studioCfg.symbol.trim()||!studioImage||studioStatus==="signing"||!walletFull)?T.border:T.accent}`, borderRadius:8, color:(!studioCfg.name.trim()||!studioCfg.symbol.trim()||!studioImage||studioStatus==="signing"||!walletFull)?T.text3:T.accent, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                      {studioStatus==="signing" ? "Launching…" : "Launch Token"}
                    </button>
                    <button onClick={() => setShowStudio(false)}
                      style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
              {!walletFull && <div style={{ fontSize:11, color:T.red, marginTop:8, textAlign:"center" }}>Connect your wallet to create a token</div>}
            </div>
          )}

          {/* ── Studio Fees Panel ────────────────────────────────────── */}
          {showStudioFees && studioFees && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><SvgCoin size={16} color={T.accent}/><span style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Creator Fees</span></div>
                <button onClick={() => setShowStudioFees(false)} style={{ background:"none", border:"none", color:T.text3, fontSize:16, cursor:"pointer" }}>✕</button>
              </div>
              {(() => {
                const pools = studioFees.pools || studioFees.data || (Array.isArray(studioFees) ? studioFees : []);
                if (!pools.length) return <div style={{ fontSize:13, color:T.text3 }}>No unclaimed fees found.</div>;
                return pools.map((pool, i) => (
                  <div key={i} style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:T.text1 }}>{pool.symbol || pool.name || `Pool ${i+1}`}</div>
                      <div style={{ fontSize:11, color:T.text3 }}>{pool.poolAddress?.slice?.(0,16)}…</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:T.green }}>{pool.unclaimedFeeUsd ? `$${parseFloat(pool.unclaimedFeeUsd).toFixed(4)}` : (pool.unclaimedFee || "—")}</div>
                      <div style={{ fontSize:11, color:T.text3 }}>unclaimed</div>
                    </div>
                  </div>
                ));
              })()}
              <div style={{ fontSize:11, color:T.text3, marginTop:8 }}>
                To claim fees, visit <a href="https://jup.ag/studio" target="_blank" rel="noreferrer" style={{ color:T.accent }}>jup.ag/studio</a>
              </div>
            </div>
          )}

          {/* ── Jupiter Lock — Token Lock Panel ─────────────────────── */}
          {showLock && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><SvgLock size={16} color={T.accent}/><span style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Lock Tokens</span></div>
                <button onClick={() => setShowLock(false)} style={{ background:"none", border:"none", color:T.text3, fontSize:16, cursor:"pointer" }}>✕</button>
              </div>
              <div style={{ fontSize:11, color:T.text3, marginBottom:14, lineHeight:1.5 }}>
                Lock tokens on-chain with cliff + linear vesting. Non-custodial — only the recipient can claim vested tokens.
              </div>
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Token</div>
                <TokenPicker value={lockCfg.token} jupFetch={jupFetch}
                  onSelect={(sym, mint, dec) => {
                    setLockCfg(c => ({ ...c, token: sym, mint }));
                    if (dec) tokenDecimalsRef.current[sym] = dec;
                  }}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Amount</div>
                  <input type="number" value={lockCfg.amount} onChange={e => setLockCfg(c=>({...c,amount:e.target.value}))}
                    placeholder="0"
                    style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}/>
                </div>
                <div>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Cliff (days)</div>
                  <input type="number" value={lockCfg.cliffDays} onChange={e => setLockCfg(c=>({...c,cliffDays:e.target.value}))}
                    placeholder="90"
                    style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}/>
                </div>
                <div>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Vesting (days)</div>
                  <input type="number" value={lockCfg.vestingDays} onChange={e => setLockCfg(c=>({...c,vestingDays:e.target.value}))}
                    placeholder="365"
                    style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}/>
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Recipient wallet (blank = your wallet)</div>
                <input value={lockCfg.recipient} onChange={e => setLockCfg(c=>({...c,recipient:e.target.value}))}
                  placeholder="Solana address (leave blank for self)"
                  style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}/>
              </div>
              {lockCfg.cliffDays && lockCfg.vestingDays && (
                <div style={{ padding:"8px 12px", background:T.tealBg, border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, color:T.text2, marginBottom:12 }}>
                  Unlocks start after <strong style={{ color:T.teal }}>{lockCfg.cliffDays} days</strong>, then vest linearly over <strong style={{ color:T.teal }}>{lockCfg.vestingDays} days</strong> total.
                </div>
              )}
              {lockStatus === "done" && lockResult && (
                <div style={{ padding:"10px 12px", background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:8, marginBottom:12, fontSize:12, color:T.green }}>
                  ✓ Lock created! ID: <code>{(lockResult.lockId||"").slice(0,20)}…</code>
                </div>
              )}
              {lockStatus === "error" && (
                <div style={{ padding:"10px 12px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, marginBottom:12, fontSize:12, color:T.red }}>
                  Lock creation failed. Make sure you have enough SOL for the transaction.
                </div>
              )}
              {lockCfg.mint === "So11111111111111111111111111111111111111112" && (
                <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, fontSize:11, color:"#ef4444", marginBottom:8 }}>
                  Note: Native SOL cannot be locked. Switch to an SPL token like USDC or JUP.
                </div>
              )}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={doCreateLock}
                  disabled={!lockCfg.mint || !lockCfg.amount || parseFloat(lockCfg.amount)<=0 || lockStatus==="signing" || !walletFull || lockCfg.mint==="So11111111111111111111111111111111111111112"}
                  className="hov-btn"
                  style={{ flex:1, padding:"10px", background:T.purpleBg, border:`1px solid ${T.purple}`, borderRadius:8, color:T.purple, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  {lockStatus==="signing" ? "Signing…" : "Create Lock"}
                </button>
                <button onClick={() => setShowLock(false)}
                  style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Lock List Panel ──────────────────────────────────────── */}
          {showLocks && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><SvgLock size={16} color={T.accent}/><span style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Token Locks</span></div>
                <button onClick={() => setShowLocks(false)} style={{ background:"none", border:"none", color:T.text3, fontSize:16, cursor:"pointer" }}>✕</button>
              </div>
              {locksLoading && <div style={{ fontSize:13, color:T.text3 }}>Loading locks…</div>}
              {!locksLoading && !lockList.length && <div style={{ fontSize:13, color:T.text3 }}>No locks found for your wallet.</div>}
              {lockList.map((lock, i) => {
                const id = lock.lockId || lock.pubkey || lock.id;
                const isClaimable = lock.claimable === true || (lock.claimableAmount && parseFloat(lock.claimableAmount) > 0);
                const sym = lock.symbol || lock.token?.symbol || lock.mintSymbol || "tokens";
                const totalAmt = lock.totalAmount || lock.amount || "—";
                const vestPct  = lock.vestedPercent ? `${parseFloat(lock.vestedPercent).toFixed(1)}%` : null;
                return (
                  <div key={i} style={{ padding:"12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                      <div>
                        <span style={{ fontSize:14, fontWeight:600, color:T.text1 }}>{sym}</span>
                        <span style={{ fontSize:11, color:T.text3, marginLeft:8 }}>{id?.slice?.(0,14)}…</span>
                      </div>
                      <span style={{ fontSize:12, padding:"2px 8px", borderRadius:10, background: isClaimable ? T.greenBg : T.surface, color: isClaimable ? T.green : T.text3, border:`1px solid ${isClaimable ? T.greenBd : T.border}` }}>
                        {isClaimable ? "Claimable" : "Locked"}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:isClaimable?8:0 }}>
                      Amount: <strong style={{ color:T.text2 }}>{totalAmt}</strong>
                      {vestPct && <> · Vested: <strong style={{ color:T.teal }}>{vestPct}</strong></>}
                      {lock.cliffEnd && <> · Cliff ends: {new Date(lock.cliffEnd * 1000).toLocaleDateString()}</>}
                    </div>
                    {isClaimable && (
                      <button onClick={() => doClaimLock(id, lock.pubkey)}
                        disabled={claimingLock === id} className="hov-btn"
                        style={{ padding:"6px 14px", background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:6, color:T.green, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        {claimingLock === id ? "Claiming…" : `Claim ${lock.claimableAmount ? parseFloat(lock.claimableAmount).toFixed(4) : ""} ${sym}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Route Inspector Panel ────────────────────────────────── */}
          {showRoute && routeData && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><SvgMap size={16} color={T.accent}/><span style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>Swap Route: {routeData.fromSym} → {routeData.toSym}</span></div>
                <button onClick={() => setShowRoute(false)} style={{ background:"none", border:"none", color:T.text3, fontSize:16, cursor:"pointer" }}>✕</button>
              </div>
              {routeLoading && <div style={{ fontSize:13, color:T.text3 }}>Fetching route…</div>}
              {!routeLoading && (() => {
                const outAmt   = routeData.outAmount ? (parseInt(routeData.outAmount) / Math.pow(10, routeData.outputDecimals || 6)).toFixed(6) : "—";
                const impact   = routeData.priceImpactPct ? `${(parseFloat(routeData.priceImpactPct)*100).toFixed(4)}%` : routeData.priceImpact || "—";
                const hops     = routeData.routeInfo?.marketInfos || routeData.routePlan || [];
                const slippage = routeData.slippageBps ? `${routeData.slippageBps / 100}%` : "0.5%";
                return (
                  <>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
                      {[
                        ["Input",        `${routeData.amount} ${routeData.fromSym}`],
                        ["Output",       `${outAmt} ${routeData.toSym}`],
                        ["Price Impact", impact],
                      ].map(([lbl, val]) => (
                        <div key={lbl} style={{ padding:"8px 10px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8 }}>
                          <div style={{ fontSize:10, color:T.text3 }}>{lbl}</div>
                          <div style={{ fontSize:13, fontWeight:600, color:T.text1 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {hops.length > 0 && (
                      <>
                        <div style={{ fontSize:11, color:T.text3, marginBottom:8 }}>ROUTE ({hops.length} hop{hops.length!==1?"s":""})</div>
                        {hops.map((hop, i) => {
                          const DEX_LOGOS = {
                            "orca":        "https://www.orca.so/favicon.ico",
                            "whirlpool":   "https://www.orca.so/favicon.ico",
                            "raydium":     "https://raydium.io/favicon.ico",
                            "meteora":     "https://app.meteora.ag/favicon.ico",
                            "lifinity":    "https://lifinity.io/favicon.ico",
                            "phoenix":     "https://www.phoenix.trade/favicon.ico",
                            "openbook":    "https://openbookdex.com/favicon.ico",
                            "goosefx":     "https://www.goosefx.io/favicon.ico",
                            "saber":       "https://app.saber.so/favicon.ico",
                            "aldrin":      "https://aldrin.com/favicon.ico",
                            "crema":       "https://crema.finance/favicon.ico",
                            "invariant":   "https://invariant.app/favicon.ico",
                            "dooar":       "https://dooar.com/favicon.ico",
                            "sanctum":     "https://www.sanctum.so/favicon.ico",
                            "pump":        "https://pump.fun/favicon.ico",
                            "humidifi":    "https://www.humidifi.io/favicon.ico",
                            "fluxbeam":    "https://fluxbeam.xyz/favicon.ico",
                            "stabble":     "https://stabble.org/favicon.ico",
                            "obric":       "https://obric.xyz/favicon.ico",
                            "jupiter":     "https://jup.ag/favicon.ico",
                            "token swap":  "https://jup.ag/favicon.ico",
                          };
                          const dex     = hop.swapInfo?.label || hop.ammKey?.label || hop.marketMeta?.amm?.label || hop.label || hop.dex || `DEX ${i+1}`;
                          const dexKey  = dex.toLowerCase().split(/[\s(]/)[0];
                          const logoUrl = Object.entries(DEX_LOGOS).find(([k]) => dexKey.includes(k))?.[1] || null;
                          const pi     = (hop.swapInfo?.priceImpactPct ?? hop.priceImpactPct) ? `${(parseFloat(hop.swapInfo?.priceImpactPct ?? hop.priceImpactPct)*100).toFixed(4)}% impact` : null;
                          const pct    = hop.percent    ? `${hop.percent}%` : null;
                          return (
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:6, fontSize:12 }}>
                              <span style={{ width:20, height:20, borderRadius:"50%", background:T.accentBg, border:`1px solid ${T.accent}`, display:"flex", alignItems:"center", justifyContent:"center", color:T.accent, fontSize:10, flexShrink:0 }}>{i+1}</span>
                              {logoUrl
                                ? <img src={logoUrl} alt={dex} style={{ width:18, height:18, borderRadius:4, objectFit:"contain", flexShrink:0, background:"#fff" }} onError={e => { e.currentTarget.style.display="none"; e.currentTarget.nextSibling.style.display="flex"; }} />
                                : null}
                              <span style={{ width:18, height:18, borderRadius:4, background:T.surface, border:`1px solid ${T.border}`, flexShrink:0, display: logoUrl ? "none" : "flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:700, color:T.accent }}>
                                {dex.slice(0,2).toUpperCase()}
                              </span>
                              <span style={{ fontWeight:600, color:T.teal, flex:1 }}>{dex}</span>
                              {pct   && <span style={{ color:T.text3 }}>{pct}</span>}
                              {pi    && <span style={{ color: parseFloat(hop.swapInfo?.priceImpactPct ?? hop.priceImpactPct ?? 0)*100 > 1 ? T.red : T.text3 }}>{pi}</span>}
                            </div>
                          );
                        })}
                      </>
                    )}
                    <div style={{ marginTop:8, fontSize:11, color:T.text3 }}>
                      Slippage tolerance: {slippage} · Powered by Jupiter DEX aggregator
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Suggestions */}
          {msgs.length <= 2 && !typing && (
            <div style={{ marginBottom:24, paddingLeft:0 }}>
              <div style={{ fontSize:11, color:T.text3, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14, paddingLeft:4 }}>Quick actions</div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {SUGGESTION_GROUPS.map(group => (
                  <div key={group.label}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:group.color, flexShrink:0 }}/>
                      <span style={{ fontSize:10, fontWeight:700, color:group.color, letterSpacing:"0.1em", textTransform:"uppercase" }}>{group.label}</span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {group.items.map(s => (
                        <button key={s} onClick={() => send(s)} className="hov-sugg"
                          style={{
                            padding:"7px 13px",
                            background:T.surface,
                            border:`1px solid ${T.border}`,
                            borderRadius:10,
                            fontSize:12,
                            color:T.text2,
                            cursor:"pointer",
                            lineHeight:1.3,
                            transition:"all 0.15s",
                            textAlign:"left",
                          }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div ref={endRef}/>
        </div>


        {/* PWA Install Banner */}
        {installBanner && (
          <div style={{ position:"absolute", bottom:80, left:12, right:12, zIndex:100, background:T.surface, border:`1px solid ${T.accent}`, borderRadius:16, padding:"14px 16px", boxShadow:"0 -4px 24px rgba(0,0,0,0.4)", display:"flex", alignItems:"center", gap:12, animation:"fadeUp 0.3s ease" }}>
            <span style={{ fontSize:24, flexShrink:0, display:"flex", alignItems:"center" }}><SvgPhone size={24} color={T.accent}/></span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:T.text1, marginBottom:2 }}>Add ChatFi to Home Screen</div>
              <div style={{ fontSize:11, color:T.text2 }}>{installBanner.isIOS ? "Tap Share → Add to Home Screen" : "Instant access, no browser bar"}</div>
            </div>
            {!installBanner.isIOS && (
              <button onClick={async () => {
                installBanner.prompt.prompt();
                const { outcome } = await installBanner.prompt.userChoice;
                if (outcome === "accepted") { localStorage.setItem("chatfi-install-done", "true"); }
                setInstallBanner(null);
              }}
              style={{ padding:"7px 14px", background:T.accent, border:"none", borderRadius:10, color:"#0d1117", fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
                Add
              </button>
            )}
            <button onClick={() => { localStorage.setItem("chatfi-install-done", "true"); setInstallBanner(null); }}
              style={{ padding:"6px 10px", background:"none", border:`1px solid ${T.border}`, borderRadius:10, color:T.text3, fontSize:12, cursor:"pointer", flexShrink:0 }}>
              ✕
            </button>
          </div>
        )}

        {/* ── Copy Trade Panel ──────────────────────────────────────────── */}
        {showCopyTrade && copyTradeData && (
          <div style={{ margin:"0 16px 16px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:15 }}><SvgBlog size={15} color="currentColor"/></span>
                <span style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>
                  Copy Trade — <span style={{ fontFamily:T.mono, fontSize:12, color:T.text3 }}>{copyTradeData.wallet.slice(0,8)}…{copyTradeData.wallet.slice(-4)}</span>
                </span>
              </div>
              <button onClick={() => setShowCopyTrade(false)} style={{ background:"none", border:"none", color:T.text3, fontSize:16, cursor:"pointer" }}>✕</button>
            </div>
            {copyTradeData.trades.map((t, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:8, gap:12, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:T.text1 }}>{t.fromSymbol} → {t.toSymbol}</div>
                  <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>
                    {t.fromAmount} {t.fromSymbol} → {t.toAmount} {t.toSymbol}
                    {t.timestamp && <> · {new Date(t.timestamp).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCopyTrade(false);
                    setMsgs(m => {
                      const next = [...m, { id: Date.now(), role:"user", text:`Swap ${t.fromAmount} ${t.fromSymbol} to ${t.toSymbol}` }];
                      try { sessionStorage.setItem("chatfi-msgs", JSON.stringify(next.slice(-80))); } catch {}
                      return next;
                    });
                    setTimeout(() => {
                      const evt = new CustomEvent("chatfi-mirror-trade", { detail: { from: t.fromSymbol, to: t.toSymbol, amount: t.fromAmount } });
                      window.dispatchEvent(evt);
                    }, 100);
                  }}
                  className="hov-btn"
                  style={{ padding:"6px 14px", background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:6, color:T.accent, fontSize:12, fontWeight:600, cursor:"pointer", flexShrink:0 }}>
                  Mirror
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Price Alerts Summary (shown when alerts are active) ──────── */}
        {priceAlerts.filter(a => !a.triggered).length > 0 && (
          <div style={{ margin:"0 16px 8px", padding:"8px 14px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
            <span style={{ fontSize:12, color:T.text2 }}>
              <strong>{priceAlerts.filter(a=>!a.triggered).length}</strong> active alert{priceAlerts.filter(a=>!a.triggered).length>1?"s":""}: {priceAlerts.filter(a=>!a.triggered).map(a=>`${a.token} ${a.condition} $${a.target.toLocaleString()}`).join(" · ")}
            </span>
            <button onClick={() => { const cleared = priceAlerts.map(a=>({...a,triggered:true})); setPriceAlerts(cleared); try{localStorage.setItem("chatfi-alerts",JSON.stringify(cleared));}catch{} }}
              style={{ background:"none", border:"none", color:T.text3, fontSize:12, cursor:"pointer", flexShrink:0 }}>Clear all</button>
          </div>
        )}

        {/* ── Circular Input Bar ── */}
        <div style={{ padding:"10px 16px 0", paddingBottom:"calc(max(18px, env(safe-area-inset-bottom, 18px)) + 8px)", background:T.bg, borderTop:`1px solid ${T.border}22`, flexShrink:0 }}>
          <div style={{
            display:"flex", alignItems:"center", gap:0,
            background:T.surface,
            border:`1.5px solid ${T.border}`,
            borderRadius:999,
            padding:"6px 6px 6px 18px",
            boxShadow:"0 -2px 24px rgba(0,0,0,0.3)",
            transition:"border-color 0.2s",
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }}
              placeholder="Ask about prices, swaps, tokens…"
              rows={1}
              style={{
                flex:1, border:"none", outline:"none", background:"transparent",
                fontFamily:T.body, fontSize:14, color:T.text1, lineHeight:1.5,
                maxHeight:120, overflowY:"auto", resize:"none",
                paddingTop:6, paddingBottom:6,
              }}
            />
            {/* Circular send button */}
            <button
              onClick={() => send()}
              disabled={!input.trim() || typing}
              className="send-btn"
              style={{
                width:40, height:40, borderRadius:"50%", flexShrink:0,
                background: (!input.trim()||typing) ? T.border : T.accent,
                border:"none",
                display:"flex", alignItems:"center", justifyContent:"center",
                cursor: (!input.trim()||typing) ? "default" : "pointer",
                transition:"background 0.15s, transform 0.1s",
                boxShadow: (!input.trim()||typing) ? "none" : `0 0 12px ${T.accent}55`,
                transform: (!input.trim()||typing) ? "scale(0.95)" : "scale(1)",
              }}>
              {typing
                ? <span className="spinner" style={{ width:14, height:14, borderWidth:2 }}/>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d1117" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
              }
            </button>
          </div>
          <div style={{ textAlign:"center", fontSize:10, color:T.text3, marginTop:6, letterSpacing:"0.02em" }}>
            Not financial advice · Powered by Jupiter
          </div>
        </div>
      </div>

      {/* ── Connect / Sign In Modal ─────────────────────────────────────────── */}
      {showWalletModal && (
        <div style={{
          position:"fixed", inset:0, zIndex:1000,
          background:"rgba(0,0,0,0.7)", backdropFilter:"blur(4px)",
          display:"flex", alignItems:"flex-end", justifyContent:"center",
          padding:"0 0 env(safe-area-inset-bottom,0)",
          animation:"fadeUp 0.18s ease",
        }} onClick={() => setShowWalletModal(false)}>
          <div style={{
            width:"100%", maxWidth:480,
            background:T.surface, borderRadius:"20px 20px 0 0",
            border:`1px solid ${T.border}`, borderBottom:"none",
            padding:"20px 20px 32px",
            animation:"fadeUp 0.22s ease",
          }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div>
                <div style={{ fontSize:17, fontWeight:700, color:T.text1 }}>Connect</div>
                <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>Sign in or connect an existing wallet</div>
              </div>
              <button onClick={() => setShowWalletModal(false)}
                style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:"50%", width:30, height:30, color:T.text2, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>

            {/* Social Login section */}
            <div style={{ fontSize:10, color:T.text3, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Recommended</div>
            <button onClick={connectWithPrivy}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"13px 16px", background:T.accentBg, border:`1px solid ${T.accent}55`, borderRadius:14, cursor:"pointer", marginBottom:10, transition:"all 0.15s" }}
              className="hov-btn">
              <div style={{ width:36, height:36, borderRadius:10, background:T.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d1117" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </div>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:14, fontWeight:700, color:T.text1 }}>Social Login</div>
                <div style={{ fontSize:11, color:T.text3, marginTop:1 }}>Email, Google, Twitter, Discord — wallet auto-created</div>
              </div>
              <div style={{ marginLeft:"auto", fontSize:10, fontWeight:700, color:T.accent, background:`${T.accent}22`, padding:"3px 8px", borderRadius:6 }}>NEW</div>
            </button>

            {/* Divider */}
            <div style={{ display:"flex", alignItems:"center", gap:10, margin:"16px 0" }}>
              <div style={{ flex:1, height:1, background:T.border }}/>
              <span style={{ fontSize:11, color:T.text3 }}>or use a wallet</span>
              <div style={{ flex:1, height:1, background:T.border }}/>
            </div>

            {/* External wallet options */}
            {[
              { name:"Phantom",     icon: WALLET_LOGOS["Phantom"] },
              { name:"Solflare",    icon: WALLET_LOGOS["Solflare"] },
              { name:"Backpack",    icon: WALLET_LOGOS["Backpack"] },
              { name:"Coinbase Wallet", icon:"https://www.coinbase.com/favicon.ico" },
              { name:"Magic Eden", icon:"https://magiceden.io/favicon.ico" },
              { name:"Trust",       icon: WALLET_LOGOS["Trust Wallet"] },
            ].map(w => (
              <button key={w.name} onClick={connectWithReown}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"11px 14px", background:"none", border:`1px solid ${T.border}`, borderRadius:12, cursor:"pointer", marginBottom:8, transition:"all 0.15s" }}
                className="hov-btn">
                <img src={w.icon} alt={w.name}
                  style={{ width:32, height:32, borderRadius:8, objectFit:"cover", flexShrink:0 }}
                  onError={e => { e.currentTarget.style.display="none"; }} />
                <span style={{ fontSize:14, fontWeight:500, color:T.text1 }}>{w.name}</span>
              </button>
            ))}

            <div style={{ textAlign:"center", fontSize:11, color:T.text3, marginTop:8 }}>
              By connecting you agree to our Terms of Service
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root export ─────────────────────────────────────────────────────────────
export default function JupChat() {
  const appId = import.meta.env.VITE_PRIVY_APP_ID || "";
  if (!appId) {
    console.error(
      "[ChatFi] VITE_PRIVY_APP_ID is not set. " +
      "Privy will initialise but login() will silently fail. " +
      "Add it to your .env file and restart the dev server."
    );
  }
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "twitter", "discord"],

        appearance: {
          theme: "dark",
          accentColor: "#c8f255",
          logo: "https://chatfi.pro/logo.png",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          // Disable ETH, create Solana wallet for ALL users on login
          // (all-users covers both new signups AND existing accounts migrated from ETH config)
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "all-users" },
          noPromptOnSignature: false,
          requireUserPasswordOnCreate: false,
        },
        // Solana mainnet RPC
        solanaClusters: [
          { name: "mainnet-beta", rpcUrl: import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com" },
        ],
      }}
    >
      <JupChatInner />
    </PrivyProvider>
  );
}
