// api/multiply.js — Vercel Serverless Route
// Uses @jup-ag/lend/borrow (undocumented beta — official "Borrow" SDK is "Coming Soon")
// Install: npm install @jup-ag/lend @solana/web3.js bn.js

import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

// IMPORTANT: /borrow subpath is correct per npm docs — do NOT change to @jup-ag/lend
import { getOperateIx } from "@jup-ag/lend/borrow";
import BN from "bn.js";

const RPC_URL = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

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

  if (!vaultId || !colAmount || !debtAmount || !signer) {
    return res.status(400).json({
      error: "Missing required fields: vaultId, colAmount, debtAmount, signer",
    });
  }

  const colStr = colAmount.toString();
  const colRaw = colStr.replace("-", "");
  const debtRaw = debtAmount.toString().replace("-", "");

  if (!colRaw || colRaw === "0" || !debtRaw || debtRaw === "0") {
    return res.status(400).json({
      error: "colAmount and debtAmount must be non-zero. Ensure leverage > 1.",
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

    console.log("[api/multiply] getOperateIx params:", {
      vaultId:    Number(vaultId),
      positionId: Number(positionId),
      colAmount:  colBN.toString(),
      debtAmount: debtBN.toString(),
      isClose,
      signer,
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
      const msg = sdkErr?.message || "";
      console.error("[api/multiply] SDK error:", msg);

      if (msg.includes("return data") || msg.includes("No return data")) {
        return res.status(500).json({
          error:
            `Vault simulation failed (vaultId: ${vaultId}) — no return data in logs. ` +
            "Possible causes: (1) vaultId doesn't match an active vault, " +
            "(2) debtAmount is in the wrong unit (may need to be in shares, not token decimals), " +
            "(3) amounts too small for this vault's minimum.",
        });
      }
      if (msg.includes("AccountNotFound") || msg.includes("could not find account")) {
        return res.status(500).json({
          error: `Vault account not found for vaultId ${vaultId}. Verify this is a live vault.`,
        });
      }
      throw sdkErr;
    }

    if (!ixs || ixs.length === 0) {
      return res.status(400).json({
        error: "SDK returned no instructions. Check vaultId and amounts.",
      });
    }

    const { blockhash } = await connection.getLatestBlockhash("finalized");
    const message = new TransactionMessage({
      payerKey:        signerPubkey,
      recentBlockhash: blockhash,
      instructions:    ixs,
    }).compileToV0Message(addressLookupTableAccounts || []);

    const tx = new VersionedTransaction(message);
    console.log("[api/multiply] transaction built OK");
    return res.status(200).json({
      transaction: Buffer.from(tx.serialize()).toString("base64"),
    });

  } catch (err) {
    console.error("[api/multiply] unhandled error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
