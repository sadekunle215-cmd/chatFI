// api/multiply.js — Vercel Serverless Route
// Full Jupiter Lend operations: multiply, unwind, deposit, borrow, repay, withdraw
// Docs: https://developers.jup.ag/docs/lend/advanced/multiply
//       https://developers.jup.ag/docs/lend/advanced/unwind
//       https://developers.jup.ag/docs/lend/borrow/combined
//
// npm install @jup-ag/lend @jup-ag/lend-read @solana/web3.js bn.js

import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getFlashBorrowIx, getFlashPaybackIx } from "@jup-ag/lend/flashloan";
import { getOperateIx } from "@jup-ag/lend/borrow";

// MAX sentinel values per Jupiter Lend docs (used for full unwind)
// These are BN.js max i64 — signals "repay/withdraw everything"
let MAX_REPAY_AMOUNT, MAX_WITHDRAW_AMOUNT;
try {
  const borrowMod = await import("@jup-ag/lend/borrow");
  MAX_REPAY_AMOUNT   = borrowMod.MAX_REPAY_AMOUNT;
  MAX_WITHDRAW_AMOUNT = borrowMod.MAX_WITHDRAW_AMOUNT;
} catch {}
// Fallback: very large BN (2^53 - 1 in base units)
if (!MAX_REPAY_AMOUNT)   MAX_REPAY_AMOUNT   = new BN("9007199254740991");
if (!MAX_WITHDRAW_AMOUNT) MAX_WITHDRAW_AMOUNT = new BN("9007199254740991");
import { Client } from "@jup-ag/lend-read";

const RPC_URL  = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const LITE_API = "https://lite-api.jup.ag/swap/v1";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function resolveAlts(connection, keys = []) {
  if (!keys.length) return [];
  const infos = await connection.getMultipleAccountsInfo(keys.map(k => new PublicKey(k)));
  return infos.reduce((acc, info, i) => {
    if (info) acc.push(new AddressLookupTableAccount({
      key: new PublicKey(keys[i]),
      state: AddressLookupTableAccount.deserialize(info.data),
    }));
    return acc;
  }, []);
}

function toIx(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map(a => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, "base64"),
  });
}

