// src/providers/PrivyProviderWrapper.jsx
import { PrivyProvider } from "@privy-io/react-auth";
import JupChatWithLanding from "../JupChatWithLanding.jsx";

export default function PrivyProviderWrapper() {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "apple", "twitter", "discord", "github"],
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "all-users" },
        },
        solanaClusters: [
          { name: "mainnet-beta", rpcUrl: import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com" }
        ],
      }}
    >
      <JupChatWithLanding />
    </PrivyProvider>
  );
}
