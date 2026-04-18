// api/multiply.js — Vercel Serverless Route
// Handles both OPEN and CLOSE of Jupiter Multiply positions via @jup-ag/lend SDK
//
// Install: npm install @jup-ag/lend @solana/web3.js bn.js

import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getOperateIx } from "@jup-ag/lend/borrow";
import BN from "bn.js";

const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { vaultId, positionId = 0, colAmount, debtAmount, signer, action = "open" } = req.body;

  if (!vaultId || !colAmount || !debtAmount || !signer) {
    return res.status(400).json({ error: "Missing required fields: vaultId, colAmount, debtAmount, signer" });
  }

  try {
    const connection = new Connection(SOLANA_RPC, { commitment: "confirmed" });
    const signerPubkey = new PublicKey(signer);

    // For close: colAmount and debtAmount are negative strings e.g. "-1000000"
    // getOperateIx accepts negative values to signal withdrawal/repayment
    const colBN  = new BN(colAmount.toString().replace("-", ""));
    const debtBN = new BN(debtAmount.toString().replace("-", ""));

    const isClose = action === "close" || colAmount.toString().startsWith("-");

    const { ixs, addressLookupTableAccounts } = await getOperateIx({
      vaultId:    Number(vaultId),
      positionId: Number(positionId),
      // Negative BN signals unwind/repay to the SDK
      colAmount:  isClose ? colBN.neg() : colBN,
      debtAmount: isClose ? debtBN.neg() : debtBN,
      signer:     signerPubkey,
      connection,
    });

    if (!ixs || ixs.length === 0) {
      return res.status(400).json({ error: "No instructions returned. Check vaultId, positionId and amounts." });
    }

    const { blockhash } = await connection.getLatestBlockhash({ commitment: "finalized" });

    const message = new TransactionMessage({
      payerKey:        signerPubkey,
      recentBlockhash: blockhash,
      instructions:    ixs,
    }).compileToV0Message(addressLookupTableAccounts || []);

    const tx = new VersionedTransaction(message);
    const serialized = Buffer.from(tx.serialize()).toString("base64");

    return res.status(200).json({ transaction: serialized });

  } catch (err) {
    console.error("[api/multiply] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
