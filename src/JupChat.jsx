import { useState, useEffect, useRef, useCallback } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";

// ─── Jupiter API endpoints ────────────────────────────────────────────────────
const JUP_PRICE_API   = "https://api.jup.ag/price/v2";
const JUP_TOKENS_API  = "https://tokens.jup.ag/token";   // GET /token/{mint}
const JUP_QUOTE_API   = "https://quote-api.jup.ag/v6/quote";  // confirmed working
const JUP_SWAP_API    = "https://quote-api.jup.ag/v6/swap";   // confirmed working
const SOLANA_RPC      = "https://rpc.ankr.com/solana";        // reliable, accurate balances
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
  const [wallet, setWallet]         = useState(null);       // display (truncated)
  const [walletFull, setWalletFull] = useState(null);       // full public key
  const [prices, setPrices]         = useState({});
  const [portfolio, setPortfolio]   = useState({});         // real on-chain balances
  const [showSwap, setShowSwap]     = useState(false);
  const [swapCfg, setSwapCfg]       = useState({ from: "SOL", to: "JUP", amount: "" });
  const [swapQuote, setSwapQuote]   = useState(null);       // real Jupiter quote
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
  const [swapStatus, setSwapStatus] = useState(null);       // null | "signing" | "broadcasting" | "done" | "error"
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

  // Auto-fetch swap quote when amount changes
  useEffect(() => {
    if (!showSwap || !swapCfg.amount || parseFloat(swapCfg.amount) <= 0) {
      setSwapQuote(null);
      return;
    }
    const t = setTimeout(() => fetchSwapQuote(), 600);
    return () => clearTimeout(t);
  }, [swapCfg.from, swapCfg.to, swapCfg.amount, showSwap]);

  // ── Proxy helper — all Jupiter calls go through /api/jupiter ───────────────
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

  // ── Real Solana balance fetch ────────────────────────────────────────────────
  const fetchSolanaBalances = async (pubkey) => {
    try {
      // SOL balance
      const solRes = await fetch(SOLANA_RPC, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [pubkey, { commitment: "confirmed" }] }),
      });
      const solJson = await solRes.json();
      const sol = (solJson.result?.value || 0) / 1e9;

      // SPL token balances
      const splRes = await fetch(SOLANA_RPC, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 2, method: "getTokenAccountsByOwner",
          params: [pubkey, { programId: SPL_PROGRAM }, { encoding: "jsonParsed", commitment: "confirmed" }],
        }),
      });
      const splJson = await splRes.json();
      const balances = { SOL: sol };
      for (const acc of (splJson.result?.value || [])) {
        const info = acc.account.data.parsed.info;
        const sym  = Object.entries(TOKEN_MINTS).find(([, v]) => v === info.mint)?.[0];
        if (sym && info.tokenAmount.uiAmount > 0) balances[sym] = info.tokenAmount.uiAmount;
      }
      return balances;
    } catch { return {}; }
  };

  // ── Real wallet connect (Phantom / Solflare) ─────────────────────────────
  const connectWallet = async (pendingSwap) => {
    // Detect any available Solana wallet — Phantom, Solflare, Backpack, Trust, Jupiter, Coin98, etc.
    const provider =
      window?.phantom?.solana ||
      window?.solflare ||
      window?.backpack?.solana ||
      window?.trustwallet?.solana ||   // Trust Wallet (lowercase w)
      window?.trustWallet?.solana ||   // Trust Wallet (some versions)
      window?.jupiter?.solana ||
      window?.jupiter ||               // Jupiter Wallet fallback
      window?.coin98?.sol ||
      window?.okxwallet?.solana ||     // OKX Wallet
      window?.solana;                  // generic fallback

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

      // Fetch real on-chain balances
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

  // ── Real swap execution (requires @solana/web3.js in Vite project) ──────────
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
      // 1. Get fresh quote
      const inputMint  = TOKEN_MINTS[from];
      const outputMint = TOKEN_MINTS[to];
      const amountRaw  = Math.floor(parseFloat(amount) * Math.pow(10, TOKEN_DECIMALS[from] || 9));
      const quoteResponse = await jupFetch(
        `${JUP_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=50`
      );

      // 2. Build swap transaction
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

      // 3. Deserialize + sign + send the versioned transaction
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

      push("ai", `Swap executed via Jupiter Swap V2 ✓\n\nSent **${amount} ${from}** → received **~${outAmt} ${to}**\n\nTransaction: \`${signature?.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);

      // Refresh balances
      const updated = await fetchSolanaBalances(walletFull);
      setPortfolio(updated);
    } catch (err) {
      setSwapStatus("error");
      push("ai", `Swap failed: ${err.message || "Unknown error"}. Please check your balance and try again.`);
    }
    setSwapStatus(null);
  };

  // ── Limit order (Jupiter Trigger API) ─────────────────────────────────────
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
    const targetLamports = Math.floor(parseFloat(targetPrice) * Math.pow(10, 6)); // price in USDC decimals

    try {
      // 1. Create the trigger order transaction
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
      push("ai", `Limit order placed on Jupiter Trigger API ✓\n\nWill ${direction === "below" ? "buy" : "sell"} **${amount} ${token}** when price goes **${direction} $${targetPrice}**\n\nTransaction: \`${signature?.slice(0,20)}…\`\n\n[View on Solscan →](https://solscan.io/tx/${signature})`);
    } catch (err) {
      push("ai", `Limit order failed: ${err.message || "Unknown error"}. Please try again.`);
    }
  };

  // ── Prediction market ───────────────────────────────────────────────────────
  const ODDS = { teamA: 2.15, draw: 3.40, teamB: 1.85 };
  const doPred = () => {
    if (!pick || !stake) return;
    setShowPred(false);
    const odds = pick === pred?.teamA ? ODDS.teamA : pick === "Draw" ? ODDS.draw : ODDS.teamB;
    const win  = (parseFloat(stake) * odds).toFixed(2);
    push("ai", `Prediction placed on Jupiter Prediction Markets.\n\nStaked **${stake} USDC** on **${pick}** at **${odds}x** odds — potential return of **$${win} USDC**.\n\nGood luck with the match.`);
  };

  // ── Message queue ───────────────────────────────────────────────────────────
  const push = (role, text, extra = {}) => {
    const id = Date.now() + Math.random();
    setMsgs(m => [...m, { id, role, text, ...extra }]);
    if (role === "ai") setLastAiId(id);
    return id;
  };

  // ── Send message to AI ──────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || typing) return;
    setInput("");
    push("user", text);
    histRef.current.push({ role: "user", content: text });
    // Update active chat title with first user message
    setChatHistory(h => h.map(c => c.active && c.title === "New conversation" ? { ...c, title: text.slice(0, 40) } : c));
    setTyping(true);
    setShowSwap(false); setShowPred(false); setShowTrig(false);

    try {
      const res  = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: histRef.current,
        }),
      });
      const data = await res.json();
      const raw  = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      histRef.current.push({ role: "assistant", content: data.content || [{ type: "text", text: raw }] });

      let parsed;
      try   { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
      catch { parsed = { text: raw || "Something went wrong. Please try again.", action: null, actionData: {} }; }

      const { text: aiText, action, actionData: ad = {} } = parsed;

      if (action === "FETCH_PRICE") {
        const tokens = (ad.tokens || ["SOL"]).map(t => t.toUpperCase());
        const live   = await fetchPrices(tokens);
        push("ai", aiText, { priceTokens: tokens.filter(t => live[t]), livePrices: live });

      } else if (action === "FETCH_TOKEN_INFO") {
        const sym  = ad.symbol?.toUpperCase();
        const info = await fetchTokenInfo(sym);
        push("ai", aiText, { tokenInfo: info, tokenSym: sym });

      } else if (action === "SHOW_SWAP") {
        if (!wallet) {
          push("ai", (aiText || "") + "\n\nConnect your wallet first to proceed with the swap.", { showConnect: true, pendingSwap: ad });
        } else {
          await fetchPrices();
          setSwapCfg({ from: ad.from || "SOL", to: ad.to || "JUP", amount: "" });
          setShowSwap(true);
          push("ai", aiText || "Here's the swap interface — powered by Jupiter Swap V2.");
        }

      } else if (action === "SHOW_TRIGGER") {
        setTrigCfg(c => ({ ...c, token: ad.token || "SOL", direction: ad.direction || "below" }));
        setShowTrig(true);
        push("ai", aiText || "Here's the limit order interface — powered by Jupiter Trigger API.");

      } else if (action === "SHOW_PREDICTION") {
        setPred(ad); setPick(null); setShowPred(true);
        push("ai", aiText || "Here's the prediction market for this match.");

      } else {
        push("ai", aiText || "Something didn't parse correctly — could you try again?");
      }
    } catch {
      push("ai", "Connection error. Please check your network and try again.");
    }
    setTyping(false);
  };

  // ── Sub-components ──────────────────────────────────────────────────────────
  const JupAvatar = () => (
    <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0, background:"linear-gradient(135deg,#d97931 0%,#c4562a 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", fontWeight:700, fontFamily:T.body }}>C</div>
  );
  const UserAvatar = () => (
    <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0, background:"#c9b89a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#fff", fontWeight:600, fontFamily:T.body }}>U</div>
  );
  const Card = ({ children, style={} }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:16, marginTop:10, width:"100%", maxWidth:460, ...style }}>{children}</div>
  );
  const CardHead = ({ label, onClose }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
      <span style={{ fontFamily:T.body, fontSize:13, fontWeight:600, color:T.text2, letterSpacing:0.1 }}>{label}</span>
      <button className="hov-btn" onClick={onClose} style={{ background:"transparent", border:`1px solid ${T.border}`, color:T.text3, borderRadius:6, width:26, height:26, cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
    </div>
  );
  const Field = ({ label, right, children }) => (
    <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"10px 12px", marginBottom:6 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:10, color:T.text3, fontFamily:T.body, fontWeight:600, textTransform:"uppercase", letterSpacing:0.6 }}>{label}</span>
        {right && <span style={{ fontSize:11, fontFamily:T.mono, color:T.text3 }}>{right}</span>}
      </div>
      {children}
    </div>
  );
  const BigBtn = ({ onClick, disabled, color=T.accent, loading=false, children }) => (
    <button className="hov-btn" onClick={onClick} disabled={disabled || loading} style={{ width:"100%", padding:"11px", borderRadius:8, border:"none", background:disabled||loading ? T.border : color, color:disabled||loading ? T.text3 : "#fff", fontSize:14, fontWeight:600, fontFamily:T.body, cursor:disabled||loading ? "not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
      {loading && <span className="spinner" />}{children}
    </button>
  );
  const TokSelect = ({ value, onChange }) => (
    <select value={value} onChange={onChange} style={{ background:T.bg, color:T.text1, border:`1px solid ${T.border}`, borderRadius:6, padding:"4px 8px", fontSize:13, fontWeight:600, fontFamily:T.body, cursor:"pointer", outline:"none" }}>
      {Object.keys(TOKEN_MINTS).map(t => <option key={t}>{t}</option>)}
    </select>
  );

  // ── Swap Panel (real Jupiter Swap V2 quote) ─────────────────────────────────
  const SwapPanel = () => {
    const { from, to, amount } = swapCfg;
    const fp = prices[from];
    const outDecimals = TOKEN_DECIMALS[to] || 9;
    const realOut = swapQuote ? (parseInt(swapQuote.outAmount) / Math.pow(10, outDecimals)) : null;
    const realOutFmt = realOut ? (realOut < 0.0001 ? realOut.toFixed(8) : realOut.toFixed(4)) : null;
    const priceImpact = swapQuote?.priceImpactPct ? parseFloat(swapQuote.priceImpactPct).toFixed(3) : null;
    const routeLabel = swapQuote?.routePlan?.length > 0
      ? swapQuote.routePlan.map(r => r.swapInfo?.label || "AMM").join(" → ")
      : null;
    const usd = amount && fp ? (parseFloat(amount) * fp).toFixed(2) : null;
    const hasPortfolio = Object.keys(portfolio).length > 0;

    return (
      <Card>
        <CardHead label="Swap — Jupiter Swap V2" onClose={() => { setShowSwap(false); setSwapQuote(null); }} />
        {hasPortfolio && (
          <div style={{ background:T.bg, borderRadius:8, padding:"8px 12px", marginBottom:10, border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.text3, marginBottom:5, fontFamily:T.body, fontWeight:600, textTransform:"uppercase", letterSpacing:0.6 }}>Your Portfolio</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"3px 14px" }}>
              {Object.entries(portfolio).map(([sym, bal]) => (
                <span key={sym} style={{ fontSize:12, fontFamily:T.mono, color:T.text2 }}>
                  {sym}: {bal < 0.001 ? bal.toFixed(6) : bal < 1 ? bal.toFixed(4) : bal.toFixed(2)}{prices[sym] ? ` · $${(bal * prices[sym]).toFixed(0)}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}
        <Field label="From" right={usd ? `$${usd}` : null}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <input type="number" placeholder="0.00" value={swapCfg.amount}
              onChange={e => setSwapCfg(p => ({ ...p, amount: e.target.value }))}
              style={{ flex:1, background:"transparent", border:"none", outline:"none", fontSize:22, fontFamily:T.mono, fontWeight:600, color:T.text1 }} />
            <TokSelect value={from} onChange={e => setSwapCfg(p => ({ ...p, from: e.target.value }))} />
          </div>
          {fp && <div style={{ fontSize:11, color:T.text3, marginTop:2, fontFamily:T.mono }}>1 {from} = ${fp < 0.01 ? fp.toFixed(6) : fp.toFixed(3)}</div>}
        </Field>
        <div onClick={() => setSwapCfg(p => ({ from:p.to, to:p.from, amount:p.amount }))}
          style={{ textAlign:"center", color:T.text3, fontSize:18, margin:"2px 0", cursor:"pointer", userSelect:"none" }}>⇅</div>
        <Field label="To (Jupiter quote)">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:22, fontFamily:T.mono, fontWeight:600, color:quoteFetching ? T.text3 : realOutFmt ? T.green : T.text3 }}>
              {quoteFetching ? "…" : realOutFmt || "—"}
            </span>
            <TokSelect value={to} onChange={e => setSwapCfg(p => ({ ...p, to: e.target.value }))} />
          </div>
          {realOut && prices[to] && <div style={{ fontSize:11, color:T.text3, marginTop:2, fontFamily:T.mono }}>≈ ${(realOut * prices[to]).toFixed(2)}</div>}
        </Field>
        {swapQuote && (
          <div style={{ background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:8, padding:"8px 12px", marginBottom:10, fontSize:12, color:T.green }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontFamily:T.body }}>Route</span>
              <span style={{ fontFamily:T.mono }}>{routeLabel || "Best route"}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontFamily:T.body }}>Price impact</span>
              <span style={{ fontFamily:T.mono, color: parseFloat(priceImpact) > 1 ? T.red : T.green }}>{priceImpact}%</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontFamily:T.body }}>Slippage</span>
              <span style={{ fontFamily:T.mono }}>0.5%</span>
            </div>
          </div>
        )}
        <BigBtn onClick={doSwap} disabled={!swapCfg.amount || quoteFetching} loading={swapStatus === "signing" || swapStatus === "broadcasting"} color={T.green}>
          {swapStatus === "signing" ? "Signing…" : swapStatus === "broadcasting" ? "Sending…" : wallet ? "Execute Swap" : "Connect Wallet First"}
        </BigBtn>
        <button className="hov-btn" onClick={() => { setShowSwap(false); setShowTrig(true); setTrigCfg(p => ({ ...p, token: from })); }}
          style={{ width:"100%", marginTop:8, background:"transparent", border:`1px solid ${T.border}`, borderRadius:8, color:T.text3, fontSize:12, padding:"8px", cursor:"pointer", fontFamily:T.body }}>
          Set a limit order instead (Jupiter Trigger)
        </button>
        <p style={{ fontSize:10.5, color:T.text3, textAlign:"center", marginTop:8, fontFamily:T.body }}>Quote from Jupiter Swap V2 · 50 bps slippage · Gasless routing</p>
      </Card>
    );
  };

  // ── Trigger / Limit Order Panel ─────────────────────────────────────────────
  const TriggerPanel = () => {
    const { token, targetPrice, amount, direction } = trigCfg;
    const cur = prices[token];
    const isAbove = direction === "above";
    return (
      <Card>
        <CardHead label="Limit Order — Jupiter Trigger API" onClose={() => setShowTrig(false)} />
        <p style={{ fontSize:13.5, color:T.text2, marginBottom:12, lineHeight:1.65, fontFamily:T.serif }}>
          Set a conditional order that executes when {token} moves {direction} your target.
          {cur && ` Current: $${cur < 0.01 ? cur.toFixed(6) : cur.toFixed(3)}.`}
        </p>
        <Field label="Token">
          <TokSelect value={token} onChange={e => setTrigCfg(p => ({ ...p, token: e.target.value }))} />
        </Field>
        <Field label="Trigger direction">
          <div style={{ display:"flex", gap:8 }}>
            {["below","above"].map(d => (
              <button key={d} onClick={() => setTrigCfg(p => ({ ...p, direction:d }))} style={{ flex:1, padding:"6px", borderRadius:6, border:`1.5px solid ${direction===d ? T.accent : T.border}`, background:direction===d ? T.accentBg : T.bg, color:direction===d ? T.accent : T.text2, fontSize:13, fontWeight:direction===d ? 600 : 400, cursor:"pointer", fontFamily:T.body }}>
                {d === "below" ? "↓ Buy below" : "↑ Sell above"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Target price (USD)" right={cur && targetPrice ? `${isAbove ? "+" : ""}${((parseFloat(targetPrice)/cur-1)*100).toFixed(1)}% from now` : null}>
          <input type="number" placeholder="e.g. 140" value={targetPrice}
            onChange={e => setTrigCfg(p => ({ ...p, targetPrice: e.target.value }))}
            style={{ background:"transparent", border:"none", outline:"none", fontSize:18, fontFamily:T.mono, fontWeight:600, color:T.text1, width:"100%" }} />
        </Field>
        <Field label={`Amount (${token})`}>
          <input type="number" placeholder="0.00" value={amount}
            onChange={e => setTrigCfg(p => ({ ...p, amount: e.target.value }))}
            style={{ background:"transparent", border:"none", outline:"none", fontSize:18, fontFamily:T.mono, fontWeight:600, color:T.text1, width:"100%" }} />
        </Field>
        <div style={{ marginTop:8 }}>
          <BigBtn onClick={doTrigger} disabled={!targetPrice || !amount}>Place Limit Order</BigBtn>
        </div>
        <p style={{ fontSize:10.5, color:T.text3, textAlign:"center", marginTop:8, fontFamily:T.body }}>Powered by Jupiter Trigger API · Single, OCO, OTOCO orders</p>
      </Card>
    );
  };

  // ── Token Info Card ─────────────────────────────────────────────────────────
  const TokenInfoCard = ({ info, sym }) => {
    if (!info) return (
      <Card style={{ border:`1px solid ${T.redBd}`, background:T.redBg }}>
        <p style={{ fontSize:13, color:T.red, fontFamily:T.body }}>⚠ Token not found in Jupiter Tokens API. It may be very new, delisted, or unverified.</p>
      </Card>
    );
    const score  = info.organicScore ?? info.tags?.includes("verified") ? 80 : 30;
    const isSafe = score > 50;
    const price  = prices[sym] || info.price;
    return (
      <Card>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          {info.logoURI && <img src={info.logoURI} alt={sym} width={28} height={28} style={{ borderRadius:"50%", border:`1px solid ${T.border}` }} />}
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:T.text1, fontFamily:T.body }}>{info.name || sym}</div>
            <div style={{ fontSize:12, color:T.text3, fontFamily:T.mono }}>{info.symbol} · {info.address?.slice(0,8)}…</div>
          </div>
          <div style={{ marginLeft:"auto", background:isSafe ? T.greenBg : T.redBg, border:`1px solid ${isSafe ? T.greenBd : T.redBd}`, borderRadius:6, padding:"3px 10px", fontSize:12, fontWeight:600, color:isSafe ? T.green : T.red, fontFamily:T.body }}>
            {isSafe ? "✓ Verified" : "⚠ Unverified"}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[
            ["Price", price ? `$${price < 0.01 ? price.toFixed(6) : price.toFixed(4)}` : "–"],
            ["Decimals", info.decimals ?? "–"],
            ["Organic Score", info.organicScore != null ? `${info.organicScore}/100` : "–"],
            ["Tags", (info.tags || []).slice(0,2).join(", ") || "–"],
          ].map(([label, val]) => (
            <div key={label} style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px" }}>
              <div style={{ fontSize:10, color:T.text3, textTransform:"uppercase", letterSpacing:0.5, fontFamily:T.body, fontWeight:600, marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:13, fontFamily:T.mono, color:T.text1 }}>{val}</div>
            </div>
          ))}
        </div>
        <button className="hov-btn" onClick={() => { setSwapCfg(p => ({ ...p, to:sym })); setShowSwap(true); }}
          style={{ width:"100%", marginTop:10, background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, padding:"9px", cursor:"pointer", fontFamily:T.body }}>
          Swap to {sym}
        </button>
      </Card>
    );
  };

  // ── Prediction Panel ────────────────────────────────────────────────────────
  const PredPanel = () => {
    if (!pred) return null;
    const curOdds = pick === pred.teamA ? ODDS.teamA : pick === "Draw" ? ODDS.draw : ODDS.teamB;
    const potWin  = pick && stake ? (parseFloat(stake) * curOdds).toFixed(2) : null;
    return (
      <Card>
        <CardHead label={`Prediction Market — ${pred.league || pred.sport || "Match"}`} onClose={() => setShowPred(false)} />
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:T.bg, borderRadius:8, padding:"12px 10px", marginBottom:10, border:`1px solid ${T.border}` }}>
          {[{ name:pred.teamA, odds:ODDS.teamA }, { name:"Draw", odds:ODDS.draw, dim:true }, { name:pred.teamB, odds:ODDS.teamB }].map(({ name, odds, dim }) => (
            <div key={name} style={{ textAlign:"center", flex:1 }}>
              <div style={{ fontSize:dim?11:14, fontWeight:dim?400:700, color:dim?T.text3:T.text1, fontFamily:T.body, marginBottom:4 }}>{name}</div>
              <div style={{ fontFamily:T.mono, fontSize:18, fontWeight:700, color:dim?T.text2:T.accent }}>{odds}x</div>
            </div>
          ))}
        </div>
        {pred.analysis && (
          <div style={{ background:T.accentBg, border:`1px solid ${T.accent}30`, borderRadius:8, padding:12, marginBottom:10 }}>
            <div style={{ fontSize:10, color:T.accent, textTransform:"uppercase", letterSpacing:1.2, marginBottom:6, fontFamily:T.body, fontWeight:600 }}>AI Analysis</div>
            <p style={{ fontSize:13.5, color:T.text2, lineHeight:1.65, fontFamily:T.serif }}>{pred.analysis}</p>
          </div>
        )}
        <div style={{ display:"flex", gap:6, marginBottom:12 }}>
          {[pred.teamA,"Draw",pred.teamB].map(opt => (
            <button key={opt} className="hov-pick" onClick={() => setPick(opt)} style={{ flex:1, padding:"9px 4px", borderRadius:8, cursor:"pointer", border:pick===opt ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`, background:pick===opt ? T.accentBg : T.bg, color:pick===opt ? T.accent : T.text2, fontSize:12, fontWeight:pick===opt?600:400, fontFamily:T.body }}>{opt}</button>
          ))}
        </div>
        <Field label="Stake amount (USDC)" right={potWin ? `→ $${potWin} potential` : null}>
          <input type="number" value={stake} onChange={e => setStake(e.target.value)}
            style={{ background:"transparent", border:"none", outline:"none", fontSize:18, fontFamily:T.mono, fontWeight:600, color:T.text1, width:"100%" }} />
        </Field>
        <div style={{ marginTop:8 }}>
          <BigBtn onClick={doPred} disabled={!pick||!stake} color={T.purple}>Place Prediction</BigBtn>
        </div>
        <p style={{ fontSize:11, color:T.text3, textAlign:"center", marginTop:8, fontFamily:T.body }}>Powered by Jupiter Prediction Markets · Binary markets on Solana</p>
      </Card>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", background:T.bg, fontFamily:T.body, overflow:"hidden", position:"relative" }}>

      {/* Sidebar */}
      <div style={{ width:sidebarOpen?256:0, flexShrink:0, background:T.sidebar, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", overflow:"hidden", transition:"width 0.22s ease" }}>
        <div style={{ padding:"14px 14px 10px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#d97931,#c4562a)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", fontWeight:700 }}>C</div>
            <span style={{ fontSize:15, fontWeight:600, color:T.text1, letterSpacing:-0.1 }}>ChatFi</span>
            <span style={{ fontSize:10, color:T.text3, background:T.border, borderRadius:4, padding:"1px 6px", marginLeft:"auto" }}>ChatFi</span>
          </div>

          {wallet ? (
            <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:T.greenBg, borderRadius:8, border:`1px solid ${T.greenBd}` }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:T.green, boxShadow:`0 0 4px ${T.green}` }} />
              <span style={{ fontSize:12, fontFamily:T.mono, color:T.green, flex:1 }}>{wallet}</span>
              <span style={{ fontSize:10, color:T.green, cursor:"pointer", fontFamily:T.body }} onClick={() => { setWallet(null); setWalletFull(null); setPortfolio({}); }}>✕</span>
            </div>
          ) : (
            <button className="hov-btn" onClick={() => connectWallet(null)} style={{ width:"100%", padding:"9px 14px", borderRadius:8, background:T.accent, border:"none", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:T.body, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <span style={{ fontSize:15 }}>◎</span> Connect Wallet
            </button>
          )}
        </div>

        {/* Live prices */}
        {Object.keys(prices).length > 0 && (
          <div style={{ padding:"10px 14px", borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.text3, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, fontWeight:600 }}>Live Prices</div>
            {Object.entries(prices).map(([sym, p]) => (
              <div key={sym} className="hov-row" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"3px 4px", borderRadius:5, cursor:"pointer" }}
                onClick={() => { setInput(`What's the ${sym} price?`); inputRef.current?.focus(); }}>
                <span style={{ fontSize:12.5, color:T.text2, fontFamily:T.body }}>{sym}</span>
                <span style={{ fontSize:12, fontFamily:T.mono, color:T.green }}>${p < 0.01 ? p.toFixed(6) : p.toFixed(3)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Portfolio */}
        {Object.keys(portfolio).length > 0 && (
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.text3, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, fontWeight:600 }}>Portfolio</div>
            {Object.entries(portfolio).map(([sym, bal]) => (
              <div key={sym} style={{ display:"flex", justifyContent:"space-between", padding:"2px 0" }}>
                <span style={{ fontSize:12, color:T.text2, fontFamily:T.body }}>{sym}</span>
                <span style={{ fontSize:12, fontFamily:T.mono, color:T.text2 }}>{bal < 0.001 ? bal.toFixed(6) : bal.toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Chat History */}
        <div style={{ flex:1, overflowY:"auto", padding:"10px 8px" }}>
          <div style={{ fontSize:10, color:T.text3, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600, padding:"0 6px", marginBottom:6 }}>Today</div>
          {chatHistory.map(c => (
            <div key={c.id} className="hov-row" style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, cursor:"pointer", background: c.active ? T.border : "transparent" }}
              onClick={() => setChatHistory(h => h.map(x => ({ ...x, active: x.id === c.id })))}>
              <span style={{ fontSize:13, color: c.active ? T.text1 : T.text2, fontFamily:T.body, flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.title}</span>
            </div>
          ))}
          <button className="hov-btn" onClick={() => {
            const id = Date.now().toString();
            setChatHistory(h => [...h.map(x => ({ ...x, active:false })), { id, title:"New conversation", active:true }]);
            setMsgs([{ id:1, role:"ai", text:"Good morning! I'm ChatFi, your AI trading assistant built on Jupiter DEX.\n\nWhat would you like to do?" }]);
            histRef.current = [];
          }} style={{ width:"100%", marginTop:10, padding:"8px", borderRadius:8, border:`1px dashed ${T.border}`, background:"transparent", color:T.text3, fontSize:12, cursor:"pointer", fontFamily:T.body, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
            + New chat
          </button>
        </div>
        <div style={{ padding:"12px 14px", borderTop:`1px solid ${T.border}`, fontSize:11, color:T.text3 }}>
          Powered by Jupiter DEX · Solana
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0, width:0 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderBottom:`1px solid ${T.border}`, background:T.bg, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button className="hov-btn" onClick={() => setSidebarOpen(o => !o)} style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:18, color:T.text2, padding:"2px 4px", lineHeight:1 }}>☰</button>
            <span style={{ fontSize:15, fontWeight:600, color:T.text1 }}>ChatFi</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {!sidebarOpen && Object.entries(prices).slice(0,3).map(([sym, p]) => (
              <span key={sym} style={{ fontSize:11, fontFamily:T.mono, color:T.green, background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:5, padding:"2px 7px" }}>
                {sym} ${p < 0.01 ? p.toFixed(4) : p.toFixed(2)}
              </span>
            ))}
            {!wallet ? (
              <button className="hov-btn" onClick={() => connectWallet(null)} style={{ background:T.accent, color:"#fff", border:"none", borderRadius:8, padding:"7px 14px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:T.body }}>Connect Wallet</button>
            ) : (
              <div style={{ display:"flex", alignItems:"center", gap:6, background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:20, padding:"5px 12px" }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:T.green }} />
                <span style={{ fontSize:12, fontFamily:T.mono, color:T.green }}>{wallet}</span>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"28px 0" }}>
          <div style={{ maxWidth:720, margin:"0 auto", padding:"0 20px", display:"flex", flexDirection:"column", gap:24 }}>
            {msgs.map(m => (
              <div key={m.id} className="msg-enter" style={{ display:"flex", gap:14, flexDirection:m.role==="user"?"row-reverse":"row", alignItems:"flex-start" }}>
                {m.role === "ai" ? <JupAvatar /> : <UserAvatar />}
                <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4, alignItems:m.role==="user"?"flex-end":"flex-start", minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:T.text3, fontFamily:T.body, marginBottom:2 }}>
                    {m.role === "ai" ? "ChatFi" : "You"}
                  </div>
                  <div style={{ background:m.role==="user"?T.surface:"transparent", border:m.role==="user"?`1px solid ${T.border}`:"none", borderRadius:m.role==="user"?"14px 14px 4px 14px":0, padding:m.role==="user"?"10px 14px":0, fontSize:15.5, lineHeight:1.72, color:T.text1, fontFamily:T.serif, maxWidth:m.role==="user"?"85%":"100%" }}>
                    <div dangerouslySetInnerHTML={{ __html: fmt(m.text) }} />

                    {/* Price tags */}
                    {m.priceTokens?.length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:12 }}>
                        {m.priceTokens.map(t => (
                          <span key={t} style={{ display:"inline-flex", alignItems:"center", gap:5, background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:6, padding:"3px 10px", fontFamily:T.mono, fontSize:13, color:T.green }}>
                            {t} <strong>${m.livePrices[t] < 0.01 ? m.livePrices[t].toFixed(6) : m.livePrices[t].toFixed(4)}</strong>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Connect button */}
                    {m.showConnect && (
                      <button className="hov-btn" onClick={() => connectWallet(m.pendingSwap)} style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:12, background:T.accent, color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:T.body }}>
                        <span style={{ fontSize:15 }}>◎</span> Connect Wallet
                      </button>
                    )}
                  </div>

                  {/* Panels attached to last AI message */}
                  {m.role === "ai" && m.id === lastAiId && showSwap && <SwapPanel />}
                  {m.role === "ai" && m.id === lastAiId && showTrig && <TriggerPanel />}
                  {m.role === "ai" && m.id === lastAiId && showPred && <PredPanel />}
                  {m.tokenInfo !== undefined && m.id === lastAiId && <TokenInfoCard info={m.tokenInfo} sym={m.tokenSym} />}
                </div>
              </div>
            ))}

            {typing && (
              <div className="msg-enter" style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                <JupAvatar />
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:T.text3, fontFamily:T.body }}>ChatFi</div>
                  <div style={{ display:"flex", gap:5, padding:"6px 0" }}>
                    <span className="dot1" /><span className="dot2" /><span className="dot3" />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Input area */}
        <div style={{ padding:"0 0 16px", background:T.bg, borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
          <div style={{ maxWidth:720, margin:"0 auto", padding:"12px 20px 0" }}>
            <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:10, scrollbarWidth:"none" }}>
              {SUGGESTIONS.map(s => (
                <button key={s} className="hov-sugg" onClick={() => { setInput(s); inputRef.current?.focus(); }} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:"5px 13px", fontSize:12.5, color:T.text2, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, fontFamily:T.body }}>{s}</button>
              ))}
            </div>
            <div style={{ background:T.surface, border:`1.5px solid ${T.border}`, borderRadius:14, padding:"12px 14px", display:"flex", alignItems:"flex-end", gap:10, boxShadow:"0 2px 8px rgba(100,80,40,0.06)" }}>
              <textarea
                ref={r => { inputRef.current = r; textareaRef.current = r; }}
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Message ChatFi…" rows={1}
                style={{ flex:1, background:"transparent", border:"none", outline:"none", color:T.text1, fontSize:15.5, fontFamily:T.serif, lineHeight:1.65, minHeight:26, maxHeight:160, overflowY:"auto" }}
              />
              <button className="send-btn" onClick={send} disabled={!input.trim()||typing} style={{ width:36, height:36, borderRadius:9, border:"none", flexShrink:0, background:input.trim()&&!typing?T.accent:T.border, color:input.trim()&&!typing?"#fff":T.text3, fontSize:18, cursor:input.trim()&&!typing?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.15s" }}>↑</button>
            </div>
            <p style={{ textAlign:"center", fontSize:11.5, color:T.text3, marginTop:8, fontFamily:T.body }}>ChatFi can make mistakes. Verify prices before trading.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
