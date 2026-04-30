import { T } from "../../constants";
import { fmtNum, fmtPrice } from "../../utils/solana";
import { SvgClose, SvgTwitterX, SvgDiscord, SvgTelegram, SvgLink } from "../icons/Icons";

// ── TokenCard ──────────────────────────────────────────────────────────────────
// Full token deep-dive card: price, stats, social links, audit info.
export default function TokenCard({ show, onClose, info, onSend }) {
  if (!show || !info) return null;

  const {
    symbol, name, logo_url, address,
    usdPrice, priceChange24h,
    market_cap, fdv, liquidity, daily_volume,
    numBuys24h, numSells24h, numTraders24h,
    circSupply, totalSupply, holderCount,
    twitter, website, telegram, discord,
    tags = [],
    organicScore, organicScoreLabel,
    freezeAuthority, mint_authority,
    topHoldersPercentage,
    launchpad, graduatedAt,
  } = info;

  const pct = priceChange24h;
  const pctColor = pct == null ? T.text3 : pct >= 0 ? T.green : T.red;
  const pctLabel = pct == null ? "" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;

  const STAT_ROWS = [
    { label: "Market Cap",    val: fmtNum(market_cap) },
    { label: "FDV",           val: fmtNum(fdv) },
    { label: "Liquidity",     val: fmtNum(liquidity) },
    { label: "24h Volume",    val: fmtNum(daily_volume) },
    { label: "Circ Supply",   val: fmtNum(circSupply) },
    { label: "Total Supply",  val: fmtNum(totalSupply) },
    { label: "Holders",       val: fmtNum(holderCount) },
    { label: "Buys 24h",      val: fmtNum(numBuys24h) },
    { label: "Sells 24h",     val: fmtNum(numSells24h) },
    { label: "Traders 24h",   val: fmtNum(numTraders24h) },
    { label: "Top 10 Holders",val: topHoldersPercentage != null ? `${topHoldersPercentage.toFixed(1)}%` : null },
    { label: "Organic Score", val: organicScore != null ? `${organicScore}${organicScoreLabel ? ` (${organicScoreLabel})` : ""}` : null },
  ].filter(r => r.val && r.val !== "—" && r.val !== "undefined");

  const AUDIT = [
    { label: "Freeze Auth", ok: freezeAuthority !== "active", bad: freezeAuthority === "active", label2: freezeAuthority === "active" ? "Active ⚠" : "Disabled ✓" },
    { label: "Mint Auth",   ok: mint_authority  !== "active", bad: mint_authority  === "active", label2: mint_authority  === "active" ? "Active ⚠" : "Disabled ✓" },
    { label: "Verified",    ok: tags.includes("verified"),    bad: !tags.includes("verified"),   label2: tags.includes("verified") ? "Yes ✓" : "No" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 910,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={onClose}>
      <div style={{
        width: "100%", maxWidth: 400,
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 16, overflow: "hidden",
        maxHeight: "85vh", display: "flex", flexDirection: "column",
      }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 12, alignItems: "center" }}>
          {logo_url
            ? <img src={logo_url} alt={symbol} style={{ width: 40, height: 40, borderRadius: "50%", border: `1px solid ${T.border}` }} onError={e => e.target.style.display = "none"} />
            : <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.bg, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: T.text2 }}>{(symbol || "?").slice(0, 2)}</div>
          }
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: T.text1 }}>{symbol}</span>
              {tags.includes("verified") && <span style={{ fontSize: 10, background: T.greenBg, border: `1px solid ${T.greenBd}`, color: T.green, borderRadius: 20, padding: "1px 7px" }}>Verified</span>}
              {launchpad && <span style={{ fontSize: 10, background: T.purpleBg, border: `1px solid ${T.purple}33`, color: T.purple, borderRadius: 20, padding: "1px 7px" }}>{launchpad}</span>}
            </div>
            {name && <div style={{ fontSize: 11, color: T.text3, marginTop: 1 }}>{name.slice(0, 40)}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.text2, padding: 4 }}>
            <SvgClose size={18} />
          </button>
        </div>

        {/* ── Price ── */}
        {usdPrice != null && (
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: T.text1 }}>{fmtPrice(usdPrice)}</span>
            {pctLabel && <span style={{ fontSize: 14, fontWeight: 700, color: pctColor }}>{pctLabel} (24h)</span>}
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>

          {/* Stats grid */}
          {STAT_ROWS.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: T.border, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
              {STAT_ROWS.map(r => (
                <div key={r.label} style={{ background: T.bg, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>{r.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text1 }}>{r.val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Audit strip */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {AUDIT.map(a => (
              <div key={a.label} style={{
                flex: 1, padding: "7px 8px", textAlign: "center",
                background: a.bad ? T.redBg : T.greenBg,
                border: `1px solid ${a.bad ? T.redBd : T.greenBd}`,
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>{a.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: a.bad ? T.red : T.green }}>{a.label2}</div>
              </div>
            ))}
          </div>

          {/* Mint address */}
          {address && (
            <div style={{ padding: "7px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 10, color: T.text3 }}>Mint</span>
              <span style={{ flex: 1, fontSize: 11, color: T.text2, fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{address}</span>
              <button onClick={() => navigator.clipboard.writeText(address)}
                style={{ fontSize: 10, padding: "2px 6px", background: "none", border: `1px solid ${T.border}`, borderRadius: 6, color: T.text3, cursor: "pointer" }}>
                Copy
              </button>
            </div>
          )}

          {/* Social links */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {twitter  && <SocialBtn href={twitter.startsWith("http") ? twitter : `https://twitter.com/${twitter}`} icon={<SvgTwitterX size={13}/>} label="Twitter" />}
            {telegram && <SocialBtn href={telegram.startsWith("http") ? telegram : `https://t.me/${telegram}`} icon={<SvgTelegram size={13}/>} label="Telegram" />}
            {discord  && <SocialBtn href={discord.startsWith("http") ? discord : `https://discord.gg/${discord}`} icon={<SvgDiscord size={13}/>} label="Discord" />}
            {website  && <SocialBtn href={website} icon={<SvgLink size={13}/>} label="Website" />}
            {address  && <SocialBtn href={`https://solscan.io/token/${address}`} icon={<SvgLink size={13}/>} label="Solscan" />}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { onSend?.(`swap SOL to ${symbol}`); onClose(); }}
              style={{ flex: 1, padding: "10px", background: T.accent, border: "none", borderRadius: 10, color: "#0d1117", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Buy {symbol}
            </button>
            <button onClick={() => { onSend?.(`swap all my ${symbol} to USDC`); onClose(); }}
              style={{ flex: 1, padding: "10px", background: "none", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text2, fontSize: 13, cursor: "pointer" }}>
              Sell {symbol}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialBtn({ href, icon, label }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, fontSize: 11, textDecoration: "none", transition: "border-color 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
      {icon}{label}
    </a>
  );
}
