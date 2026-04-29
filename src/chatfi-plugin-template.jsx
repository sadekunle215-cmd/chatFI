// ─────────────────────────────────────────────────────────────────────────────
// ExamplePlugin.jsx  —  Template for adding new features to JupChat
//
// HOW TO USE:
//  1. Copy this file to src/plugins/YourFeatureName.jsx
//  2. Rename everything: ExamplePlugin → YourFeatureName, "example" → "yourfeature"
//  3. In JupChat.jsx:
//       a) Uncomment / add import at the top:
//            import YourFeatureName, { suggestionGroup as yourSuggestions } from "./plugins/YourFeatureName";
//       b) Add yourSuggestions to PLUGIN_SUGGESTION_GROUPS array
//       c) Add panel render in the Plugin Panels section:
//            {activePlugin === "yourfeature" && (
//              <YourFeatureName onClose={() => setActivePlugin(null)} T={T} send={send} />
//            )}
//       d) If a quick action button should open the panel instead of sending a chat message,
//          in the SUGGESTION_GROUPS render (around line 12890), change the onClick for that item.
//          But the easiest approach is to just use send() — the AI will handle it.
// ─────────────────────────────────────────────────────────────────────────────

// 1. ── Quick action items shown in the suggestions bar ───────────────────────
//    These appear as pill buttons under your group label on the home screen.
export const suggestionGroup = {
  label: "My Feature",       // group heading
  color: "#f6ad55",          // dot + label color (use any hex)
  items: [
    "Do thing A",            // these strings get sent to the AI when clicked
    "Do thing B",
  ],
};

// 2. ── The panel UI component ─────────────────────────────────────────────────
//    Props:
//      onClose  — call this to hide the panel
//      T        — design tokens object (colors, fonts) from JupChat
//      send     — function to send a message to the AI chat
export default function ExamplePlugin({ onClose, T, send }) {
  return (
    <div style={{
      margin: "0 16px 16px",
      padding: 20,
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontFamily: T.serif, fontSize: 15, fontWeight: 500, color: T.text1 }}>
          My Feature
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: T.text3, fontSize: 16, cursor: "pointer" }}>
          ✕
        </button>
      </div>

      {/* Body — put your feature UI here */}
      <div style={{ color: T.text2, fontSize: 13 }}>
        <p>This is where your feature UI goes.</p>
        <button
          onClick={() => send("Do thing A")}
          style={{
            marginTop: 12,
            padding: "8px 16px",
            background: T.accent,
            border: "none",
            borderRadius: 8,
            color: "#0d1117",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}>
          Trigger AI action
        </button>
      </div>
    </div>
  );
}
