import { T } from "../constants";
import { fmt } from "../utils/solana";

// ── MessageBubble ─────────────────────────────────────────────────────────────
// Renders a single chat message — either user or AI.
// AI messages use the fmt() markdown renderer.
export default function MessageBubble({ message }) {
  const { role, content, ts } = message;
  const isUser = role === "user";

  if (isUser) {
    return (
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
        <div style={{
          maxWidth: "75%",
          padding: "10px 14px",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: "14px 14px 4px 14px",
          fontSize: 14,
          color: T.text1,
          lineHeight: 1.5,
        }}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"flex-start" }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: "linear-gradient(135deg, #c7f284 0%, #38bdf8 100%)",
        flexShrink: 0, display:"flex", alignItems:"center", justifyContent:"center",
        fontSize: 12, fontWeight: 800, color: "#0d1117",
      }}>
        C
      </div>

      {/* Bubble */}
      <div style={{
        flex: 1,
        padding: "12px 14px",
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: "4px 14px 14px 14px",
        fontSize: 13,
        color: T.text1,
        lineHeight: 1.6,
        fontFamily: T.body,
      }}
        dangerouslySetInnerHTML={{ __html: fmt(content) }}
      />
    </div>
  );
}
