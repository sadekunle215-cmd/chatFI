import { T } from "../constants";
import { SvgWallet, SvgClose } from "./Icons";

// ── WalletModal ───────────────────────────────────────────────────────────────
// Modal showing available wallets to connect. Supports:
//   - Detected extensions (connect directly)
//   - Mobile deep links (open wallet app)
//   - Desktop install links
//   - Social login via Privy
export default function WalletModal({
  show, onClose,
  walletList,
  onSelectWallet,
  onPrivyLogin,
  wcStatus, wcUri, wcMode, setWcMode, wcCopied, setWcCopied,
  wcQrRef,
}) {
  if (!show) return null;

  const detected  = walletList.filter(w => w.detected);
  const undetected = walletList.filter(w => !w.detected);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 16, padding: 24, width: "100%", maxWidth: 360,
        maxHeight: "80vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:700, color:T.text1 }}>Connect Wallet</div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:T.text2, padding:4 }}>
            <SvgClose size={18} />
          </button>
        </div>

        {/* Social login (Privy) */}
        <button onClick={onPrivyLogin}
          style={{ width:"100%", padding:"12px 16px", background:T.accentBg, border:`1px solid ${T.accent}44`, borderRadius:12, color:T.accent, fontSize:14, fontWeight:600, cursor:"pointer", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          🔐 Continue with Email / Social
        </button>

        <div style={{ fontSize:11, color:T.text3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>
          {detected.length ? "Detected Wallets" : "Available Wallets"}
        </div>

        {/* Detected wallets */}
        {detected.map(w => (
          <button key={w.name} onClick={() => onSelectWallet(w)}
            style={{ width:"100%", padding:"11px 14px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, color:T.text1, fontSize:14, fontWeight:500, cursor:"pointer", marginBottom:6, display:"flex", alignItems:"center", gap:10, transition:"border-color 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
            onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
            {w.icon && <img src={w.icon} alt={w.name} style={{ width:24, height:24, borderRadius:6 }} onError={e => e.target.style.display="none"} />}
            <span>{w.name}</span>
            <span style={{ marginLeft:"auto", fontSize:10, color:T.green }}>Detected</span>
          </button>
        ))}

        {/* Undetected / install links */}
        {undetected.length > 0 && (
          <>
            <div style={{ fontSize:11, color:T.text3, textTransform:"uppercase", letterSpacing:"0.08em", margin:"14px 0 8px" }}>
              Install
            </div>
            {undetected.map(w => (
              <button key={w.name} onClick={() => onSelectWallet(w)}
                style={{ width:"100%", padding:"11px 14px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, color:T.text2, fontSize:13, fontWeight:500, cursor:"pointer", marginBottom:6, display:"flex", alignItems:"center", gap:10 }}>
                {w.icon && <img src={w.icon} alt={w.name} style={{ width:24, height:24, borderRadius:6 }} onError={e => e.target.style.display="none"} />}
                <span>{w.name}</span>
                <span style={{ marginLeft:"auto", fontSize:10, color:T.text3 }}>↗ {w.type === "deeplink" ? "Open" : "Install"}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
