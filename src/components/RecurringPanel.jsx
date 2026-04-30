import { useState } from "react";
import { T } from "../../constants";
import { jupFetch } from "../../utils/solana";
import { SvgClose } from "../icons/Icons";

const CYCLES = [
  { id: "every_minute", label: "Every Minute (test)" },
  { id: "daily",        label: "Daily" },
  { id: "weekly",       label: "Weekly" },
  { id: "monthly",      label: "Monthly" },
];

const CYCLE_SECONDS = {
  every_minute: 60,
  daily:        86400,
  weekly:       604800,
  monthly:      2592000,
};

// ── RecurringPanel ─────────────────────────────────────────────────────────────
export default function RecurringPanel({ show, onClose, cfg, setCfg, walletFull, getActiveProvider, push }) {
  const [submitting, setSubmitting] = useState(false);

  if (!show) return null;

  const handleSubmit = async () => {
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Connect your wallet first."); return; }
    setSubmitting(true);
    try {
      const inputDecimals = cfg.fromDecimals || 6;
      const amtRaw = Math.floor(parseFloat(cfg.amount) * Math.pow(10, inputDecimals)).toString();
      const cycleSeconds = CYCLE_SECONDS[cfg.cycle] || 86400;

      const data = await jupFetch("https://api.jup.ag/recurring/v1/createOrder", {
        method: "POST",
        body: {
          user: walletFull,
          inputMint:  cfg.fromMint,
          outputMint: cfg.toMint,
          params: {
            orderType: "time",
            inAmount: amtRaw,
            cycleSecondsApart: cycleSeconds,
            numberOfOrders: parseInt(cfg.numberOfOrders || "30"),
            startAt: null,
          },
        },
      });
      if (!data?.setupTransaction) throw new Error("No transaction returned");

      const { VersionedTransaction } = await import("@solana/web3.js");
      const { Connection }           = await import("@solana/web3.js");
      const txBytes = Uint8Array.from(atob(data.setupTransaction), c => c.charCodeAt(0));
      const tx      = VersionedTransaction.deserialize(txBytes);
      const signed  = await provider.signTransaction(tx);
      const conn    = new Connection(import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");
      const sig     = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction(sig, "confirmed");

      onClose();
      push("ai", `DCA order created ✓\n\nBuying **${cfg.amount} ${cfg.from} → ${cfg.to}** every **${cfg.cycle}** for **${cfg.numberOfOrders || 30}** orders.\n\n[View on Solscan →](https://solscan.io/tx/${sig})`);
    } catch (err) {
      push("ai", `DCA order failed: ${err?.message}`);
    }
    setSubmitting(false);
  };

  return (
    <div style={{ margin: "0 0 20px 44px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text1 }}>DCA / Recurring Buy</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.text2 }}><SvgClose size={16} /></button>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Token row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="Buy With" value={cfg.from} onChange={v => setCfg(c => ({ ...c, from: v }))} placeholder="USDC" />
          <Field label="Buy Token" value={cfg.to}  onChange={v => setCfg(c => ({ ...c, to: v }))}   placeholder="SOL" />
        </div>

        {/* Amount + cycle */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="Amount per order" value={cfg.amount} onChange={v => setCfg(c => ({ ...c, amount: v }))} placeholder="10" type="number" />
          <div>
            <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>Frequency</div>
            <select value={cfg.cycle} onChange={e => setCfg(c => ({ ...c, cycle: e.target.value }))}
              style={{ width: "100%", padding: "7px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text1, fontSize: 13 }}>
              {CYCLES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <Field label="Number of orders" value={cfg.numberOfOrders || "30"} onChange={v => setCfg(c => ({ ...c, numberOfOrders: v }))} placeholder="30" type="number" />

        {/* Summary */}
        {cfg.amount && cfg.cycle && (
          <div style={{ padding: "8px 12px", background: T.tealBg, border: `1px solid ${T.teal}33`, borderRadius: 8, fontSize: 12, color: T.teal }}>
            Will spend <strong>{cfg.amount} {cfg.from}</strong> {cfg.cycle} × {cfg.numberOfOrders || 30} orders
            = <strong>{(parseFloat(cfg.amount || 0) * parseInt(cfg.numberOfOrders || 30)).toLocaleString()} {cfg.from}</strong> total
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          style={{ padding: "10px", background: T.accent, border: "none", borderRadius: 8, color: "#0d1117", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {submitting ? <><Spinner /> Creating DCA…</> : `Start DCA: ${cfg.from} → ${cfg.to}`}
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
