// api/multiply.js — Vercel Serverless Route
// Jupiter Lend: multiply, unwind, deposit, borrow, repay, withdraw
// Docs: https://developers.jup.ag/docs/lend/advanced/multiply
//
// REQUIRED env var: SOLANA_RPC — must be a paid RPC (Helius/Triton/Quicknode).
// The public mainnet-beta RPC will rate-limit and cause FUNCTION_INVOCATION_FAILED.
// Set in Vercel: Settings → Environment Variables → SOLANA_RPC

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

const MAX_REPAY    = MAX_REPAY_AMOUNT   ?? new BN("9007199254740991");
const MAX_WITHDRAW = MAX_WITHDRAW_AMOUNT ?? new BN("9007199254740991");

const RPC_URL  = process.env.SOLANA_RPC;
const LITE_API = "https://lite-api.jup.ag/swap/v1";

// ── Helpers ────────────────────────────────────────────────────────────────────
function toIx(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map(a => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, "base64"),
  });
}

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

function dedupeAlts(alts) {
  const seen = new Set();
  return alts.filter(a => { const k = a.key.toString(); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function buildTx(connection, signerPubkey, ixs, alts) {
  if (!ixs?.length) throw new Error("No instructions returned from SDK.");
  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [cuIx, ...ixs],
  }).compileToV0Message(alts || []);
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64");
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // ── GET: health check + real vault list ──────────────────────────────────────
  if (req.method === "GET") {
    if (!RPC_URL) return res.status(500).json({ error: "SOLANA_RPC env var not set. Set it in Vercel Environment Variables." });
    try {
      const connection = new Connection(RPC_URL, { commitment: "confirmed" });
      const readClient = new Client(connection);
      const allVaults  = await readClient.vault.getAllVaults();
      const vaults = allVaults.map(v => ({
        vaultId:     v.constantViews.vaultId,
        supplyToken: v.constantViews.supplyToken.toBase58(),
        borrowToken: v.constantViews.borrowToken.toBase58(),
      }));
      return res.status(200).json({ ok: true, vaults });
    } catch(e) {
      return res.status(500).json({ error: e.message, stack: e.stack?.split("\n").slice(0,4).join(" | ") });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── RPC guard — fail fast with a clear message ────────────────────────────────
  if (!RPC_URL) {
    return res.status(500).json({
      error: "SOLANA_RPC environment variable is not set. Go to Vercel → Settings → Environment Variables and add SOLANA_RPC with a Helius/Triton/Quicknode URL. The public RPC will always fail under load.",
    });
  }

  const { action = "open", vaultId, positionId = 0, initialColAmount,
          targetLeverageBps, withdrawAmount, colAmount, debtAmount, signer } = req.body;

  if (!vaultId || !signer) return res.status(400).json({ error: "Missing vaultId or signer" });

  let signerPubkey;
  try { signerPubkey = new PublicKey(signer); }
  catch { return res.status(400).json({ error: `Invalid signer: ${signer}` }); }

  const connection = new Connection(RPC_URL, { commitment: "confirmed", confirmTransactionInitialTimeout: 60000 });

  try {
    // ── OPEN ──────────────────────────────────────────────────────────────────
    if (action === "open") {
      if (!initialColAmount) return res.status(400).json({ error: "open requires initialColAmount" });
      if (!targetLeverageBps && !debtAmount) return res.status(400).json({ error: "open requires targetLeverageBps or debtAmount" });

      const colBN = new BN(initialColAmount.toString());
      if (colBN.isZero()) return res.status(400).json({ error: "initialColAmount must be non-zero" });

      let borrowBN;
      if (targetLeverageBps) {
        const bps = Number(targetLeverageBps);
        if (bps <= 100) return res.status(400).json({ error: "targetLeverageBps must be > 100 (>1x leverage)" });
        borrowBN = colBN.muln(bps - 100).divn(100);
      } else {
        borrowBN = new BN(debtAmount.toString());
      }
      if (borrowBN.isZero()) return res.status(400).json({ error: "Derived borrow amount is zero" });

      console.log(`[multiply/open] vault=${vaultId} posId=${positionId} col=${colBN} borrow=${borrowBN}`);

      // Resolve vault mints once — needed for flashloan asset + swap mints
      const readClient = new Client(connection);
      const vaultConfig = await readClient.vault.getVaultConfig(Number(vaultId));
      const colMint  = vaultConfig.supplyToken;
      const debtMint = vaultConfig.borrowToken;

      console.log(`[multiply/open] colMint=${colMint.toBase58()} debtMint=${debtMint.toBase58()}`);

      // Run flashloan ixs + quote in parallel to minimise RPC round trips
      const isStable = [
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  // USDT
      ].includes(colMint.toBase58()) || [
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      ].includes(debtMint.toBase58());
      const slippageBps = isStable ? 50 : 150;

      const flashParams = { connection, signer: signerPubkey, asset: debtMint, amount: borrowBN };
      const [flashBorrowIx, flashPayIx, quoteRes] = await Promise.all([
        getFlashBorrowIx(flashParams),
        getFlashPaybackIx(flashParams),
        fetch(`${LITE_API}/quote?inputMint=${debtMint.toBase58()}&outputMint=${colMint.toBase58()}&amount=${borrowBN.toString()}&slippageBps=${slippageBps}`)
          .then(r => r.json()),
      ]);

      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Swap quote failed: ${quoteRes.error ?? "No route"}` });

      const [swapApiRes, operateResult] = await Promise.all([
        fetch(`${LITE_API}/swap-instructions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
        }).then(r => r.json()),
        getOperateIx({
          vaultId:    Number(vaultId),
          positionId: Number(positionId),
          colAmount:  colBN.add(new BN(quoteRes.outAmount.toString())),
          debtAmount: borrowBN,
          signer:     signerPubkey,
          connection,
        }),
      ]);

      if (swapApiRes.error) return res.status(502).json({ error: `Swap instructions failed: ${swapApiRes.error}` });

      const swapIx   = toIx(swapApiRes.swapInstruction);
      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateResult.addressLookupTableAccounts ?? []), ...swapAlts]);
      const allIxs   = [flashBorrowIx, swapIx, ...operateResult.ixs, flashPayIx];
      const transaction = await buildTx(connection, signerPubkey, allIxs, allAlts);
      return res.status(200).json({ transaction });
    }

    // ── UNWIND ────────────────────────────────────────────────────────────────
    if (action === "unwind") {
      const readClient   = new Client(connection);
      const vaultConfig  = await readClient.vault.getVaultConfig(Number(vaultId));
      const colMint      = vaultConfig.supplyToken;
      const debtMint     = vaultConfig.borrowToken;
      const isFullUnwind = !withdrawAmount;
      let flashColBN;

      if (isFullUnwind) {
        const pos   = await readClient.vault.getUserPosition({ vaultId: Number(vaultId), positionId: Number(positionId) });
        if (!pos) return res.status(400).json({ error: `Position ${positionId} not found in vault ${vaultId}` });
        const state = await readClient.vault.getCurrentPositionState({ vaultId: Number(vaultId), position: pos });
        flashColBN  = state.colRaw.muln(101).divn(100);
      } else {
        flashColBN = new BN(withdrawAmount.toString());
      }

      const flashParams = { connection, signer: signerPubkey, asset: colMint, amount: flashColBN };
      const [flashBorrowIx, flashPayIx, quoteRes] = await Promise.all([
        getFlashBorrowIx(flashParams),
        getFlashPaybackIx(flashParams),
        fetch(`${LITE_API}/quote?inputMint=${colMint.toBase58()}&outputMint=${debtMint.toBase58()}&amount=${flashColBN.toString()}&slippageBps=150`)
          .then(r => r.json()),
      ]);

      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Unwind quote failed: ${quoteRes.error ?? "No route"}` });

      const opColAmount  = isFullUnwind ? MAX_WITHDRAW : new BN(withdrawAmount.toString()).neg();
      const opDebtAmount = isFullUnwind ? MAX_REPAY    : new BN(quoteRes.otherAmountThreshold.toString()).neg();

      const [swapApiRes, operateResult] = await Promise.all([
        fetch(`${LITE_API}/swap-instructions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
        }).then(r => r.json()),
        getOperateIx({
          vaultId: Number(vaultId), positionId: Number(positionId),
          colAmount: opColAmount, debtAmount: opDebtAmount,
          signer: signerPubkey, connection,
        }),
      ]);

      if (swapApiRes.error) return res.status(502).json({ error: `Unwind swap failed: ${swapApiRes.error}` });

      const swapIx   = toIx(swapApiRes.swapInstruction);
      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateResult.addressLookupTableAccounts ?? []), ...swapAlts]);
      const allIxs   = [flashBorrowIx, swapIx, ...operateResult.ixs, flashPayIx];
      const transaction = await buildTx(connection, signerPubkey, allIxs, allAlts);
      return res.status(200).json({ transaction });
    }

    // ── SIMPLE OPS: deposit | borrow | repay | withdraw ───────────────────────
    const OPS = { deposit:{col:+1,debt:0}, borrow:{col:0,debt:+1}, repay:{col:0,debt:-1}, withdraw:{col:-1,debt:0} };
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
      const transaction = await buildTx(connection, signerPubkey, ixs, addressLookupTableAccounts);
      return res.status(200).json({ transaction });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    const msg   = err?.message || "Internal server error";
    const stack = err?.stack?.split("\n").slice(0, 4).join(" | ") || "";
    console.error("[multiply] ERROR:", msg);
    console.error("[multiply] STACK:", stack);
    // Translate common errors to readable messages
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("Too many"))
      return res.status(500).json({ error: "RPC rate limited — set SOLANA_RPC to a paid provider in Vercel env vars.", detail: msg });
    if (msg.includes("return data") || msg.includes("No return data"))
      return res.status(500).json({ error: `Vault ${vaultId} simulation failed. Vault may be paused or amounts out of range.`, detail: msg });
    if (msg.includes("AccountNotFound") || msg.includes("could not find account"))
      return res.status(500).json({ error: `Account not found — vaultId ${vaultId} may be wrong.`, detail: msg });
    return res.status(500).json({ error: msg, detail: stack });
  }
}
