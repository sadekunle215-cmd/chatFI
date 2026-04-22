// api/multiply.js — Vercel Serverless Route
// Full Jupiter Lend operations: multiply, unwind, deposit, borrow, repay, withdraw
// Docs: https://developers.jup.ag/docs/lend/advanced/multiply
//       https://developers.jup.ag/docs/lend/advanced/unwind
//       https://developers.jup.ag/docs/lend/borrow/combined
//
// npm install @jup-ag/lend @jup-ag/lend-read @solana/web3.js bn.js

import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getFlashBorrowIx, getFlashPaybackIx } from "@jup-ag/lend/flashloan";
import { getOperateIx, MAX_REPAY_AMOUNT, MAX_WITHDRAW_AMOUNT } from "@jup-ag/lend/borrow";
import { Client } from "@jup-ag/lend-read";

const MAX_REPAY   = MAX_REPAY_AMOUNT   ?? new BN("9007199254740991");
const MAX_WITHDRAW = MAX_WITHDRAW_AMOUNT ?? new BN("9007199254740991");

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
  return alts.filter(alt => {
    const k = alt.key.toString();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function buildAndReturn(res, connection, signerPubkey, ixs, alts) {
  if (!ixs?.length) return res.status(400).json({ error: "No instructions returned from SDK." });
  // Always prepend compute budget — multiply uses many instructions
  const computeIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const allIxs = [computeIx, ...ixs];
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message(alts || []);
  const tx = new VersionedTransaction(message);
  return res.status(200).json({ transaction: Buffer.from(tx.serialize()).toString("base64") });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  // ── GET: list all real vault IDs from chain ──────────────────────────────
  // Frontend calls GET /api/multiply to get real vaultId→mints mapping
  if (req.method === "GET") {
    try {
      const connection = new Connection(RPC_URL, { commitment: "confirmed" });
      const readClient = new Client(connection);
      const allVaults = await readClient.vault.getAllVaults();
      const vaults = allVaults.map(v => ({
        vaultId:   v.constantViews.vaultId,
        supplyToken: v.constantViews.supplyToken.toBase58(),
        borrowToken: v.constantViews.borrowToken.toBase58(),
      }));
      return res.status(200).json({ vaults });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    action = "open",     // open | unwind | deposit | borrow | repay | withdraw
    vaultId,
    positionId = 0,
    initialColAmount,    // open: initial collateral (raw token units)
    targetLeverageBps,   // open: leverage × 100, e.g. 200 = 2x (preferred)
    withdrawAmount,      // unwind: partial withdraw amount in col token raw units
    colAmount,           // simple ops
    debtAmount,          // simple ops / open legacy fallback
    signer,
  } = req.body;

  if (!vaultId || !signer) return res.status(400).json({ error: "Missing vaultId or signer" });

  let signerPubkey;
  try { signerPubkey = new PublicKey(signer); }
  catch { return res.status(400).json({ error: `Invalid signer: ${signer}` }); }

  try {
    const connection = new Connection(RPC_URL, { commitment: "confirmed", confirmTransactionInitialTimeout: 60000 });
    const readClient = new Client(connection);

    // Resolve real vault mints from on-chain config
    let vaultConfig;
    try { vaultConfig = await readClient.vault.getVaultConfig(Number(vaultId)); }
    catch (e) { return res.status(400).json({ error: `Vault ${vaultId} not found on-chain: ${e.message}` }); }

    const colMint  = vaultConfig.supplyToken;
    const debtMint = vaultConfig.borrowToken;

    console.log(`[multiply] action=${action} vault=${vaultId}`, {
      colMint: colMint.toBase58(), debtMint: debtMint.toBase58(), signer: signerPubkey.toBase58(),
    });

    // ── OPEN (Multiply) ───────────────────────────────────────────────────────
    // Official flow: FlashBorrow(debt) → Swap(debt→col) → Operate(+col,+debt) → FlashPayback
    // Ref: https://developers.jup.ag/docs/lend/advanced/multiply
    if (action === "open") {
      if (!initialColAmount)
        return res.status(400).json({ error: "open requires initialColAmount" });
      if (!targetLeverageBps && !debtAmount)
        return res.status(400).json({ error: "open requires targetLeverageBps (e.g. 200 for 2x) or debtAmount" });

      const colBN = new BN(initialColAmount.toString());
      if (colBN.isZero())
        return res.status(400).json({ error: "initialColAmount must be non-zero" });

      // Derive borrowAmount from targetLeverageBps: borrowAmount = col × (leverage-1)
      // e.g. 2x with 5 USDC collateral → borrow 5 USDC  (targetLeverageBps=200 → 200-100=100 → ×100/100 = 1× col)
      let borrowAmountBN;
      if (targetLeverageBps) {
        const bps = Number(targetLeverageBps);
        if (bps <= 100) return res.status(400).json({ error: "targetLeverageBps must be > 100 (leverage > 1x)" });
        borrowAmountBN = colBN.muln(bps - 100).divn(100);
      } else {
        borrowAmountBN = new BN(debtAmount.toString());
      }
      if (borrowAmountBN.isZero())
        return res.status(400).json({ error: "Derived borrow amount is zero — check leverage/collateral" });

      console.log(`[multiply/open] colRaw=${colBN.toString()} borrowRaw=${borrowAmountBN.toString()}`);

      // 1. Flashloan instructions for the debt asset
      const flashParams = { connection, signer: signerPubkey, asset: debtMint, amount: borrowAmountBN };
      const [flashBorrowIx, flashPayIx] = await Promise.all([
        getFlashBorrowIx(flashParams),
        getFlashPaybackIx(flashParams),
      ]);

      // 2. Quote: swap debt → collateral via Jupiter Lite
      // Per official docs, slippageBps=100 is the standard. Use 150 for extra safety on volatile pairs.
      const isStableStable =
        colMint.toBase58()  === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" || // USDC
        colMint.toBase58()  === "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"  || // USDT
        debtMint.toBase58() === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ||
        debtMint.toBase58() === "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
      const slippageBps = isStableStable ? 50 : 150;

      const quoteRes = await fetch(
        `${LITE_API}/quote?inputMint=${debtMint.toBase58()}&outputMint=${colMint.toBase58()}&amount=${borrowAmountBN.toString()}&slippageBps=${slippageBps}`
      ).then(r => r.json());
      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Swap quote failed: ${quoteRes.error ?? "No route found"}` });

      // 3. Swap instructions
      const swapApiRes = await fetch(`${LITE_API}/swap-instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());
      if (swapApiRes.error) return res.status(502).json({ error: `Swap instructions failed: ${swapApiRes.error}` });

      // 4. Operate: deposit (initialCol + swapped) and borrow
      // Per official docs, use outAmount (optimistic) for supplyAmount — the operate ix validates internally
      const swapOutput  = new BN(quoteRes.outAmount.toString());
      const supplyTotal = colBN.add(swapOutput);

      const { ixs: operateIxs, addressLookupTableAccounts: operateAlts } = await getOperateIx({
        vaultId:    Number(vaultId),
        positionId: Number(positionId),
        colAmount:  supplyTotal,
        debtAmount: borrowAmountBN,
        signer:     signerPubkey,
        connection,
      });

      const swapIx   = toIx(swapApiRes.swapInstruction);
      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateAlts ?? []), ...swapAlts]);
      const allIxs   = [flashBorrowIx, swapIx, ...operateIxs, flashPayIx];
      return buildAndReturn(res, connection, signerPubkey, allIxs, allAlts);
    }

    // ── UNWIND (Close/Deleverage) ─────────────────────────────────────────────
    // Official flow: FlashBorrow(col) → Swap(col→debt) → Operate(-col,-debt) → FlashPayback
    if (action === "unwind") {
      const resolvedPosId = Number(positionId);
      if (!resolvedPosId && resolvedPosId !== 0)
        return res.status(400).json({ error: "unwind requires positionId" });

      const isFullUnwind = !withdrawAmount;
      let flashColBN;
      if (isFullUnwind) {
        try {
          const pos   = await readClient.vault.getUserPosition({ vaultId: Number(vaultId), positionId: resolvedPosId });
          const state = await readClient.vault.getCurrentPositionState({ vaultId: Number(vaultId), position: pos });
          flashColBN = state.colRaw.muln(101).divn(100); // 1% buffer
        } catch {
          return res.status(400).json({ error: `Could not read position ${positionId} for vault ${vaultId}.` });
        }
      } else {
        flashColBN = new BN(withdrawAmount.toString());
      }

      const slippageBps = 150;
      const flashParams = { connection, signer: signerPubkey, asset: colMint, amount: flashColBN };
      const [flashBorrowIx, flashPayIx] = await Promise.all([
        getFlashBorrowIx(flashParams),
        getFlashPaybackIx(flashParams),
      ]);

      const quoteRes = await fetch(
        `${LITE_API}/quote?inputMint=${colMint.toBase58()}&outputMint=${debtMint.toBase58()}&amount=${flashColBN.toString()}&slippageBps=${slippageBps}`
      ).then(r => r.json());
      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Unwind swap quote failed: ${quoteRes.error ?? "No route"}` });

      const swapApiRes = await fetch(`${LITE_API}/swap-instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());
      if (swapApiRes.error) return res.status(502).json({ error: `Unwind swap instructions failed: ${swapApiRes.error}` });

      const opColAmount  = isFullUnwind ? MAX_WITHDRAW : new BN(withdrawAmount.toString()).neg();
      const opDebtAmount = isFullUnwind ? MAX_REPAY    : new BN(quoteRes.otherAmountThreshold.toString()).neg();

      const { ixs: operateIxs, addressLookupTableAccounts: operateAlts } = await getOperateIx({
        vaultId: Number(vaultId), positionId: resolvedPosId,
        colAmount: opColAmount, debtAmount: opDebtAmount,
        signer: signerPubkey, connection,
      });

      const swapIx   = toIx(swapApiRes.swapInstruction);
      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateAlts ?? []), ...swapAlts]);
      const allIxs   = [flashBorrowIx, swapIx, ...operateIxs, flashPayIx];
      return buildAndReturn(res, connection, signerPubkey, allIxs, allAlts);
    }

    // ── SIMPLE OPS (deposit, borrow, repay, withdraw) ─────────────────────────
    const OPS = {
      deposit:  { col: +1, debt:  0 },
      borrow:   { col:  0, debt: +1 },
      repay:    { col:  0, debt: -1 },
      withdraw: { col: -1, debt:  0 },
    };

    if (OPS[action]) {
      const op        = OPS[action];
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

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    const msg = err?.message || "Internal server error";
    console.error("[multiply] error:", msg, err?.stack);
    if (msg.includes("return data") || msg.includes("No return data"))
      return res.status(500).json({ error: `Vault ${vaultId} simulation failed. Check amounts and vault availability.` });
    if (msg.includes("AccountNotFound") || msg.includes("could not find account"))
      return res.status(500).json({ error: `Account not found for vault ${vaultId}. The vaultId may be wrong.` });
    return res.status(500).json({ error: msg });
  }
}
