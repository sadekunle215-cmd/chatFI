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
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import { getFlashBorrowIx, getFlashPaybackIx } from "@jup-ag/lend/flashloan";
import { getOperateIx, getInitPositionIx, MAX_REPAY_AMOUNT, MAX_WITHDRAW_AMOUNT } from "@jup-ag/lend/borrow";
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

// Returns an ATA creation ix if the account doesn't exist, or null if it already exists
async function getAtaCreateIxIfNeeded(connection, mint, owner) {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  try {
    const info = await connection.getAccountInfo(ata);
    if (info) return null; // already exists
  } catch {}
  return createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint, TOKEN_PROGRAM_ID);
}

async function buildTx(connection, signerPubkey, ixs, alts) {
  if (!ixs?.length) throw new Error("No instructions returned from SDK.");
  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  // Validate ALTs — filter out any nulls/malformed entries before compiling
  const validAlts = (alts || []).filter(a => a && a.key && a.state);
  console.log(`[buildTx] ixs=${ixs.length} alts=${validAlts.length} blockhash=${blockhash.slice(0,8)}`);

  // Log instruction programs for debugging
  ixs.forEach((ix, i) => {
    try { console.log(`  ix[${i}] program=${ix.programId?.toString().slice(0,8)} keys=${ix.keys?.length}`); } catch {}
  });

  let msg;
  try {
    msg = new TransactionMessage({
      payerKey: signerPubkey,
      recentBlockhash: blockhash,
      instructions: [cuIx, ...ixs],
    }).compileToV0Message(validAlts);
  } catch(e) {
    throw new Error(`Transaction compile failed (${ixs.length} ixs, ${validAlts.length} ALTs): ${e.message}`);
  }

  let txBytes;
  try {
    txBytes = new VersionedTransaction(msg).serialize();
  } catch(e) {
    throw new Error(`Transaction serialize failed: ${e.message}`);
  }

  console.log(`[buildTx] tx size=${txBytes.length} bytes`);
  if (txBytes.length > 1232) {
    throw new Error(`Transaction too large: ${txBytes.length} bytes (max 1232). Too many instructions or accounts.`);
  }

  return Buffer.from(txBytes).toString("base64");
}

// ── Known vault mint pairs — avoids getVaultConfig() RPC call on every request ─
// Source: on-chain via getAllVaults(). Update if Jupiter adds new vaults.
// vaultId → { supplyToken (collateral mint), borrowToken (debt mint) }
const VAULT_MINTS = {
  1: { supplyToken: "So11111111111111111111111111111111111111112",  borrowToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // SOL / USDC
  2: { supplyToken: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", borrowToken: "So11111111111111111111111111111111111111112"  }, // JitoSOL / SOL
  3: { supplyToken: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",  borrowToken: "So11111111111111111111111111111111111111112"  }, // JupSOL / SOL
  4: { supplyToken: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", borrowToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // WBTC / USDC
  5: { supplyToken: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",  borrowToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // JLP / USDC
  6: { supplyToken: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  borrowToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // JUP / USDC
  7: { supplyToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", borrowToken: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"  }, // USDC / USDT
};

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // ── GET: lightweight health check — just verify RPC is reachable ────────────
  // getAllVaults() is too heavy (100+ RPC calls) for a health check.
  // Vault mints are hardcoded in VAULT_MINTS below — no on-chain lookup needed.
  if (req.method === "GET") {
    if (!RPC_URL) return res.status(500).json({ error: "SOLANA_RPC env var not set." });
    try {
      const connection = new Connection(RPC_URL, { commitment: "confirmed" });
      const slot = await connection.getSlot();
      return res.status(200).json({ ok: true, slot, vaults: Object.entries(VAULT_MINTS).map(([id, v]) => ({ vaultId: Number(id), ...v })) });
    } catch(e) {
      return res.status(500).json({ error: e.message });
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

      // Resolve vault mints from hardcoded map — avoids getVaultConfig() RPC call
      const vaultMints = VAULT_MINTS[Number(vaultId)];
      if (!vaultMints) return res.status(400).json({ error: `Unknown vaultId ${vaultId}. Valid IDs: ${Object.keys(VAULT_MINTS).join(", ")}` });
      const colMint  = new PublicKey(vaultMints.supplyToken);
      const debtMint = new PublicKey(vaultMints.borrowToken);

      console.log(`[multiply/open] vault=${vaultId} col=${colMint.toBase58().slice(0,8)} debt=${debtMint.toBase58().slice(0,8)}`);

      // Run flashloan ixs + quote in parallel to minimise RPC round trips
      const isStable = [
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  // USDT
      ].includes(colMint.toBase58()) || [
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      ].includes(debtMint.toBase58());
      const slippageBps = isStable ? 50 : 300; // 3% for volatile pairs to avoid 6025

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

      // ATA setup: create col/debt token accounts if they don't exist
      const [colAtaIx, debtAtaIx] = await Promise.all([
        getAtaCreateIxIfNeeded(connection, colMint, signerPubkey),
        getAtaCreateIxIfNeeded(connection, debtMint, signerPubkey),
      ]);
      const ataIxs = [colAtaIx, debtAtaIx].filter(Boolean);

      // Use positionId 0 — getOperateIx handles init internally per docs.
      // We send with skipPreflight:true on the frontend to bypass simulation 6011.
      const mainIxs = [flashBorrowIx, swapIx, ...operateResult.ixs, flashPayIx];
      console.log(`[multiply/open] ataIxs=${ataIxs.length} mainIxs=${mainIxs.length}`);

      const transaction = await buildTx(connection, signerPubkey, mainIxs, allAlts);

      // Setup tx for ATAs only (legacy format)
      let setupTransaction = null;
      if (ataIxs.length > 0) {
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        const legacyTx = new Transaction({ feePayer: signerPubkey, recentBlockhash: blockhash });
        ataIxs.forEach(ix => legacyTx.add(ix));
        setupTransaction = Buffer.from(legacyTx.serialize({ requireAllSignatures: false })).toString("base64");
      }

      // skipPreflight flag tells frontend to bypass simulation for the main tx
      return res.status(200).json({ transaction, setupTransaction, skipPreflight: true });
    }

    // ── UNWIND ────────────────────────────────────────────────────────────────
    if (action === "unwind") {
      const vaultMints = VAULT_MINTS[Number(vaultId)];
      if (!vaultMints) return res.status(400).json({ error: `Unknown vaultId ${vaultId}` });
      const colMint  = new PublicKey(vaultMints.supplyToken);
      const debtMint = new PublicKey(vaultMints.borrowToken);
      const isFullUnwind = !withdrawAmount;
      let flashColBN;

      if (isFullUnwind) {
        const readClient = new Client(connection);
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
