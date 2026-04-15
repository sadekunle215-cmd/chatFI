import { useState, useEffect, useRef, useCallback } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";

// ─── Jupiter API endpoints ────────────────────────────────────────────────────
const JUP_PRICE_API   = "https://api.jup.ag/price/v2";
const JUP_TOKENS_API  = "https://tokens.jup.ag/token";
const JUP_QUOTE_API   = "https://quote-api.jup.ag/v6/quote";
const JUP_SWAP_API    = "https://quote-api.jup.ag/v6/swap";
const SOLANA_RPC      = "https://rpc.ankr.com/solana";
const SPL_PROGRAM     = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const TOKEN_MINTS = {
  SOL:  "So11111111111111111111111111111111111111112",
  JUP:  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF:  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  RAY:  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  PYTH: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
};

const TOKEN_DECIMALS = {
  SOL: 9, JUP: 6, BONK: 5, WIF: 6, USDC: 6, RAY: 6, PYTH: 6,
};

// ─── AI system prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ChatFi — a sharp, honest AI trading assistant built on Jupiter DEX (Solana). Your tone and depth mirror Claude: thoughtful, direct, warm — never hyped.

You pull live data: token prices, safety scores, on-chain metadata. You help users swap, set limit orders, research tokens, and predict sports outcomes via Jupiter Prediction Markets.

ALWAYS reply in this exact raw JSON format — no markdown fences, no text outside the JSON:
{
  "text": "your message to the user",
  "action": null,
  "actionData": {}
}

Available actions:
- null                → just chat
- "FETCH_PRICE"       → live prices. actionData: { "tokens": ["SOL","JUP"] }
- "FETCH_TOKEN_INFO"  → token safety + metadata via Tokens API. actionData: { "symbol": "JUP" }
- "SHOW_SWAP"         → swap UI pre-filled. actionData: { "from": "SOL", "to": "JUP", "reason": "brief why" }
- "SHOW_TRIGGER"      → limit order UI. actionData: { "token": "SOL", "direction": "below", "hint": "brief why" }
- "SHOW_PREDICTION"   → prediction market. actionData: { "teamA": "Arsenal", "teamB": "Chelsea", "sport": "football", "league": "Premier League", "analysis": "detailed breakdown" }

