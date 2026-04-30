// ── chatFi.jsx — Main Orchestrator ───────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";

// Hooks
import useWallet     from "./hooks/useWallet";
import useChat       from "./hooks/useChat";
import useSwap       from "./hooks/useSwap";
import useTokenData  from "./hooks/useTokenData";
import useVolatility from "./hooks/useVolatility";
import useRebalancer from "./hooks/useRebalancer";

// Components — all flat in components/
import TickerBar         from "./components/TickerBar";
import MessageBubble     from "./components/MessageBubble";
import ChatInput         from "./components/ChatInput";
import WalletModal       from "./components/WalletModal";
import SwapPanel         from "./components/SwapPanel";
import PortfolioPanel    from "./components/PortfolioPanel";
import TokenCard         from "./components/TokenCard";
import TriggerOrderPanel from "./components/TriggerOrderPanel";
import RecurringPanel    from "./components/RecurringPanel";
import BlogPanel         from "./components/BlogPanel";
import RebalancerPanel   from "./components/RebalancerPanel";

// Icons
import { SvgChat, SvgWallet, SvgZap, SvgBarChart, SvgPlus, SvgBlog } from "./components/Icons";

// Constants + utils
import { T }               from "./constants";
import { jupFetch }        from "./utils/solana";
import { isEnabled }       from "./config/features";
import { SYSTEM_PROMPT }   from "./constants/systemPrompt";

