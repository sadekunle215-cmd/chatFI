import { useState, useEffect } from "react";
import { jupFetch, fmtPrice } from "../utils/solana";
import { JUP_TOKEN_CAT } from "../constants";

// ── TickerBar ─────────────────────────────────────────────────────────────────
// Scrolling horizontal ticker showing trending token prices.
// Props:
//   onTokenClick(symbol) — called when user taps a ticker item
export default function TickerBar({ onTokenClick }) {
  const [tokens, setTokens] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await jupFetch(`${JUP_TOKEN_CAT}/toptrending/1h?limit=20`);
        const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
        if (!cancelled && list.length > 0) { setTokens(list); setLoaded(true); }
      } catch {}
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!loaded || tokens.length === 0) return null;

  const items = [...tokens, ...tokens]; // duplicate for seamless loop

  return (
    <div style={{
      position: "absolute", top: 58, left: 0, right: 0, zIndex: 197,
      height: 28, overflow: "hidden",
      background: "rgba(13,17,23,0.95)",
      borderBottom: "1px solid #1e2d3d",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center",
    }}>
      {/* Label */}
      <div style={{
        flexShrink: 0, padding: "0 10px", fontSize: 9, fontWeight: 700,
        color: "#4d6a7a", letterSpacing: "0.1em", textTransform: "uppercase",
        borderRight: "1px solid #1e2d3d", height: "100%",
        display: "flex", alignItems: "center",
        background: "rgba(13,17,23,0.98)", zIndex: 2,
      }}>
        TRENDING
      </div>

      {/* Scrolling track */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <style>{`
          @keyframes tickerScroll { 0% { transform:translateX(0); } 100% { transform:translateX(-50%); } }
          .ticker-track { display:flex;align-items:center;white-space:nowrap;animation:tickerScroll 45s linear infinite;will-change:transform; }
          .ticker-track:hover { animation-play-state:paused; }
          .ticker-item:hover { opacity:0.75; }
        `}</style>
        <div className="ticker-track">
          {items.map((t, i) => {
            const chgRaw  = t.priceChange24h ?? null;
            const isUp    = chgRaw == null ? null : chgRaw >= 0;
            const changeColor = isUp === null ? "#4d6a7a" : isUp ? "#68d391" : "#f28484";
            const changeStr   = chgRaw == null ? "" : `${isUp ? "+" : ""}${chgRaw.toFixed(2)}%`;
            const addr    = t.address || t.id || t.mint;
            const logoSrc = t.icon || t.logoURI || t.logo || (addr ? `https://img.jup.ag/tokens/${addr}` : null);

            return (
              <button key={`${addr}-${i}`} className="ticker-item"
                onClick={() => onTokenClick && onTokenClick(t.symbol)}
                style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5, padding:"0 14px 0 6px", height:28, flexShrink:0, transition:"opacity 0.15s" }}>
                {logoSrc && (
                  <img src={logoSrc} alt={t.symbol}
                    style={{ width:14, height:14, borderRadius:"50%", objectFit:"cover", flexShrink:0, border:"1px solid #1e2d3d" }}
                    onError={e => { e.currentTarget.style.display = "none"; }} />
                )}
                <span style={{ fontSize:11, fontWeight:700, color:"#c8d8e0", letterSpacing:"-0.1px" }}>{t.symbol}</span>
                <span style={{ fontSize:11, color:"#8fa8b8" }}>{fmtPrice(t.price || t.usdPrice)}</span>
                {changeStr && <span style={{ fontSize:10, fontWeight:700, color:changeColor }}>{changeStr}</span>}
                <span style={{ fontSize:10, color:"#1e2d3d", paddingLeft:4, userSelect:"none" }}>·</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
