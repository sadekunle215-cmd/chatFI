// api/rebalance.js — Vercel Serverless Function
// POST /api/rebalance
// Body: { wallet, trades: [{ from, to, amountUsd, fromMint, toMint }], regime }
//
// This runs server-side so the API key stays secret and swaps execute
// even if the user closes the tab (when triggered by autopilot webhook).

import {
  Connection,
  VersionedTransaction,
  Keypair,
  PublicKey,
} from "@solana/web3.js";

const RPC_URL       = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const JUP_API_KEY   = process.env.JUP_API_KEY    || "";
const SLIPPAGE_BPS  = 50; // 0.5%

const jupHeaders = {
  "Content-Type": "application/json",
  ...(JUP_API_KEY ? { "x-api-key": JUP_API_KEY } : {}),
};

async function getQuote(fromMint, toMint, amountRaw) {
  const url = `https://api.jup.ag/swap/v1/quote?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&slippageBps=${SLIPPAGE_BPS}`;
  const res  = await fetch(url, { headers: jupHeaders });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `Quote failed: ${res.status}`);
  return data;
}

async function buildSwapTx(quote, userPublicKey) {
  const res = await fetch("https://api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: jupHeaders,
    body: JSON.stringify({
      quoteResponse:    quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.swapTransaction) throw new Error(data.error?.message || "No swap transaction");
  return data.swapTransaction; // base64
}

// ── Token decimals lookup (hardcoded common ones + fallback 6) ────────────────
const DECIMALS = {
  So11111111111111111111111111111111111111112: 9,  // SOL
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6, // USDC
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 6, // USDT
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 6, // JUP
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 5, // BONK
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: 6, // WIF
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { wallet, trades, regime } = req.body || {};

  if (!wallet || !trades?.length) {
    return res.status(400).json({ error: "Missing wallet or trades" });
  }

  // ── Safety gate: refuse to execute if any monitored token is HIGH/EXTREME ──
  if (regime) {
    const blocked = Object.entries(regime).find(([, r]) => r === "EXTREME");
    if (blocked) {
      return res.status(200).json({
        blocked: true,
        reason:  `${blocked[0]} is in EXTREME volatility — execution blocked for safety`,
        results: [],
      });
    }
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const results    = [];

  // NOTE: This backend signs with a server keypair only if REBALANCE_KEYPAIR_SECRET
  // env var is set. Otherwise it returns unsigned transactions for the client to sign.
  // For full autopilot (sign server-side), fund a dedicated rebalancer wallet and
  // set REBALANCE_KEYPAIR_SECRET as a base58 private key in Vercel env vars.
  const serverKeypair = process.env.REBALANCE_KEYPAIR_SECRET
    ? Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.REBALANCE_KEYPAIR_SECRET))
      )
    : null;

  for (const trade of trades) {
    try {
      const decimals = DECIMALS[trade.fromMint] ?? 6;
      const amtRaw   = Math.floor(trade.amountUsd * Math.pow(10, decimals)).toString();

      const quote   = await getQuote(trade.fromMint, trade.toMint, amtRaw);
      const txB64   = await buildSwapTx(quote, wallet);

      if (serverKeypair) {
        // ── Server-side signing (full autopilot mode) ─────────────────────
        const txBytes  = Uint8Array.from(Buffer.from(txB64, "base64"));
        const tx       = VersionedTransaction.deserialize(txBytes);
        tx.sign([serverKeypair]);
        const sig      = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        const conf     = await connection.confirmTransaction(sig, "confirmed");
        results.push({
          success:         !conf.value?.err,
          from:            trade.from,
          to:              trade.to,
          amountFormatted: `$${trade.amountUsd.toFixed(2)}`,
          sig,
          mode:            "server-signed",
        });
      } else {
        // ── Return unsigned tx for client to sign ─────────────────────────
        results.push({
          success:     true,
          from:        trade.from,
          to:          trade.to,
          amountFormatted: `$${trade.amountUsd.toFixed(2)}`,
          txBase64:    txB64,
          mode:        "client-sign-required",
        });
      }
    } catch (err) {
      results.push({ success: false, from: trade.from, to: trade.to, error: err?.message });
    }
  }

  return res.status(200).json({ success: true, results });
}
