// api/borrow.js — Vercel Serverless Function
// Jupiter Lend: deposit collateral + borrow via getOperateIx (single call per npm docs)

import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getOperateIx } from "@jup-ag/lend/borrow";

const RPC_URL = process.env.SOLANA_RPC;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  if (!RPC_URL)
    return res.status(500).json({ error: "SOLANA_RPC env var not set." });

  try {
    const { action, vaultId, positionId, colAmount, debtAmount, signer } = req.body;

    if (action !== "operate") return res.status(400).json({ error: "Unknown action: " + action });
    if (!vaultId || !signer)  return res.status(400).json({ error: "Missing vaultId or signer" });

    let signerPubkey;
    try { signerPubkey = new PublicKey(signer); }
    catch { return res.status(400).json({ error: "Invalid signer: " + signer }); }

    const connection     = new Connection(RPC_URL, { commitment: "confirmed" });
    const parsedVaultId  = Number(vaultId);
    const parsedPosId    = parseInt(positionId ?? 0);
    const colBN          = new BN(colAmount  ?? "0");
    const debtBN         = new BN(debtAmount ?? "0");

    console.log(`[borrow] vault=${parsedVaultId} pos=${parsedPosId} col=${colBN} debt=${debtBN} signer=${signer.slice(0,8)}`);

    // Single call — SDK handles positionId:0 internally (per npm docs example)
    const result = await getOperateIx({
      vaultId:    parsedVaultId,
      positionId: parsedPosId,
      colAmount:  colBN,
      debtAmount: debtBN,
      connection,
      signer: signerPubkey,
    });

    const ixs  = result?.ixs;
    const alts = result?.addressLookupTableAccounts ?? [];
    const resolvedPositionId = result?.positionId ?? parsedPosId;

    console.log(`[borrow] resolvedPositionId=${resolvedPositionId} ixs=${ixs?.length} alts=${alts?.length}`);

    if (!ixs?.length)
      return res.status(400).json({ error: "No instructions returned by SDK." });

    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const validAlts = (alts || []).filter(a => a && a.key && a.state);

    const message = new TransactionMessage({
      payerKey:        signerPubkey,
      recentBlockhash: blockhash,
      instructions:    [cuIx, ...ixs],
    }).compileToV0Message(validAlts);

    const txBytes = new VersionedTransaction(message).serialize();
    console.log(`[borrow] tx=${txBytes.length} bytes`);

    if (txBytes.length > 1232)
      return res.status(400).json({ error: `Transaction too large: ${txBytes.length} bytes.` });

    return res.status(200).json({
      transaction: Buffer.from(txBytes).toString("base64"),
      positionId:  resolvedPositionId,
      blockhash,
    });

  } catch (err) {
    const msg   = err?.message || "Internal server error";
    const stack = err?.stack?.split("\n").slice(0, 4).join(" | ") || "";
    console.error("[borrow] ERROR:", msg);
    console.error("[borrow] STACK:", stack);

    if (msg.includes("insufficient") || msg.includes("balance"))
      return res.status(400).json({ error: "Insufficient balance: " + msg, detail: stack });
    if (msg.includes("LTV") || msg.includes("liquidat") || msg.includes("borrow limit"))
      return res.status(400).json({ error: "LTV/borrow limit exceeded: " + msg, detail: stack });

    return res.status(500).json({ error: msg, detail: stack });
  }
}
