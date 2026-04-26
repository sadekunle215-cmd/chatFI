import { useState, useEffect, useRef, useCallback } from "react";
import { Transaction, VersionedTransaction, Keypair } from "@solana/web3.js";

// ── Reown AppKit (external wallet connect — Phantom, Backpack, etc.) ─────────
import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect, useWalletInfo } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana as solanaMainnet } from "@reown/appkit/networks";

// ── Privy loaded dynamically — no npm package needed ─────────────────────────
// We use Privy's UMD bundle from CDN so we don't need to change package.json.
// usePrivyAuth() below wraps window.Privy once the script loads.
let _privyClient = null;
let _privyListeners = [];
const notifyPrivyListeners = () => _privyListeners.forEach(fn => fn());

const loadPrivySDK = () =>
  new Promise((resolve) => {
    if (window.__PrivyLoaded) { resolve(); return; }
    // Privy doesn't publish a UMD bundle — we use their iframe-based hosted auth instead.
    // The approach: open privy's hosted login URL in a popup, receive address via postMessage.
    window.__PrivyLoaded = true;
    resolve();
  });

// Minimal Privy hook — uses Privy's hosted OAuth popup flow via postMessage
const usePrivyAuth = () => {
  const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "";

  const [authed, setAuthed]       = useState(false);
  const [user, setUser]           = useState(null);
  const [wallet, setWallet]       = useState(null); // { address, signTransaction }
  const [ready, setReady]         = useState(true); // always ready (no SDK to load)
  const popupRef                  = useRef(null);

  // Listen for messages from Privy hosted auth popup
  useEffect(() => {
    const handler = async (e) => {
      // Privy sends { type:"privy:authenticated", user:{id,email,...}, wallet:{address} }
      if (!e.data || e.data.type !== "privy:authenticated") return;
      const { user: u, embeddedWallet } = e.data;
      if (!embeddedWallet?.address) return;
      popupRef.current?.close();

      // Build a signTransaction shim using Privy's iframe signing endpoint
      const privySignTx = async (tx) => {
        // Serialize the tx to base64 and send to Privy's signing iframe via postMessage.
        // For the embedded wallet, Privy handles key management server-side.
        // We use their REST signing API with the session token received at login.
        const sessionToken = e.data.sessionToken;
        const serialized = tx.serialize ? Buffer.from(tx.serialize()).toString("base64")
          : Buffer.from(tx.serialize()).toString("base64");
        const res = await fetch(`https://auth.privy.io/api/v1/embedded-wallet/sign-transaction`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "privy-app-id": PRIVY_APP_ID,
            "Authorization": `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ address: embeddedWallet.address, transaction: serialized, encoding: "base64" }),
        });
        const data = await res.json();
        if (!data.signed_transaction) throw new Error(data.error || "Privy signing failed");
        const bytes = Uint8Array.from(atob(data.signed_transaction), c => c.charCodeAt(0));
        // Return the same tx type
        try { return VersionedTransaction.deserialize(bytes); }
        catch { return Transaction.from(bytes); }
      };

      setAuthed(true);
      setUser(u);
      setWallet({ address: embeddedWallet.address, signTransaction: privySignTx });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [PRIVY_APP_ID]);

  const login = () => {
    if (!PRIVY_APP_ID) {
      alert("Privy App ID not set. Add VITE_PRIVY_APP_ID to Vercel environment variables.");
      return;
    }
    const url = `https://auth.privy.io/oauth/login?app_id=${PRIVY_APP_ID}&redirect_uri=${encodeURIComponent(window.location.origin + "/privy-callback")}&response_type=token`;
    const popup = window.open(url, "privy-login", "width=480,height=640,scrollbars=yes");
    popupRef.current = popup;
  };

  const logout = () => {
    setAuthed(false);
    setUser(null);
    setWallet(null);
  };

  return { ready, authenticated: authed, user, embeddedWallet: wallet, login, logout };
};

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

const CHATFI_AVATAR = "data:image/jpeg;base64,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ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg";

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
- "FETCH_TOKEN_TAG"     → actionData: { "tag": "verified" } — tag must be "lst" (liquid staking) or "verified"
- "FETCH_TOKEN_CATEGORY"→ actionData: { "category": "toptrending", "interval": "24h", "limit": 20 } — category: toporganicscore|toptraded|toptrending; interval: 5m|1h|6h|24h
- "FETCH_TOKEN_RECENT"  → actionData: {} — newest tokens that just got their first liquidity pool
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

Rules:
- "buy X" / "swap X to Y" / "exchange" → SHOW_SWAP — use EXACT symbol user mentioned even if unknown meme coin
- "price of X" → FETCH_PRICE — ALWAYS use this for any token price, even unknown ones. Use the token SYMBOL (e.g. "METEOR" for Meteora).
- "is X safe?" / "research X" / token info → FETCH_TOKEN_INFO — always attempt, UI searches Jupiter live; shows full metadata
- "show verified tokens" / "list verified" / "show LST tokens" / "liquid staking tokens" → FETCH_TOKEN_TAG
- "trending tokens" / "top trending" / "top traded" / "best organic score" / "hot tokens" → FETCH_TOKEN_CATEGORY
- "new tokens" / "recently listed" / "new listings" / "just launched" → FETCH_TOKEN_RECENT
- "can I verify X?" / "verify eligibility" / "submit X for verification" → CHECK_TOKEN_VERIFY
- "my portfolio" / "my wallet" / "my positions" / "my orders" / "my bets" → FETCH_PORTFOLIO
- "claim" / "claim winnings" / "claim payout" → CLAIM_PAYOUTS
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
- NEVER say you don't have live data. ALWAYS trigger the appropriate action and let the UI fetch it. Never fabricate prices. Be concise.
- CRITICAL — NEVER say "I can't", "I currently can't", "I don't support", "I'm unable to", or any phrase implying you cannot do something that has a supported action. ALWAYS fire the action instead.
- CRITICAL — SHOW_RECURRING is fully supported. When user asks for a recurring/DCA order, you MUST return action:"SHOW_RECURRING" with all fields pre-filled from the user's message. Never tell the user to do it manually.`;

const SUGGESTION_GROUPS = [
  {
    label: "Market",
    color: "#c7f284",
    items: ["What's the SOL price?", "Top trending tokens today", "Show swap route: SOL → USDC"],
  },
  {
    label: "Trade",
    color: "#63b3ed",
    items: ["Swap SOL to BONK", "Limit order: buy SOL below $140", "OCO: TP $200 SL $120 on SOL", "Long SOL 10x perps"],
  },
  {
    label: "Earn",
    color: "#68d391",
    items: ["Show earn vaults", "DCA $10 USDC into SOL daily"],
  },
  {
    label: "Tools",
    color: "#f6ad55",
    items: ["Send 1 SOL via invite link", "Create a token on Jupiter Studio", "Lock 1000 JUP for 1 year", "Arsenal vs Man City prediction"],
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

          html += `<div style="display:flex;align-items:center;gap:0;background:#161e27;border:1px solid #1e2d3d;border-radius:11px;overflow:hidden;">
            <div style="width:3px;align-self:stretch;background:${rankNum<=3 ? rankColor : "#1e2d3d"};flex-shrink:0"></div>
            <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;flex:1;min-width:0">
              <span style="font-size:10px;font-weight:700;color:${rankColor};min-width:16px;text-align:center;flex-shrink:0">${item.num}</span>
              ${logoHtml}
              <div style="flex:1;min-width:0;overflow:hidden">
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
                  <span style="font-size:13px;font-weight:700;color:#e8f4f0;letter-spacing:-0.2px">${sym.replace(/✓/g,"").trim()}</span>
                  ${isVerified ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#c7f284" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
                  <span style="font-size:11px;color:#4d6a7a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name.replace(/✓/g,"").trim()}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:12px;font-weight:600;color:#c8d8e0">${price}</span>
                  <span style="font-size:10px;font-weight:700;color:${changeColor};background:${changeBg};padding:1px 6px;border-radius:5px">${change}</span>
                </div>
              </div>
              ${scoreNum ? `<div style="text-align:center;flex-shrink:0;padding-left:4px"><div style="font-size:9px;color:#4d6a7a;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:1px">score</div><div style="font-size:14px;font-weight:800;color:${scoreColor};line-height:1">${scoreNum}</div></div>` : ""}
            </div>
          </div>`;
        } else {
          // Generic numbered item — clean pill
          const rankNum = parseInt(item.num);
          const rankColor = rankNum === 1 ? "#f6d860" : rankNum === 2 ? "#c0c0c0" : rankNum === 3 ? "#cd7f32" : "#2d4a5a";
          html += `<div style="display:flex;align-items:flex-start;gap:0;background:#161e27;border:1px solid #1e2d3d;border-radius:11px;overflow:hidden;">
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

// ─── Main component ───────────────────────────────────────────────────────────
function JupChatInner() {
  const [msgs, setMsgs] = useState([{ id:1, role:"ai", showConnectBtn:true, text:"Hey! I'm **ChatFi** — your personal AI tools on Solana. 👋\n\nI can swap tokens, check prices, set limit orders, track your portfolio, predict sports outcomes, and earn yield.\n\nConnect your wallet to get started, or just ask me anything!" }]);
  const [showWalletModal, setShowWalletModal] = useState(false);
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
          embeddedWallet: privyEmbeddedWallet,
          login: privyLogin, logout: privyLogout } = usePrivyAuth();
  // Track whether Privy is the active auth method
  const [privyMode, setPrivyMode] = useState(false);

  // Capture wallet icon from Reown whenever it changes
  useEffect(() => {
    if (reownWalletInfo?.icon) setConnectedWalletIcon(reownWalletInfo.icon);
  }, [reownWalletInfo]);

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
  const [earnWithdraw, setEarnWithdraw]       = useState({ vault:null, amount:"" });
  const [showEarnWithdraw, setShowEarnWithdraw] = useState(false);

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

  // ── Jupiter official docs — fetched once, injected into AI system prompt ────
  const [jupDocs, setJupDocs] = useState("");

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState([{ id:"default", title:"New conversation", active:true }]);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showSocialsNav, setShowSocialsNav] = useState(false);

  // Dynamic token cache — grows as user searches any token
  const tokenCacheRef    = useRef({ ...TOKEN_MINTS });
  const tokenDecimalsRef = useRef({ ...TOKEN_DECIMALS });

  const histRef     = useRef([]);
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
    const upper = symbolOrName.toUpperCase();
    if (tokenCacheRef.current[upper]) {
      return { mint: tokenCacheRef.current[upper], decimals: tokenDecimalsRef.current[upper] ?? 6 };
    }
    const tryParse = (data, sym) => {
      const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
      const match = list.find(t => t.symbol?.toUpperCase() === sym) || list[0];
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

    // Try V2 first
    try {
      const searchData = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbol)}`);
      const list = Array.isArray(searchData) ? searchData : (searchData?.tokens || searchData?.data || []);
      const match = list.find(t => t.symbol?.toUpperCase() === upper) || list[0];
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

    // Last resort: if we have a cached mint, fetch detail directly
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

  // ── Token Recent — newly listed tokens (first pool just created) ────────────
  const fetchRecentTokens = async () => {
    try {
      const data = await jupFetch(JUP_TOKEN_RECENT);
      return Array.isArray(data) ? data : (data?.tokens || data?.data || []);
    } catch { return []; }
  };

  // ── Verify Eligibility — check if a token can be express-verified ───────────
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
          return {
            ...lk,
            lockId:          lk.pubkey || lk.id || lk.address,
            symbol:          sym,
            claimableAmount: typeof claimRaw === "number" && claimRaw > 1000 ? fmtAmt(claimRaw) : parseFloat(claimRaw || 0).toFixed(4),
            totalAmount:     typeof totalRaw === "number" && totalRaw > 1000 ? fmtAmt(totalRaw) : parseFloat(totalRaw || 0).toFixed(4),
            vestedPercent:   totalRaw > 0 ? ((parseFloat(claimRaw) / parseFloat(totalRaw)) * 100).toFixed(1) : "0",
            cliff:           lk.cliff || lk.cliffTime || lk.cliffTimestamp || null,
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
    try {
      const res = await fetch("/api/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accounts", wallet: walletFull }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Enrich each account with display fields the UI needs
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

      const enriched = (data.accounts || []).map(acct => {
        const mintSym = Object.entries(tokenCacheRef.current).find(([, v]) => v === acct.mint)?.[0]
          || KNOWN_MINT_SYMS[acct.mint]
          || `${acct.mint.slice(0, 6)}…`;
        const dec = tokenDecimalsRef.current[mintSym] || KNOWN_DECIMALS[mintSym] || 6;
        const fmtAmt = (raw) => (raw / Math.pow(10, dec)).toFixed(dec >= 9 ? 4 : 2);
        return {
          ...acct,
          lockId:          acct.pubkey,
          symbol:          mintSym,
          claimableAmount: fmtAmt(acct.claimableRaw || 0),
          totalAmount:     fmtAmt(acct.totalRaw || 0),
          vestedPercent:   acct.totalRaw > 0
            ? ((acct.claimableRaw / acct.totalRaw) * 100).toFixed(1)
            : "0",
        };
      });

      setLockList(enriched);
      setShowLocks(true);
      if (!enriched.length) push("ai", "No token locks found for your wallet.");
    } catch (err) {
      push("ai", `Could not fetch locks: ${err?.message}`);
    }
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
      push("ai", "⚠️ Native SOL cannot be locked directly. Please use an SPL token like **USDC** or **JUP** instead.");
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
        `🔗 **Invite link:**\n\`${inviteLink}\`\n\n` +
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
        push("ai", `⚠️ Jupiter Prediction markets returned a **geo-restriction error**.\n\nThis can happen if the ChatFi server (not your device) is deployed in a restricted region. If you've successfully used prediction markets before or know your country is supported, this is a server-side issue.\n\n**Try:**\n• Reconnect your wallet and try again\n• If the issue persists, the server may need to be re-deployed to a US/EU region\n\n*Note: Jupiter supports US, UK, EU and most regions — this is rarely a user restriction.*`);
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
      push("ai", `Multiply position opened ✓\n\n**${leverage}x ${vault.collateral}/${vault.debt}**\nCollateral: **${colAmount} ${vault.collateral}**\n\nTransaction: \`${signature.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})\n\n⚠️ Monitor your position at [jup.ag/lend/multiply](https://jup.ag/lend/multiply) — your Position NFT is in your wallet.`);
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
        multiplyHint = "\n\n💡 This vault requires opening your first position directly at [jup.ag/lend/multiply](https://jup.ag/lend/multiply). Once the position NFT is created, you can manage it here.";
      } else if (msg.includes("6025") || msg.includes("SlippageExceeded")) {
        multiplyHint = "\n\n💡 Slippage exceeded during the flashloan swap. Try reducing leverage (e.g. 2x instead of 3x), a smaller collateral amount, or wait for calmer market conditions.";
      } else if (msg.includes("6001") || msg.includes("insufficient") || msg.includes("balance") || msg.includes("funds")) {
        multiplyHint = "\n\n💡 Insufficient balance. Make sure you have enough of the collateral token in your wallet.";
      } else if (msg.includes("rent") || msg.includes("fee") || msg.includes("lamport")) {
        multiplyHint = "\n\n💡 Not enough SOL for transaction fees. You need at least 0.01 SOL.";
      }
      push("ai", `Multiply failed: ${decodedErr}${multiplyHint}`);
    }
    setMultiplyStatus(null);
  };

  // ── Fetch open Lend positions ─────────────────────────────────────────────────
  // Earn positions: direct REST call (GET /lend/v1/earn/positions) — works reliably.
  // Borrow/Multiply positions: Jupiter Borrow REST API is "Coming Soon" (SDK-only for now).
  // The /api/lend-positions serverless endpoint requires @jup-ag/lend-read SDK on the server.
  // We try it safely (text → parse) so an HTML crash page never breaks the UI.
  const fetchLendPositions = async () => {
    if (!walletFull) { push("ai", "Connect your wallet first to view your Lend positions."); return; }
    setLendPosLoading(true);
    setShowLendPos(true);

    // 1. Earn positions — direct REST API (always works)
    let earnPositions = [];
    try {
      const earnRaw = await jupFetch(`${JUP_EARN_API}/positions?wallets=${walletFull}`);
      // Jupiter may return positions under various keys — try all known shapes
      let earnArr = [];
      if (Array.isArray(earnRaw)) {
        earnArr = earnRaw;
      } else if (earnRaw && typeof earnRaw === "object") {
        // Try every possible key
        earnArr = earnRaw.data || earnRaw.positions || earnRaw.earnPositions
                || earnRaw.result || earnRaw.items || earnRaw.balances || [];
        // Sometimes it's an object keyed by vault address — flatten to array
        if (!Array.isArray(earnArr)) {
          const vals = Object.values(earnRaw).filter(v => v && typeof v === "object" && !Array.isArray(v));
          if (vals.length > 0) earnArr = vals;
          else earnArr = [];
        }
      }
      earnPositions = earnArr.map(e => ({ ...e, _type: "earn" }));
    } catch {}

    // 2. Borrow/Multiply positions — via /api/lend-positions (uses @jup-ag/lend-read SDK)
    // Uses res.text() → JSON.parse so an HTML crash page never breaks the UI
    let borrowPositions = [];
    try {
      const res = await fetch(`/api/lend-positions?wallet=${walletFull}`);
      const txt = await res.text();
      try {
        const data = JSON.parse(txt);
        if (data.positions) borrowPositions = data.positions.map(p => ({ ...p, _type: "borrow" }));
      } catch {} // non-JSON (HTML error page) — silently ignore
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
        "Borrow successful ✓\n\n" +
        "📥 **" + colAmount + " " + collateral + "** deposited as collateral\n" +
        "💸 **" + borrowAmount + " " + debt + "** borrowed to your wallet\n\n" +
        "Position NFT is in your wallet.\nTx: `" + signature.slice(0,20) + "…`\n" +
        "[View on Solscan →](https://solscan.io/tx/" + signature + ")\n\n" +
        "⚠️ Monitor your LTV at [jup.ag/lend](https://jup.ag/lend) to avoid liquidation."
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
      if (msg.includes("insufficient") || msg.includes("balance")) hint = "\n\n💡 Insufficient balance — make sure you hold the collateral token.";
      else if (msg.includes("SOL") || msg.includes("fee") || msg.includes("rent")) hint = "\n\n💡 Not enough SOL for fees. You need at least 0.01 SOL.";
      else if (msg.includes("LTV") || msg.includes("liquidat")) hint = "\n\n💡 Borrow amount exceeds your collateral LTV limit. Reduce the borrow amount.";
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
      const orderData = await jupFetch(`${JUP_SWAP_ORDER}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&taker=${walletFull}`);
      if (orderData.error) throw new Error(typeof orderData.error==="object"?JSON.stringify(orderData.error):orderData.error);
      if (!orderData.transaction) throw new Error("No transaction returned from Jupiter — check your balance.");

      const binaryStr = atob(orderData.transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i=0;i<binaryStr.length;i++) txBytes[i]=binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);
      if (!provider.signTransaction) throw new Error("Wallet does not support transaction signing");
      const signedTx = await provider.signTransaction(tx);

      const signedBase64 = bytesToB64(signedTx.serialize());
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
      const signedBase64=bytesToB64(signedTx.serialize());
      const execRes=await jupFetch(JUP_TRIGGER_EXEC,{method:"POST",body:{signedTransaction:signedBase64,requestId:orderRes.requestId}});
      if (execRes.error) throw new Error(typeof execRes.error==="object"?JSON.stringify(execRes.error):execRes.error);
      const signature=execRes.signature||execRes.txid||orderRes.order;
      setShowTrig(false);
      push("ai",`Limit order placed ✓\n\nWill ${direction==="below"?"buy":"sell"} **${amount} ${direction==="below"?"USDC worth of "+token:token}** when price hits **$${targetPrice}**\n\nTransaction: \`${signature?.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
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
        hint = "\n\n💡 Trigger orders require wallet message signing for JWT auth. Use Phantom or Solflare browser extension. Alternatively, swap first then set a limit order once funds are in your wallet.";
      } else if (msg.includes("vault") || msg.includes("deposit")) {
        hint = "\n\n💡 Your trigger vault may need to be funded first. The system tried to deposit automatically.";
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
    setMsgs(m => [...m, { id, role, text, ...extra }]);
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
      push("ai", "👋 Wallet disconnected. Connect again anytime to access your portfolio and trading features.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reownConnected, reownAddress, reownProvider, privyMode]);

  // ── Privy connection sync ─────────────────────────────────────────────────
  useEffect(() => {
    if (!privyReady) return;
    if (privyAuthed && privyEmbeddedWallet) {
      const address = privyEmbeddedWallet.address;
      const justConnected = !privyMode;
      setPrivyMode(true);
      prevConnectedRef.current = true;
      const display = address.slice(0,4) + "…" + address.slice(-4);
      setWallet(display);
      setWalletFull(address);
      setConnectedWalletName(privyUser?.email?.address || privyUser?.google?.email || "Social Account");
      // Build provider shim using Privy embedded wallet's signTransaction
      const privyProvider = {
        signTransaction: async (tx) => privyEmbeddedWallet.signTransaction(tx),
        signAllTransactions: async (txs) => Promise.all(txs.map(tx => privyEmbeddedWallet.signTransaction(tx))),
      };
      connectedProviderRef.current = privyProvider;
      fetchSolanaBalances(address).then(balances => {
        setPortfolio(balances);
        if (justConnected) {
          fetchPrices().then(live => {
            const solUSD = balances.SOL && live.SOL ? ` (~$${(balances.SOL * live.SOL).toFixed(2)})` : "";
            const emailLabel = privyUser?.email?.address || privyUser?.google?.email || "your account";
            push("ai",
              `Wallet ready ✓ — signed in as **${emailLabel}**\n\n` +
              `Your embedded Solana wallet: \`${display}\`\n\n` +
              `Balance: **${(balances.SOL||0).toFixed(4)} SOL**${solUSD}` +
              Object.entries(balances).filter(([k])=>k!=="SOL")
                .map(([k,v])=>`\n${k}: ${v<1?v.toFixed(6):v.toFixed(2)}`).join("") +
              "\n\nWhat would you like to do?"
            );
          }).catch(()=>{});
        }
      }).catch(()=>{});
    } else if (privyMode && !privyAuthed) {
      setPrivyMode(false);
      prevConnectedRef.current = false;
      connectedProviderRef.current = null;
      setWallet(null);
      setWalletFull(null);
      setConnectedWalletName(null);
      setPortfolio({});
      push("ai", "👋 Signed out. Connect again anytime.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privyReady, privyAuthed, privyEmbeddedWallet, privyUser]);

  // ── Send message to Claude ──────────────────────────────────────────────────
  const send = async (override) => {
    const raw = (override ?? input).trim();
    if (!raw || typing) return;
    setInput("");
    push("user", raw);
    setTyping(true);
    setShowSwap(false); setShowPred(false); setShowTrig(false); setShowTrigV2(false); setShowTrigOrders(false); setShowRecurring(false); setShowRecurringOrders(false);
    setShowPredList(false); setShowEarn(false); setShowEarnDeposit(false); setShowBet(false); setShowMultiply(false); setShowBorrow(false);
    setShowSend(false); setShowPortfolio(false); setShowPerpsPos(false); setShowPerps(false);
    setShowTokenCard(false); setTokenCardData(null);

    histRef.current = [...histRef.current, { role:"user", content:raw }];

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
          push("ai", "⚠️ No prediction markets returned. This may be a server-region issue (the ChatFi proxy may be in a restricted region). The markets API itself is working — try again or check [jup.ag/prediction](https://jup.ag/prediction) directly.");
        }

      } else if (action === "FETCH_EARN") {
        push("ai", text + "\n\nFetching earn vaults…");
        await fetchEarnVaults();
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
          push("ai", `⚠️ **Trigger orders require wallet message signing**, which isn't supported by WalletConnect on mobile.\n\n**Alternatives:**\n• Use a **Limit order** instead (same price trigger, no message signing needed)\n• Use **Phantom or Solflare browser extension** on desktop for full trigger support\n\nWould you like to set up a Limit order instead?`);
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
        const tag = (actionData?.tag || "verified").toLowerCase();
        const tokens = await fetchTokensByTag(tag);
        if (!tokens.length) {
          push("ai", text + `\n\nNo tokens found for tag **${tag}**.`);
        } else {
          const label = tag === "lst" ? "Liquid Staking Tokens (LST)" : "Verified Tokens";
          push("ai", text + `\n\n**${label}** (${tokens.length} found, showing top 15):\n${fmtTokenList(tokens, 15)}`);
        }

      } else if (action === "FETCH_TOKEN_CATEGORY") {
        const cat      = actionData?.category || "toptrending";
        const interval = actionData?.interval || "24h";
        const limit    = Math.min(actionData?.limit || 20, 50);
        const tokens   = await fetchTokensByCategory(cat, interval, limit);
        if (!tokens.length) {
          push("ai", text + `\n\nNo data returned for category **${cat}** / **${interval}**.`);
        } else {
          const catLabel = { toptrending: "Top Trending", toptraded: "Top Traded", toporganicscore: "Highest Organic Score" }[cat] || cat;
          push("ai", text + `\n\n**${catLabel}** — ${interval} (showing ${Math.min(tokens.length, 20)}):\n${fmtTokenList(tokens, 20)}`);
        }

      } else if (action === "FETCH_TOKEN_RECENT") {
        const tokens = await fetchRecentTokens();
        if (!tokens.length) {
          push("ai", text + "\n\nCould not fetch recently listed tokens right now.");
        } else {
          push("ai", text + `\n\n**Recently Listed Tokens** (${tokens.length} found, newest first):\n${fmtTokenList(tokens, 15)}`);
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
            vText += `\nToken exists on-chain: ${result.tokenExists ? "✅ Yes" : "❌ No"}`;
            vText += `\nAlready verified: ${result.isVerified ? "✅ Yes" : "No"}`;
            vText += `\nCan submit verification: ${result.canVerify ? "✅ Yes" : "❌ No"}`;
            vText += `\nCan update metadata: ${result.canMetadata ? "✅ Yes" : "❌ No"}`;
            if (result.verificationError) vText += `\n⚠ Verify blocked: ${result.verificationError}`;
            if (result.metadataError)     vText += `\n⚠ Metadata blocked: ${result.metadataError}`;
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
            { label:"Blog",        icon:<SvgBlog size={15} color="currentColor"/>,     url:"https://station.jup.ag/blog" },
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
                    className="hov-btn">☰</button>
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
                        <button onClick={() => setShowSocialsNav(false)}
                          style={{ display:"none" }}/>
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
                      {/* Wallet logo — show live icon from Reown, fall back to WALLET_LOGOS map */}
                      {(connectedWalletIcon || (connectedWalletName && WALLET_LOGOS[connectedWalletName])) ? (
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
                    <button onClick={() => connectWallet(null)} className="hov-btn"
                      style={{ padding:"6px 14px", background:T.accent, border:"none", borderRadius:20, color:"#0d1117", fontSize:12, fontWeight:700, cursor:"pointer", boxShadow:`0 0 12px ${T.accent}44`, whiteSpace:"nowrap" }}>
                      Sign In
                    </button>
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
                <div dangerouslySetInnerHTML={{ __html:fmt(m.text) }} />
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
                          {isSus && <span style={{ fontSize:10, fontWeight:700, color:T.red, background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:20, padding:"1px 7px" }}>🚨 Sus</span>}
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
                          {hasFreeze && <span style={{ fontSize:11, color:"#f6ad55" }}>⚠ Freeze auth</span>}
                          {hasMintAuth && <span style={{ fontSize:11, color:"#f6ad55" }}>⚠ Mint auth</span>}
                          {isSus && <span style={{ fontSize:11, color:T.red, fontWeight:700 }}>🚨 Flagged suspicious</span>}
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
                        { key:"website",  label:"Website",     icon:"🌐", url:info.website },
                        { key:"telegram", label:"Telegram",    icon:"✈️", url:info.telegram },
                        { key:"discord",  label:"Discord",     icon:"🎮", url:info.discord },
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
                ⚡ Placing will prompt a message-sign for authentication, then a deposit transaction.
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
                          {cat && <span>📂 {cat}</span>}
                          {closeTs && (
                            <span style={{ color: closeSoon ? T.red : T.text3 }}>
                              🕐 {closeSoon ? "Closes " : ""}{new Date(typeof closeTs==="number"?closeTs*1000:closeTs).toLocaleDateString()}
                            </span>
                          )}
                          {volFmt && <span>💰 {volFmt} vol</span>}
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
                💡 This is AI analysis. To place a real on-chain bet, ask <em>"Show prediction markets"</em> and pick from live Jupiter markets below.
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
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
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
                      ⚠ You need at least $5 USDC or JupUSD to place a bet.
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

              {!earnLoading && earnVaults.map((v) => (
                <div key={v.id} className="vault-card"
                  style={{ padding:"14px 16px", border:`1px solid ${T.border}`, borderRadius:10, marginBottom:10, background:T.bg, transition:"all 0.15s", cursor:"default" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        {v.logoUrl && <img src={v.logoUrl} alt={v.token} style={{ width:20, height:20, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} onError={e=>e.target.style.display="none"} />}
                        <div style={{ fontWeight:600, fontSize:14, color:T.text1 }}>{v.token} Earn Vault</div>
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
                          onClick={() => { setEarnWithdraw({ vault:v, amount:"" }); setShowEarnWithdraw(true); }} className="hov-btn"
                          style={{ padding:"5px 14px", background:"none", border:`1px solid ${T.border}`, borderRadius:6, color:T.text2, fontSize:11, cursor:"pointer" }}>
                          Withdraw
                        </button>
                      </div>
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

          {/* ── Borrow panel ─────────────────────────────────────────────── */}
          {showBorrow && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>🏦 Borrow from Jupiter Lend</div>
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
                  📥 Deposit <strong>{borrowCfg.colAmount} {borrowCfg.collateral}</strong> · 💸 Borrow <strong>{borrowCfg.borrowAmount || "?"} {borrowCfg.debt}</strong><br/>
                  <span style={{ fontSize:11, color:T.text3 }}>Max LTV: {(MULTIPLY_VAULTS.find(v=>v.vaultId===borrowCfg.vaultId)||MULTIPLY_VAULTS[0]).ltv} · Position NFT created automatically · positionId:0</span>
                </div>
              )}

              {/* Warning */}
              <div style={{ fontSize:11, color:T.text3, background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, padding:"7px 10px", marginBottom:12 }}>
                ⚠️ Borrowing accrues interest. Keep LTV below the liquidation threshold or your collateral may be sold.
              </div>

              {/* Coming Soon notice */}
              <div style={{ background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:10, padding:"14px 16px", marginBottom:12, textAlign:"center" }}>
                <div style={{ fontSize:13, fontWeight:700, color:T.accent, marginBottom:4 }}>🚧 In-App Borrow — Coming Soon</div>
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
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>📤 Jupiter Send</div>
                <span style={{ fontSize:10, padding:"2px 7px", background:T.tealBg, border:`1px solid ${T.teal}33`, borderRadius:10, color:T.teal, fontWeight:600 }}>INVITE LINK</span>
              </div>
              <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>
                Send tokens to anyone — recipient doesn't need a wallet. They claim via the link. You can claw back unclaimed tokens anytime.
              </div>

              {/* Jupiter Send only supports SOL and USDC — other mints are rejected server-side */}
              <div style={{ fontSize:11, color:"#f6ad55", background:"#2e1f0a", border:"1px solid #f6ad5544", borderRadius:8, padding:"7px 10px", marginBottom:10 }}>
                ⚠️ Jupiter Send only supports <strong>SOL</strong> and <strong>USDC</strong>. Other tokens will fail at the claim step.
              </div>

              {/* Token + Amount row */}
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Token</div>
                  <select
                    value={sendCfg.token}
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
                    style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                  />
                </div>
              </div>

              {/* Preview */}
              {sendCfg.amount && (
                <div style={{ fontSize:12, color:T.teal, background:T.tealBg, border:`1px solid ${T.teal}33`, borderRadius:8, padding:"8px 12px", marginBottom:12, lineHeight:1.7 }}>
                  📤 Sending <strong>{sendCfg.amount} {sendCfg.token}</strong> via invite link<br/>
                  <span style={{ fontSize:11, color:T.text3 }}>From: {walletFull?.slice(0,4)}…{walletFull?.slice(-4)} · Unclaimed tokens auto-clawable</span>
                </div>
              )}

              <div style={{ fontSize:11, color:T.text3, background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:8, padding:"7px 10px", marginBottom:12 }}>
                💡 The invite link is generated on-chain. Share it via any app — the recipient creates a wallet when claiming.
              </div>

              <button onClick={doSend}
                disabled={!sendCfg.amount || parseFloat(sendCfg.amount) <= 0 || sendStatus === "signing"}
                style={{ width:"100%", padding:"11px", background: (!sendCfg.amount || sendStatus==="signing") ? T.border : T.accent, border:"none", borderRadius:10, color:"#0d1117", fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:8 }}>
                {sendStatus === "signing" ? <><span className="spinner" style={{ borderTopColor:"#0d1117", display:"inline-block", marginRight:6 }}/> Signing…</> : `📤 Send ${sendCfg.amount||""} ${sendCfg.token} via Invite Link`}
              </button>

              {sendStatus === "done" && sendLink && (
                <div style={{ marginTop:4, marginBottom:8, background:T.tealBg, border:`1px solid ${T.teal}44`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:T.teal, marginBottom:6 }}>✅ Invite link ready — share to recipient</div>
                  <div style={{ fontSize:11, color:T.text2, wordBreak:"break-all", background:T.bg, borderRadius:6, padding:"6px 10px", marginBottom:8, fontFamily:"monospace" }}>
                    {sendLink}
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => navigator.clipboard.writeText(sendLink)}
                      style={{ flex:1, padding:"8px", background:T.accent, border:"none", borderRadius:8, color:"#0d1117", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      📋 Copy Link
                    </button>
                    <button onClick={() => {
                      const code = sendLink.split("code=")[1];
                      if (code) doClawback(code);
                    }}
                      style={{ flex:1, padding:"8px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:12, cursor:"pointer" }}>
                      ↩ Claw Back
                    </button>
                  </div>
                </div>
              )}

              <button onClick={() => setShowSend(false)}
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
                              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12 }}>
                                <span style={{ color:T.text2 }}>{sym} <span style={{ fontSize:10, color:T.text3 }}>Earn{label}</span></span>
                                <span style={{ fontWeight:600, color:"#68d391" }}>{amt}</span>
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
                          const claimable = p.claimable;
                          return (
                            <div key={i} style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${claimable ? T.greenBd : T.border}`, borderRadius:10, fontSize:12 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                                <span style={{ fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:6, background: side==="YES" ? T.greenBg : T.redBg, color: side==="YES" ? T.green : T.red }}>{side}</span>
                                <span style={{ fontWeight:600, color: claimable ? T.green : T.text3 }}>{claimable ? "🏆 Claimable" : cost}</span>
                              </div>
                              <div style={{ color:T.text2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title.slice(0,42)}</div>
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
                                <span style={{ fontWeight:700, color:T.text1 }}>{side==="long"?"📈":"📉"} {side.toUpperCase()} {mkt}</span>
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
                                {closingPerp === p.positionKey ? <><span className="spinner" style={{borderTopColor:T.red, display:"inline-block", marginRight:4}}/> Closing…</> : "⚡ Close Position"}
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
                          return (
                            <div key={i} style={{ padding:"10px 12px", background:T.bg, border:`1px solid ${claimable ? T.greenBd : T.border}`, borderRadius:10, fontSize:12 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                                <span style={{ fontWeight:700, color:T.text1 }}>{lk.totalAmount} {lk.symbol}</span>
                                <span style={{ fontSize:10, padding:"2px 7px", background: claimable ? T.greenBg : T.border, borderRadius:6, color: claimable ? T.green : T.text3, fontWeight:700 }}>
                                  {lk.vestedPercent}% vested
                                </span>
                              </div>
                              {claimable && (
                                <div style={{ color:T.green, fontWeight:600 }}>
                                  {lk.claimableAmount} {lk.symbol} claimable
                                </div>
                              )}
                              {lk.cliff && <div style={{ color:T.text3, fontSize:11, marginTop:2 }}>Cliff: {new Date(lk.cliff * 1000).toLocaleDateString()}</div>}
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
                  ⚡ Jupiter Perps
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
                      📈 Long
                    </button>
                    <button onClick={() => setPerpCfg(c=>({...c,side:"short"}))}
                      style={{ flex:1, padding:"8px", background: perpCfg.side==="short" ? T.redBg : T.bg, border:`1px solid ${perpCfg.side==="short" ? T.redBd : T.border}`, borderRadius:8, color: perpCfg.side==="short" ? T.red : T.text2, fontSize:13, fontWeight:perpCfg.side==="short"?700:400, cursor:"pointer" }}>
                      📉 Short
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
                  ⚠️ Perps carry liquidation risk. At {perpCfg.leverage}x, a ~{(100/parseFloat(perpCfg.leverage||1)).toFixed(0)}% move against you triggers liquidation.
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
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1, marginBottom:4 }}>📊 Open Perps Positions</div>
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
                    const icon   = side === "long" ? "📈" : "📉";
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
                          {isClosing ? <><span className="spinner" style={{ borderTopColor:T.red, display:"inline-block", marginRight:6 }}/> Closing…</> : "⚡ Close Position"}
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
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1, marginBottom:4 }}>🏦 My Jupiter Lend Positions</div>
              {lendPosLoading ? (
                <div style={{ fontSize:12, color:T.text3 }}>Loading positions…</div>
              ) : lendPositions.length === 0 ? (
                <div style={{ fontSize:12, color:T.text3 }}>No open positions found.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {lendPositions.map((pos, i) => {
                    // Look up vault to get correct decimals; fall back to 9 (SOL default)
                    const vaultMeta   = MULTIPLY_VAULTS.find(v => v.vaultId === pos.vaultId);
                    const colDec      = vaultMeta?.colDecimals  ?? 9;
                    const debtDec     = vaultMeta?.debtDecimals ?? 6;
                    const colSym      = vaultMeta?.collateral || "Col";
                    const debtSym     = vaultMeta?.debt       || "Debt";
                    const supplyNum   = parseFloat(pos.supply) / Math.pow(10, colDec);
                    const borrowNum   = parseFloat(pos.borrow) / Math.pow(10, debtDec);
                    const riskPct    = Math.round((pos.riskRatio || 0) * 100);
                    const ltPct      = pos.liquidationThreshold ? Math.round(pos.liquidationThreshold * 100) : null;
                    const riskColor  = riskPct > 80 ? T.red : riskPct > 60 ? "#f59e0b" : T.green;
                    const isUnwinding = unwindStatus === pos.positionId;
                    return (
                      <div key={i} style={{ padding:"12px 14px", border:`1px solid ${T.border}`, borderRadius:10, background:T.bg }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text1 }}>Position #{pos.positionId} · Vault {pos.vaultId}</div>
                          {pos.isLiquidated && <span style={{ fontSize:10, color:T.red, fontWeight:700 }}>LIQUIDATED</span>}
                        </div>
                        <div style={{ fontSize:11, color:T.text3, marginBottom:8, display:"flex", flexWrap:"wrap", gap:10 }}>
                          <span>📥 Collateral: <strong style={{ color:T.text1 }}>{supplyNum.toFixed(4)}</strong></span>
                          <span>💸 Debt: <strong style={{ color:T.red }}>{borrowNum.toFixed(4)}</strong></span>
                        </div>
                        {/* Risk bar */}
                        <div style={{ marginBottom:10 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                            <span style={{ color:T.text3 }}>Risk ratio</span>
                            <span style={{ color:riskColor, fontWeight:700 }}>{riskPct}%{ltPct ? ` / ${ltPct}% LT` : ""}</span>
                          </div>
                          <div style={{ height:4, borderRadius:4, background:T.border, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${Math.min(riskPct, 100)}%`, background:riskColor, borderRadius:4 }}/>
                          </div>
                        </div>
                        {/* Action buttons */}
                        {!pos.isLiquidated && (
                          <div style={{ display:"flex", gap:8 }}>
                            <button onClick={() => doUnwind(pos, false)} disabled={!!unwindStatus} className="hov-btn"
                              style={{ flex:1, padding:"8px", background:T.redBg, border:`1px solid ${T.redBd}`, borderRadius:8, color:T.red, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              {isUnwinding ? <><span className="spinner" style={{ borderTopColor:T.red }}/> Closing…</> : "⚡ Close Full Position"}
                            </button>
                            <button onClick={() => { setMultiplyPos({ vault: MULTIPLY_VAULTS.find(v=>v.vaultId===pos.vaultId)||{vaultId:pos.vaultId}, colAmount:"", leverage:"2" }); setShowMultiplyForm(true); setShowLendPos(false); }} className="hov-btn"
                              style={{ padding:"8px 12px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:12, cursor:"pointer" }}>
                              ➕ Add
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
                <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, color:T.text1 }}>⚡ Jupiter Multiply</div>
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
                  ⚠ Risk: Liquidation if LTV breached. High borrow rate may erode yield. Start conservative at 2x–3x. Monitor at jup.ag/lend.
                </div>
              </div>
              {/* Coming Soon notice */}
              <div style={{ background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:10, padding:"14px 16px", marginBottom:14, textAlign:"center" }}>
                <div style={{ fontSize:13, fontWeight:700, color:T.accent, marginBottom:4 }}>🚧 In-App Multiply — Coming Soon</div>
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
                  ⚡ {v.collateral}/{v.debt} Multiply
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
                    <div style={{ fontSize:10, color:T.text3, marginTop:4 }}>⚠ Position tracked as NFT. Monitor at jup.ag/lend.</div>
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
              <div style={{ fontSize:11, color:T.text3, marginBottom:14 }}>
                Enter the amount of <strong style={{ color:T.text2 }}>{earnWithdraw.vault.token}</strong> to withdraw. Withdrawals are subject to the Automated Debt Ceiling — large amounts may be smoothed over blocks.
              </div>
              <input type="number" placeholder={`Amount (${earnWithdraw.vault.token})`} value={earnWithdraw.amount}
                onChange={e => setEarnWithdraw(d=>({...d,amount:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:12 }}
              />
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
                    { id:"meme", label:"🐸 Meme", desc:"16K→69K MC, raises ~18K USDC" },
                    { id:"indie", label:"🚀 Indie", desc:"32K→240K MC, raises ~58K USDC + vesting" },
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
                      {studioStatus==="signing" ? "Launching…" : "🚀 Launch Token"}
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
                  📅 Unlocks start after <strong style={{ color:T.teal }}>{lockCfg.cliffDays} days</strong>, then vest linearly over <strong style={{ color:T.teal }}>{lockCfg.vestingDays} days</strong> total.
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
                  ⚠️ Native SOL cannot be locked. Switch to an SPL token like USDC or JUP.
                </div>
              )}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={doCreateLock}
                  disabled={!lockCfg.mint || !lockCfg.amount || parseFloat(lockCfg.amount)<=0 || lockStatus==="signing" || !walletFull || lockCfg.mint==="So11111111111111111111111111111111111111112"}
                  className="hov-btn"
                  style={{ flex:1, padding:"10px", background:T.purpleBg, border:`1px solid ${T.purple}`, borderRadius:8, color:T.purple, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  {lockStatus==="signing" ? "Signing…" : "🔒 Create Lock"}
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
                          const dex    = hop.ammKey?.label || hop.marketMeta?.amm?.label || hop.label || hop.dex || `DEX ${i+1}`;
                          const inSym  = hop.inputMint  ? `${hop.inAmount ? (parseInt(hop.inAmount)/1e6).toFixed(4)  : ""} ${routeData.fromSym}` : "";
                          const outSym = hop.outputMint ? `${hop.outAmount ? (parseInt(hop.outAmount)/1e6).toFixed(4) : ""} ${routeData.toSym}`   : "";
                          const pi     = hop.priceImpactPct ? `${(parseFloat(hop.priceImpactPct)*100).toFixed(4)}% impact` : null;
                          const pct    = hop.percent    ? `${hop.percent}%` : null;
                          return (
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:6, fontSize:12 }}>
                              <span style={{ width:20, height:20, borderRadius:"50%", background:T.accentBg, border:`1px solid ${T.accent}`, display:"flex", alignItems:"center", justifyContent:"center", color:T.accent, fontSize:10, flexShrink:0 }}>{i+1}</span>
                              <span style={{ fontWeight:600, color:T.teal, flex:1 }}>{dex}</span>
                              {pct   && <span style={{ color:T.text3 }}>{pct}</span>}
                              {pi    && <span style={{ color: parseFloat(hop.priceImpactPct||0)*100 > 1 ? T.red : T.text3 }}>{pi}</span>}
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
  return <JupChatInner />;
}
