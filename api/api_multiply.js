// api/multiply.js — Vercel Serverless Route
// Builds a Jupiter Multiply (leveraged loop) transaction using @jup-ag/lend SDK
// Frontend calls POST /api/multiply → gets back base64 VersionedTransaction → signs via wallet
//
// Install in your Vercel project:
//   npm install @jup-ag/lend @solana/web3.js bn.js

import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getOperateIx } from "@jup-ag/lend/borrow";
import BN from "bn.js";

const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

export default async function handler(req, res) {
  // Allow only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { vaultId, positionId = 0, colAmount, debtAmount, signer } = req.body;

  // Validate required fields
  if (!vaultId || !colAmount || !debtAmount || !signer) {
    return res.status(400).json({ error: "Missing required fields: vaultId, colAmount, debtAmount, signer" });
  }

  try {
    const connection = new Connection(SOLANA_RPC, { commitment: "confirmed" });
    const signerPubkey = new PublicKey(signer);

    // Call Jupiter Lend SDK — getOperateIx handles flash-loan + loop atomically
    const { ixs, addressLookupTableAccounts } = await getOperateIx({
      vaultId:    Number(vaultId),
      positionId: Number(positionId),
      colAmount:  new BN(colAmount),
      debtAmount: new BN(debtAmount),
      signer:     signerPubkey,
      connection,
    });

    if (!ixs || ixs.length === 0) {
      return res.status(400).json({ error: "No instructions returned by Jupiter Lend SDK. Check vault ID and amounts." });
    }

    // Build versioned transaction (unsigned — frontend will sign)
    const { blockhash } = await connection.getLatestBlockhash({ commitment: "finalized" });

    const message = new TransactionMessage({
      payerKey:        signerPubkey,
      recentBlockhash: blockhash,
      instructions:    ixs,
    }).compileToV0Message(addressLookupTableAccounts || []);

    const tx = new VersionedTransaction(message);

    // Return as base64 — same format as all other Jupiter API transactions in ChatFi
    const serialized = Buffer.from(tx.serialize()).toString("base64");

    return res.status(200).json({ transaction: serialized });

  } catch (err) {
    console.error("[api/multiply] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