export default function ChatFi() {

  // ── Token data ──────────────────────────────────────────────────────────────
  const {
    tokenCacheRef, tokenDecimalsRef, resolveToken, prices,
    fetchTokenInfo, fetchTokensByCategory, fetchRecentTokens, fetchXStocks, fmtTokenList,
  } = useTokenData();

  // ── Panel visibility ─────────────────────────────────────────────────────────
  const [showPortfolio,  setShowPortfolio]  = useState(false);
  const [showTokenCard,  setShowTokenCard]  = useState(false);
  const [tokenCardInfo,  setTokenCardInfo]  = useState(null);
  const [showTrigV2,     setShowTrigV2]     = useState(false);
  const [trigV2Cfg,      setTrigV2Cfg]      = useState({ orderType:"single", from:"USDC", to:"SOL", amount:"", triggerPrice:"", tpPrice:"", slPrice:"", fromMint:null, toMint:null, fromDecimals:6, toDecimals:9 });
  const [showRecurring,  setShowRecurring]  = useState(false);
  const [recurCfg,       setRecurCfg]       = useState({ from:"USDC", to:"SOL", amount:"10", cycle:"daily", numberOfOrders:"30", fromMint:null, toMint:null, fromDecimals:6 });
  const [showBlog,       setShowBlog]       = useState(false);
  const [showRebalancer, setShowRebalancer] = useState(false);
  const [windowMinutes,  setWindowMinutes]  = useState(60);

  // ── Chat (push declared early so hooks below can use it) ────────────────────
  const [_onAction, _setOnAction] = useState(() => async () => {});
  const {
    messages, input, setInput, loading, send, push,
    activeSuggGroup, setActiveSuggGroup, bottomRef,
  } = useChat({ onAction: _onAction });

  // ── Wallet ───────────────────────────────────────────────────────────────────
  const {
    wallet, walletFull, portfolio, setPortfolio,
    showWalletModal, setShowWalletModal, walletList,
    wcStatus, wcUri, wcMode, setWcMode, wcCopied, setWcCopied,
    getActiveProvider, connectWallet, disconnectWallet,
    handleWalletSelected, fetchSolanaBalances, privyLogin,
  } = useWallet({ push, tokenCacheRef, tokenDecimalsRef });

  // ── Swap ─────────────────────────────────────────────────────────────────────
  const {
    showSwap, setShowSwap, swapCfg, setSwapCfg,
    swapQuote, quoteFetching, swapStatus, fetchSwapQuote, doSwap,
  } = useSwap({ walletFull, getActiveProvider, push, tokenCacheRef, tokenDecimalsRef });

  useEffect(() => {
    if (!swapCfg.fromMint || !swapCfg.toMint || !swapCfg.amount) return;
    const t = setTimeout(fetchSwapQuote, 600);
    return () => clearTimeout(t);
  }, [swapCfg.fromMint, swapCfg.toMint, swapCfg.amount]);

  // ── Volatility ────────────────────────────────────────────────────────────────
  const monitoredTokens = [
    ...new Set([
      ...Object.entries(portfolio || {}).filter(([,v]) => v > 0).map(([s]) => s),
      "SOL","USDC","JUP",
    ]),
  ].slice(0, 8);

  const { volData, allLow, loading: volLoading, lastUpdated, refresh: refreshVol } = useVolatility({
    tokens: monitoredTokens, windowMinutes, pollIntervalMs: 60_000, tokenCacheRef,
  });

  // ── Rebalancer ────────────────────────────────────────────────────────────────
  const {
    targets, setTargets, currentWeights, driftItems, buildTrades,
    autopilotEnabled, setAutopilotEnabled,
    checkIntervalMin, setCheckIntervalMin,
    driftThresholdPct, setDriftThresholdPct,
    status: rebalStatus, log: rebalLog, clearLog,
    manualRebalance, forceRebalance,
  } = useRebalancer({
    walletFull, portfolio, prices, volData, allLow,
    getActiveProvider, push, tokenCacheRef, tokenDecimalsRef,
  });

  // ── AI Action Dispatcher ──────────────────────────────────────────────────────
  const dispatchAction = useCallback(async ({ action, text, actionData = {} }) => {
    switch (action) {
      case null: case undefined:
        push("ai", text || ""); break;

      case "SHOW_SWAP": {
        const { from="SOL", to="USDC", amount="" } = actionData;
        const [fR, tR] = await Promise.all([resolveToken(from), resolveToken(to)]);
        setSwapCfg({ from:from.toUpperCase(), fromMint:fR?.mint||null, fromDecimals:fR?.decimals||9, to:to.toUpperCase(), toMint:tR?.mint||null, toDecimals:tR?.decimals||6, amount });
        setShowSwap(true);
        push("ai", text || `Swap ${from.toUpperCase()} → ${to.toUpperCase()}`);
        break;
      }
      case "SHOW_TRIGGER_V2": {
        const { from="USDC", to="SOL", amount="", triggerPrice="", orderType="single", tpPrice="", slPrice="" } = actionData;
        const [fR, tR] = await Promise.all([resolveToken(from), resolveToken(to)]);
        setTrigV2Cfg({ orderType, from:from.toUpperCase(), fromMint:fR?.mint, fromDecimals:fR?.decimals||6, to:to.toUpperCase(), toMint:tR?.mint, toDecimals:tR?.decimals||9, amount, triggerPrice, tpPrice, slPrice });
        setShowTrigV2(true);
        push("ai", text || "Trigger order ready.");
        break;
      }
      case "SHOW_RECURRING": {
        const { from="USDC", to="SOL", amount="10", cycle="daily" } = actionData;
        const [fR, tR] = await Promise.all([resolveToken(from), resolveToken(to)]);
        setRecurCfg(c => ({ ...c, from:from.toUpperCase(), fromMint:fR?.mint, fromDecimals:fR?.decimals||6, to:to.toUpperCase(), toMint:tR?.mint, amount, cycle }));
        setShowRecurring(true);
        push("ai", text || "DCA order configured.");
        break;
      }
      case "SHOW_PORTFOLIO":   setShowPortfolio(true);  push("ai", text || "Loading portfolio…");   break;
      case "SHOW_REBALANCER":  setShowRebalancer(true); push("ai", text || "Opening autopilot…");   break;
      case "SHOW_TOKEN": {
        push("ai", text || `Looking up **${actionData?.symbol}**…`);
        const info = await fetchTokenInfo(actionData?.symbol);
        if (info) { setTokenCardInfo(info); setShowTokenCard(true); }
        else push("ai", `Could not find **${actionData?.symbol}**.`);
        break;
      }
      case "FETCH_TRENDING": {
        const toks = await fetchTokensByCategory(actionData?.category||"toptrending", actionData?.interval||"24h", actionData?.limit||20);
        push("ai", text + (toks.length ? `\n\n${fmtTokenList(toks,20)}` : "\n\nNo data."));
        break;
      }
      case "FETCH_RECENT": {
        const toks = await fetchRecentTokens(actionData?.limit||30);
        push("ai", text + (toks.length ? `\n\n${fmtTokenList(toks,30)}` : "\n\nNone found."));
        break;
      }
      case "FETCH_XSTOCKS": {
        const toks = await fetchXStocks(actionData?.limit||15);
        push("ai", text + (toks.length ? `\n\n${fmtTokenList(toks,15)}` : "\n\nUnavailable."));
        break;
      }
      case "SET_PRICE_ALERT": {
        const { token="SOL", condition="above", price } = actionData;
        if (!price) { push("ai","Specify a target price."); break; }
        push("ai", `${text||""}\n\nAlert set: **${token.toUpperCase()}** ${condition} **$${price}**`);
        break;
      }
      default:
        push("ai", text || "Action not yet implemented.");
    }
  }, [push, resolveToken, fetchTokenInfo, fetchTokensByCategory, fetchRecentTokens, fetchXStocks, fmtTokenList, setSwapCfg, setShowSwap]);

  // ── Wire handleAction into useChat ────────────────────────────────────────────
  useEffect(() => {
    _setOnAction(() => async ({ action, text, history }) => {
      if (action === "REFRESH") {
        if (walletFull) { const b = await fetchSolanaBalances(walletFull); setPortfolio(b); refreshVol(); push("ai","Refreshed ✓"); }
        else push("ai","No wallet connected.");
        return;
      }
      if (action === "AI_CHAT") {
        try {
          // ── FIX: Call your Vercel API route instead of Anthropic directly ──
          const res = await fetch("/api/claude", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "claude-sonnet-4-5",
              max_tokens: 1000,
              system: SYSTEM_PROMPT,
              messages: history,
            }),
          });
          const data  = await res.json();
          const txt   = data.content?.find(b => b.type==="text")?.text || "";
          let parsed  = { text:txt, action:null, actionData:{} };
          try { const m = txt.match(/\{[\s\S]*?\}/); if (m) parsed = { ...parsed, ...JSON.parse(m[0]) }; } catch {}
          await dispatchAction(parsed);
        } catch(e) { push("ai", `Error: ${e?.message}`); }
      }
    });
  }, [dispatchAction, walletFull, fetchSolanaBalances, setPortfolio, push, refreshVol]);

  // ── Sidebar ───────────────────────────────────────────────────────────────────
  const regimeSummary = Object.entries(volData).map(([s,d]) => `${s}:${d?.regime?.[0]||"?"}`).join(" ");

  return (
    <div style={{ display:"flex", height:"100vh", background:T.bg, fontFamily:T.body, color:T.text1, overflow:"hidden" }}>

      {/* Sidebar */}
      <div style={{ width:56, flexShrink:0, background:T.sidebar, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", alignItems:"center", padding:"12px 0", gap:4 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,#c7f284,#38bdf8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#0d1117", marginBottom:8 }}>C</div>
        {[
          { icon:<SvgChat size={18}/>,     label:"Chat",      active:true,  onClick:null },
          { icon:<SvgBarChart size={18}/>, label:"Portfolio", active:false, onClick:()=>setShowPortfolio(true) },
          { icon:<SvgZap size={18}/>,      label:"Autopilot", active:false, onClick:()=>setShowRebalancer(true), badge: autopilotEnabled?"ON":null },
          { icon:<SvgBlog size={18}/>,     label:"Blog",      active:false, onClick:()=>setShowBlog(true) },
        ].map(item => (
          <div key={item.label} style={{ position:"relative" }}>
            <button title={item.label} onClick={item.onClick}
              style={{ width:40, height:40, borderRadius:10, background:item.active?T.accentBg:"none", border:`1px solid ${item.active?T.accent+"44":"transparent"}`, color:item.active?T.accent:T.text3, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {item.icon}
            </button>
            {item.badge && <div style={{ position:"absolute", top:2, right:2, fontSize:7, fontWeight:800, background:"#c7f284", color:"#0d1117", borderRadius:4, padding:"1px 3px" }}>{item.badge}</div>}
          </div>
        ))}
        <div style={{ flex:1 }}/>
        <button onClick={()=>send("delete messages")} style={{ width:40, height:40, borderRadius:10, background:"none", border:`1px solid ${T.border}`, color:T.text3, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <SvgPlus size={16}/>
        </button>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ height:58, flexShrink:0, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", background:T.sidebar, zIndex:200 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:T.text1 }}>ChatFi</div>
            {autopilotEnabled && regimeSummary && (
              <div style={{ fontSize:9, color:allLow?"#c7f284":"#f6ad55", marginTop:1 }}>{allLow?"🟢":"🟡"} {regimeSummary}</div>
            )}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {autopilotEnabled && (
              <div style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:20, background:allLow?"#1a2e1a":"#2e2010", color:allLow?"#c7f284":"#f6ad55", border:`1px solid ${allLow?"#2d4d1a":"#4d3510"}` }}>
                {allLow?"LOW ✓":"WAITING"}
              </div>
            )}
            {wallet
              ? <><span style={{ fontSize:12, color:T.text2 }}>{wallet}</span><button onClick={disconnectWallet} style={{ padding:"5px 10px", fontSize:11, background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text3, cursor:"pointer" }}>Disconnect</button></>
              : <button onClick={()=>connectWallet()} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.accentBg, border:`1px solid ${T.accent}55`, borderRadius:8, color:T.accent, cursor:"pointer" }}>Connect</button>
            }
          </div>
        </div>

        {/* Ticker */}
        {isEnabled("tickerBar") && <TickerBar onTokenClick={(sym)=>send(`${sym} info`)} />}

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"86px 16px 16px", display:"flex", flexDirection:"column", gap:4 }}>
          {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
          {isEnabled("swap") && showSwap && <SwapPanel swapCfg={swapCfg} setSwapCfg={setSwapCfg} swapQuote={swapQuote} quoteFetching={quoteFetching} swapStatus={swapStatus} onSwap={doSwap} onClose={()=>setShowSwap(false)} walletFull={walletFull} jupFetch={jupFetch} />}
          {isEnabled("limitOrders") && showTrigV2 && <TriggerOrderPanel show={showTrigV2} onClose={()=>setShowTrigV2(false)} cfg={trigV2Cfg} setCfg={setTrigV2Cfg} walletFull={walletFull} getActiveProvider={getActiveProvider} push={push} />}
          {isEnabled("dcaRecurring") && showRecurring && <RecurringPanel show={showRecurring} onClose={()=>setShowRecurring(false)} cfg={recurCfg} setCfg={setRecurCfg} walletFull={walletFull} getActiveProvider={getActiveProvider} push={push} />}
          {loading && (
            <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#c7f284,#38bdf8)", flexShrink:0 }}/>
              <div style={{ padding:"12px 14px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:"4px 14px 14px 14px" }}>
                <div style={{ display:"flex", gap:4 }}>
                  {[0,1,2].map(i=><div key={i} style={{ width:5, height:5, borderRadius:"50%", background:T.accent, animation:`pulse 1s ${i*0.2}s infinite` }}/>)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        <ChatInput input={input} setInput={setInput} onSend={send} loading={loading} activeSuggGroup={activeSuggGroup} setActiveSuggGroup={setActiveSuggGroup} />
      </div>

      {/* Modals */}
      <WalletModal show={showWalletModal} onClose={()=>setShowWalletModal(false)} walletList={walletList} onSelectWallet={handleWalletSelected} onPrivyLogin={privyLogin} wcStatus={wcStatus} wcUri={wcUri} wcMode={wcMode} setWcMode={setWcMode} wcCopied={wcCopied} setWcCopied={setWcCopied} />
      {isEnabled("portfolio")  && <PortfolioPanel  show={showPortfolio}  onClose={()=>setShowPortfolio(false)}  walletFull={walletFull} portfolio={portfolio} onSend={send} />}
      {isEnabled("tokenCard")  && <TokenCard        show={showTokenCard}  onClose={()=>setShowTokenCard(false)}  info={tokenCardInfo} onSend={send} />}
      {isEnabled("blogPosts")  && <BlogPanel        show={showBlog}       onClose={()=>setShowBlog(false)} />}
      {isEnabled("rebalancer") && (
        <RebalancerPanel
          show={showRebalancer} onClose={()=>setShowRebalancer(false)}
          volData={volData} allLow={allLow} volLoading={volLoading} lastUpdated={lastUpdated}
          windowMinutes={windowMinutes} setWindowMinutes={setWindowMinutes}
          targets={targets} setTargets={setTargets}
          currentWeights={currentWeights} driftItems={driftItems} buildTrades={buildTrades}
          autopilotEnabled={autopilotEnabled} setAutopilotEnabled={setAutopilotEnabled}
          checkIntervalMin={checkIntervalMin} setCheckIntervalMin={setCheckIntervalMin}
          driftThresholdPct={driftThresholdPct} setDriftThresholdPct={setDriftThresholdPct}
          status={rebalStatus} log={rebalLog} clearLog={clearLog}
          manualRebalance={manualRebalance} forceRebalance={forceRebalance}
        />
      )}

      <style>{`
        *{box-sizing:border-box}body{margin:0;padding:0;background:${T.bg}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1e2d3d;border-radius:2px}
        input,textarea,select{outline:none}
      `}</style>
    </div>
  );
}
