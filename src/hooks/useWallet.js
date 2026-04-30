import { useState, useRef, useEffect } from "react";
import { usePrivy, useWallets, useSolanaWallets } from "@privy-io/react-auth";
import { useAppKitAccount, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import { Connection } from "@solana/web3.js";
import { jupFetch } from "../utils/solana";
import { TOKEN_MINTS } from "../constants";

// ── Wallet logos (inline SVGs for wallets that block hotlinks) ─────────────────
export const WALLET_LOGOS = {
  "Phantom": "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#ab9ff2"/><path d="M110 55c0-25.4-20.6-46-46-46S18 29.6 18 55c0 14.3 6.5 27 16.8 35.4L29 110h12l5-8a45.7 45.7 0 0 0 18 4 45.7 45.7 0 0 0 18-4l5 8h12l-5.8-19.6C108.9 82.1 110 68.8 110 55zm-60 8a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm28 0a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" fill="white"/></svg>`),
  "Solflare":     "https://solflare.com/favicon.ico",
  "Backpack":     "https://backpack.app/favicon.ico",
  "Jupiter":      "https://jup.ag/favicon.ico",
  "Trust Wallet": "https://trustwallet.com/favicon.ico",
  "OKX": "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#000"/><rect x="22" y="48" width="24" height="24" rx="4" fill="white"/><rect x="52" y="48" width="24" height="24" rx="4" fill="white"/><rect x="82" y="48" width="24" height="24" rx="4" fill="white"/><rect x="37" y="62" width="24" height="24" rx="4" fill="white"/><rect x="67" y="62" width="24" height="24" rx="4" fill="white"/><rect x="37" y="34" width="24" height="24" rx="4" fill="white"/><rect x="67" y="34" width="24" height="24" rx="4" fill="white"/></svg>`),
  "Coin98":        "https://coin98.com/favicon.ico",
  "Get Jupiter Wallet": "https://jup.ag/favicon.ico",
};

const MOBILE_DEEP_LINKS = {
  "Phantom":      (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  "Solflare":     (url) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  "Backpack":     (url) => `https://backpack.app/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  "Trust Wallet": (url) => `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(url)}`,
  "OKX":          (url) => `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
  "Coin98":       (url) => `https://coin98.com/dapp/${encodeURIComponent(url)}`,
  "Jupiter":      ()    => "https://jup.ag/mobile",
};

