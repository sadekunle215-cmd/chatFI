import { useState, useMemo } from "react";
import { T } from "../constants";
import { REGIMES } from "../hooks/useVolatility";
import { SvgClose, SvgZap, SvgBarChart } from "./Icons";

// ── Mini sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ history = [], color = "#c7f284", width = 80, height = 28 }) {
  if (history.length < 2) return <div style={{ width, height }} />;
  const prices = history.map(h => h.price);
  const min    = Math.min(...prices);
  const max    = Math.max(...prices);
  const range  = max - min || 1;
  const pts    = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((p - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ display:"block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Vol band bar ───────────────────────────────────────────────────────────────
function VolBandBar({ bandPosition = 0.5, regime = "UNKNOWN" }) {
  const r      = REGIMES[regime] || REGIMES.LOW;
  const clamp  = Math.max(0, Math.min(1, bandPosition));
  return (
    <div style={{ position:"relative", height:6, borderRadius:3, background:"#1e2d3d", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, background:`linear-gradient(90deg, ${REGIMES.LOW.color}22, ${REGIMES.MEDIUM.color}22, ${REGIMES.HIGH.color}22, ${REGIMES.EXTREME.color}22)` }} />
      <div style={{ position:"absolute", top:0, left:`${clamp*100}%`, transform:"translateX(-50%)", width:8, height:6, background:r.color, borderRadius:2, transition:"left 0.4s ease" }} />
    </div>
  );
}

// ── Regime badge ───────────────────────────────────────────────────────────────
function RegimeBadge({ regime = "UNKNOWN" }) {
  const r = REGIMES[regime] || { color:"#8fa8b8", bg:"#161e27", border:"#1e2d3d", label:"…" };
  return (
    <span style={{ fontSize:9, fontWeight:800, letterSpacing:"0.08em", padding:"2px 7px", borderRadius:20, background:r.bg, border:`1px solid ${r.border}`, color:r.color }}>
      {r.label}
    </span>
  );
}

// ── Drift bar ──────────────────────────────────────────────────────────────────
function DriftBar({ actual, target }) {
  const drift    = actual - target;
  const absDrift = Math.min(Math.abs(drift), 30); // cap at 30% for display
  const isOver   = drift > 0;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ flex:1, height:5, borderRadius:3, background:"#1e2d3d", position:"relative" }}>
        {/* Target marker */}
        <div style={{ position:"absolute", top:-1, left:`${target}%`, width:2, height:7, background:"#8fa8b8", borderRadius:1 }} />
        {/* Actual fill */}
        <div style={{ position:"absolute", top:0, left:0, height:5, width:`${actual}%`, borderRadius:3, background: Math.abs(drift) > 5 ? (isOver ? "#f28484" : "#f6ad55") : "#c7f284", transition:"width 0.4s ease" }} />
      </div>
      <span style={{ fontSize:10, fontWeight:700, color: Math.abs(drift) > 5 ? (isOver ? "#f28484" : "#f6ad55") : "#8fa8b8", minWidth:36, textAlign:"right" }}>
        {drift > 0 ? "+" : ""}{drift.toFixed(1)}%
      </span>
    </div>
  );
}

// ── VolTokenRow ────────────────────────────────────────────────────────────────
function VolTokenRow({ sym, data, weight }) {
  const r = REGIMES[data?.regime] || REGIMES.LOW;
  return (
    <div style={{ padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:r.color, boxShadow:`0 0 6px ${r.color}88` }} />
          <span style={{ fontSize:13, fontWeight:700, color:T.text1 }}>{sym}</span>
          <RegimeBadge regime={data?.regime} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Sparkline history={data?.history || []} color={r.color} />
          <span style={{ fontSize:12, fontWeight:600, color:T.text1, minWidth:60, textAlign:"right" }}>
            {data?.currentPrice != null
              ? data.currentPrice >= 1
                ? `$${data.currentPrice.toFixed(2)}`
                : `$${data.currentPrice.toFixed(5)}`
              : "—"}
          </span>
        </div>
      </div>
      {/* Vol band position */}
      <div style={{ marginBottom:6 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3, marginBottom:3 }}>
          <span>Volatility band</span>
          <span>{data?.annualisedVol != null ? `${data.annualisedVol.toFixed(1)}% ann.` : "Warming up…"}</span>
        </div>
        <VolBandBar bandPosition={data?.bandPosition} regime={data?.regime} />
        {data?.bands && (
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:T.text3, marginTop:2 }}>
            <span>↓ {data.bands.lower < 1 ? data.bands.lower.toFixed(4) : data.bands.lower.toFixed(2)}</span>
            <span>mid {data.bands.middle < 1 ? data.bands.middle.toFixed(4) : data.bands.middle.toFixed(2)}</span>
            <span>{data.bands.upper < 1 ? data.bands.upper.toFixed(4) : data.bands.upper.toFixed(2)} ↑</span>
          </div>
        )}
      </div>
      {/* Weight drift */}
      {weight && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3, marginBottom:3 }}>
            <span>Weight: <strong style={{ color:T.text2 }}>{weight.actualPct.toFixed(1)}%</strong> / target {weight.targetPct}%</span>
            <span style={{ color: weight.needsRebal ? "#f6ad55" : T.text3 }}>{weight.needsRebal ? "Needs rebal" : "On target"}</span>
          </div>
          <DriftBar actual={weight.actualPct} target={weight.targetPct} />
        </div>
      )}
    </div>
  );
}

