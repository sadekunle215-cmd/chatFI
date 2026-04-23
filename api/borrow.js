// api/borrow.js — Vercel Serverless Function
// Jupiter Lend: create position (legacy tx) then operate (versioned tx)
// Two separate transactions — mirrors multiply.js pattern exactly

import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getOperateIx, getInitPositionIx } from "@jup-ag/lend/borrow";

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

    const connection    = new Connection(RPC_URL, { commitment: "confirmed" });
    const parsedVaultId = Number(vaultId);
    const parsedPosId   = parseInt(positionId ?? 0);
    const colBN         = new BN(colAmount  ?? "0");
    const debtBN        = new BN(debtAmount ?? "0");

    console.log(`[borrow] vault=${parsedVaultId} pos=${parsedPosId} col=${colBN} debt=${debtBN}`);

    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    if (parsedPosId === 0) {
      // ── NEW POSITION: two separate transactions ──────────────────────────────
      // Tx 1 (legacy): getInitPositionIx — creates the position NFT on-chain
      const { ix: initIx, nftId } = await getInitPositionIx({
        vaultId:    parsedVaultId,
        connection,
        signer:     signerPubkey,
      });

      console.log(`[borrow] nftId=${nftId}`);

      const setupTx = new Transaction({
        feePayer:        signerPubkey,
        recentBlockhash: blockhash,
      });
      setupTx.add(initIx);
      const setupTransaction = Buffer.from(
        setupTx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      // Tx 2 (versioned): getOperateIx with real nftId — deposit + borrow
      const result = await getOperateIx({
        vaultId:    parsedVaultId,
        positionId: nftId,
        colAmount:  colBN,
        debtAmount: debtBN,
        connection,
        signer:     signerPubkey,
      });

      const ixs       = result?.ixs;
      const alts      = result?.addressLookupTableAccounts ?? [];

      if (!ixs?.length)
        return res.status(400).json({ error: "No operate instructions returned by SDK." });

      const cuIx      = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
      const validAlts = (alts || []).filter(a => a && a.key && a.state);

      const { blockhash: blockhash2 } = await connection.getLatestBlockhash("confirmed");
      const message = new TransactionMessage({
        payerKey:        signerPubkey,
        recentBlockhash: blockhash2,
        instructions:    [cuIx, ...ixs],
      }).compileToV0Message(validAlts);

      const txBytes = new VersionedTransaction(message).serialize();
      console.log(`[borrow] setupTx ready nftId=${nftId} operateTx=${txBytes.length}b`);

      return res.status(200).json({
        setupTransaction,           // legacy tx — create position
        transaction: Buffer.from(txBytes).toString("base64"), // versioned tx — operate
        positionId:  nftId,
        blockhash,
      });

    } else {
      // ── EXISTING POSITION: single versioned tx ───────────────────────────────
      const result = await getOperateIx({
        vaultId:    parsedVaultId,
        positionId: parsedPosId,
        colAmount:  colBN,
        debtAmount: debtBN,
        connection,
        signer:     signerPubkey,
      });

      const ixs       = result?.ixs;
      const alts      = result?.addressLookupTableAccounts ?? [];

      if (!ixs?.length)
        return res.status(400).json({ error: "No instructions returned by SDK." });

      const cuIx      = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
      const validAlts = (alts || []).filter(a => a && a.key && a.state);

      const message = new TransactionMessage({
        payerKey:        signerPubkey,
        recentBlockhash: blockhash,
        instructions:    [cuIx, ...ixs],
      }).compileToV0Message(validAlts);

      const txBytes = new VersionedTransaction(message).serialize();

      return res.status(200).json({
        transaction: Buffer.from(txBytes).toString("base64"),
        positionId:  parsedPosId,
        blockhash,
      });
    }

  } catch (err) {
    const msg   = err?.message || "Internal server error";
    const stack = err?.stack?.split("\n").slice(0, 4).join(" | ") || "";
    console.error("[borrow] ERROR:", msg);
    console.error("[borrow] STACK:", stack);

    if (msg.includes("insufficient") || msg.includes("balance"))
      return res.status(400).json({ error: "Insufficient balance: " + msg });
    if (msg.includes("LTV") || msg.includes("liquidat") || msg.includes("borrow limit"))
      return res.status(400).json({ error: "LTV/borrow limit exceeded: " + msg });

    return res.status(500).json({ error: msg, detail: stack });
  }
}