Rules:
- "buy X" / "swap X to Y" → SHOW_SWAP
- "price of X" → FETCH_PRICE
- "is X safe?" / "research X" → FETCH_TOKEN_INFO then answer
- sports match + betting → web_search for live form/odds, deep analysis, then SHOW_PREDICTION
- "limit order" / "buy X when it hits $Y" → SHOW_TRIGGER
- Never fabricate prices. Never use crypto-bro slang (LFG, ser, wagmi).
- Write plain prose, not bullet lists. Be concise and precise.`;

const SUGGESTIONS = [
  "What's the SOL price?",
  "Swap SOL to JUP",
  "Is BONK safe to buy?",
  "Set a limit order on SOL",
  "Arsenal vs Man City prediction",
  "Research WIF token",
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
  body:     "'DM Sans', 'Segoe UI', sans-serif",
  serif:    "'Lora', 'Georgia', serif",
  mono:     "'JetBrains Mono', monospace",
};

const fmt = (text = "") =>
  text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br/>");

// ─── Main component ───────────────────────────────────────────────────────────
export default function JupChat() {
  const [msgs, setMsgs]             = useState([{ id: 1, role: "ai", text: "Good morning! I'm ChatFi, your AI trading assistant built on Jupiter DEX.\n\nI can pull live token prices from Solana, help you swap assets, research token safety, set limit orders, and analyse sports for prediction markets — all in one conversation.\n\nConnect your Phantom wallet to get started, or just ask me anything." }]);
  const [input, setInput]           = useState("");
  const [typing, setTyping]         = useState(false);
  const [wallet, setWallet]         = useState(null);
  const [walletFull, setWalletFull] = useState(null);
  const [prices, setPrices]         = useState({});
  const [portfolio, setPortfolio]   = useState({});
  const [showSwap, setShowSwap]     = useState(false);
  const [swapCfg, setSwapCfg]       = useState({ from: "SOL", to: "JUP", amount: "" });
  const [swapQuote, setSwapQuote]   = useState(null);
  const [quoteFetching, setQF]      = useState(false);
  const [showPred, setShowPred]     = useState(false);
  const [pred, setPred]             = useState(null);
  const [pick, setPick]             = useState(null);
  const [stake, setStake]           = useState("10");
  const [showTrig, setShowTrig]     = useState(false);
  const [trigCfg, setTrigCfg]       = useState({ token: "SOL", targetPrice: "", amount: "", direction: "below" });
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [chatHistory, setChatHistory]   = useState([{ id: "default", title: "New conversation", active: true }]);
  const [lastAiId, setLastAiId]     = useState(null);
  const [swapStatus, setSwapStatus] = useState(null);
  const [swapTxid, setSwapTxid]     = useState(null);
  const histRef     = useRef([]);
  const endRef      = useRef(null);
  const inputRef    = useRef(null);
  const textareaRef = useRef(null);

  // ── Fonts + global CSS ──────────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      @keyframes blink  { 0%,80%,100%{opacity:0.15} 40%{opacity:0.9} }
      @keyframes spin   { to { transform: rotate(360deg); } }
      .msg-enter { animation: fadeUp 0.22s ease forwards; }
      ::-webkit-scrollbar { width:5px; height:5px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:#d4c9b5; border-radius:6px; }
      textarea { resize:none; }
      textarea::placeholder, input::placeholder { color:#b0a090; }
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      select option { background:#faf7f2; color:#1a1410; }
      code { font-family:'JetBrains Mono',monospace; background:#ede8de; padding:1px 5px; border-radius:3px; font-size:0.87em; color:#7a5c00; }
      .dot1,.dot2,.dot3 { display:inline-block; width:7px; height:7px; border-radius:50%; background:#b5a896; animation:blink 1.2s infinite; }
      .dot2 { animation-delay:0.2s; } .dot3 { animation-delay:0.4s; }
      .hov-row:hover { background:#e8e2d5 !important; }
      .hov-btn:hover { opacity:0.8; }
      .hov-sugg:hover { background:#e8e2d5 !important; color:#3d2e1e !important; }
      .hov-pick:hover { border-color:#d97931 !important; }
      .send-btn:not(:disabled):hover { background:#c4562a !important; }
      .spinner { width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.7s linear infinite; }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing, showSwap, showPred, showTrig]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  useEffect(() => {
    if (!showSwap || !swapCfg.amount || parseFloat(swapCfg.amount) <= 0) {
      setSwapQuote(null);
      return;
    }
    const t = setTimeout(() => fetchSwapQuote(), 600);
    return () => clearTimeout(t);
  }, [swapCfg.from, swapCfg.to, swapCfg.amount, showSwap]);

  // ── Proxy helper ────────────────────────────────────────────────────────────
  const jupFetch = async (url, options = {}) => {
    const res = await fetch("/api/jupiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, ...options }),
    });
    return res.json();
  };

  // ── Jupiter Price API ───────────────────────────────────────────────────────
  const fetchPrices = useCallback(async (tokens = Object.keys(TOKEN_MINTS)) => {
    try {
      const mints = tokens.map(t => TOKEN_MINTS[t.toUpperCase()]).filter(Boolean);
      if (!mints.length) return {};
      const json = await jupFetch(`${JUP_PRICE_API}?ids=${mints.join(",")}`);
      const out  = {};
      for (const [mint, info] of Object.entries(json.data || {})) {
        const sym = Object.entries(TOKEN_MINTS).find(([, v]) => v === mint)?.[0];
        if (sym) out[sym] = parseFloat(info.price);
      }
      setPrices(p => ({ ...p, ...out }));
      return out;
    } catch { return {}; }
  }, []);

  // ── Jupiter Tokens API ──────────────────────────────────────────────────────
  const fetchTokenInfo = async (symbol) => {
    const mint = TOKEN_MINTS[symbol?.toUpperCase()];
    if (!mint) return null;
    try {
      return await jupFetch(`${JUP_TOKENS_API}/${mint}`);
    } catch { return null; }
  };

  // ── Jupiter Swap V6 quote ───────────────────────────────────────────────────
  const fetchSwapQuote = useCallback(async () => {
    const { from, to, amount } = swapCfg;
    if (!amount || parseFloat(amount) <= 0 || from === to) return;
    const inputMint  = TOKEN_MINTS[from];
    const outputMint = TOKEN_MINTS[to];
    const decimals   = TOKEN_DECIMALS[from] || 9;
    const amountRaw  = Math.floor(parseFloat(amount) * Math.pow(10, decimals));
    setQF(true);
    setSwapQuote(null);
    try {
      const url = `${JUP_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=50&restrictIntermediateTokens=true`;
      const data = await jupFetch(url);
      if (data && !data.error) {
        setSwapQuote(data);
      } else {
        setSwapQuote(null);
      }
    } catch { setSwapQuote(null); }
    setQF(false);
  }, [swapCfg]);

  // ── FIXED: Solana balance fetch — routed through /api/jupiter proxy ─────────
  // Previously called Ankr RPC directly from the browser, which got blocked by
  // CORS and returned 0. Now proxied server-side just like all other Jupiter calls.
  const fetchSolanaBalances = async (pubkey) => {
    try {
      // SOL balance — via proxy
      const solJson = await jupFetch(SOLANA_RPC, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [pubkey, { commitment: "confirmed" }],
        }),
      });
      const sol = (solJson.result?.value || 0) / 1e9;

      // SPL token balances — via proxy
      const splJson = await jupFetch(SOLANA_RPC, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "getTokenAccountsByOwner",
          params: [
            pubkey,
            { programId: SPL_PROGRAM },
            { encoding: "jsonParsed", commitment: "confirmed" },
          ],
        }),
      });

      const balances = { SOL: sol };
      for (const acc of (splJson.result?.value || [])) {
        const info = acc.account.data.parsed.info;
        const sym  = Object.entries(TOKEN_MINTS).find(([, v]) => v === info.mint)?.[0];
        if (sym && info.tokenAmount.uiAmount > 0) balances[sym] = info.tokenAmount.uiAmount;
      }
      return balances;
    } catch { return {}; }
  };

  // ── Wallet connect ──────────────────────────────────────────────────────────
  const connectWallet = async (pendingSwap) => {
    const provider =
      window?.phantom?.solana ||
      window?.solflare ||
      window?.backpack?.solana ||
      window?.trustwallet?.solana ||
      window?.trustWallet?.solana ||
      window?.jupiter?.solana ||
      window?.jupiter ||
      window?.coin98?.sol ||
      window?.okxwallet?.solana ||
      window?.solana;

    if (!provider) {
      push("ai", "No Solana wallet detected. Please install one of: **Phantom**, **Solflare**, **Backpack**, **Trust Wallet**, or **Jupiter Wallet** to connect.");
      return;
    }
    try {
      const resp    = await provider.connect();
      const pubkey  = resp.publicKey.toString();
      const display = pubkey.slice(0, 4) + "…" + pubkey.slice(-4);
      setWallet(display);
      setWalletFull(pubkey);

      const balances = await fetchSolanaBalances(pubkey);
      setPortfolio(balances);

      const live = await fetchPrices();
      const solUSD = balances.SOL && live.SOL
        ? ` (~$${(balances.SOL * live.SOL).toFixed(2)})`
        : "";

      if (pendingSwap) {
        setSwapCfg({ from: pendingSwap.from || "SOL", to: pendingSwap.to || "JUP", amount: "" });
        setShowSwap(true);
        push("ai", `Wallet connected. You have **${(balances.SOL || 0).toFixed(4)} SOL**${solUSD} available. Swap interface is ready below.`);
      } else {
        push("ai", `Wallet connected ✓\n\nBalance: **${(balances.SOL || 0).toFixed(4)} SOL**${solUSD}${Object.entries(balances).filter(([k]) => k !== "SOL").map(([k, v]) => `\n${k}: ${v < 1 ? v.toFixed(6) : v.toFixed(2)}`).join("")}\n\nWhat would you like to do?`);
      }
    } catch (err) {
      const msg = err?.code === 4001
        ? "Wallet connection declined."
        : "Failed to connect wallet — please try again.";
      push("ai", msg);
    }
  };

  // ── Swap execution ──────────────────────────────────────────────────────────
  const doSwap = async () => {
    const { from, to, amount } = swapCfg;
    if (!amount || !walletFull) {
      if (!walletFull) { push("ai", "Connect your wallet first to execute a swap."); return; }
      return;
    }
    const provider =
      window?.phantom?.solana ||
      window?.solflare ||
      window?.backpack?.solana ||
      window?.trustwallet?.solana ||
      window?.trustWallet?.solana ||
      window?.jupiter?.solana ||
      window?.jupiter ||
      window?.coin98?.sol ||
      window?.okxwallet?.solana ||
      window?.solana;
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    setSwapStatus("signing");
    setSwapTxid(null);
    try {
      const inputMint  = TOKEN_MINTS[from];
      const outputMint = TOKEN_MINTS[to];
      const amountRaw  = Math.floor(parseFloat(amount) * Math.pow(10, TOKEN_DECIMALS[from] || 9));
      const quoteResponse = await jupFetch(
        `${JUP_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=50`
      );

      const swapData = await jupFetch(JUP_SWAP_API, {
        method: "POST",
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: walletFull,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto",
        }),
      });
      const { swapTransaction, lastValidBlockHeight } = swapData;

      const binaryStr = atob(swapTransaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);

      let signature;
      if (provider.signAndSendTransaction) {
        const result = await provider.signAndSendTransaction(tx);
        signature = result?.signature || result;
      } else if (provider.signTransaction) {
        const signed = await provider.signTransaction(tx);
        const connection = new Connection(SOLANA_RPC, "confirmed");
        signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
        await connection.confirmTransaction({ signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight });
      } else {
        throw new Error("Wallet does not support transaction signing");
      }

      setSwapStatus("done");
      setSwapTxid(signature);
      setShowSwap(false);

      const outDecimals = TOKEN_DECIMALS[to] || 9;
      const outAmt = swapQuote
        ? (parseInt(swapQuote.outAmount) / Math.pow(10, outDecimals)).toFixed(4)
        : "?";

      push("ai", `Swap executed via Jupiter ✓\n\nSent **${amount} ${from}** → received **~${outAmt} ${to}**\n\nTransaction: \`${signature?.slice(0, 20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);

      const updated = await fetchSolanaBalances(walletFull);
      setPortfolio(updated);
    } catch (err) {
      setSwapStatus("error");
      push("ai", `Swap failed: ${err.message || "Unknown error"}. Please check your balance and try again.`);
    }
    setSwapStatus(null);
  };

  // ── Limit order (Jupiter Trigger API) ──────────────────────────────────────
  const doTrigger = async () => {
    const { token, targetPrice, amount, direction } = trigCfg;
    if (!targetPrice || !amount || !walletFull) {
      if (!walletFull) { push("ai", "Connect your wallet first to set a limit order."); return; }
      return;
    }
    const provider =
      window?.phantom?.solana || window?.solflare || window?.backpack?.solana ||
      window?.trustwallet?.solana || window?.trustWallet?.solana ||
      window?.jupiter?.solana || window?.jupiter || window?.coin98?.sol ||
      window?.okxwallet?.solana || window?.solana;
    if (!provider) { push("ai", "Wallet provider not found. Please reconnect."); return; }

    const inputMint  = direction === "below" ? TOKEN_MINTS.USDC  : TOKEN_MINTS[token];
    const outputMint = direction === "below" ? TOKEN_MINTS[token] : TOKEN_MINTS.USDC;
    const inDecimals = direction === "below" ? TOKEN_DECIMALS.USDC : (TOKEN_DECIMALS[token] || 9);
    const amountRaw  = Math.floor(parseFloat(amount) * Math.pow(10, inDecimals));
    const targetLamports = Math.floor(parseFloat(targetPrice) * Math.pow(10, 6));

    try {
      const orderRes = await jupFetch("https://api.jup.ag/trigger/v1/createOrder", {
        method: "POST",
        body: JSON.stringify({
          inputMint,
          outputMint,
          maker: walletFull,
          payer: walletFull,
          params: {
            makingAmount: amountRaw.toString(),
            takingAmount: targetLamports.toString(),
            expiredAt: null,
          },
          computeUnitPrice: "auto",
        }),
      });

      if (orderRes.error) throw new Error(orderRes.error);

      const { transaction } = orderRes;
      const binaryStr = atob(transaction);
      const txBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
      const tx = VersionedTransaction.deserialize(txBytes);

      let signature;
      if (provider.signAndSendTransaction) {
        const result = await provider.signAndSendTransaction(tx);
        signature = result?.signature || result;
      } else if (provider.signTransaction) {
        const signed = await provider.signTransaction(tx);
        const connection = new Connection(SOLANA_RPC, "confirmed");
        signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      } else {
        throw new Error("Wallet does not support transaction signing");
      }

      setShowTrig(false);
      push("ai", `Limit order placed ✓\n\nWill buy **${amount} ${direction === "below" ? "USDC worth of " + token : token}** when price hits **$${targetPrice}**\n\nTransaction: \`${signature?.slice(0, 20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
    } catch (err) {
      push("ai", `Limit order failed: ${err.message || "Unknown error"}. Please try again.`);
    }
  };

  // ── Push message helper ─────────────────────────────────────────────────────
  const push = (role, text, extra = {}) => {
    const id = Date.now() + Math.random();
    if (role === "ai") setLastAiId(id);
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
    setShowSwap(false);
    setShowPred(false);
    setShowTrig(false);

    histRef.current = [...histRef.current, { role: "user", content: raw }];

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: histRef.current,
        }),
      });

      const data = await res.json();
      const raw_text = data?.content?.[0]?.text || '{"text":"Sorry, I encountered an error. Please try again.","action":null,"actionData":{}}';

      let parsed;
      try {
        parsed = JSON.parse(raw_text);
      } catch {
        parsed = { text: raw_text, action: null, actionData: {} };
      }

      const { text, action, actionData } = parsed;
      histRef.current = [...histRef.current, { role: "assistant", content: raw_text }];

      // Handle actions
      if (action === "FETCH_PRICE") {
        const tokens = actionData?.tokens || ["SOL"];
        const live = await fetchPrices(tokens);
        const priceLines = tokens.map(t => `${t}: $${live[t]?.toFixed(4) ?? "N/A"}`).join("\n");
        push("ai", `${text}\n\n${priceLines}`);
      } else if (action === "FETCH_TOKEN_INFO") {
        const info = await fetchTokenInfo(actionData?.symbol);
        const extra = info
          ? `\n\nName: ${info.name}\nSymbol: ${info.symbol}\nMint: \`${info.address?.slice(0, 16)}…\`${info.tags?.length ? "\nTags: " + info.tags.join(", ") : ""}`
          : "";
        push("ai", text + extra);
      } else if (action === "SHOW_SWAP") {
        if (!walletFull) {
          push("ai", text + "\n\nConnect your wallet first to swap.");
          setTimeout(() => connectWallet({ from: actionData?.from, to: actionData?.to }), 300);
        } else {
          setSwapCfg({ from: actionData?.from || "SOL", to: actionData?.to || "JUP", amount: "" });
          setShowSwap(true);
          push("ai", text);
        }
      } else if (action === "SHOW_TRIGGER") {
        if (!walletFull) {
          push("ai", text + "\n\nConnect your wallet first to set a limit order.");
        } else {
          setTrigCfg(c => ({ ...c, token: actionData?.token || "SOL", direction: actionData?.direction || "below" }));
          setShowTrig(true);
          push("ai", text);
        }
      } else if (action === "SHOW_PREDICTION") {
        setPred(actionData);
        setPick(null);
        setShowPred(true);
        push("ai", text);
      } else {
        push("ai", text);
      }
    } catch (err) {
      push("ai", "Connection error. Please check your setup and try again.");
    }
    setTyping(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const mainW = sidebarOpen ? "calc(100% - 240px)" : "100%";

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
            <button
              onClick={() => {
                histRef.current = [];
                setMsgs([{ id: Date.now(), role:"ai", text:"New conversation started. How can I help?" }]);
                setChatHistory(h => [{ id: Date.now(), title:"New conversation", active:true }, ...h.map(c => ({...c, active:false}))]);
              }}
              style={{ width:"100%", padding:"8px 12px", background:"transparent", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:8 }}
              className="hov-row"
            >
              <span style={{ fontSize:16 }}>+</span> New chat
            </button>
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"0 8px" }}>
            {chatHistory.map(c => (
              <div key={c.id} className="hov-row" style={{ padding:"8px 12px", borderRadius:8, fontSize:13, color: c.active ? T.text1 : T.text2, background: c.active ? T.border : "transparent", cursor:"pointer", marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {c.title}
              </div>
            ))}
          </div>

          <div style={{ padding:"12px 16px", borderTop:`1px solid ${T.border}` }}>
            {wallet ? (
              <div style={{ fontSize:12, color:T.text2 }}>
                <div style={{ color:T.green, fontWeight:500, marginBottom:4 }}>● {wallet}</div>
                {portfolio.SOL !== undefined && (
                  <div>{portfolio.SOL.toFixed(4)} SOL{prices.SOL ? ` · $${(portfolio.SOL * prices.SOL).toFixed(2)}` : ""}</div>
                )}
              </div>
            ) : (
              <button
                onClick={() => connectWallet(null)}
                style={{ width:"100%", padding:"8px 12px", background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}
                className="hov-btn"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>

        {/* Header */}
        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:12, background:T.surface }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background:"none", border:"none", cursor:"pointer", color:T.text3, fontSize:18, padding:4 }} className="hov-btn">
            ☰
          </button>
          <div style={{ fontFamily:T.serif, fontSize:16, fontWeight:500, color:T.text1 }}>ChatFi</div>
          {wallet && (
            <div style={{ marginLeft:"auto", fontSize:12, color:T.green, fontWeight:500 }}>
              ● {wallet}
            </div>
          )}
          {!wallet && (
            <button
              onClick={() => connectWallet(null)}
              style={{ marginLeft:"auto", padding:"6px 14px", background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}
              className="hov-btn"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px 20px" }}>
          {msgs.map(m => (
            <div key={m.id} className="msg-enter" style={{ marginBottom:20, display:"flex", gap:12, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              {m.role === "ai" && (
                <div style={{ width:32, height:32, borderRadius:"50%", background:T.accentBg, border:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, marginTop:2 }}>🤖</div>
              )}
              <div style={{
                maxWidth:"72%",
                padding: m.role === "user" ? "10px 16px" : "12px 16px",
                borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                background: m.role === "user" ? T.accent : T.surface,
                color: m.role === "user" ? "#fff" : T.text1,
                border: m.role === "ai" ? `1px solid ${T.border}` : "none",
                fontSize:14,
                lineHeight:1.6,
              }}
                dangerouslySetInnerHTML={{ __html: fmt(m.text) }}
              />
            </div>
          ))}

          {typing && (
            <div style={{ display:"flex", gap:12, marginBottom:20 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:T.accentBg, border:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🤖</div>
              <div style={{ padding:"12px 16px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:"4px 18px 18px 18px", display:"flex", gap:5, alignItems:"center" }}>
                <span className="dot1" /><span className="dot2" /><span className="dot3" />
              </div>
            </div>
          )}

          {/* Swap panel */}
          {showSwap && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:16, color:T.text1 }}>Swap Tokens</div>
              <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"center" }}>
                <select value={swapCfg.from} onChange={e => setSwapCfg(c => ({...c, from:e.target.value}))}
                  style={{ flex:1, padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}>
                  {Object.keys(TOKEN_MINTS).map(t => <option key={t}>{t}</option>)}
                </select>
                <button onClick={() => setSwapCfg(c => ({...c, from:c.to, to:c.from}))}
                  style={{ padding:"8px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, cursor:"pointer", color:T.text2, fontSize:14 }}>⇄</button>
                <select value={swapCfg.to} onChange={e => setSwapCfg(c => ({...c, to:e.target.value}))}
                  style={{ flex:1, padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}>
                  {Object.keys(TOKEN_MINTS).map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <input
                type="number" placeholder="Amount" value={swapCfg.amount}
                onChange={e => setSwapCfg(c => ({...c, amount:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:10 }}
              />
              {quoteFetching && <div style={{ fontSize:12, color:T.text3, marginBottom:8 }}>Fetching quote…</div>}
              {swapQuote && !quoteFetching && (
                <div style={{ fontSize:12, color:T.green, background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:8, padding:"8px 12px", marginBottom:10 }}>
                  You'll receive ≈ {(parseInt(swapQuote.outAmount) / Math.pow(10, TOKEN_DECIMALS[swapCfg.to] || 6)).toFixed(4)} {swapCfg.to}
                  {swapQuote.priceImpactPct && <span style={{ color: parseFloat(swapQuote.priceImpactPct) > 1 ? T.red : T.text3 }}> · {parseFloat(swapQuote.priceImpactPct).toFixed(2)}% impact</span>}
                </div>
              )}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={doSwap} disabled={!swapCfg.amount || swapStatus === "signing"}
                  style={{ flex:1, padding:"10px", background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                  className="send-btn">
                  {swapStatus === "signing" ? <><span className="spinner" /> Signing…</> : `Swap ${swapCfg.from} → ${swapCfg.to}`}
                </button>
                <button onClick={() => setShowSwap(false)}
                  style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Limit order panel */}
          {showTrig && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:16, color:T.text1 }}>Limit Order</div>
              <div style={{ display:"flex", gap:10, marginBottom:12 }}>
                <select value={trigCfg.token} onChange={e => setTrigCfg(c => ({...c, token:e.target.value}))}
                  style={{ flex:1, padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}>
                  {Object.keys(TOKEN_MINTS).filter(t => t !== "USDC").map(t => <option key={t}>{t}</option>)}
                </select>
                <select value={trigCfg.direction} onChange={e => setTrigCfg(c => ({...c, direction:e.target.value}))}
                  style={{ flex:1, padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}>
                  <option value="below">Buy when below</option>
                  <option value="above">Sell when above</option>
                </select>
              </div>
              <input type="number" placeholder="Target price (USD)" value={trigCfg.targetPrice}
                onChange={e => setTrigCfg(c => ({...c, targetPrice:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:8 }}
              />
              <input type="number" placeholder={`Amount (${trigCfg.direction === "below" ? "USDC" : trigCfg.token})`} value={trigCfg.amount}
                onChange={e => setTrigCfg(c => ({...c, amount:e.target.value}))}
                style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:12 }}
              />
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={doTrigger} disabled={!trigCfg.targetPrice || !trigCfg.amount}
                  style={{ flex:1, padding:"10px", background:T.purple, border:"none", borderRadius:8, color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer" }}
                  className="hov-btn">
                  Place Order
                </button>
                <button onClick={() => setShowTrig(false)}
                  style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Prediction market panel */}
          {showPred && pred && (
            <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
              <div style={{ fontFamily:T.serif, fontSize:15, fontWeight:500, marginBottom:4, color:T.text1 }}>{pred.teamA} vs {pred.teamB}</div>
              <div style={{ fontSize:12, color:T.text3, marginBottom:14 }}>{pred.league} · {pred.sport}</div>
              {pred.analysis && <div style={{ fontSize:13, color:T.text2, marginBottom:16, lineHeight:1.6, padding:"10px 12px", background:T.bg, borderRadius:8 }}>{pred.analysis}</div>}
              <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                {[pred.teamA, "Draw", pred.teamB].map(opt => (
                  <button key={opt} onClick={() => setPick(opt)} className="hov-pick"
                    style={{ flex:1, padding:"10px 8px", border:`2px solid ${pick === opt ? T.accent : T.border}`, borderRadius:10, background: pick === opt ? T.accentBg : T.bg, color: pick === opt ? T.accent : T.text2, fontSize:13, fontWeight: pick === opt ? 600 : 400, cursor:"pointer", transition:"all 0.15s" }}>
                    {opt}
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="number" placeholder="Stake (USDC)" value={stake}
                  onChange={e => setStake(e.target.value)}
                  style={{ flex:1, padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13 }}
                />
                <button onClick={() => {
                  if (!pick) return;
                  push("ai", `Prediction noted: **${pick}** with $${stake} USDC stake.\n\nNote: On-chain prediction market execution requires Jupiter's Prediction Markets API integration. This feature records your pick — actual wagering will be enabled in a future update.`);
                  setShowPred(false);
                }}
                  disabled={!pick || !stake}
                  style={{ padding:"8px 16px", background:T.green, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}
                  className="hov-btn">
                  Confirm Pick
                </button>
                <button onClick={() => setShowPred(false)}
                  style={{ padding:"8px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:13, cursor:"pointer" }}>
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

          <div ref={endRef} />
        </div>

        {/* Input bar */}
        <div style={{ padding:"12px 20px 16px", borderTop:`1px solid ${T.border}`, background:T.surface }}>
          <div style={{ display:"flex", gap:10, alignItems:"flex-end", background:T.bg, border:`1px solid ${T.border}`, borderRadius:14, padding:"10px 14px" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask about prices, swaps, tokens, or sports predictions…"
              rows={1}
              style={{ flex:1, border:"none", outline:"none", background:"transparent", fontFamily:T.body, fontSize:14, color:T.text1, lineHeight:1.5, maxHeight:160, overflowY:"auto" }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || typing}
              className="send-btn"
              style={{ padding:"8px 16px", background: (!input.trim() || typing) ? T.border : T.accent, border:"none", borderRadius:10, color: (!input.trim() || typing) ? T.text3 : "#fff", fontSize:13, fontWeight:500, cursor: (!input.trim() || typing) ? "default" : "pointer", flexShrink:0, transition:"background 0.15s", display:"flex", alignItems:"center", gap:6 }}>
              {typing ? <><span className="spinner" /></> : "Send"}
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
