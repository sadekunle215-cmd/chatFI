/**
 * WalletContext
 * ─────────────
 * Handles wallet connection for both iOS and Android using WalletConnect v2.
 * On Android, also supports Solana Mobile Wallet Adapter (MWA) via deep linking.
 *
 * Flow:
 *  1. User taps "Connect Wallet"
 *  2. WalletConnect modal opens → user scans QR or chooses wallet
 *  3. Wallet approves → address + provider stored in context
 *  4. All sign/send operations go through `signTransaction()`
 */

import React, {
  createContext, useContext, useState, useCallback, useRef,
  ReactNode,
} from "react";
import { Platform, Linking, Alert } from "react-native";
import SignClient from "@walletconnect/sign-client";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { b64ToBytes, bytesToB64 } from "../api/jupiter";

const WALLETCONNECT_PROJECT_ID = process.env.EXPO_PUBLIC_WC_PROJECT_ID || "";
const SOLANA_CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1oz4";        // Solana mainnet chainId

interface WalletContextValue {
  address: string | null;
  walletName: string | null;
  isConnected: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (tx: Transaction | VersionedTransaction) => Promise<Uint8Array>;
  signAndSendTransaction: (txB64: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue>({
  address: null, walletName: null, isConnected: false, connecting: false,
  connect: async () => {}, disconnect: () => {},
  signTransaction: async () => new Uint8Array(),
  signAndSendTransaction: async () => "",
});

export const useWallet = () => useContext(WalletContext);

// ── Phantom deep-link helpers (iOS primary) ───────────────────────────────────
// Phantom supports a URL-based signing API for mobile apps.
// Docs: https://docs.phantom.app/phantom-deeplinks/deeplinks-ios-and-android

const PHANTOM_APP_URL = "https://phantom.app";
const CHATFI_URL      = "chatfi://"; // our app's custom URL scheme

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress]     = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const clientRef   = useRef<any>(null);
  const sessionRef  = useRef<any>(null);

  // ── Init WalletConnect client ─────────────────────────────────────────────
  const getClient = async () => {
    if (clientRef.current) return clientRef.current;
    const client = await SignClient.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name:        "ChatFi",
        description: "AI-powered Solana trading assistant",
        url:         "https://chatfi.pro",
        icons:       ["https://chatfi.pro/icon.png"],
      },
    });
    clientRef.current = client;

    // Handle session events
    client.on("session_delete", () => { disconnect(); });
    client.on("session_expire", () => { disconnect(); });
    return client;
  };

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const client = await getClient();
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          solana: {
            methods:  ["solana_signTransaction", "solana_signMessage"],
            chains:   [SOLANA_CHAIN],
            events:   ["chainChanged", "accountsChanged"],
          },
        },
      });

      if (uri) {
        // Try to open in a wallet app; fall back to deep link
        const walletLinks = [
          `phantom://wc?uri=${encodeURIComponent(uri)}`,
          `solflare://wc?uri=${encodeURIComponent(uri)}`,
          `trust://wc?uri=${encodeURIComponent(uri)}`,
        ];

        let opened = false;
        for (const link of walletLinks) {
          const canOpen = await Linking.canOpenURL(link);
          if (canOpen) {
            await Linking.openURL(link);
            opened = true;
            break;
          }
        }

        if (!opened) {
          // Fallback: open Phantom web page with WC uri
          await Linking.openURL(`https://phantom.app/ul/v1/connect?app_url=${encodeURIComponent("https://chatfi.pro")}&redirect_link=${encodeURIComponent(uri)}`);
        }
      }

      const session = await approval();
      sessionRef.current = session;

      const accounts = session.namespaces?.solana?.accounts || [];
      if (accounts.length > 0) {
        const addr = accounts[0].split(":")[2];
        setAddress(addr);
        setWalletName(session.peer?.metadata?.name || "Wallet");
      }
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        Alert.alert("Connection cancelled", "You rejected the wallet connection.");
      } else {
        Alert.alert("Connection failed", err?.message || "Could not connect wallet.");
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (sessionRef.current && clientRef.current) {
      try {
        clientRef.current.disconnect({
          topic:  sessionRef.current.topic,
          reason: { code: 6000, message: "User disconnected" },
        });
      } catch {}
    }
    sessionRef.current = null;
    setAddress(null);
    setWalletName(null);
  }, []);

  // ── Sign transaction ──────────────────────────────────────────────────────
  const signTransaction = useCallback(async (tx: Transaction | VersionedTransaction): Promise<Uint8Array> => {
    const client  = clientRef.current;
    const session = sessionRef.current;
    if (!client || !session || !address) throw new Error("Wallet not connected");

    const serialized = tx.serialize({ requireAllSignatures: false });
    const txB64 = bytesToB64(serialized);

    const result = await client.request({
      topic: session.topic,
      chainId: SOLANA_CHAIN,
      request: {
        method: "solana_signTransaction",
        params: { transaction: txB64 },
      },
    });

    // Wallet returns signed tx as base64
    const signedB64 = result?.transaction || result?.signedTransaction || result;
    if (!signedB64 || typeof signedB64 !== "string") {
      throw new Error("Wallet returned unexpected sign response");
    }
    return b64ToBytes(signedB64);
  }, [address]);

  // ── Sign + broadcast ──────────────────────────────────────────────────────
  const signAndSendTransaction = useCallback(async (txB64: string): Promise<string> => {
    const client  = clientRef.current;
    const session = sessionRef.current;
    if (!client || !session || !address) throw new Error("Wallet not connected");

    const signedBytes = await signTransaction(
      VersionedTransaction.deserialize(b64ToBytes(txB64))
    );

    // Broadcast via Solana RPC
    const rpcRes = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "sendTransaction",
        params: [bytesToB64(signedBytes), { encoding: "base64", skipPreflight: true }],
      }),
    });
    const rpcData = await rpcRes.json();
    const sig = rpcData?.result;
    if (!sig) throw new Error(rpcData?.error?.message || "Transaction failed to broadcast");
    return sig;
  }, [address, signTransaction]);

  return (
    <WalletContext.Provider value={{
      address, walletName,
      isConnected: !!address,
      connecting,
      connect, disconnect,
      signTransaction, signAndSendTransaction,
    }}>
      {children}
    </WalletContext.Provider>
  );
}
