/**
 * YieldRotatorPlugin.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Yield Rotator — auto-detects better Jupiter Earn APY pools and surfaces a
 * "Migrate" banner on any Earn position card.
 *
 * HOW TO ACTIVATE IN chatFI.jsx:
 *   1. import YieldRotatorPlugin, { suggestionGroup as yieldRotatorSuggestions }
 *        from "./plugins/YieldRotatorPlugin";
 *   2. Add yieldRotatorSuggestions to PLUGIN_SUGGESTION_GROUPS.
 *   3. Mount <YieldRotatorPlugin ... /> wherever you render plugin panels
 *      (same pattern as AutoPilotPlugin — inside the messages column, after
 *       all other panels, before the input box).
 *
 * ZERO USER CONFIG:
 *   • Any wallet with an active Jupiter Earn position is automatically monitored.
 *   • The plugin polls every 5 minutes, compares live pool APYs, and injects a
 *     "Migrate" banner onto the Earn position card when a better pool exists.
 *   • Cross-asset migration (USDC → USDT) is fully supported.
 *
 * MIGRATION TX FLOW (3 silent sequential txs):
 *   Tx 1 — Withdraw from current Earn pool
 *   Tx 2 — Swap (only if cross-asset)
 *   Tx 3 — Deposit into new Earn pool
 *
 * REQUIRED PROPS:
 *   walletFull        — connected wallet public key string (or null)
 *   earnPositions     — array from portfolioData.earnPositions
 *   jupFetch          — the existing jupFetch(url, opts?) helper
 *   getActiveProvider — existing getActiveProvider() from chatFI
 *   push              — push("ai", text) chat message helper
 *   T                 — design tokens object from chatFI
 *   isMobile          — boolean
 *
 * OPTIONAL PROPS:
 *   onMigrationDone   — () => void   — called after successful migration (e.g. to refresh portfolio)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { VersionedTransaction, Connection } from "@solana/web3.js";

// ── Jupiter Earn API base (confirmed from docs: api.jup.ag/lend/v1/earn/) ─────
const JUP_EARN_API   = "https://api.jup.ag/lend/v1/earn";
const JUP_SWAP_ORDER = "https://lite-api.jup.ag/ultra/v1/order";
const JUP_SWAP_EXEC  = "https://lite-api.jup.ag/ultra/v1/execute";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Well-known mint addresses — mirrors chatFI TOKEN_MINTS subset
const KNOWN_MINTS = {
  USDC:   "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT:   "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  SOL:    "So11111111111111111111111111111111111111112",
  JUP:    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK:   "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  jitoSOL:"J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  JupSOL: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
};
const KNOWN_SYMS = Object.fromEntries(Object.entries(KNOWN_MINTS).map(([k,v])=>[v,k]));
const KNOWN_DECIMALS = { USDC:6, USDT:6, SOL:9, JUP:6, BONK:5, jitoSOL:9, JupSOL:9 };

// ── Helpers ───────────────────────────────────────────────────────────────────
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const bytesToB64 = (buf) => btoa(String.fromCharCode(...buf));

function mintToSym(mint) {
  return KNOWN_SYMS[mint] || (mint ? mint.slice(0, 6) + "…" : "?");
}
function symToMint(sym) {
  return KNOWN_MINTS[sym] || null;
}

// ── Suggestion group (for PLUGIN_SUGGESTION_GROUPS) ───────────────────────────
export const suggestionGroup = {
  label: "Yield Rotator",
  color: "#c7f284",
  items: [
    "Check my earn yield",
    "Find better APY pools",
    "Migrate my earn position",
    "Best earn rates now",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Plugin Component
// ─────────────────────────────────────────────────────────────────────────────
export default function YieldRotatorPlugin({
  walletFull,
  earnPositions = [],
  jupFetch,
  getActiveProvider,
  push,
  T,
  isMobile,
  onMigrationDone,
  onDirectMigrateRef,
}) {
  // ── State ────────────────────────────────────────────────────────────────
  const [allPools, setAllPools]           = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [migrating, setMigrating]         = useState(null);
  const [migrateStep, setMigrateStep]     = useState("");
  const [lastChecked, setLastChecked]     = useState(null);
  const [successCard, setSuccessCard]     = useState(null); // { posSym, bestSym, posApy, bestApy, depositSig }
  const pollRef = useRef(null);

  // Expose doMigrate to parent for direct mode — parent passes a ref
  // and can call rotatorRef.current.migrate(op) or rotatorRef.current.getOpportunities()
  useEffect(() => {
    if (onDirectMigrateRef) {
      onDirectMigrateRef.current = {
        migrate: (op) => doMigrate(op),
        getOpportunities: () => opportunities,
      };
    }
  });

  // ── Fetch all Jupiter Earn pools with live APYs ───────────────────────────
  const fetchAllPools = useCallback(async () => {
    try {
      // Correct endpoint: /lend/v1/earn/tokens returns all pools with APY info
      const data = await jupFetch(`${JUP_EARN_API}/tokens`);
      const arr = Array.isArray(data) ? data
                : data?.markets || data?.tokens || data?.data || data?.pools || [];

      // Normalise each pool: Jupiter returns APY as totalRate/supplyRate percent strings
      // e.g. "4.8" = 4.8%. Guard: if > 100, it was in bps — divide by 100.
      const parseRate = (raw) => {
        const n = parseFloat(raw || 0);
        if (!n || n <= 0) return 0;
        return n > 100 ? n / 100 : n; // bps → percent OR already percent
      };
      const normalised = arr.map(pool => ({
        ...pool,
        // Expose a unified _apy field the detector can rely on
        _apy: parseRate(pool.totalRate) || parseRate(pool.supplyRate) ||
              parseFloat(pool.totalApy ?? pool.supplyApy ?? pool.apy ?? pool.lendingApy ?? pool.rate ?? 0),
        // Normalise mint: Jupiter uses asset.address not asset.mint
        _mint: pool.asset?.address || pool.asset?.mint || pool.mint || pool.tokenMint || pool.assetMint || "",
        _sym:  pool.asset?.symbol  || pool.symbol || "",
        _id:   pool.planId || pool.id || pool.poolId || pool.marketId || "",
      }));

      setAllPools(normalised);
      return normalised;
    } catch {
      return [];
    }
  }, [jupFetch]);

  // ── Compare user positions vs ALL pools → find best opportunity (any asset) ─
  const detectOpportunities = useCallback((positions, pools) => {
    if (!positions?.length || !pools?.length) return [];
    const ops = [];

    // Normalise a raw APY value to a percent number (e.g. 4.15, not 0.0415 or 41500)
    const toPercent = (raw) => {
      const n = parseFloat(raw || 0);
      if (!n || n <= 0) return 0;
      if (n > 100) return n / 100;   // bps encoded (e.g. 415 → 4.15%)
      if (n < 1)   return n * 100;   // decimal (e.g. 0.0415 → 4.15%)
      return n;                       // already percent (e.g. 4.15)
    };

    for (const pos of positions) {
      // Support both raw API shape AND yieldVaultPositions shape { sym, mint, amount, apy, logo, dec }
      // Jupiter uses asset.address (not asset.mint) for the mint field
      const posMint   = pos.mint || pos.asset?.address || pos.asset?.mint || pos.tokenMint || pos.assetMint || "";
      // Try every possible symbol field — portfolio API uses pos.symbol, yieldVaultPositions uses pos.sym
      const posSym    = pos.sym || pos.symbol || pos.asset?.symbol || pos.assetSymbol
                     || pos.token?.symbol || pos.tokenSymbol
                     || mintToSym(posMint) || "";

      // pos.apy from yieldVaultPositions is already stored as a percent number (e.g. 4.15)
      // portfolio API uses totalApy/supplyApy. Apply toPercent() defensively.
      const rawApy = pos.apy ?? pos.totalApy ?? pos.supplyApy ?? pos.apyPct ?? pos.lendingApy ?? pos.rate ?? 0;
      const posApy = toPercent(rawApy);

      const posAmt    = parseFloat(
        pos.amount ?? pos.depositedAmount ?? pos.underlyingBalance ?? pos.underlyingAssets ??
        pos.depositedUSD ?? pos.value ?? 0
      );
      // Also accept symbol from _fromPortfolio shape
      const resolvedSym = posSym === "Token" || !posSym
        ? (pos.label?.replace(/earn|lend|vault|yield/gi, "").trim() || "?")
        : posSym;
      const posPoolId = pos.planId || pos.poolId || pos.marketId || pos.pool || "";

      if (posAmt <= 0) continue;

      // Find the single best pool across ALL assets (cross-asset included)
      // No minimum APY gap — any improvement triggers the banner
      let bestPool = null;
      let bestApy  = -Infinity;

      for (const pool of pools) {
        // Use pre-normalised _apy field set in fetchAllPools (accounts for totalRate/supplyRate)
        const poolApy = pool._apy ?? 0;
        if (!poolApy || poolApy <= 0) continue;

        // Use pre-normalised _mint and _id fields set in fetchAllPools
        const poolMint = pool._mint || "";
        const poolId   = pool._id   || "";

        // Skip the user's current pool
        const sameById  = poolId && posPoolId && poolId === posPoolId;
        const sameByVal = !sameById && poolMint && poolMint === posMint && Math.abs(poolApy - posApy) < 0.5;
        if (sameById || sameByVal) continue;

        if (poolApy > bestApy) {
          bestApy  = poolApy;
          bestPool = pool;
        }
      }

      // Only show banner if:
      // 1. Current position has a real APY > 0 (avoids ghost banners when APY lookup failed)
      // 2. Best pool is at least 0.10% better (filters noise / rounding artefacts)
      if (bestPool && posApy > 0 && bestApy > posApy && (bestApy - posApy) >= 0.1) {
        const bestMint = bestPool._mint || "";
        ops.push({
          position:     pos,
          posSym:       resolvedSym,
          posMint,
          posApy,
          posAmt,
          posPoolId,
          bestPool,
          bestSym:      bestPool._sym || bestPool.asset?.symbol || bestPool.symbol || mintToSym(bestMint),
          bestMint,
          bestApy,
          apyGap:       bestApy - posApy,
          isCrossAsset: bestMint !== posMint,
        });
      }
    }

    ops.sort((a, b) => b.apyGap - a.apyGap);
    return ops;
  }, []);

  // ── Poll loop ─────────────────────────────────────────────────────────────
  const runCheck = useCallback(async () => {
    if (!walletFull) return;
    const pools = await fetchAllPools();
    const ops   = detectOpportunities(earnPositions, pools);
    setOpportunities(ops);
    setLastChecked(Date.now());
  }, [walletFull, earnPositions, fetchAllPools, detectOpportunities]);

  useEffect(() => {
    runCheck();
    pollRef.current = setInterval(runCheck, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [runCheck]);

  // ── Migration execution ───────────────────────────────────────────────────
  const doMigrate = async (op) => {
    if (!walletFull) { push("ai", "Connect your wallet to migrate."); return; }
    const provider = getActiveProvider();
    if (!provider)  { push("ai", "Wallet provider not found — please reconnect."); return; }

    const { position, posSym, posMint, posAmt, posPoolId, bestPool, bestSym, bestMint, isCrossAsset, posApy, bestApy } = op;

    setMigrating(posPoolId || posSym);
    const rpcUrl = process.env?.NEXT_PUBLIC_SOLANA_RPC || import.meta.env?.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
    const conn   = new Connection(rpcUrl, "confirmed");

    const stepRef = { current: "" };
    const setStep = (s) => { stepRef.current = s; setMigrateStep(s); };

    // waitConfirm: polls every 800ms, accepts processed/confirmed/finalized
    const waitConfirm = async (sig, maxMs = 75000, minLevel = "processed") => {
      const LEVELS = { processed: 0, confirmed: 1, finalized: 2 };
      const minIdx = LEVELS[minLevel] ?? 0;
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        try {
          const res = await conn.getSignatureStatuses([sig], { searchTransactionHistory: true });
          const st  = res?.value?.[0];
          if (st?.err) throw new Error("On-chain error: " + JSON.stringify(st.err));
          if (st?.confirmationStatus && (LEVELS[st.confirmationStatus] ?? -1) >= minIdx) return;
        } catch (pollErr) {
          if (pollErr.message?.startsWith("On-chain error")) throw pollErr;
        }
        await new Promise(r => setTimeout(r, 800));
      }
      throw new Error("Tx timeout — check Solscan");
    };

    // FIX 3: send signed txs directly via conn.sendRawTransaction, not
    // jupFetch(rpcUrl, …). jupFetch routes through the app's API proxy which
    // isn't designed for raw Solana RPC calls — that's what caused "Failed to fetch".
    const sendSigned = async (txBase64) => {
      const tx = VersionedTransaction.deserialize(b64ToBytes(txBase64));
      const signed = await provider.signTransaction(tx);
      const sig = await conn.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
        maxRetries: 5,
        preflightCommitment: "processed",
      });
      return sig;
    };

    // Read actual on-chain token balance for a mint after a tx confirms
    const readTokenBalance = async (mint) => {
      try {
        const { PublicKey } = await import("@solana/web3.js");
        const accounts = await conn.getParsedTokenAccountsByOwner(
          new PublicKey(walletFull),
          { mint: new PublicKey(mint) }
        );
        const raw = accounts.value?.[0]
          ?.account?.data?.parsed?.info?.tokenAmount?.amount;
        return raw && Number(raw) > 0 ? Math.floor(Number(raw)) : null;
      } catch {
        return null;
      }
    };

    try {
      // ── FIX 1: Resolve the real on-chain share amount before withdrawing ──
      // Jupiter Earn tracks positions in shares, not token units. Scaling
      // posAmt (e.g. 0.4 USDC → 400000) does NOT match the share amount the
      // API expects, which is why the withdraw was returning "insufficient funds".
      // Always fetch /positions first and use depositedAmount directly.
      setStep("Fetching position details…");
      let withdrawAmtRaw;
      try {
        // ── FIX: correct query param is ?users= not ?wallet= ──────────────────
        const positions = await jupFetch(`${JUP_EARN_API}/positions?users=${walletFull}`);
        const arr = Array.isArray(positions) ? positions : (positions?.positions || positions?.data || []);
        const matched = arr.find(p => {
          const pId   = p.planId || p.poolId || p.marketId || p.id || "";
          const pMint = p.asset?.address || p.asset?.mint || p.mint || p.token?.address || p.tokenMint || p.assetMint || "";
          return (posPoolId && pId === posPoolId) || (posMint && pMint === posMint);
        });
        const rawFromApi = matched?.depositedAmount ?? matched?.shares ?? matched?.rawAmount ?? null;
        if (rawFromApi && Number(rawFromApi) > 0) {
          withdrawAmtRaw = Math.floor(Number(rawFromApi));
          console.log(`[YieldRotator] Using API amount: ${withdrawAmtRaw}`);
        } else {
          const dec = KNOWN_DECIMALS[posSym] ?? KNOWN_DECIMALS[posMint] ?? 6;
          withdrawAmtRaw = posAmt > 1e6 ? Math.floor(posAmt) : Math.floor(posAmt * Math.pow(10, dec));
          console.warn(`[YieldRotator] /positions returned no raw amount — falling back to scaled posAmt: ${withdrawAmtRaw}`);
        }
      } catch (fetchErr) {
        console.warn("[YieldRotator] Could not fetch /positions, falling back:", fetchErr);
        const dec = KNOWN_DECIMALS[posSym] ?? KNOWN_DECIMALS[posMint] ?? 6;
        withdrawAmtRaw = posAmt > 1e6 ? Math.floor(posAmt) : Math.floor(posAmt * Math.pow(10, dec));
      }

      // ── Tx 1: Withdraw from current Earn pool ──────────────────────────────
      setStep("Withdrawing from current pool…");
      push("ai", `[Migrate] ${posSym} Earn → ${bestSym} Earn\nStep 1/3 — withdrawing from current pool…`);

      const preMint    = posMint || symToMint(posSym);
      const bestPlanId = bestPool.planId || bestPool.id || bestPool.poolId;

      const withdrawRes = await jupFetch(`${JUP_EARN_API}/withdraw`, {
        method: "POST",
        body: { asset: preMint, amount: withdrawAmtRaw.toString(), signer: walletFull },
      });
      if (withdrawRes?.error || !withdrawRes?.transaction) {
        throw new Error(withdrawRes?.error || "No withdraw transaction returned");
      }

      const withdrawSig = await sendSigned(withdrawRes.transaction);
      if (!withdrawSig) throw new Error("No signature from withdraw tx");
      await waitConfirm(withdrawSig, 75000, "processed");
      push("ai", `[Done] Step 1/3 — withdrawn from ${posSym} Earn. [Solscan](https://solscan.io/tx/${withdrawSig})`);

      // ── Tx 2: Swap if cross-asset ──────────────────────────────────────────
      let depositMint = preMint;
      let depositSym  = posSym;

      if (isCrossAsset && bestMint && bestMint !== depositMint) {
        setStep("Swapping to target asset…");
        push("ai", `[Swap] Step 2/3 — swapping ${posSym} → ${bestSym}…`);

        // Read actual post-withdraw wallet balance — shares redeemed to tokens
        const postWithdrawBalance = await readTokenBalance(depositMint);
        const swapInputAmt = postWithdrawBalance ?? withdrawAmtRaw;

        const swapOrderRes = await jupFetch(
          `${JUP_SWAP_ORDER}?inputMint=${depositMint}&outputMint=${bestMint}&amount=${swapInputAmt}&slippageBps=50&taker=${walletFull}`
        );
        if (swapOrderRes?.error || !swapOrderRes?.transaction) {
          throw new Error(swapOrderRes?.error || "No swap transaction returned");
        }

        const swapTx     = VersionedTransaction.deserialize(b64ToBytes(swapOrderRes.transaction));
        const swapSigned = await provider.signTransaction(swapTx);
        const swapExec   = await jupFetch(JUP_SWAP_EXEC, {
          method: "POST",
          body: { signedTransaction: bytesToB64(swapSigned.serialize()), requestId: swapOrderRes.requestId },
        });
        if (swapExec?.error) throw new Error(swapExec.error);
        const swapSig = swapExec?.signature || swapExec?.txid;
        if (!swapSig) throw new Error("No signature from swap tx");
        await waitConfirm(swapSig, 75000, "processed");

        depositMint = bestMint;
        depositSym  = bestSym;

        const outDec = KNOWN_DECIMALS[bestSym] ?? 6;
        const outAmt = swapOrderRes.outAmount || swapOrderRes.outputAmount;
        const depositHuman = outAmt
          ? (Number(outAmt) / Math.pow(10, outDec)).toFixed(4)
          : "~" + (swapInputAmt / Math.pow(10, KNOWN_DECIMALS[posSym] ?? 6)).toFixed(4);
        push("ai", `[Done] Step 2/3 — swapped to ${bestSym}. Depositing ~${depositHuman} ${bestSym}. [Solscan](https://solscan.io/tx/${swapSig})`);
      } else {
        push("ai", `[Skip] Step 2/3 — same asset (${posSym}), no swap needed.`);
      }

      // ── Tx 3: Deposit into new Earn pool (with retry) ─────────────────────
      setStep("Depositing into new pool…");
      push("ai", `[Deposit] Step 3/3 — depositing into ${bestSym} Earn (${bestApy.toFixed(2)}% APY)…`);

      // FIX 2: always read actual wallet balance before building the deposit tx.
      // The old prefetch used pre-withdraw amounts which were wrong. Reading chain
      // state here is the ground truth for both same-asset and cross-asset paths.
      const actualBalance = await readTokenBalance(depositMint);
      const depositAmtRaw = actualBalance ?? (() => {
        const dec = KNOWN_DECIMALS[depositSym] ?? 6;
        return posAmt > 1e6 ? Math.floor(posAmt) : Math.floor(posAmt * Math.pow(10, dec));
      })();

      if (!depositAmtRaw || depositAmtRaw <= 0) {
        throw new Error(`Could not determine deposit amount for ${depositSym} — check wallet balance.`);
      }

      let depositRes = await jupFetch(`${JUP_EARN_API}/deposit`, {
        method: "POST",
        body: {
          asset:  depositMint,
          amount: depositAmtRaw.toString(),
          signer: walletFull,
          ...(bestPlanId ? { planId: bestPlanId } : {}),
        },
      });
      if (depositRes?.error || !depositRes?.transaction) {
        throw new Error(depositRes?.error || `No deposit transaction returned (amount: ${depositAmtRaw}, mint: ${depositMint})`);
      }

      // Retry deposit up to 2 times — funds already moved, can't give up easily
      let depositSig = null;
      let lastDepositErr = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          depositSig = await sendSigned(depositRes.transaction);
          if (!depositSig) throw new Error("No signature from deposit tx");
          await waitConfirm(depositSig);
          break; // success — exit retry loop

        } catch (err) {
          lastDepositErr = err;
          if (attempt === 0) {
            console.warn("Deposit attempt 1 failed, retrying…", err?.message);
            setStep("Deposit timed out — retrying…");
            push("ai", `[Retry] Deposit attempt 1 timed out — retrying automatically…`);
            await new Promise(r => setTimeout(r, 2000));
            // Fetch a fresh deposit tx with a new blockhash for the retry
            try {
              const retryRes = await jupFetch(`${JUP_EARN_API}/deposit`, {
                method: "POST",
                body: {
                  asset:  depositMint,
                  amount: depositAmtRaw.toString(),
                  signer: walletFull,
                  ...(bestPlanId ? { planId: bestPlanId } : {}),
                },
              });
              if (retryRes?.transaction && !retryRes?.error) depositRes = retryRes;
            } catch { /* use original tx as last resort */ }
          }
        }
      }

      if (!depositSig) {
        throw new Error(
          `Deposit failed after 2 attempts — your ${bestSym} is safely in your wallet. ` +
          `Please deposit manually via the ${bestSym} Earn Vault card. ` +
          `(${lastDepositErr?.message || "unknown error"})`
        );
      }

      push("ai",
        `[Complete] Migration done\n` +
        `${posSym} Earn (${posApy.toFixed(2)}%) → ${bestSym} Earn (${bestApy.toFixed(2)}%)\n` +
        `Now earning +${(bestApy - posApy).toFixed(2)}% more APY\n` +
        `[View deposit tx](https://solscan.io/tx/${depositSig})`
      );

      // Show success card in the panel
      setSuccessCard({ posSym, bestSym, posApy, bestApy, depositSig });

      // ── Sync yield vault: cancel old vault + recreate for new position ──────
      // After a successful migration the earn position has moved from posSym →
      // bestSym. We cancel any vault watching the old position (so it doesn't
      // silently stay "active" pointing at a token the user no longer holds in
      // Earn) and immediately create a fresh vault for the new position,
      // preserving the same threshold and target token settings.
      try {
        const vaultRes = await fetch(`/api/yield-vault?wallet=${walletFull}`);
        if (vaultRes.ok) {
          const { vaults = [] } = await vaultRes.json();

          // Match on earnMint first (exact), then fall back to earnSymbol string compare
          const staleVaults = vaults.filter(v => {
            if (posMint && v.earnMint && v.earnMint === posMint) return true;
            const storedSym = (v.earnSymbol || v.earnSym || v.sym || "").toUpperCase();
            return storedSym && storedSym === posSym.toUpperCase();
          });

          for (const vault of staleVaults) {
            // 1️⃣  Cancel the old vault
            await fetch(`/api/yield-vault?id=${vault.id}&wallet=${walletFull}`, {
              method: "DELETE",
            });

            // 2️⃣  Recreate for the new position — inherit threshold + target token
            await fetch(`/api/yield-vault`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                wallet:             walletFull,
                earnMint:           bestMint,
                earnSymbol:         bestSym,
                earnJlMint:         vault.earnJlMint || null,
                depositedAmount:    vault.depositedAmount || 0,
                depositedValueUSD:  vault.depositedValueUSD || 0,
                thresholdUSD:       vault.thresholdUSD,
                targetTokenSymbol:  vault.targetTokenSymbol,
                targetTokenMint:    vault.targetTokenMint,
                targetTokenDecimals: vault.targetTokenDecimals ?? 9,
              }),
            });
          }

          if (staleVaults.length > 0) {
            push("ai",
              `[Vault] Cancelled old ${posSym} vault and created a new one for ${bestSym} Earn ` +
              `(same threshold & target token preserved).`
            );
          }
        }
      } catch (vaultErr) {
        // Non-fatal — migration succeeded, vault sync failed
        console.warn("[YieldRotator] Vault sync failed (non-fatal):", vaultErr);
      }

      // Notify user via Telegram if they have it linked
      try {
        await fetch("/api/yield-vault?action=notify-rotation-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: walletFull, posSym, bestSym, posApy, bestApy, depositSig, isCrossAsset }),
        });
      } catch { /* non-fatal — migration already succeeded */ }

      // Brief delay — lets Firestore propagate the newly created vault before
      // fetchEarnPositionsForVault re-fetches, preventing the "NO VAULT" ghost
      // state that appears when the GET races the POST on the yield-vault API.
      await new Promise(r => setTimeout(r, 1500));

      // Refresh opportunities after successful migration
      await runCheck();
      onMigrationDone?.();

    } catch (err) {
      const msg = err?.message || "Unknown error";
      push("ai", `[Failed] Migration stopped at: ${stepRef.current || "unknown step"}\n${msg}`);
    } finally {
      setMigrating(null);
      setMigrateStep("");
    }
  };

  // ── Render: Migrate banner cards ──────────────────────────────────────────
  if (!opportunities.length && !successCard) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Success card — shown after migration completes ── */}
      {successCard && (
        <div style={{
          padding: "14px 16px",
          background: "linear-gradient(135deg, #0a1f0a, #0d230d)",
          border: "1px solid #68d39155",
          borderRadius: 12,
          fontSize: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {/* checkmark circle */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#68d391" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.5 3.5 6.5-7"/>
              </svg>
              <span style={{ fontWeight: 700, color: "#68d391", fontSize: 13 }}>Migration Complete</span>
            </div>
            <button onClick={() => setSuccessCard(null)}
              style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", padding: 2, lineHeight: 1 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* from → to row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ background: T.surface, borderRadius: 8, padding: "5px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text2 }}>{successCard.posSym}</div>
              <div style={{ fontSize: 10, color: T.text3 }}>{successCard.posApy.toFixed(2)}%</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {/* arrow right */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#68d391" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              <span style={{ fontSize: 10, color: "#68d391", fontWeight: 700 }}>+{(successCard.bestApy - successCard.posApy).toFixed(2)}% APY</span>
            </div>
            <div style={{ background: "rgba(104,211,145,0.08)", border: "1px solid rgba(104,211,145,0.25)", borderRadius: 8, padding: "5px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#68d391" }}>{successCard.bestSym}</div>
              <div style={{ fontSize: 10, color: "#68d391", fontWeight: 700 }}>{successCard.bestApy.toFixed(2)}%</div>
            </div>
          </div>

          <a href={`https://solscan.io/tx/${successCard.depositSig}`} target="_blank" rel="noreferrer"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "7px", background: "rgba(104,211,145,0.08)", border: "1px solid rgba(104,211,145,0.2)", borderRadius: 8, color: "#68d391", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            View on Solscan
          </a>
        </div>
      )}
      {/* Section header + opportunity cards — only when opportunities exist */}
      {opportunities.length > 0 && (<>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {/* rotate icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c7f284" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#c7f284", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Better APY Available
          </span>
          <span style={{ fontSize: 10, color: T.text3, background: T.border, borderRadius: 8, padding: "1px 6px" }}>
            {opportunities.length}
          </span>
        </div>

      {opportunities.map((op, i) => {
        const key     = op.posPoolId || op.posSym + i;
        const isBusy  = migrating === key || migrating === (op.posPoolId || op.posSym);
        // Normalize posAmt to human-readable units — raw units check
        // If posAmt > 1e6 it's likely raw units (e.g. 1300000 = 1.3 USDC with 6 decimals)
        const dec     = KNOWN_DECIMALS[op.posSym] ?? KNOWN_DECIMALS[op.posMint] ?? 6;
        const posAmtHuman = op.posAmt > 1e6
          ? op.posAmt / Math.pow(10, dec)
          : op.posAmt;
        // Use depositedUSD from position if available, otherwise estimate from amount
        const usdVal  = op.position?.depositedUSD || op.position?.usdValue || posAmtHuman;
        const amtFmt  = usdVal > 0 ? `$${parseFloat(usdVal).toFixed(2)}` : "";
        const apyDiff = op.apyGap.toFixed(2);
        // Token logos — use img.jup.ag CDN which works for all Solana tokens
        const posLogo  = op.position?.logo || (op.posMint  ? `https://img.jup.ag/tokens/${op.posMint}`  : null);
        const bestLogo = op.bestPool?.logoUrl || op.bestPool?.asset?.logo_url || (op.bestMint ? `https://img.jup.ag/tokens/${op.bestMint}` : null);

        return (
          <div key={key}
            style={{
              padding: "12px 14px",
              background: "linear-gradient(135deg, #0f1a0f, #0d1c0d)",
              border: "1px solid #c7f28444",
              borderRadius: 12,
              fontSize: 12,
            }}>

            {/* Top row: current → best */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {/* Current pool chip */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: T.surface, borderRadius: 8, padding: "5px 10px", minWidth: 64, gap: 3 }}>
                {posLogo && <img src={posLogo} alt={op.posSym} style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
                <span style={{ fontSize: 11, fontWeight: 700, color: T.text2 }}>{op.posSym}</span>
                <span style={{ fontSize: 10, color: T.text3 }}>{op.posApy.toFixed(2)}%</span>
              </div>

              {/* Arrow + gap badge */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ height: 1, flex: 1, background: "#c7f28444" }}/>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#c7f284" }}>+{apyDiff}%</span>
                  <div style={{ height: 1, flex: 1, background: "#c7f28444" }}/>
                </div>
                {op.isCrossAsset && (
                  <span style={{ fontSize: 9, color: T.text3, fontStyle: "italic" }}>cross-asset swap</span>
                )}
              </div>

              {/* Best pool chip */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(199,242,132,0.06)", border: "1px solid rgba(199,242,132,0.25)", borderRadius: 8, padding: "5px 10px", minWidth: 64, gap: 3 }}>
                {bestLogo && <img src={bestLogo} alt={op.bestSym} style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
                <span style={{ fontSize: 11, fontWeight: 700, color: "#c7f284" }}>{op.bestSym}</span>
                <span style={{ fontSize: 10, color: "#c7f284", fontWeight: 700 }}>{op.bestApy.toFixed(2)}%</span>
              </div>
            </div>

            {/* Amount row */}
            {amtFmt && (
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>
                Position: <span style={{ color: T.text2, fontWeight: 600 }}>{amtFmt}</span>
                {op.isCrossAsset && <span style={{ marginLeft: 8, color: "#c7f284" }}>Includes swap</span>}
              </div>
            )}

            {/* Progress bar during migration */}
            {isBusy && migrateStep && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: "#c7f284", marginBottom: 4 }}>{migrateStep}</div>
                <div style={{ height: 3, borderRadius: 3, background: T.border, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    background: "linear-gradient(90deg, #c7f284, #68d391)",
                    borderRadius: 3,
                    animation: "rotatorProgress 1.5s ease-in-out infinite",
                    width: "60%",
                  }}/>
                </div>
              </div>
            )}

            {/* Migrate button */}
            <button
              disabled={!!migrating}
              onClick={() => doMigrate(op)}
              style={{
                width: "100%",
                padding: "8px",
                background: isBusy ? T.border : "linear-gradient(90deg, #1a2e0a, #1a2e1a)",
                border: `1px solid ${isBusy ? T.border : "#c7f28466"}`,
                borderRadius: 8,
                color: isBusy ? T.text3 : "#c7f284",
                fontSize: 12,
                fontWeight: 700,
                cursor: migrating ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}>
              {isBusy ? (
                <>
                  <span style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    border: "2px solid #c7f28444",
                    borderTop: "2px solid #c7f284",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}/>
                  Migrating…
                </>
              ) : (
                <>
                  {/* Rotate arrows icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  Migrate to {op.bestSym} Earn (+{apyDiff}% APY)
                </>
              )}
            </button>
          </div>
        );
      })}

      {/* Last checked */}
      {lastChecked && (
        <div style={{ fontSize: 10, color: T.text3, textAlign: "right", marginTop: 2 }}>
          Last checked: {new Date(lastChecked).toLocaleTimeString()}
          <button onClick={runCheck}
            style={{ marginLeft: 8, background: "none", border: "none", color: "#c7f284", fontSize: 10, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
            refresh
          </button>
        </div>
      )}
      </>)}

      {/* Keyframe styles */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes rotatorProgress {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION GUIDE (paste into chatFI.jsx where earn positions are rendered)
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. IMPORT (top of chatFI.jsx, replace the commented-out example):
//
//    import YieldRotatorPlugin, { suggestionGroup as yieldRotatorSuggestions }
//      from "./plugins/YieldRotatorPlugin";
//
//    const PLUGIN_SUGGESTION_GROUPS = [
//      yieldRotatorSuggestions,
//    ];
//
//
// 2. MOUNT inside the portfolio panel, right AFTER the Earn Positions section
//    (around line 12783, after the earnPos block closes):
//
//    <YieldRotatorPlugin
//      walletFull={walletFull}
//      earnPositions={portfolioData?.earnPositions || []}
//      jupFetch={jupFetch}
//      getActiveProvider={getActiveProvider}
//      push={push}
//      T={T}
//      isMobile={isMobile}
//      onMigrationDone={() => fetchPortfolio()}  // your existing refresh fn
//    />
//
//
// 3. SERVER ROUTE (api/yield-rotator.js — optional, for Telegram alerts):
//    See YieldRotatorCron.js in the same folder for the Vercel cron handler.
//
// ─────────────────────────────────────────────────────────────────────────────
