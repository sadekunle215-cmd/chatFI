import { useRef } from "react";
import { T, SUGGESTION_GROUPS } from "../constants";
import { SvgSend } from "./Icons";

// ── ChatInput ─────────────────────────────────────────────────────────────────
// Bottom input bar with send button and collapsible suggestion chips.
export default function ChatInput({ input, setInput, onSend, loading, activeSuggGroup, setActiveSuggGroup }) {
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleSuggestion = (text) => {
    setActiveSuggGroup(null);
    onSend(text);
  };

  return (
    <div style={{ padding: "0 16px 16px", flexShrink: 0 }}>
      {/* Suggestion groups */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
        {SUGGESTION_GROUPS.map(group => (
          <div key={group.label} style={{ position:"relative" }}>
            <button
              onClick={() => setActiveSuggGroup(activeSuggGroup === group.label ? null : group.label)}
              style={{
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
                background: activeSuggGroup === group.label ? group.color + "22" : T.surface,
                border: `1px solid ${activeSuggGroup === group.label ? group.color : T.border}`,
                borderRadius: 20, color: activeSuggGroup === group.label ? group.color : T.text2,
                cursor: "pointer", transition: "all 0.15s",
              }}>
              {group.label}
            </button>
            {activeSuggGroup === group.label && (
              <div style={{
                position: "absolute", bottom: "100%", left: 0, marginBottom: 6,
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 10, padding: "6px 4px", zIndex: 50,
                minWidth: 200, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              }}>
                {group.items.map(item => (
                  <button key={item}
                    onClick={() => handleSuggestion(item)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "7px 10px", fontSize: 12, color: T.text1,
                      background: "none", border: "none", cursor: "pointer",
                      borderRadius: 7, transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.bg}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input row */}
      <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything — swap, portfolio, alerts, earn…"
          rows={1}
          style={{
            flex: 1, padding: "10px 14px", resize: "none",
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 12, color: T.text1, fontSize: 14,
            fontFamily: T.body, lineHeight: 1.5, outline: "none",
            transition: "border-color 0.15s",
          }}
          onFocus={e => e.target.style.borderColor = T.accent}
          onBlur={e  => e.target.style.borderColor = T.border}
        />
        <button
          onClick={() => onSend()}
          disabled={!input.trim() || loading}
          style={{
            width: 40, height: 40, flexShrink: 0,
            background: input.trim() && !loading ? T.accent : T.accentBg,
            border: `1px solid ${T.accent}66`,
            borderRadius: 10, cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            display: "flex", alignItems:"center", justifyContent:"center",
            transition: "all 0.15s",
          }}>
          {loading
            ? <span style={{ width:14, height:14, border:`2px solid ${T.accent}44`, borderTop:`2px solid ${T.accent}`, borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }}/>
            : <SvgSend size={16} color={input.trim() ? "#0d1117" : T.accent} />
          }
        </button>
      </div>
    </div>
  );
}
