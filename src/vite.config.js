import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Required for @solana/web3.js — polyfills Buffer, crypto, etc.
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  define: {
    "process.env": {},
  },
  optimizeDeps: {
    include: ["@solana/web3.js"],
  },
});