// ── TargetEditor ───────────────────────────────────────────────────────────────
function TargetEditor({ targets, setTargets }) {
  const total = targets.reduce((s, t) => s + (parseFloat(t.targetPct) || 0), 0);
  return (
    <div>
      <div style={{ fontSize:11, color:T.text3, marginBottom:8 }}>
        Target weights — total: <strong style={{ color: Math.abs(total - 100) < 0.5 ? T.green : T.red }}>{total.toFixed(0)}%</strong>
        {Math.abs(total - 100) >= 0.5 && <span style={{ color:T.red }}> (must = 100%)</span>}
      </div>
      {targets.map((t, i) => (
        <div key={t.symbol} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
          <span style={{ fontSize:12, fontWeight:700, color:T.text1, width:50 }}>{t.symbol}</span>
          <input
            type="range" min={0} max={100} value={t.targetPct}
            onChange={e => setTargets(prev => prev.map((x, j) => j === i ? { ...x, targetPct: parseInt(e.target.value) } : x))}
            style={{ flex:1, accentColor:T.accent }}
          />
          <input
            type="number" min={0} max={100} value={t.targetPct}
            onChange={e => setTargets(prev => prev.map((x, j) => j === i ? { ...x, targetPct: parseInt(e.target.value)||0 } : x))}
            style={{ width:44, padding:"3px 6px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, color:T.text1, fontSize:12, textAlign:"center" }}
          />
          <span style={{ fontSize:11, color:T.text3 }}>%</span>
          <button onClick={() => setTargets(prev => prev.filter((_, j) => j !== i))}
            style={{ background:"none", border:"none", cursor:"pointer", color:T.text3, padding:2, fontSize:14 }}>×</button>
        </div>
      ))}
      <button onClick={() => setTargets(prev => [...prev, { symbol:"", targetPct:0 }])}
        style={{ fontSize:11, padding:"4px 10px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text3, cursor:"pointer", marginTop:4 }}>
        + Add token
      </button>
    </div>
  );
}

// ── ExecutionLog ───────────────────────────────────────────────────────────────
function ExecutionLog({ log, clearLog }) {
  if (!log.length) return <div style={{ fontSize:12, color:T.text3, padding:"8px 0" }}>No activity yet.</div>;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <span style={{ fontSize:10, color:T.text3, textTransform:"uppercase", letterSpacing:"0.08em" }}>Execution Log</span>
        <button onClick={clearLog} style={{ fontSize:10, background:"none", border:"none", cursor:"pointer", color:T.text3 }}>Clear</button>
      </div>
      <div style={{ maxHeight:140, overflowY:"auto", display:"flex", flexDirection:"column", gap:3 }}>
        {[...log].reverse().map((entry, i) => (
          <div key={i} style={{ fontSize:11, color: entry.message.startsWith("✓") ? T.green : entry.message.startsWith("✗") ? T.red : T.text2, padding:"4px 8px", background:T.bg, borderRadius:6, fontFamily:"'JetBrains Mono',monospace" }}>
            <span style={{ color:T.text3, marginRight:6 }}>{new Date(entry.ts).toLocaleTimeString()}</span>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── STATUS PILL ────────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  idle:      { color:"#8fa8b8", bg:"#161e27", label:"Idle" },
  waiting:   { color:"#f6ad55", bg:"#2e2010", label:"Waiting for LOW regime…" },
  executing: { color:"#c7f284", bg:"#1a2e1a", label:"Executing…" },
  done:      { color:"#c7f284", bg:"#1a2e1a", label:"Done ✓" },
  error:     { color:"#f28484", bg:"#2e1a1a", label:"Error" },
};

// ── RebalancerPanel ────────────────────────────────────────────────────────────
export default function RebalancerPanel({
  show, onClose,
  // from useVolatility
  volData = {}, allLow = false, volLoading = false, lastUpdated = null,
  windowMinutes, setWindowMinutes,
  // from useRebalancer
  targets, setTargets,
  currentWeights = [],
  driftItems = [],
  buildTrades,
  autopilotEnabled, setAutopilotEnabled,
  checkIntervalMin, setCheckIntervalMin,
  driftThresholdPct, setDriftThresholdPct,
  status = "idle",
  log = [],
  clearLog,
  manualRebalance,
  forceRebalance,
}) {
  const [tab, setTab] = useState("overview");
  const trades        = useMemo(() => buildTrades?.() || [], [buildTrades, driftItems.length]);
  const statusStyle   = STATUS_STYLES[status] || STATUS_STYLES.idle;
  const allSymbols    = [...new Set([...targets.map(t => t.symbol), ...Object.keys(volData)])];

  if (!show) return null;

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:930,
      background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"flex-end", justifyContent:"center",
    }} onClick={onClose}>
      <div style={{
        width:"100%", maxWidth:520,
        background:T.surface, border:`1px solid ${T.border}`,
        borderRadius:"16px 16px 0 0", maxHeight:"90vh",
        display:"flex", flexDirection:"column",
      }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{ padding:"16px 20px 0", borderBottom:`1px solid ${T.border}`, paddingBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:T.text1, display:"flex", alignItems:"center", gap:8 }}>
                <SvgZap size={16} color={T.accent} /> Regime-Aware Autopilot
              </div>
              <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>
                Ultra Swap rebalancer · executes only in LOW-vol windows
              </div>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:T.text2 }}>
              <SvgClose size={18} />
            </button>
          </div>

          {/* Status + allLow indicator */}
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:20, background:statusStyle.bg, color:statusStyle.color }}>
              {statusStyle.label}
            </div>
            <div style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:20, background: allLow ? REGIMES.LOW.bg : REGIMES.HIGH.bg, color: allLow ? REGIMES.LOW.color : REGIMES.HIGH.color, border:`1px solid ${allLow ? REGIMES.LOW.border : REGIMES.HIGH.border}` }}>
              {allLow ? "🟢 ALL LOW — Ready to execute" : "🟡 Waiting for LOW regime"}
            </div>
            {lastUpdated && <span style={{ fontSize:9, color:T.text3, marginLeft:"auto" }}>Updated {new Date(lastUpdated).toLocaleTimeString()}</span>}
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:4, marginTop:12 }}>
            {[["overview","Overview"], ["weights","Weights"], ["autopilot","Autopilot"], ["log","Log"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ padding:"5px 12px", fontSize:11, fontWeight:600, background: tab===id ? T.accentBg : "none", border:`1px solid ${tab===id ? T.accent+"44" : T.border}`, borderRadius:20, color: tab===id ? T.accent : T.text3, cursor:"pointer" }}>
                {label}{id==="log" && log.length > 0 ? ` (${log.length})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px 20px 20px" }}>

          {/* ── OVERVIEW tab ── */}
          {tab === "overview" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:11, color:T.text3, textTransform:"uppercase", letterSpacing:"0.08em" }}>Vol window</span>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <input type="range" min={5} max={240} step={5} value={windowMinutes}
                    onChange={e => setWindowMinutes(parseInt(e.target.value))}
                    style={{ width:80, accentColor:T.accent }} />
                  <span style={{ fontSize:12, color:T.text1, fontWeight:600, minWidth:50 }}>{windowMinutes} min</span>
                </div>
              </div>
              {volLoading && <div style={{ fontSize:12, color:T.text3, textAlign:"center", padding:12 }}>Warming up price history…</div>}
              {allSymbols.map(sym => (
                <VolTokenRow key={sym} sym={sym} data={volData[sym]} weight={currentWeights.find(w => w.symbol === sym)} />
              ))}
            </div>
          )}

          {/* ── WEIGHTS tab ── */}
          {tab === "weights" && (
            <div>
              <TargetEditor targets={targets} setTargets={setTargets} />
              <div style={{ height:1, background:T.border, margin:"16px 0" }} />
              <div style={{ fontSize:11, color:T.text3, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>Pending trades</div>
              {trades.length === 0
                ? <div style={{ fontSize:12, color:T.text3 }}>Portfolio is balanced — no trades needed.</div>
                : trades.map((t, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:6, fontSize:12 }}>
                    <span style={{ color:T.text1, fontWeight:600 }}>{t.from} → {t.to}</span>
                    <span style={{ color:t.type==="sell" ? T.red : T.green }}>{t.type === "sell" ? "−" : "+"} ${t.amountUsd.toFixed(2)}</span>
                  </div>
                ))
              }
              <div style={{ display:"flex", gap:8, marginTop:14 }}>
                <button onClick={manualRebalance} disabled={!trades.length}
                  style={{ flex:1, padding:"10px", background: allLow && trades.length ? T.accent : T.accentBg, border: allLow && trades.length ? "none" : `1px solid ${T.accent}44`, borderRadius:10, color: allLow && trades.length ? "#0d1117" : T.accent, fontSize:13, fontWeight:700, cursor: trades.length ? "pointer" : "not-allowed" }}>
                  {allLow ? "⚡ Rebalance Now" : "🔒 Queue (waiting for LOW)"}
                </button>
                <button onClick={forceRebalance} disabled={!trades.length}
                  style={{ padding:"10px 14px", background:"none", border:`1px solid ${T.red}44`, borderRadius:10, color:T.red, fontSize:12, cursor:"pointer" }}>
                  Force
                </button>
              </div>
              <div style={{ fontSize:10, color:T.text3, marginTop:6, textAlign:"center" }}>Force ignores vol regime. Use with caution.</div>
            </div>
          )}

          {/* ── AUTOPILOT tab ── */}
          {tab === "autopilot" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* Toggle */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:T.bg, border:`1px solid ${autopilotEnabled ? T.accent+"44" : T.border}`, borderRadius:12 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:T.text1 }}>🤖 Autopilot</div>
                  <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>Auto-executes when vol is LOW + drift exceeds threshold</div>
                </div>
                <button onClick={() => setAutopilotEnabled(p => !p)}
                  style={{ width:42, height:24, borderRadius:12, background: autopilotEnabled ? T.accent : "#1e2d3d", border:"none", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                  <div style={{ position:"absolute", top:3, left: autopilotEnabled ? 20 : 3, width:18, height:18, borderRadius:"50%", background: autopilotEnabled ? "#0d1117" : "#4d6a7a", transition:"left 0.2s" }} />
                </button>
              </div>

              {/* Check interval */}
              <div>
                <div style={{ fontSize:11, color:T.text3, marginBottom:6 }}>Check every <strong style={{ color:T.text1 }}>{checkIntervalMin} minutes</strong></div>
                <input type="range" min={1} max={60} value={checkIntervalMin}
                  onChange={e => setCheckIntervalMin(parseInt(e.target.value))}
                  style={{ width:"100%", accentColor:T.accent }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3 }}>
                  <span>1 min</span><span>60 min</span>
                </div>
              </div>

              {/* Drift threshold */}
              <div>
                <div style={{ fontSize:11, color:T.text3, marginBottom:6 }}>Rebalance when drift exceeds <strong style={{ color:T.text1 }}>{driftThresholdPct}%</strong></div>
                <input type="range" min={1} max={20} value={driftThresholdPct}
                  onChange={e => setDriftThresholdPct(parseInt(e.target.value))}
                  style={{ width:"100%", accentColor:T.accent }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3 }}>
                  <span>1%</span><span>20%</span>
                </div>
              </div>

              {/* Info box */}
              <div style={{ padding:"10px 12px", background:T.accentBg, border:`1px solid ${T.accent}33`, borderRadius:10, fontSize:11, color:T.text2, lineHeight:1.6 }}>
                <strong style={{ color:T.accent }}>How it works:</strong><br/>
                Every {checkIntervalMin} min the autopilot checks vol regime across all tokens.
                If ALL tokens are in <strong style={{ color:REGIMES.LOW.color }}>LOW</strong> regime and any token has drifted {">"}  {driftThresholdPct}% from target,
                it calls <code style={{ color:T.teal }}>/api/rebalance</code> to execute the swap bundle.
                In <strong style={{ color:T.red }}>HIGH / EXTREME</strong> regime, execution is blocked automatically.
              </div>
            </div>
          )}

          {/* ── LOG tab ── */}
          {tab === "log" && <ExecutionLog log={log} clearLog={clearLog} />}
        </div>
      </div>
    </div>
  );
}
