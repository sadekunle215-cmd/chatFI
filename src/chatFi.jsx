// ── chatFi.jsx — Main Orchestrator ───────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";

// Hooks
import useWallet    from "./hooks/useWallet";
import useChat      from "./hooks/useChat";
import useSwap      from "./hooks/useSwap";
import useTokenData from "./hooks/useTokenData";

// Components — all flat in components/
import TickerBar        from "./components/TickerBar";
import MessageBubble    from "./components/MessageBubble";
import ChatInput        from "./components/ChatInput";
import WalletModal      from "./components/WalletModal";
import SwapPanel        from "./components/SwapPanel";
import PortfolioPanel   from "./components/PortfolioPanel";
import TokenCard        from "./components/TokenCard";
import TriggerOrderPanel from "./components/TriggerOrderPanel";
import RecurringPanel   from "./components/RecurringPanel";
import BlogPanel        from "./components/BlogPanel";

// Icons — flat in components/
import { SvgChat, SvgWallet, SvgZap, SvgBarChart, SvgPlus, SvgBlog } from "./components/Icons";

// Constants + utils
import { T, SUGGESTION_GROUPS } from "./constants";
import { jupFetch, fmt }        from "./utils/solana";
import FEATURES, { isEnabled }  from "./config/features";
import { SYSTEM_PROMPT }        from "./constants/systemPrompt";

