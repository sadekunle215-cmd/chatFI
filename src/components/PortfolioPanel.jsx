import { useState, useEffect } from "react";
import { T } from "../../constants";
import { jupFetch, fmtNum, fmtPrice } from "../../utils/solana";
import { SvgClose, SvgBarChart } from "../icons/Icons";

// ── PortfolioPanel ─────────────────────────────────────────────────────────────
// Full portfolio view: token balances, earn positions, open orders, locks.
export default function PortfolioPanel({ show, onClose, walletFull, portfolio, onSend }) {
  const [section, setSection] = useState("tokens");
  const [earnData, setEarnData]   = useState([]);
  const [orderData, setOrderData] = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!show || !walletFull) return;
    setLoading(true);
    Promise.all([
      jupFetch(`https://api.jup.ag/earn/v1/positions?wallet=${walletFull}`).catch(() => []),
      jupFetch(`https://api.jup.ag/trigger/v2/getTriggerOrders?wallet=${walletFull}&status=open&includeFailedTx=false`).catch(() => []),
    ]).then(([earn, orders]) => {
      setEarnData(Array.isArray(earn) ? earn : earn?.positions || []);
      const oList = orders?.orders || orders?.data || (Array.isArray(orders) ? orders : []);
      setOrderData(oList);
      setLoading(false);
    });
  }, [show, walletFull]);

  if (!show) return null;

  const tokenEntries = Object.entries(portfolio || {})
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  const SECTIONS = [
    { id: "tokens", label: "Tokens" },
    { id: "earn",   label: "Earn" },
    { id: "orders", label: "Orders" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        width: "100%", maxWidth: 520,
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: "16px 16px 0 0",
        maxHeight: "80vh", display: "flex", flexDirection: "column",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text1 }}>Portfolio</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.text2 }}>
            <SvgClose size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "12px 20px 0" }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 600,
                background: section === s.id ? T.accentBg : "none",
                border: `1px solid ${section === s.id ? T.accent + "44" : T.border}`,
                borderRadius: 20, color: section === s.id ? T.accent : T.text3,
                cursor: "pointer",
              }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
          {loading && <div style={{ color: T.text3, fontSize: 13, textAlign: "center", padding: 20 }}>Loading…</div>}

          {/* Tokens tab */}
          {!loading && section === "tokens" && (
            tokenEntries.length === 0
              ? <NoData label="No token balances found." sub={walletFull ? "Your wallet appears empty." : "Connect a wallet to see your portfolio."} />
              : tokenEntries.map(([sym, bal]) => (
                <TokenRow key={sym} symbol={sym} balance={bal} onSend={onSend} />
              ))
          )}

          {/* Earn tab */}
          {!loading && section === "earn" && (
            earnData.length === 0
              ? <NoData label="No earn positions." sub='Try "show earn vaults" to deposit.' />
              : earnData.map((p, i) => <EarnRow key={i} pos={p} />)
          )}

          {/* Orders tab */}
          {!loading && section === "orders" && (
            orderData.length === 0
              ? <NoData label="No open orders." sub='Try "limit order: buy SOL below $140".' />
              : orderData.map((o, i) => <OrderRow key={i} order={o} />)
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function NoData({ label, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "30px 0" }}>
      <SvgBarChart size={28} color={T.text3} />
      <div style={{ fontSize: 13, color: T.text2, marginTop: 10 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function TokenRow({ symbol, balance, onSend }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: T.bg, border: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: T.text2,
        }}>
          {symbol.slice(0, 2)}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text1 }}>{symbol}</div>
          <div style={{ fontSize: 11, color: T.text3 }}>{balance.toFixed(4)}</div>
        </div>
      </div>
      <button onClick={() => onSend?.(`swap all my ${symbol} to USDC`)}
        style={{ padding: "4px 10px", fontSize: 11, background: "none", border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, cursor: "pointer" }}>
        Swap →
      </button>
    </div>
  );
}

function EarnRow({ pos }) {
  const sym = pos.symbol || pos.inputToken?.symbol || "?";
  const bal = parseFloat(pos.currentAmount || pos.depositedAmount || 0).toFixed(4);
  const apy = pos.apy != null ? `${(pos.apy * 100).toFixed(2)}% APY` : "";
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text1 }}>{sym}</div>
        {apy && <div style={{ fontSize: 11, color: T.green }}>{apy}</div>}
      </div>
      <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{bal} deposited</div>
    </div>
  );
}

function OrderRow({ order }) {
  const inSym  = order.inputMint?.slice(0, 6) || "?";
  const outSym = order.outputMint?.slice(0, 6) || "?";
  const price  = order.triggerPrice || order.limitPrice;
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text1 }}>
          {inSym} → {outSym}
        </div>
        <div style={{ fontSize: 11, padding: "2px 8px", background: T.tealBg, border: `1px solid ${T.teal}33`, borderRadius: 20, color: T.teal }}>
          Open
        </div>
      </div>
      {price && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Trigger @ ${parseFloat(price).toFixed(4)}</div>}
    </div>
  );
}
