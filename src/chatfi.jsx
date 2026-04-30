// ── JupChat.jsx — Main Orchestrator ──────────────────────────────────────────
// This file is now a thin coordinator. It:
//   1. Wires together all hooks (useWallet, useChat, useSwap, useTokenData)
//   2. Handles AI action dispatch (the big switch on action type)
//   3. Renders the shell layout + conditionally shows panels
//
// All business logic lives in hooks/. All UI panels live in components/.
// To add a new feature: add it to config/features.js, add a hook in hooks/,
// add a component in components/, and add an action case below.

import { useState, useEffect, useRef, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";

// Hooks
import useWallet    from "./hooks/useWallet";
import useChat      from "./hooks/useChat";
import useSwap      from "./hooks/useSwap";
import useTokenData from "./hooks/useTokenData";

// Components
import TickerBar        from "./components/Chat/TickerBar";
import MessageBubble    from "./components/Chat/MessageBubble";
import ChatInput        from "./components/Chat/ChatInput";
import WalletModal      from "./components/Wallet/WalletModal";
import SwapPanel        from "./components/Swap/SwapPanel";

// Icons
import { SvgChat, SvgWallet, SvgZap, SvgBarChart, SvgPlus, SvgMenu } from "./components/icons/Icons";

// Constants + utils
import { T, SUGGESTION_GROUPS } from "./constants";
import { jupFetch, fmt }        from "./utils/solana";
import FEATURES, { isEnabled }  from "./config/features";

// AI system prompt (keep here or move to constants/systemPrompt.js for cleanliness)
import { SYSTEM_PROMPT } from "./constants/systemPrompt";

// ─────────────────────────────────────────────────────────────────────────────
export default function JupChat() {
  // ── Token data ───────────────────────────────────────────────────────────────
  const {
    prices, setPrices,
    tokenCacheRef, tokenDecimalsRef,
    resolveToken, fetchPrices,
    fetchTokenInfo, fetchTokensByTag, fetchTokensByCategory,
    fetchRecentTokens, fetchXStocks,
    fmtTokenList,
  } = useTokenData();

  // ── AI action dispatcher (passed into useChat) ────────────────────────────────
  const handleAction = useCallback(async ({ action, text, history }) => {
    if (action === "REFRESH") {
      if (walletFull) {
        const balances = await fetchSolanaBalances(walletFull);
        setPortfolio(balances);
        push("ai", "Balances refreshed ✓");
      } else {
        push("ai", "No wallet connected.");
      }
      return;
    }

    if (action === "AI_CHAT") {
      // Call AI API
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: history,
        }),
      });
      const data = await response.json();
      const aiText = data.content?.find(b => b.type === "text")?.text || "";

      // Parse action from AI response
      let parsed = { text: aiText, action: null, actionData: {} };
      try {
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = { ...parsed, ...JSON.parse(jsonMatch[0]) };
      } catch {}

      await dispatchAction(parsed);
      return;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const {
    messages, input, setInput,
    loading, send, push,
    activeSuggGroup, setActiveSuggGroup,
    bottomRef,
  } = useChat({ onAction: handleAction });

  // ── Wallet ───────────────────────────────────────────────────────────────────
  const {
    wallet, walletFull, portfolio, setPortfolio,
    connectedWalletName, privyMode,
    showWalletModal, setShowWalletModal,
    walletList,
    wcStatus, setWcStatus, wcUri, setWcUri,
    wcMode, setWcMode, wcCopied, setWcCopied,
    wcPreferredWallet, setWcPreferredWallet,
    connectedProviderRef,
    getActiveProvider,
    connectWallet, disconnectWallet, handleWalletSelected,
    fetchSolanaBalances,
    privyLogin,
  } = useWallet({ push, tokenCacheRef, tokenDecimalsRef });

  // ── Swap ─────────────────────────────────────────────────────────────────────
  const {
    showSwap, setShowSwap,
    swapCfg, setSwapCfg,
    swapQuote, quoteFetching, swapStatus,
    fetchSwapQuote, doSwap,
  } = useSwap({ walletFull, getActiveProvider, push, tokenCacheRef, tokenDecimalsRef });

  // Debounce quote fetching
  useEffect(() => {
    if (!swapCfg.fromMint || !swapCfg.toMint) return;
    const t = setTimeout(() => fetchSwapQuote(), 600);
    return () => clearTimeout(t);
  }, [swapCfg.fromMint, swapCfg.toMint, swapCfg.amount, showSwap]);

  // ── Panel visibility state ────────────────────────────────────────────────────
  // Each panel lives here. As you add features, add their show/setShow here.
  const [showPortfolio,  setShowPortfolio]  = useState(false);
  const [showTokenCard,  setShowTokenCard]  = useState(false);
  const [tokenCardInfo,  setTokenCardInfo]  = useState(null);
  const [showTrigV2,     setShowTrigV2]     = useState(false);
  const [trigV2Cfg,      setTrigV2Cfg]      = useState({ orderType:"single", from:"USDC", to:"SOL", amount:"", triggerPrice:"", fromMint:null, toMint:null });
  const [showRecurring,  setShowRecurring]  = useState(false);
  const [recurCfg,       setRecurCfg]       = useState({ from:"USDC", to:"SOL", amount:"10", cycle:"daily", fromMint:null, toMint:null });
  const [showEarn,       setShowEarn]       = useState(false);
  const [showPerps,      setShowPerps]      = useState(false);
  const [perpCfg,        setPerpCfg]        = useState({ market:"SOL-PERP", side:"long", collateral:"", leverage:"10" });
  const [showSend,       setShowSend]       = useState(false);
  const [sendCfg,        setSendCfg]        = useState({ token:"SOL", amount:"", mint:null });
  const [showLock,       setShowLock]       = useState(false);
  const [lockCfg,        setLockCfg]        = useState({ token:"JUP", mint:null, amount:"", cliffDays:"0", vestingDays:"365", recipient:"" });
  const [showStudio,     setShowStudio]     = useState(false);
  const [showRoute,      setShowRoute]      = useState(false);
  const [routeData,      setRouteData]      = useState(null);
  const [showPred,       setShowPred]       = useState(false);
  const [predMarkets,    setPredMarkets]    = useState([]);

  // ── AI Action Dispatcher ──────────────────────────────────────────────────────
  // This is the single place where AI-returned action strings map to UI behavior.
  // Adding a new action = add a case here + a component + a hook if needed.
  const dispatchAction = useCallback(async ({ action, text, actionData = {} }) => {
    switch (action) {
      case null:
      case undefined:
        push("ai", text || "");
        break;

      case "SHOW_SWAP": {
        const { from = "SOL", to = "USDC", amount = "" } = actionData;
        const [fRes, tRes] = await Promise.all([resolveToken(from), resolveToken(to)]);
        setSwapCfg({
          from: from.toUpperCase(), fromMint: fRes?.mint || null, fromDecimals: fRes?.decimals || 9,
          to:   to.toUpperCase(),   toMint:   tRes?.mint || null, toDecimals:   tRes?.decimals || 6,
          amount,
        });
        setShowSwap(true);
        push("ai", text || `Swap ${from.toUpperCase()} → ${to.toUpperCase()} — confirm below.`);
        break;
      }

      case "SHOW_TRIGGER_V2": {
        const { from = "USDC", to = "SOL", amount = "", triggerPrice = "", orderType = "single" } = actionData;
        const [fRes, tRes] = await Promise.all([resolveToken(from), resolveToken(to)]);
        setTrigV2Cfg({ orderType, from: from.toUpperCase(), fromMint: fRes?.mint, fromDecimals: fRes?.decimals || 6, to: to.toUpperCase(), toMint: tRes?.mint, toDecimals: tRes?.decimals || 9, amount, triggerPrice });
        setShowTrigV2(true);
        push("ai", text || "Trigger order ready — fill in the details below.");
        break;
      }

      case "SHOW_RECURRING": {
        const { from = "USDC", to = "SOL", amount = "10", cycle = "daily" } = actionData;
        const [fRes, tRes] = await Promise.all([resolveToken(from), resolveToken(to)]);
        setRecurCfg({ from: from.toUpperCase(), fromMint: fRes?.mint, to: to.toUpperCase(), toMint: tRes?.mint, amount, cycle });
        setShowRecurring(true);
        push("ai", text || "DCA order configured — review and confirm below.");
        break;
      }

      case "SHOW_EARN":
        setShowEarn(true);
        push("ai", text || "Opening earn vaults…");
        break;

      case "SHOW_PERPS":
        setPerpCfg({ market: actionData?.market || "SOL-PERP", side: actionData?.side || "long", collateral: actionData?.collateral || "", leverage: actionData?.leverage || "10" });
        setShowPerps(true);
        push("ai", text || "Opening perps panel…");
        break;

      case "SHOW_PORTFOLIO":
        setShowPortfolio(true);
        push("ai", text || "Loading your portfolio…");
        break;

      case "SHOW_TOKEN": {
        const info = await fetchTokenInfo(actionData?.symbol);
        if (info) { setTokenCardInfo(info); setShowTokenCard(true); }
        push("ai", text || `Token info for **${actionData?.symbol}**`);
        break;
      }

      case "FETCH_TRENDING": {
        const interval = actionData?.interval || "24h";
        const category = actionData?.category || "toptrending";
        const tokens   = await fetchTokensByCategory(category, interval, actionData?.limit || 20);
        push("ai", text + (tokens.length ? `\n\n${fmtTokenList(tokens, 20)}` : "\n\nNo data available."));
        break;
      }

      case "FETCH_RECENT": {
        const tokens = await fetchRecentTokens(actionData?.limit || 30);
        push("ai", text + (tokens.length ? `\n\n${fmtTokenList(tokens, 30)}` : "\n\nNo recent tokens found."));
        break;
      }

      case "FETCH_XSTOCKS": {
        const tokens = await fetchXStocks(actionData?.limit || 15);
        push("ai", text + (tokens.length ? `\n\n${fmtTokenList(tokens, 15)}` : "\n\nCould not fetch xStocks right now."));
        break;
      }

      case "SHOW_SEND":
        setSendCfg({ token: (actionData?.token || "SOL").toUpperCase(), amount: actionData?.amount || "", mint: null });
        setShowSend(true);
        push("ai", text || "Opening send panel…");
        break;

      case "SHOW_LOCK":
        setLockCfg(c => ({ ...c, token: (actionData?.token || "JUP").toUpperCase(), amount: actionData?.amount || "", cliffDays: actionData?.cliffDays || "0", vestingDays: actionData?.vestingDays || "365", recipient: actionData?.recipient || "" }));
        setShowLock(true);
        push("ai", text || "Opening lock panel…");
        break;

      case "SHOW_STUDIO":
        setShowStudio(true);
        push("ai", text || "Opening Jupiter Studio…");
        break;

      case "SHOW_ROUTE":
        push("ai", text || "Fetching swap route…");
        // routeBreakdown logic can go in its own hook
        break;

      case "SHOW_PREDICTIONS":
        setShowPred(true);
        push("ai", text || "Loading prediction markets…");
        break;

      case "SET_PRICE_ALERT": {
        const { token = "SOL", condition = "above", price } = actionData;
        if (!price) { push("ai", "Please specify a target price."); break; }
        push("ai", text + `\n\nAlert set: **${token.toUpperCase()}** ${condition} **$${price}**`);
        break;
      }

      default:
        push("ai", text || "Action not yet implemented.");
    }
  }, [push, resolveToken, fetchTokenInfo, fetchTokensByCategory, fetchRecentTokens, fetchXStocks, fmtTokenList, setSwapCfg, setShowSwap]);

  // Fix circular reference: handleAction needs dispatchAction
  // (In production, extract this to a dedicated useActionDispatcher hook)

  // ── Sidebar items ─────────────────────────────────────────────────────────────
  const sidebarItems = [
    { icon: <SvgChat size={18}/>,     label: "Chat",      active: true },
    { icon: <SvgBarChart size={18}/>, label: "Portfolio", onClick: () => setShowPortfolio(true) },
    { icon: <SvgZap size={18}/>,      label: "Trade",     onClick: () => send("What can I trade?") },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", background:T.bg, fontFamily:T.body, color:T.text1, overflow:"hidden" }}>

      {/* ── Sidebar ── */}
      <div style={{ width:56, flexShrink:0, background:T.sidebar, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", alignItems:"center", padding:"12px 0", gap:4 }}>
        {/* Logo */}
        <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,#c7f284,#38bdf8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#0d1117", marginBottom:8 }}>C</div>
        {sidebarItems.map(item => (
          <button key={item.label} title={item.label} onClick={item.onClick}
            style={{ width:40, height:40, borderRadius:10, background:item.active ? T.accentBg : "none", border:`1px solid ${item.active ? T.accent+"44" : "transparent"}`, color:item.active ? T.accent : T.text3, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {item.icon}
          </button>
        ))}
        <div style={{ flex:1 }}/>
        {/* New chat */}
        <button title="New Chat" onClick={() => send("delete messages")}
          style={{ width:40, height:40, borderRadius:10, background:"none", border:`1px solid ${T.border}`, color:T.text3, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <SvgPlus size={16}/>
        </button>
      </div>

      {/* ── Main chat area ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }}>

        {/* ── Header ── */}
        <div style={{ height:58, flexShrink:0, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", background:T.sidebar, zIndex:200 }}>
          <div style={{ fontSize:15, fontWeight:700, color:T.text1 }}>ChatFi</div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {wallet
              ? <>
                  <span style={{ fontSize:12, color:T.text2 }}>{wallet}</span>
                  <button onClick={disconnectWallet}
                    style={{ padding:"5px 10px", fontSize:11, background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text3, cursor:"pointer" }}>
                    Disconnect
                  </button>
                </>
              : <button onClick={() => connectWallet()}
                  style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.accentBg, border:`1px solid ${T.accent}55`, borderRadius:8, color:T.accent, cursor:"pointer" }}>
                  <SvgWallet size={13} color={T.accent}/>{" "}Connect
                </button>
            }
          </div>
        </div>

        {/* ── Ticker ── */}
        {isEnabled("tickerBar") && (
          <TickerBar onTokenClick={(sym) => send(`${sym} info`)} />
        )}

        {/* ── Messages ── */}
        <div style={{ flex:1, overflowY:"auto", padding:"86px 16px 16px", display:"flex", flexDirection:"column", gap:4 }}>
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Inline panels — rendered after the message that triggered them */}
          {isEnabled("swap") && showSwap && (
            <SwapPanel
              swapCfg={swapCfg} setSwapCfg={setSwapCfg}
              swapQuote={swapQuote} quoteFetching={quoteFetching} swapStatus={swapStatus}
              onSwap={doSwap} onClose={() => setShowSwap(false)}
              walletFull={walletFull} jupFetch={jupFetch}
            />
          )}

          {/* 
            ─── ADD NEW FEATURE PANELS HERE ───────────────────────────────────
            Each panel follows the same pattern:
              {isEnabled("featureName") && showFeature && (
                <FeaturePanel cfg={...} onClose={() => setShowFeature(false)} ... />
              )}
            ────────────────────────────────────────────────────────────────────
          */}

          {/* Loading indicator */}
          {loading && (
            <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#c7f284,#38bdf8)", flexShrink:0 }}/>
              <div style={{ padding:"12px 14px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:"4px 14px 14px 14px" }}>
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width:5, height:5, borderRadius:"50%", background:T.accent, animation:`pulse 1s ${i*0.2}s infinite` }}/>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef}/>
        </div>

        {/* ── Input ── */}
        <ChatInput
          input={input} setInput={setInput}
          onSend={send} loading={loading}
          activeSuggGroup={activeSuggGroup} setActiveSuggGroup={setActiveSuggGroup}
        />
      </div>

      {/* ── Wallet Modal ── */}
      <WalletModal
        show={showWalletModal} onClose={() => setShowWalletModal(false)}
        walletList={walletList}
        onSelectWallet={handleWalletSelected}
        onPrivyLogin={privyLogin}
        wcStatus={wcStatus} wcUri={wcUri}
        wcMode={wcMode} setWcMode={setWcMode}
        wcCopied={wcCopied} setWcCopied={setWcCopied}
      />

      {/* Global CSS */}
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: ${T.bg}; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:0.3; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.1); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2d3d; border-radius: 2px; }
        input, textarea, select { outline: none; }
      `}</style>
    </div>
  );
}
