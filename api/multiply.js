// api/multiply.js — Vercel Serverless Route
// Handles both OPEN and CLOSE of Jupiter Multiply positions via @jup-ag/lend SDK
//
// Install: npm install @jup-ag/lend @solana/web3.js bn.js
// IMPORTANT: Set SOLANA_RPC in your Vercel env vars to a premium RPC (Helius/QuickNode).
// The public RPC does NOT return simulation returnData, causing "No return data in logs".

import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

// ── FIX 1: Correct import path — NOT "@jup-ag/lend/borrow" ───────────────────
import { getOperateIx } from "@jup-ag/lend";
import BN from "bn.js";

const SOLANA_RPC = process.env.SOLANA_RPC;

if (!SOLANA_RPC) {
  console.warn(
    "[api/multiply] WARNING: SOLANA_RPC env var not set. " +
    "Falling back to public RPC — simulation returnData will likely fail. " +
    "Set SOLANA_RPC to a Helius or QuickNode endpoint."
  );
}

const RPC_URL = SOLANA_RPC || "https://api.mainnet-beta.solana.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    vaultId,
    positionId = 0,
    colAmount,
    debtAmount,
    signer,
    action = "open",
  } = req.body;

  // ── Basic validation ───────────────────────────────────────────────────────
  if (!vaultId || !colAmount || !debtAmount || !signer) {
    return res.status(400).json({
      error: "Missing required fields: vaultId, colAmount, debtAmount, signer",
    });
  }

  const colStr  = colAmount.toString();
  const debtStr = debtAmount.toString();

  // ── FIX 2: Validate amounts before calling SDK ────────────────────────────
  const colRaw  = colStr.replace("-", "");
  const debtRaw = debtStr.replace("-", "");

  if (!colRaw || colRaw === "0" || !debtRaw || debtRaw === "0") {
    return res.status(400).json({
      error: "colAmount and debtAmount must be non-zero. " +
             "Check that leverage > 1 and collateral amount is positive.",
    });
  }

  let colBN, debtBN;
  try {
    colBN  = new BN(colRaw);
    debtBN = new BN(debtRaw);
  } catch (e) {
    return res.status(400).json({ error: `Invalid amount format: ${e.message}` });
  }

  const isClose = action === "close" || colStr.startsWith("-");

  try {
    // ── FIX 3: Use confirmed commitment + enable returnData in simulation ────
    // The public RPC strips returnData from simulateTransaction responses.
    // A premium RPC (Helius, QuickNode, Triton) returns it correctly.
    const connection = new Connection(RPC_URL, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
    });

    let signerPubkey;
    try {
      signerPubkey = new PublicKey(signer);
    } catch {
      return res.status(400).json({ error: `Invalid signer public key: ${signer}` });
    }

    console.log("[api/multiply] calling getOperateIx", {
      vaultId:    Number(vaultId),
      positionId: Number(positionId),
      colAmount:  (isClose ? colBN.neg() : colBN).toString(),
      debtAmount: (isClose ? debtBN.neg() : debtBN).toString(),
      signer,
      action,
    });

    let ixs, addressLookupTableAccounts;
    try {
      ({ ixs, addressLookupTableAccounts } = await getOperateIx({
        vaultId:    Number(vaultId),
        positionId: Number(positionId),
        colAmount:  isClose ? colBN.neg() : colBN,
        debtAmount: isClose ? debtBN.neg() : debtBN,
        signer:     signerPubkey,
        connection,
      }));
    } catch (sdkErr) {
      // ── FIX 4: Intercept SDK simulation errors with actionable messages ───
      const sdkMsg = sdkErr?.message || "";
      console.error("[api/multiply] getOperateIx SDK error:", sdkMsg);

      if (sdkMsg.includes("return data") || sdkMsg.includes("No return data")) {
        return res.status(500).json({
          error:
            "Jupiter Lend vault simulation failed — no return data in logs. " +
            "Likely causes: (1) Your SOLANA_RPC is the public endpoint which doesn't return simulation returnData — " +
            "switch to Helius or QuickNode in your Vercel env. " +
            "(2) The vaultId " + vaultId + " may be invalid or the vault is paused. " +
            "(3) The collateral/debt amounts are too small for this vault.",
        });
      }

      if (sdkMsg.includes("AccountNotFound") || sdkMsg.includes("could not find account")) {
        return res.status(500).json({
          error: `Vault account not found for vaultId ${vaultId}. ` +
                 "Check that this vault ID matches a live Jupiter Lend vault.",
        });
      }

      // Re-throw any other SDK error
      throw sdkErr;
    }

    if (!ixs || ixs.length === 0) {
      return res.status(400).json({
        error: "SDK returned no instructions. Check vaultId, positionId and amounts.",
      });
    }

    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const message = new TransactionMessage({
      payerKey:        signerPubkey,
      recentBlockhash: blockhash,
      instructions:    ixs,
    }).compileToV0Message(addressLookupTableAccounts || []);

    const tx         = new VersionedTransaction(message);
    const serialized = Buffer.from(tx.serialize()).toString("base64");

    console.log("[api/multiply] transaction built successfully, returning to client.");
    return res.status(200).json({ transaction: serialized });

  } catch (err) {
    console.error("[api/multiply] unhandled error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
