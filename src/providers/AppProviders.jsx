import { PrivyProvider } from "@privy-io/react-auth";
import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana as solanaMainnet } from "@reown/appkit/networks";
import { REOWN_PROJECT_ID } from "../constants";

// ── Reown AppKit Init (runs once at module load) ──────────────────────────────
const _solanaAdapter = new SolanaAdapter();
createAppKit({
  adapters: [_solanaAdapter],
  networks: [solanaMainnet],
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: "ChatFi",
    description: "ChatFi — Your personal AI tools on Solana",
    url: typeof window !== "undefined" ? window.location.origin : "https://chatfi.app",
    icons: ["https://jup.ag/favicon.ico"],
  },
  features: { analytics: false },
});

// ── AppProviders ──────────────────────────────────────────────────────────────
// Wrap your app in this component at the root (main.jsx / App.jsx)
export default function AppProviders({ children }) {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID || ""}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#c7f284",
          logo: "https://jup.ag/favicon.ico",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana:   { createOnLogin: "all-users" },
          noPromptOnSignature: false,
          requireUserPasswordOnCreate: false,
        },
        solanaClusters: [
          { name: "mainnet-beta", rpcUrl: import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com" },
        ],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
