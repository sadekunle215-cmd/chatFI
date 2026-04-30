import { useState } from "react";
import { T } from "../../constants";
import { jupFetch } from "../../utils/solana";
import { SvgClose } from "../icons/Icons";

const ORDER_TYPES = [
  { id: "single", label: "Limit",  desc: "Buy or sell at a specific price" },
  { id: "oco",    label: "OCO",    desc: "Take profit + stop loss together" },
  { id: "otoco",  label: "OTOCO",  desc: "Entry + TP/SL in one order" },
];

// ── TriggerOrderPanel ──────────────────────────────────────────────────────────
// Panel for creating limit / OCO / OTOCO orders via Jupiter Trigger v2.
export default function TriggerOrderPanel({ show, onClose, cfg, setCfg, walletFull, getActiveProvider, push }) {
  const [submitting, setSubmitting] = useState(false);

  if (!show) return null;

  const handleSubmit = async () => {
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Connect your wallet first."); return; }
    if (!walletFull) return;
    setSubmitting(true);
    try {
      const inputDecimals  = cfg.fromDecimals || 6;
      const outputDecimals = cfg.toDecimals   || 9;
      const amtRaw = Math.floor(parseFloat(cfg.amount) * Math.pow(10, inputDecimals)).toString();
      const triggerPriceRaw = parseFloat(cfg.triggerPrice).toFixed(outputDecimals);

      const body = {
        orderType: cfg.orderType,
        inputMint: cfg.fromMint,
        outputMint: cfg.toMint,
        maker: walletFull,
        payer: walletFull,
        params: {
          makingAmount: amtRaw,
          triggerPrice: triggerPriceRaw,
          ...(cfg.orderType === "oco" && {
            takeProfitPrice: cfg.tpPrice,
            stopLossPrice:   cfg.slPrice,
          }),
          ...(cfg.orderType === "otoco" && {
            entryPrice: cfg.triggerPrice,
            takeProfitPrice: cfg.tpPrice,
            stopLossPrice:   cfg.slPrice,
          }),
        },
      };

      const data = await jupFetch("https://api.jup.ag/trigger/v1/createOrder", { method: "POST", body });
      if (!data?.transaction) throw new Error("No transaction returned");

      const { VersionedTransaction } = await import("@solana/web3.js");
      const { Connection }           = await import("@solana/web3.js");
      const txBytes = Uint8Array.from(atob(data.transaction), c => c.charCodeAt(0));
      const tx      = VersionedTransaction.deserialize(txBytes);
      const signed  = await provider.signTransaction(tx);

      const conn = new Connection(import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");
      const sig  = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction(sig, "confirmed");

      onClose();
      const typeLabel = cfg.orderType === "oco" ? "OCO order" : cfg.orderType === "otoco" ? "OTOCO order" : "Limit order";
      push("ai", `${typeLabel} placed ✓\n\nBuy **${cfg.amount} ${cfg.from}** if price hits **$${cfg.triggerPrice}**\n\n[View on Solscan →](https://solscan.io/tx/${sig})`);
    } catch (err) {
      push("ai", `Order failed: ${err?.message}`);
    }
    setSubmitting(false);
  };

  return (
    <div style={{ margin: "0 0 20px 44px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text1 }}>Trigger Order</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.text2 }}><SvgClose size={16} /></button>
      </div>

      <div style={{ padding: 16 }}>
        {/* Order type tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {ORDER_TYPES.map(t => (
            <button key={t.id} onClick={() => setCfg(c => ({ ...c, orderType: t.id }))}
              style={{
                flex: 1, padding: "7px 4px", fontSize: 12, fontWeight: 600,
                background: cfg.orderType === t.id ? T.accentBg : "none",
                border: `1px solid ${cfg.orderType === t.id ? T.accent + "55" : T.border}`,
                borderRadius: 8, color: cfg.orderType === t.id ? T.accent : T.text2,
                cursor: "pointer",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="From" value={cfg.from} onChange={v => setCfg(c => ({ ...c, from: v }))} placeholder="USDC" />
          <Field label="To"   value={cfg.to}   onChange={v => setCfg(c => ({ ...c, to: v }))}   placeholder="SOL" />
          <Field label="Amount" value={cfg.amount} onChange={v => setCfg(c => ({ ...c, amount: v }))} placeholder="100" type="number" />
          <Field label="Trigger Price ($)" value={cfg.triggerPrice} onChange={v => setCfg(c => ({ ...c, triggerPrice: v }))} placeholder="140" type="number" />

          {(cfg.orderType === "oco" || cfg.orderType === "otoco") && <>
            <Field label="Take Profit ($)" value={cfg.tpPrice || ""} onChange={v => setCfg(c => ({ ...c, tpPrice: v }))} placeholder="200" type="number" />
            <Field label="Stop Loss ($)"   value={cfg.slPrice || ""} onChange={v => setCfg(c => ({ ...c, slPrice: v }))} placeholder="120" type="number" />
          </>}
        </div>

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: "100%", marginTop: 14, padding: "10px", background: T.accent, border: "none", borderRadius: 8, color: "#0d1117", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {submitting
            ? <><Spinner /> Placing order…</>
            : `Place ${ORDER_TYPES.find(t => t.id === cfg.orderType)?.label} Order`
          }
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "7px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text1, fontSize: 13, boxSizing: "border-box" }} />
    </div>
  );
}

function Spinner() {
  return <span style={{ width: 12, height: 12, border: "2px solid #0d111744", borderTop: "2px solid #0d1117", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />;
}