function dedupeAlts(alts) {
  const seen = new Set();
  return alts.filter(alt => { const k = alt.key.toString(); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function buildAndReturn(res, connection, signerPubkey, ixs, alts) {
  if (!ixs?.length) return res.status(400).json({ error: "No instructions returned from SDK." });
  const { blockhash } = await connection.getLatestBlockhash("finalized");
  const message = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message(alts || []);
  const tx = new VersionedTransaction(message);
  return res.status(200).json({ transaction: Buffer.from(tx.serialize()).toString("base64") });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Global safety net — always return JSON, never HTML
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    action = "open",   // open | unwind | deposit | borrow | repay | withdraw
    vaultId,
    positionId = 0,
    // open/multiply: initialColAmount + debtAmount
    initialColAmount,
    // unwind: withdrawAmount (undefined = full unwind)
    withdrawAmount,
    // simple ops: colAmount and/or debtAmount (raw token units)
    colAmount,
    debtAmount,
    signer,
  } = req.body;

  if (!vaultId || !signer) return res.status(400).json({ error: "Missing vaultId or signer" });

  let signerPubkey;
  try { signerPubkey = new PublicKey(signer); }
  catch { return res.status(400).json({ error: `Invalid signer: ${signer}` }); }

  try {
    const connection = new Connection(RPC_URL, { commitment: "confirmed", confirmTransactionInitialTimeout: 60000 });
    const readClient = new Client(connection);

    // Resolve vault mints
    let vaultConfig;
    try { vaultConfig = await readClient.vault.getVaultConfig(Number(vaultId)); }
    catch (e) { return res.status(400).json({ error: `Vault ${vaultId} not found: ${e.message}` }); }

    const colMint  = vaultConfig.supplyToken;
    const debtMint = vaultConfig.borrowToken;

    console.log(`[multiply] action=${action} vault=${vaultId} positionId=${positionId}`, {
      colMint: colMint.toBase58(), debtMint: debtMint.toBase58()
    });

    // ── OPEN (Multiply) ───────────────────────────────────────────────────────
    // Flow: FlashBorrow(debt) → Swap(debt→col) → Operate(+col, +debt) → FlashPayback
    if (action === "open") {
      if (!initialColAmount || !debtAmount)
        return res.status(400).json({ error: "open requires initialColAmount and debtAmount" });

      const colBN  = new BN(initialColAmount.toString());
      const debtBN = new BN(debtAmount.toString());
      if (colBN.isZero() || debtBN.isZero())
        return res.status(400).json({ error: "Amounts must be non-zero" });

      const flashParams   = { connection, signer: signerPubkey, asset: debtMint, amount: debtBN };
      const [flashBorrowIx, flashPayIx] = await Promise.all([
        getFlashBorrowIx(flashParams),
        getFlashPaybackIx(flashParams),
      ]);

      const quoteRes = await fetch(
        `${LITE_API}/quote?inputMint=${debtMint.toBase58()}&outputMint=${colMint.toBase58()}&amount=${debtBN.toString()}&slippageBps=100`
      ).then(r => r.json());
      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Swap quote failed: ${quoteRes.error ?? "No route"}` });

      const swapApiRes = await fetch(`${LITE_API}/swap-instructions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());
      if (swapApiRes.error) return res.status(502).json({ error: `Swap instructions failed: ${swapApiRes.error}` });

      const swapIx      = toIx(swapApiRes.swapInstruction);
      const swapOutput  = new BN(quoteRes.outAmount.toString());
      const supplyTotal = colBN.add(swapOutput);

      const { ixs: operateIxs, addressLookupTableAccounts: operateAlts } = await getOperateIx({
        vaultId: Number(vaultId), positionId: Number(positionId),
        colAmount: supplyTotal, debtAmount: debtBN,
        signer: signerPubkey, connection,
      });

      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateAlts ?? []), ...swapAlts]);
      const allIxs   = [flashBorrowIx, swapIx, ...operateIxs, flashPayIx];
      return buildAndReturn(res, connection, signerPubkey, allIxs, allAlts);
    }

    // ── UNWIND (Close/Deleverage) ─────────────────────────────────────────────
    // Flow: FlashBorrow(col) → Swap(col→debt) → Operate(-col, -debt) → FlashPayback
    if (action === "unwind") {
      if (!positionId) return res.status(400).json({ error: "unwind requires positionId" });
      const isFullUnwind = !withdrawAmount;

      // For full unwind, read current position to estimate flashloan size
      let flashColBN;
      if (isFullUnwind) {
        try {
          const pos = await readClient.vault.getUserPosition({ vaultId: Number(vaultId), positionId: Number(positionId) });
          const state = await readClient.vault.getCurrentPositionState({ vaultId: Number(vaultId), position: pos });
          // Use colRaw as flashloan amount (add 1% buffer for price movement)
          flashColBN = state.colRaw.muln(101).divn(100);
        } catch {
          return res.status(400).json({ error: `Could not read position ${positionId}. Check vaultId and positionId are correct.` });
        }
      } else {
        flashColBN = new BN(withdrawAmount.toString());
      }

      const flashParams   = { connection, signer: signerPubkey, asset: colMint, amount: flashColBN };
      const [flashBorrowIx, flashPayIx] = await Promise.all([
        getFlashBorrowIx(flashParams),
        getFlashPaybackIx(flashParams),
      ]);

      // Swap col → debt (to get tokens to repay debt)
      const quoteRes = await fetch(
        `${LITE_API}/quote?inputMint=${colMint.toBase58()}&outputMint=${debtMint.toBase58()}&amount=${flashColBN.toString()}&slippageBps=100`
      ).then(r => r.json());
      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Swap quote failed for unwind: ${quoteRes.error ?? "No route"}` });

      const swapApiRes = await fetch(`${LITE_API}/swap-instructions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());
      if (swapApiRes.error) return res.status(502).json({ error: `Swap instructions failed: ${swapApiRes.error}` });

      const swapIx = toIx(swapApiRes.swapInstruction);

      // Use MAX amounts for full unwind, or specific amounts for partial
      const opColAmount  = isFullUnwind ? MAX_WITHDRAW_AMOUNT : new BN(withdrawAmount.toString()).neg();
      const opDebtAmount = isFullUnwind ? MAX_REPAY_AMOUNT    : new BN(quoteRes.otherAmountThreshold.toString()).neg();

      const { ixs: operateIxs, addressLookupTableAccounts: operateAlts } = await getOperateIx({
        vaultId: Number(vaultId), positionId: Number(positionId),
        colAmount: opColAmount, debtAmount: opDebtAmount,
        signer: signerPubkey, connection,
      });

      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateAlts ?? []), ...swapAlts]);
      const allIxs   = [flashBorrowIx, swapIx, ...operateIxs, flashPayIx];
      return buildAndReturn(res, connection, signerPubkey, allIxs, allAlts);
    }

    // ── SIMPLE OPS (deposit, borrow, repay, withdraw) ─────────────────────────
    // These use getOperateIx directly — no flashloan needed
    const OPS = {
      deposit:  { col: +1, debt: 0  },
      borrow:   { col: 0,  debt: +1 },
      repay:    { col: 0,  debt: -1 },
      withdraw: { col: -1, debt: 0  },
    };

    if (OPS[action]) {
      const op = OPS[action];
      const colBNRaw  = colAmount  ? new BN(Math.abs(parseInt(colAmount)).toString())  : new BN(0);
      const debtBNRaw = debtAmount ? new BN(Math.abs(parseInt(debtAmount)).toString()) : new BN(0);

      const finalCol  = op.col  === 0 ? new BN(0) : op.col  > 0 ? colBNRaw  : colBNRaw.neg();
      const finalDebt = op.debt === 0 ? new BN(0) : op.debt > 0 ? debtBNRaw : debtBNRaw.neg();

      if (finalCol.isZero() && finalDebt.isZero())
        return res.status(400).json({ error: `${action} requires colAmount or debtAmount` });

      const { ixs, addressLookupTableAccounts } = await getOperateIx({
        vaultId: Number(vaultId), positionId: Number(positionId),
        colAmount: finalCol, debtAmount: finalDebt,
        signer: signerPubkey, connection,
      });
      return buildAndReturn(res, connection, signerPubkey, ixs, addressLookupTableAccounts);
    }

    return res.status(400).json({ error: `Unknown action: ${action}. Valid: open, unwind, deposit, borrow, repay, withdraw` });

  } catch (err) {
    const msg = err?.message || "Internal server error";
    console.error("[multiply] error:", msg);
    if (msg.includes("return data") || msg.includes("No return data"))
      return res.status(500).json({ error: `Vault ${vaultId} simulation failed. The vault may be paused or amounts are outside its limits.` });
    if (msg.includes("AccountNotFound") || msg.includes("could not find account"))
      return res.status(500).json({ error: `Vault or position account not found for vaultId ${vaultId}.` });
    return res.status(500).json({ error: msg });
  }
}
