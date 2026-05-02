/**
 * YieldRotatorPlugin
 * Scans earn positions and surfaces migration banners when a better APY provider is available.
 * Currently a stub — renders nothing until rotation logic is implemented.
 */

import { useEffect } from "react";

// ── Suggestion group (used by PLUGIN_SUGGESTION_GROUPS in chatFI.jsx) ────────
export const suggestionGroup = {
  label: "Yield Rotator",
  suggestions: [
    { label: "Find better APY", prompt: "Show me earn positions with better APY available" },
    { label: "Rotate my yield", prompt: "Migrate my earn position to the highest APY provider" },
  ],
};

// ── Main plugin component ─────────────────────────────────────────────────────
export default function YieldRotatorPlugin({
  walletFull,
  earnPositions = [],
  jupFetch,
  getActiveProvider,
  push,
  T,
  isMobile,
  onMigrationDone,
}) {
  useEffect(() => {
    // TODO: compare earnPositions APYs against available providers
    // and surface migration suggestions via push()
  }, [earnPositions, walletFull]);

  // Renders nothing until rotation UI is built out
  return null;
}