// ─────────────────────────────────────────────────────────────────────────────
export default function ChatFi() {

  // ── Token data ───────────────────────────────────────────────────────────────
  const {
    tokenCacheRef, tokenDecimalsRef,
    resolveToken,
    fetchTokenInfo, fetchTokensByCategory,
    fetchRecentTokens, fetchXStocks,
    fmtTokenList,
  } = useTokenData();

  // ── Panel state ───────────────────────────────────────────────────────────────
  const [showPortfolio,  setShowPortfolio]  = useState(false);
  const [showTokenCard,  setShowTokenCard]  = useState(false);
  const [tokenCardInfo,  setTokenCardInfo]  = useState(null);
  const [showTrigV2,     setShowTrigV2]     = useState(false);
  const [trigV2Cfg,      setTrigV2Cfg]      = useState({ orderType:"single", from:"USDC", to:"SOL", amount:"", triggerPrice:"", tpPrice:"", slPrice:"", fromMint:null, toMint:null, fromDecimals:6, toDecimals:9 });
  const [showRecurring,  setShowRecurring]  = useState(false);
  const [recurCfg,       setRecurCfg]       = useState({ from:"USDC", to:"SOL", amount:"10", cycle:"daily", numberOfOrders:"30", fromMint:null, toMint:null, fromDecimals:6 });
  const [showBlog,       setShowBlog]       = useState(false);

  // ── AI Action Dispatcher ──────────────────────────────────────────────────────
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
        const { from = "USDC", to = "SOL", amount = "", triggerPrice = "", orderType = "single", tpPrice = "", slPrice = "" } = actionData;
        const [fRes, tRes] = await Promise.all([resolveToken(from), resolveToken(to)]);
        setTrigV2Cfg({ orderType, from: from.toUpperCase(), fromMint: fRes?.mint, fromDecimals: fRes?.decimals || 6, to: to.toUpperCase(), toMint: tRes?.mint, toDecimals: tRes?.decimals || 9, amount, triggerPrice, tpPrice, slPrice });
        setShowTrigV2(true);
        push("ai", text || "Trigger order ready — fill in the details below.");
        break;
      }

      case "SHOW_RECURRING": {
        const { from = "USDC", to = "SOL", amount = "10", cycle = "daily" } = actionData;
        const [fRes, tRes] = await Promise.all([resolveToken(from), resolveToken(to)]);
        setRecurCfg(c => ({ ...c, from: from.toUpperCase(), fromMint: fRes?.mint, fromDecimals: fRes?.decimals || 6, to: to.toUpperCase(), toMint: tRes?.mint, amount, cycle }));
        setShowRecurring(true);
        push("ai", text || "DCA order configured — review and confirm below.");
        break;
      }

      case "SHOW_PORTFOLIO":
        setShowPortfolio(true);
        push("ai", text || "Loading your portfolio…");
        break;

      case "SHOW_TOKEN": {
        push("ai", text || `Looking up **${actionData?.symbol}**…`);
        const info = await fetchTokenInfo(actionData?.symbol);
        if (info) { setTokenCardInfo(info); setShowTokenCard(true); }
        else push("ai", `Could not find token info for **${actionData?.symbol}**.`);
        break;
      }

      case "FETCH_TRENDING": {
        const tokens = await fetchTokensByCategory(
          actionData?.category || "toptrending",
          actionData?.interval || "24h",
          actionData?.limit    || 20
        );
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

      case "SET_PRICE_ALERT": {
        const { token = "SOL", condition = "above", price } = actionData;
        if (!price) { push("ai", "Please specify a target price."); break; }
        push("ai", `${text || ""}\n\nAlert set: **${token.toUpperCase()}** ${condition} **$${price}**`);
        break;
      }

      default:
        push("ai", text || "Action not yet implemented.");
    }
  }, []); // deps filled after hooks are declared below

  // ── handleAction — called by useChat for every message ───────────────────────
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
      try {
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
        const data    = await response.json();
        const aiText  = data.content?.find(b => b.type === "text")?.text || "";
        let parsed    = { text: aiText, action: null, actionData: {} };
        try {
          const m = aiText.match(/\{[\s\S]*?\}/);
          if (m) parsed = { ...parsed, ...JSON.parse(m[0]) };
        } catch {}
        await dispatchAction(parsed);
      } catch (err) {
        push("ai", `Error: ${err?.message || "Something went wrong."}`);
      }
    }
  }, [dispatchAction]); // eslint-disable-line

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
    showWalletModal, setShowWalletModal,
    walletList,
    wcStatus, wcUri, wcMode, setWcMode, wcCopied, setWcCopied,
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

  // Debounce swap quote
  useEffect(() => {
    if (!swapCfg.fromMint || !swapCfg.toMint || !swapCfg.amount) return;
    const t = setTimeout(fetchSwapQuote, 600);
    return () => clearTimeout(t);
  }, [swapCfg.fromMint, swapCfg.toMint, swapCfg.amount]);

  // ── Sidebar ───────────────────────────────────────────────────────────────────
  const sidebarItems = [
    { icon: <SvgChat size={18}/>,     label: "Chat",      active: true,  onClick: null },
    { icon: <SvgBarChart size={18}/>, label: "Portfolio", active: false, onClick: () => setShowPortfolio(true) },
    { icon: <SvgZap size={18}/>,      label: "Trade",     active: false, onClick: () => send("What can I trade?") },
    { icon: <SvgBlog size={18}/>,     label: "Blog",      active: false, onClick: () => setShowBlog(true) },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", background:T.bg, fontFamily:T.body, color:T.text1, overflow:"hidden" }}>

      {/* ── Sidebar ── */}
      <div style={{ width:56, flexShrink:0, background:T.sidebar, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", alignItems:"center", padding:"12px 0", gap:4 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,#c7f284,#38bdf8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#0d1117", marginBottom:8 }}>C</div>
        {sidebarItems.map(item => (
          <button key={item.label} title={item.label} onClick={item.onClick}
            style={{ width:40, height:40, borderRadius:10, background:item.active ? T.accentBg : "none", border:`1px solid ${item.active ? T.accent+"44" : "transparent"}`, color:item.active ? T.accent : T.text3, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {item.icon}
          </button>
        ))}
        <div style={{ flex:1 }}/>
        <button title="New Chat" onClick={() => { send("delete messages"); }}
          style={{ width:40, height:40, borderRadius:10, background:"none", border:`1px solid ${T.border}`, color:T.text3, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <SvgPlus size={16}/>
        </button>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ height:58, flexShrink:0, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", background:T.sidebar, zIndex:200 }}>
          <div style={{ fontSize:15, fontWeight:700, color:T.text1 }}>ChatFi</div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {wallet
              ? <>
                  <span style={{ fontSize:12, color:T.text2 }}>{wallet}</span>
                  <button onClick={disconnectWallet} style={{ padding:"5px 10px", fontSize:11, background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text3, cursor:"pointer" }}>Disconnect</button>
                </>
              : <button onClick={() => connectWallet()} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.accentBg, border:`1px solid ${T.accent}55`, borderRadius:8, color:T.accent, cursor:"pointer" }}>
                  Connect
                </button>
            }
          </div>
        </div>

        {/* Ticker */}
        {isEnabled("tickerBar") && <TickerBar onTokenClick={(sym) => send(`${sym} info`)} />}

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"86px 16px 16px", display:"flex", flexDirection:"column", gap:4 }}>
          {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}

          {/* ── Inline panels ── */}
          {isEnabled("swap") && showSwap && (
            <SwapPanel swapCfg={swapCfg} setSwapCfg={setSwapCfg} swapQuote={swapQuote} quoteFetching={quoteFetching} swapStatus={swapStatus} onSwap={doSwap} onClose={() => setShowSwap(false)} walletFull={walletFull} jupFetch={jupFetch} />
          )}
          {isEnabled("limitOrders") && showTrigV2 && (
            <TriggerOrderPanel show={showTrigV2} onClose={() => setShowTrigV2(false)} cfg={trigV2Cfg} setCfg={setTrigV2Cfg} walletFull={walletFull} getActiveProvider={getActiveProvider} push={push} />
          )}
          {isEnabled("dcaRecurring") && showRecurring && (
            <RecurringPanel show={showRecurring} onClose={() => setShowRecurring(false)} cfg={recurCfg} setCfg={setRecurCfg} walletFull={walletFull} getActiveProvider={getActiveProvider} push={push} />
          )}

          {/* ── ADD NEW FEATURE PANELS HERE ── */}

          {/* Loading dots */}
          {loading && (
            <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#c7f284,#38bdf8)", flexShrink:0 }}/>
              <div style={{ padding:"12px 14px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:"4px 14px 14px 14px" }}>
                <div style={{ display:"flex", gap:4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:5, height:5, borderRadius:"50%", background:T.accent, animation:`pulse 1s ${i*0.2}s infinite` }}/>)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <ChatInput input={input} setInput={setInput} onSend={send} loading={loading} activeSuggGroup={activeSuggGroup} setActiveSuggGroup={setActiveSuggGroup} />
      </div>

      {/* ── Modals / sheets ── */}
      <WalletModal show={showWalletModal} onClose={() => setShowWalletModal(false)} walletList={walletList} onSelectWallet={handleWalletSelected} onPrivyLogin={privyLogin} wcStatus={wcStatus} wcUri={wcUri} wcMode={wcMode} setWcMode={setWcMode} wcCopied={wcCopied} setWcCopied={setWcCopied} />
      {isEnabled("portfolio")  && <PortfolioPanel show={showPortfolio} onClose={() => setShowPortfolio(false)} walletFull={walletFull} portfolio={portfolio} onSend={send} />}
      {isEnabled("tokenCard")  && <TokenCard show={showTokenCard} onClose={() => setShowTokenCard(false)} info={tokenCardInfo} onSend={send} />}
      {isEnabled("blogPosts")  && <BlogPanel show={showBlog} onClose={() => setShowBlog(false)} />}

      {/* Global CSS */}
      <style>{`
        * { box-sizing:border-box; }
        body { margin:0; padding:0; background:${T.bg}; }
        @keyframes spin  { to { transform:rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#1e2d3d; border-radius:2px; }
        input,textarea,select { outline:none; }
      `}</style>
    </div>
  );
}
