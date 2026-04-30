import { useState, useCallback } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { jupFetch } from "../utils/solana";
import { TOKEN_MINTS, JUP_QUOTE_API, JUP_SWAP_API } from "../constants";

// ── useSwap ───────────────────────────────────────────────────────────────────
// Manages swap panel state, quote fetching, and swap execution.
export default function useSwap({ walletFull, getActiveProvider, push, tokenCacheRef, tokenDecimalsRef }) {
  const [showSwap, setShowSwap]     = useState(false);
  const [swapCfg, setSwapCfg]       = useState({
    from: "SOL", fromMint: TOKEN_MINTS.SOL, fromDecimals: 9,
    to:   "USDC", toMint: TOKEN_MINTS.USDC, toDecimals: 6,
    amount: "",
  });
  const [swapQuote, setSwapQuote]   = useState(null);
  const [quoteFetching, setQuoteFetching] = useState(false);
  const [swapStatus, setSwapStatus] = useState(null); // null | "signing" | "done" | "error"

  // ── Fetch quote ──────────────────────────────────────────────────────────────
  const fetchSwapQuote = useCallback(async () => {
    if (!swapCfg.fromMint || !swapCfg.toMint || !swapCfg.amount) { setSwapQuote(null); return; }
    setQuoteFetching(true);
    try {
      const dec    = swapCfg.fromDecimals || 9;
      const amtRaw = Math.floor(parseFloat(swapCfg.amount) * Math.pow(10, dec)).toString();
      const data   = await jupFetch(`${JUP_QUOTE_API}?inputMint=${swapCfg.fromMint}&outputMint=${swapCfg.toMint}&amount=${amtRaw}&slippageBps=50`);
      setSwapQuote(data?.error ? null : data);
    } catch { setSwapQuote(null); }
    setQuoteFetching(false);
  }, [swapCfg]);

  // ── Execute swap ─────────────────────────────────────────────────────────────
  const doSwap = useCallback(async (cfg = null) => {
    const provider = getActiveProvider();
    if (!provider) { push("ai", "Please **connect your wallet** first."); return; }
    const active = cfg || swapCfg;
    if (!active.fromMint || !active.toMint || !active.amount) return;

    setSwapStatus("signing");
    try {
      const dec    = active.fromDecimals || 9;
      const amtRaw = Math.floor(parseFloat(active.amount) * Math.pow(10, dec)).toString();

      const quote = await jupFetch(`${JUP_QUOTE_API}?inputMint=${active.fromMint}&outputMint=${active.toMint}&amount=${amtRaw}&slippageBps=50`);
      if (!quote || quote.error) throw new Error(quote?.error?.message || "No quote returned");

      const swapData = await jupFetch(JUP_SWAP_API, {
        method: "POST",
        body: { quoteResponse: quote, userPublicKey: walletFull, wrapAndUnwrapSol: true },
      });
      if (!swapData?.swapTransaction) throw new Error("No swap transaction returned");

      const txBytes = Uint8Array.from(atob(swapData.swapTransaction), c => c.charCodeAt(0));
      const tx      = VersionedTransaction.deserialize(txBytes);
      const signed  = await provider.signTransaction(tx);

      const RPC_URL    = import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(RPC_URL, "confirmed");
      const sig        = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });

      push("ai", `Confirming swap… ⏳`);
      await connection.confirmTransaction(sig, "confirmed");

      setSwapStatus("done");
      setShowSwap(false);
      const outAmt = (parseInt(quote.outAmount) / Math.pow(10, active.toDecimals || 6)).toFixed(4);
      push("ai", `Swap complete ✓\n\n**${active.amount} ${active.from}** → **${outAmt} ${active.to}**\n\nTx: [View on Solscan →](https://solscan.io/tx/${sig})`);
    } catch (err) {
      setSwapStatus("error");
      push("ai", `Swap failed: ${err?.message}`);
    }
    setSwapStatus(null);
  }, [swapCfg, walletFull, getActiveProvider, push]);

  return {
    showSwap, setShowSwap,
    swapCfg, setSwapCfg,
    swapQuote, setSwapQuote,
    quoteFetching,
    swapStatus,
    fetchSwapQuote,
    doSwap,
  };
}
