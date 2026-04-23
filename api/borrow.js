// /api/borrow.js — Vercel serverless function
// Builds a versioned (v0) transaction for Jupiter Lend Borrow operations using getOperateIx.
// All ops (deposit, borrow, repay, withdraw, combined) use the same function with signed BN amounts:
//   colAmount  > 0 = deposit,  < 0 = withdraw,  0 = no collateral change
//   debtAmount > 0 = borrow,   < 0 = repay,     0 = no debt change
//   positionId = 0 → SDK creates position; two-call pattern required (per official docs)

import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import BN from "bn.js";
import { getOperateIx } from "@jup-ag/lend/borrow";

const RPC_URL = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      action,        // "operate" — the only action for now
      vaultId,       // number: 1=SOL→USDC, 2=JitoSOL→SOL, 3=JupSOL→SOL, 4=WBTC→USDC, 5=JLP→USDC, 6=JUP→USDC, 7=USDC→USDT
      positionId,    // number: 0 = create new position + operate atomically
      colAmount,     // string: collateral in base units. Positive=deposit, negative=withdraw, "0"=no change
      debtAmount,    // string: debt in base units.       Positive=borrow,  negative=repay,   "0"=no change
      signer,        // string: wallet public key
    } = req.body;

    if (action !== "operate") return res.status(400).json({ error: "Unknown action: " + action });
    if (!vaultId || !signer) return res.status(400).json({ error: "Missing required fields: vaultId, signer" });

    const connection = new Connection(RPC_URL, { commitment: "confirmed" });
    const signerPubkey = new PublicKey(signer);

    const colBN  = new BN(colAmount  ?? "0");
    const debtBN = new BN(debtAmount ?? "0");
    const parsedVaultId    = parseInt(vaultId);
    const parsedPositionId = parseInt(positionId ?? 0);

    let finalIxs;
    let finalAlts;
    let resolvedPositionId;

    if (parsedPositionId === 0) {
      // ── TWO-CALL PATTERN (official docs: Combined Operations) ─────────────
      //
      // Call 1: positionId=0 → SDK creates the position and returns positionId.
      //         The ixs from this call contain the create-position instruction(s).
      const call1 = await getOperateIx({
        vaultId:    parsedVaultId,
        positionId: 0,
        colAmount:  colBN,
        debtAmount: debtBN,
        connection,
        signer: signerPubkey,
      });

      // SDK returns `positionId` (not nftId) when called with positionId: 0
      resolvedPositionId = call1?.positionId ?? call1?.nftId;

      if (resolvedPositionId === undefined || resolvedPositionId === null) {
        return res.status(400).json({ error: "SDK did not return a positionId from first call. Cannot proceed." });
      }

      // Call 2: use the real positionId → SDK returns the actual operate instructions
      const call2 = await getOperateIx({
        vaultId:    parsedVaultId,
        positionId: resolvedPositionId,
        colAmount:  colBN,
        debtAmount: debtBN,
        connection,
        signer: signerPubkey,
      });

      // Merge both ixs arrays (call1 has create-position ix, call2 has operate ix)
      finalIxs = [
        ...(call1?.ixs ?? []),
        ...(call2?.ixs ?? []),
      ];

      // Merge and deduplicate address lookup tables by key
      const allAlts = [
        ...(call1?.addressLookupTableAccounts ?? []),
        ...(call2?.addressLookupTableAccounts ?? []),
      ];
      const seen = new Set();
      finalAlts = allAlts.filter((alt) => {
        const k = alt.key.toString();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

    } else {
      // ── SINGLE-CALL (existing position) ───────────────────────────────────
      const result = await getOperateIx({
        vaultId:    parsedVaultId,
        positionId: parsedPositionId,
        colAmount:  colBN,
        debtAmount: debtBN,
        connection,
        signer: signerPubkey,
      });

      finalIxs           = result?.ixs;
      finalAlts          = result?.addressLookupTableAccounts ?? [];
      resolvedPositionId = parsedPositionId;
    }

    if (!finalIxs?.length) {
      return res.status(400).json({ error: "No instructions returned by Jupiter Lend SDK. Check vault ID and amounts." });
    }

    // Build versioned (v0) transaction with address lookup tables
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
      payerKey:        signerPubkey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions:    finalIxs,
    }).compileToV0Message(finalAlts);

    const tx = new VersionedTransaction(message);

    // Return as base64 — client deserializes, signs with wallet, then sends via RPC
    const txBase64 = Buffer.from(tx.serialize()).toString("base64");

    return res.status(200).json({
      transaction: txBase64,
      positionId:  resolvedPositionId,   // always the real positionId (new or existing)
      blockhash:   latestBlockhash.blockhash,
    });

  } catch (err) {
    console.error("[/api/borrow] error:", err);
    const msg = err?.message || "Internal server error";

    // Friendly hints for common SDK errors
    if (msg.includes("insufficient") || msg.includes("balance"))
      return res.status(400).json({ error: "Insufficient balance: " + msg });
    if (msg.includes("LTV") || msg.includes("liquidat") || msg.includes("borrow limit"))
      return res.status(400).json({ error: "LTV/borrow limit exceeded: " + msg });
    if (msg.includes("vault"))
      return res.status(400).json({ error: "Invalid vault: " + msg });

    return res.status(500).json({ error: msg });
  }
}