export default function useWallet({ push, tokenCacheRef, tokenDecimalsRef }) {
  const [wallet, setWallet]                   = useState(null);
  const [walletFull, setWalletFull]           = useState(null);
  const [portfolio, setPortfolio]             = useState({});
  const [connectedWalletName, setConnectedWalletName] = useState(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletList, setWalletList]           = useState([]);
  const [mobileHint, setMobileHint]           = useState(null);

  // WalletConnect state
  const [wcStatus, setWcStatus]               = useState("idle");
  const [wcUri, setWcUri]                     = useState("");
  const [wcMode, setWcMode]                   = useState("qr");
  const [wcCopied, setWcCopied]               = useState(false);
  const [wcPreferredWallet, setWcPreferredWallet] = useState(null);
  const wcClientRef  = useRef(null);
  const wcSessionRef = useRef(null);

  const connectedProviderRef = useRef(null);
  const pendingSwapRef       = useRef(null);

  // Privy
  const { login: privyLogin, logout: privyLogout, authenticated: privyAuthenticated, user: privyUser } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { wallets: solWallets }   = useSolanaWallets();
  const privyMode = privyAuthenticated && !!privyUser;

  // Reown AppKit
  const { address: reownAddress, isConnected: reownConnected } = useAppKitAccount();
  const { walletProvider: reownProvider } = useAppKitProvider("solana");
  const { disconnect: reownDisconnect }   = useDisconnect();

  // ── Fetch Solana balances ────────────────────────────────────────────────────
  const fetchSolanaBalances = async (address) => {
    try {
      const data = await jupFetch(`https://api.jup.ag/portfolio/v1/portfolio?wallet=${address}`);
      const out = {};
      const tokens = data?.tokens || data?.walletTokens || [];
      for (const t of tokens) {
        const sym = t.symbol || t.mint?.slice(0, 4) || "UNKNOWN";
        out[sym] = parseFloat(t.uiAmount || t.balance || 0);
        if (t.mint) {
          tokenCacheRef.current[sym.toUpperCase()] = t.mint;
          tokenDecimalsRef.current[sym.toUpperCase()] = t.decimals ?? 6;
        }
      }
      const nativeSol = data?.nativeBalance ?? data?.sol ?? null;
      if (nativeSol != null) out["SOL"] = parseFloat(nativeSol);
      return out;
    } catch { return {}; }
  };

  // ── Get active signing provider ──────────────────────────────────────────────
  const getActiveProvider = () => connectedProviderRef.current;

  // ── Detect legacy injected wallets ──────────────────────────────────────────
  const getLegacyProvider = (name) => {
    switch (name) {
      case "Phantom":      return window?.phantom?.solana;
      case "Solflare":     return window?.solflare?.isSolflare ? window.solflare : null;
      case "Backpack":     return window?.backpack?.solana;
      case "Jupiter": {
        const jupSolana = window?.solana;
        if (jupSolana?.isJupiter) return jupSolana;
        return window?.jupiter?.solana || window?.jupiter || null;
      }
      case "Trust Wallet": {
        const tw = window?.trustwallet?.solana || window?.trustWallet?.solana;
        return (tw && typeof tw.connect === "function") ? tw : null;
      }
      case "Coin98": return window?.coin98?.sol;
      case "OKX":    return window?.okxwallet?.solana;
      default:       return window?.solana || null;
    }
  };

  // ── Detect Wallet Standard wallets ──────────────────────────────────────────
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

  const wrapStandardWallet = (stdWallet) => ({
    connect: async () => {
      const feat = stdWallet.features["standard:connect"];
      const result = await feat.connect();
      const acct = result.accounts?.[0];
      if (!acct) throw new Error("No account returned");
      let pubkeyStr;
      if (typeof acct.address === "string") {
        pubkeyStr = acct.address;
      } else if (acct.publicKey instanceof Uint8Array) {
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
      const feat = stdWallet.features["standard:signTransaction"] || stdWallet.features["solana:signTransaction"];
      const result = await feat.signTransaction({ transaction: tx, account: stdWallet.accounts?.[0] });
      return result.signedTransaction || result.transaction || tx;
    },
    isStandard: true,
    walletName: stdWallet.name,
  });

  // ── Build wallet list for modal ──────────────────────────────────────────────
  const buildWalletList = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const list = [];

    for (const sw of getStandardWallets()) {
      list.push({ name: sw.name, icon: sw.icon || "", detected: true, connect: async () => wrapStandardWallet(sw), type: "standard" });
    }

    const LEGACY = ["Phantom","Solflare","Backpack","Jupiter","Trust Wallet","Coin98","OKX"];
    for (const name of LEGACY) {
      const already = list.find(l => l.name.toLowerCase() === name.toLowerCase());
      if (already) continue;
      const prov = getLegacyProvider(name);
      if (prov) list.push({ name, icon: WALLET_LOGOS[name], detected: true, connect: async () => prov, type: "legacy" });
    }

    if (isMobile) {
      const detected = new Set(list.map(l => l.name.toLowerCase()));
      for (const [name, fn] of Object.entries(MOBILE_DEEP_LINKS)) {
        if (!detected.has(name.toLowerCase())) {
          list.push({ name, icon: WALLET_LOGOS[name] || WALLET_LOGOS["Jupiter"], detected: false, deepLink: fn(window.location.href), type: "deeplink" });
        }
      }
      if (!list.some(l => l.type === "download")) {
        list.push({ name: "Get Jupiter Wallet", icon: WALLET_LOGOS["Get Jupiter Wallet"], detected: false, deepLink: "https://jup.ag/mobile", type: "download" });
      }
    } else {
      const DESKTOP = [
        { name:"Phantom",  url:"https://phantom.com/download" },
        { name:"Solflare", url:"https://solflare.com/download" },
        { name:"Backpack", url:"https://backpack.app/downloads" },
        { name:"OKX",      url:"https://www.okx.com/web3/wallet" },
        { name:"Jupiter",  url:"https://jup.ag/wallet" },
      ];
      const detected = new Set(list.map(l => l.name.toLowerCase()));
      for (const w of DESKTOP) {
        if (!detected.has(w.name.toLowerCase())) {
          list.push({ name: w.name, icon: WALLET_LOGOS[w.name], detected: false, deepLink: w.url, type: "download" });
        }
      }
    }
    return list;
  };

  useEffect(() => {
    if (!showWalletModal) return;
    const rebuild = () => setWalletList(buildWalletList());
    rebuild();
    window.addEventListener("wallet-standard:register-wallet", rebuild);
    const t1 = setTimeout(rebuild, 300);
    const t2 = setTimeout(rebuild, 800);
    const t3 = setTimeout(rebuild, 2000);
    return () => {
      window.removeEventListener("wallet-standard:register-wallet", rebuild);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, [showWalletModal]);

  // ── Connect wallet ───────────────────────────────────────────────────────────
  const connectWallet = (pendingSwap = null) => {
    pendingSwapRef.current = pendingSwap || null;
    setShowWalletModal(true);
  };

  const handleWalletSelected = async (walletEntry) => {
    if (walletEntry.type === "deeplink" || walletEntry.type === "download") {
      window.open(walletEntry.deepLink, "_blank");
      return;
    }
    try {
      const provider = await walletEntry.connect();
      const result   = await provider.connect();
      const address  = result?.publicKey?.toString?.() || result?.publicKey;
      if (!address) throw new Error("No public key returned");

      connectedProviderRef.current = provider;
      const display = `${address.slice(0,4)}…${address.slice(-4)}`;
      setWallet(display);
      setWalletFull(address);
      setConnectedWalletName(walletEntry.name);
      setShowWalletModal(false);

      const balances = await fetchSolanaBalances(address);
      setPortfolio(balances);
      push("ai", `Wallet connected ✓ — **${walletEntry.name}**\n\nBalance: **${(balances.SOL||0).toFixed(4)} SOL**\n\nType **refresh** to update balances or **delete messages** to clear chat.`);
    } catch (err) {
      const msg = err?.message || "";
      if (!msg.toLowerCase().includes("rejected") && !msg.toLowerCase().includes("cancel")) {
        push("ai", `Connection failed: ${msg || "Please try again."}`);
      }
    }
  };

  // ── Disconnect ───────────────────────────────────────────────────────────────
  const disconnectWallet = async () => {
    connectedProviderRef.current = null;
    setWallet(null);
    setWalletFull(null);
    setPortfolio({});
    setConnectedWalletName(null);
    try { if (reownConnected) await reownDisconnect(); } catch {}
    push("ai", "Wallet disconnected.");
  };

  return {
    wallet, walletFull, portfolio, setPortfolio,
    connectedWalletName, privyMode,
    showWalletModal, setShowWalletModal,
    walletList, mobileHint,
    wcStatus, setWcStatus, wcUri, setWcUri,
    wcMode, setWcMode, wcCopied, setWcCopied,
    wcPreferredWallet, setWcPreferredWallet,
    wcClientRef, wcSessionRef,
    connectedProviderRef, pendingSwapRef,
    getActiveProvider,
    connectWallet, disconnectWallet,
    handleWalletSelected,
    fetchSolanaBalances,
    privyLogin, privyLogout, privyAuthenticated, privyUser, privyWallets, solWallets,
    reownAddress, reownConnected, reownProvider,
  };
}
