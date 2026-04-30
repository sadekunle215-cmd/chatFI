import { T } from "../constants";

// ── TokenPicker (inline) ──────────────────────────────────────────────────────
// Simple dropdown for selecting a token by symbol.
// For a full implementation, wire up jupFetch to search Jupiter's token list.
function TokenPicker({ value, onSelect, jupFetch }) {
  const common = ["SOL","USDC","USDT","JUP","BONK","WIF","PENGU","FARTCOIN"];
  return (
    <select
      value={value}
      onChange={e => onSelect(e.target.value, null, 6)}
      style={{ flex:1, padding:"8px 10px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, color:T.text1, fontSize:13, cursor:"pointer" }}>
      {common.map(sym => <option key={sym} value={sym}>{sym}</option>)}
    </select>
  );
}

// ── SwapPanel ─────────────────────────────────────────────────────────────────
// Inline swap form rendered inside the chat thread.
export default function SwapPanel({ swapCfg, setSwapCfg, swapQuote, quoteFetching, swapStatus, onSwap, onClose, walletFull, jupFetch }) {
  return (
    <div style={{ margin:"0 0 20px 44px", padding:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
      <div style={{ fontFamily:"'Lora','Georgia',serif", fontSize:15, fontWeight:500, marginBottom:16, color:T.text1 }}>
        Swap Tokens
      </div>

      {/* Token selectors */}
      <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"center" }}>
        <TokenPicker value={swapCfg.from} jupFetch={jupFetch}
          onSelect={(sym) => setSwapCfg(c => ({ ...c, from:sym }))} />
        <button onClick={() => setSwapCfg(c => ({ ...c, from:c.to, to:c.from, fromMint:c.toMint, toMint:c.fromMint, fromDecimals:c.toDecimals, toDecimals:c.fromDecimals }))}
          style={{ padding:"8px 12px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, cursor:"pointer", color:T.text2, fontSize:14, flexShrink:0 }}>
          ⇄
        </button>
        <TokenPicker value={swapCfg.to} jupFetch={jupFetch}
          onSelect={(sym) => setSwapCfg(c => ({ ...c, to:sym }))} />
      </div>

      {/* Amount */}
      <input type="number" placeholder="Amount"
        value={swapCfg.amount}
        onChange={e => setSwapCfg(c => ({ ...c, amount:e.target.value }))}
        style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, color:T.text1, fontSize:13, marginBottom:10, boxSizing:"border-box" }}
      />

      {/* Quote */}
      {quoteFetching && <div style={{ fontSize:12, color:T.text3, marginBottom:8 }}>Fetching quote…</div>}
      {swapQuote && !quoteFetching && (
        <div style={{ fontSize:12, color:T.green, background:T.greenBg, border:`1px solid ${T.greenBd}`, borderRadius:8, padding:"8px 12px", marginBottom:10 }}>
          You'll receive ≈ {(parseInt(swapQuote.outAmount) / Math.pow(10, swapCfg.toDecimals||6)).toFixed(4)} {swapCfg.to}
          {swapQuote.priceImpactPct && (
            <span style={{ color:parseFloat(swapQuote.priceImpactPct) > 1 ? T.red : T.text3 }}>
              {" · "}{parseFloat(swapQuote.priceImpactPct).toFixed(2)}% impact
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onSwap} disabled={!swapCfg.amount || swapStatus === "signing"}
          style={{ flex:1, padding:"10px", background:walletFull ? T.accent : T.accentBg, border:walletFull ? "none" : `1px solid ${T.accent}66`, borderRadius:8, color:walletFull ? "#0d1117" : T.accent, fontSize:14, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          {swapStatus === "signing"
            ? <><span style={{ width:12, height:12, border:"2px solid #0d111744", borderTop:"2px solid #0d1117", borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }}/> Signing…</>
            : walletFull ? `Swap ${swapCfg.from} → ${swapCfg.to}` : "🔗 Connect Wallet to Swap"}
        </button>
        <button onClick={onClose}
          style={{ padding:"10px 16px", background:"none", border:`1px solid ${T.border}`, borderRadius:8, color:T.text2, fontSize:14, cursor:"pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
