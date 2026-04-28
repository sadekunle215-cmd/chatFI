// api/multiply.js — Vercel Serverless Route
// Jupiter Lend: multiply, unwind, deposit, borrow, repay, withdraw
// Docs: https://dev.jup.ag/docs/lend/advanced/multiply
//       https://dev.jup.ag/docs/lend/advanced/unwind
//
// REQUIRED env var: SOLANA_RPC — must be a paid RPC (Helius/Triton/Quicknode).
// The public mainnet-beta RPC will rate-limit and cause FUNCTION_INVOCATION_FAILED.
// Set in Vercel: Settings → Environment Variables → SOLANA_RPC
//
// 2-TX FLOW (mirrors Jupiter's own UI):
//   Tx 1 — action:"initPosition" → creates position NFT, returns { transaction, positionId }
//   Tx 2 — action:"open"         → flashloan multiply using the real positionId
//
// GET ?getPositions=1&vaultId=X&signer=Y → returns existing positionIds for user/vault
//   Use as fallback if you need to resume after a partial init.

import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
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
import { getFlashloanIx } from "@jup-ag/lend/flashloan";
import { getInitPositionIx, getOperateIx, MAX_REPAY_AMOUNT, MAX_WITHDRAW_AMOUNT } from "@jup-ag/lend/borrow";
import { Client } from "@jup-ag/lend-read";

const MAX_REPAY    = MAX_REPAY_AMOUNT   ?? new BN("9007199254740991");
const MAX_WITHDRAW = MAX_WITHDRAW_AMOUNT ?? new BN("9007199254740991");

const RPC_URL     = process.env.SOLANA_RPC;
const JUP_API_KEY = process.env.JUP_API_KEY || "";

// Per official docs: use lite-api for swap quotes+instructions inside flashloan txs
const LITE_API = "https://lite-api.jup.ag/swap/v1";

const jupHeaders = {
  "Content-Type": "application/json",
  ...(JUP_API_KEY ? { "x-api-key": JUP_API_KEY } : {}),
};

// Vercel: disable automatic body parsing so GET requests don't throw schema errors
export const config = {
  api: { bodyParser: false },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method !== "POST") return resolve({});
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function toIx(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map(a => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
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
  return alts.filter(a => {
    const k = a.key.toString();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

async function buildTx(connection, signerPubkey, ixs, alts = []) {
  if (!ixs?.length) throw new Error("No instructions provided.");
  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const validAlts = (alts || []).filter(a => a && a.key && a.state);
  console.log(`[buildTx] ixs=${ixs.length} alts=${validAlts.length}`);
  const msg = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [cuIx, ...ixs],
  }).compileToV0Message(validAlts);
  const txBytes = new VersionedTransaction(msg).serialize();
  console.log(`[buildTx] size=${txBytes.length} bytes`);
  if (txBytes.length > 1232) throw new Error(`Transaction too large: ${txBytes.length} bytes (max 1232).`);
  return Buffer.from(txBytes).toString("base64");
}

async function getAtaIxIfNeeded(connection, mint, owner) {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  try {
    const info = await connection.getAccountInfo(ata);
    if (info) return null;
  } catch {}
  return createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint, TOKEN_PROGRAM_ID);
}

const vaultMintCache = {};
async function getVaultMints(connection, vaultId) {
  const id = Number(vaultId);
  if (vaultMintCache[id]) return vaultMintCache[id];
  const client = new Client(connection);
  const v = await client.vault.getVaultByVaultId(id);
  if (!v) throw new Error(`Unknown vaultId ${id}`);
  const mints = { supplyToken: v.supplyToken.toBase58(), borrowToken: v.borrowToken.toBase58() };
  vaultMintCache[id] = mints;
  console.log(`[vault] id=${id} col=${mints.supplyToken.slice(0,8)} debt=${mints.borrowToken.slice(0,8)}`);
  return mints;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!RPC_URL) return res.status(500).json({ error: "SOLANA_RPC env var not set." });

  // ── GET: health check + vault mint map + optional position listing ──────────
  if (req.method === "GET") {
    const query = Object.fromEntries(new URL(req.url, "http://localhost").searchParams);

    // GET ?getPositions=1&vaultId=X&signer=Y
    // Returns the list of positionIds the user owns in this vault.
    // Use as fallback/resume if Step 1 completed but Step 2 hasn't run yet.
    if (query.getPositions && query.vaultId && query.signer) {
      try {
        const connection = new Connection(RPC_URL, { commitment: "confirmed" });
        const client = new Client(connection);
        const signerPk = new PublicKey(query.signer);
        const vaultId  = Number(query.vaultId);

        // Per SKILL.md: getAllUserPositions(userPublicKey) returns all positions across vaults.
        // Each position has p.nftId (the position NFT ID) and p.vault.constantViews.vaultId.
        const allPositions = await client.vault.getAllUserPositions(signerPk);
        const positions = (allPositions || []).filter(
          p => p.vault?.constantViews?.vaultId === vaultId
        );

        const ids = positions.map(p => p.nftId).filter(id => id != null);

        console.log(`[getPositions] vault=${vaultId} signer=${query.signer.slice(0,8)} found=${ids.length}`);
        return res.status(200).json({ positionIds: ids });
      } catch (e) {
        console.error("[getPositions] ERROR:", e.message);
        return res.status(500).json({ error: e.message });
      }
    }

    // Default GET: health + vault map
    try {
      const connection = new Connection(RPC_URL, { commitment: "confirmed" });
      const slot = await connection.getSlot();
      const KNOWN_VAULT_IDS = [1, 2, 3, 4, 5, 6, 7];
      const client = new Client(connection);
      const results = await Promise.allSettled(
        KNOWN_VAULT_IDS.map(id => client.vault.getVaultByVaultId(id))
      );
      const vaults = results
        .map((r, i) => {
          if (r.status !== "fulfilled" || !r.value) return null;
          return {
            vaultId:     KNOWN_VAULT_IDS[i],
            supplyToken: r.value.supplyToken.toBase58(),
            borrowToken: r.value.borrowToken.toBase58(),
          };
        })
        .filter(Boolean);
      return res.status(200).json({ ok: true, slot, vaults });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body;
  try { body = await parseBody(req); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  const {
    action = "open",
    vaultId,
    positionId = 0,
    initialColAmount,
    targetLeverageBps,
    debtAmount: debtAmountRaw,
    colAmount:  colAmountRaw,
    withdrawAmount,
    signer,
  } = body;

  if (!vaultId || !signer) return res.status(400).json({ error: "Missing vaultId or signer" });

  let signerPubkey;
  try { signerPubkey = new PublicKey(signer); }
  catch { return res.status(400).json({ error: `Invalid signer: ${signer}` }); }

  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });

  try {

    // ── INIT POSITION (Step 1 of 2) ──────────────────────────────────────────
    // Creates the position NFT on-chain. This must be sent and confirmed BEFORE
    // the multiply (Step 2). Mirrors Jupiter's own "Step 1: Create Position" button.
    //
    // Returns: { transaction: base64, positionId: number }
    // The positionId is needed for the "open" action (Step 2).
    if (action === "initPosition") {
      console.log(`[initPosition] vault=${vaultId} signer=${signer.slice(0,8)}`);

      const result = await getInitPositionIx({
        vaultId:    Number(vaultId),
        signer:     signerPubkey,
        connection,
      });

      // getInitPositionIx returns: { ixs, positionId, addressLookupTableAccounts }
      // positionId is the newly assigned on-chain position index (e.g. 4881)
      const { ixs, positionId: newPositionId, addressLookupTableAccounts } = result;

      console.log(`[initPosition] positionId=${newPositionId} ixs=${ixs.length}`);

      const transaction = await buildTx(connection, signerPubkey, ixs, addressLookupTableAccounts ?? []);
      return res.status(200).json({
        transaction,
        positionId: newPositionId, // Pass back to client for use in Step 2
      });
    }

    // ── OPEN / MULTIPLY (Step 2 of 2) ────────────────────────────────────────
    // Requires a real positionId from initPosition (Step 1).
    // positionId MUST be non-zero — 0 causes "Vault assertion failed".
    // Flow: flashBorrow(debt) → swap(debt→col) → operate(deposit col, borrow debt) → flashPayback
    if (action === "open") {
      if (!initialColAmount) return res.status(400).json({ error: "open requires initialColAmount" });
      if (!targetLeverageBps && !debtAmountRaw) return res.status(400).json({ error: "open requires targetLeverageBps or debtAmount" });
      if (!positionId || Number(positionId) === 0) {
        return res.status(400).json({
          error: "open requires a real positionId (non-zero). Run initPosition first to create the position NFT.",
        });
      }

      const initialColBN = new BN(initialColAmount.toString());
      if (initialColBN.isZero()) return res.status(400).json({ error: "initialColAmount must be non-zero" });

      let borrowBN;
      if (targetLeverageBps) {
        const bps = Number(targetLeverageBps);
        if (bps <= 100) return res.status(400).json({ error: "targetLeverageBps must be > 100 (>1x leverage)" });
        borrowBN = initialColBN.muln(bps - 100).divn(100);
      } else {
        borrowBN = new BN(debtAmountRaw.toString());
      }
      if (borrowBN.isZero()) return res.status(400).json({ error: "Derived borrow amount is zero" });

      const MIN_BORROW = new BN("1000");
      if (borrowBN.lt(MIN_BORROW)) {
        return res.status(400).json({
          error: `Borrow amount too small (${borrowBN.toString()} base units). Use higher leverage or larger collateral.`,
        });
      }

      const vaultMints = await getVaultMints(connection, vaultId);
      const colMint  = new PublicKey(vaultMints.supplyToken);
      const debtMint = new PublicKey(vaultMints.borrowToken);

      console.log(`[open] vault=${vaultId} pos=${positionId} borrow=${borrowBN} initialCol=${initialColBN}`);

      // 1. Flash loan + quote in parallel
      const flashParams = { connection, signer: signerPubkey, asset: debtMint, amount: borrowBN };
      const [{ borrowIx: flashBorrowIx, paybackIx: flashPaybackIx }, quoteRes] = await Promise.all([
        getFlashloanIx(flashParams),
        fetch(
          `${LITE_API}/quote?inputMint=${debtMint.toBase58()}&outputMint=${colMint.toBase58()}&amount=${borrowBN.toString()}&slippageBps=300`,
          { headers: jupHeaders }
        ).then(r => r.json()),
      ]);

      if (quoteRes.error || !quoteRes.routePlan) {
        return res.status(502).json({ error: `Swap quote failed: ${quoteRes.error ?? "No route"}` });
      }

      // colAmount = initial collateral + swap output (per official docs)
      const swapOutputBN = new BN(quoteRes.outAmount.toString());
      const totalColBN   = initialColBN.add(swapOutputBN);

      // 2. Get operate + swap instructions in parallel
      const [operateResult, swapApiRes] = await Promise.all([
        getOperateIx({
          vaultId:    Number(vaultId),
          positionId: Number(positionId), // REAL position ID from Step 1, not 0
          colAmount:  totalColBN,
          debtAmount: borrowBN,
          signer:     signerPubkey,
          connection,
        }),
        fetch(`${LITE_API}/swap-instructions`, {
          method:  "POST",
          headers: jupHeaders,
          body:    JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
        }).then(r => r.json()),
      ]);

      if (swapApiRes.error) {
        return res.status(502).json({ error: `Swap instructions failed: ${swapApiRes.error}` });
      }

      const swapIx   = toIx(swapApiRes.swapInstruction);
      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateResult.addressLookupTableAccounts ?? []), ...swapAlts]);

      // Ensure ATAs exist (idempotent)
      const [colAtaIx, debtAtaIx] = await Promise.all([
        getAtaIxIfNeeded(connection, colMint, signerPubkey),
        getAtaIxIfNeeded(connection, debtMint, signerPubkey),
      ]);
      const ataIxs = [colAtaIx, debtAtaIx].filter(Boolean);

      // Single tx: [ATAs] → flashBorrow → swap → operate → flashPayback
      const allIxs = [...ataIxs, flashBorrowIx, swapIx, ...operateResult.ixs, flashPaybackIx];
      console.log(`[open] ixs=${allIxs.length} (atas=${ataIxs.length} operate=${operateResult.ixs.length})`);

      const transaction = await buildTx(connection, signerPubkey, allIxs, allAlts);
      return res.status(200).json({ transaction });
    }

    // ── UNWIND ────────────────────────────────────────────────────────────────
    // Official single-tx flow:
    //   flashBorrow(col) → swap(col→debt) → operate(repay debt, withdraw col) → flashPayback
    if (action === "unwind") {
      const vaultMints = await getVaultMints(connection, vaultId);
      const colMint  = new PublicKey(vaultMints.supplyToken);
      const debtMint = new PublicKey(vaultMints.borrowToken);

      const isFullUnwind = !withdrawAmount;

      let flashColBN;
      if (isFullUnwind) {
        // Per SKILL.md: getAllUserPositions returns positions with .nftId and .supply (collateral).
        const allPositions = await client.vault.getAllUserPositions(signerPubkey);
        const pos = allPositions.find(
          p => p.vault?.constantViews?.vaultId === Number(vaultId) && p.nftId === Number(positionId)
        );
        if (!pos) return res.status(400).json({ error: `Position ${positionId} not found in vault ${vaultId}` });
        flashColBN = pos.supply.muln(101).divn(100); // 1% buffer on actual collateral
      } else {
        flashColBN = new BN(withdrawAmount.toString());
      }

      console.log(`[unwind] vault=${vaultId} pos=${positionId} flashCol=${flashColBN} full=${isFullUnwind}`);

      // 1. Flash loan + quote in parallel
      const flashParams = { connection, signer: signerPubkey, asset: colMint, amount: flashColBN };
      const [{ borrowIx: flashBorrowIx, paybackIx: flashPaybackIx }, quoteRes] = await Promise.all([
        getFlashloanIx(flashParams),
        fetch(
          `${LITE_API}/quote?inputMint=${colMint.toBase58()}&outputMint=${debtMint.toBase58()}&amount=${flashColBN.toString()}&slippageBps=100`,
          { headers: jupHeaders }
        ).then(r => r.json()),
      ]);

      if (quoteRes.error || !quoteRes.routePlan) {
        return res.status(502).json({ error: `Unwind quote failed: ${quoteRes.error ?? "No route"}` });
      }

      const colOpAmount  = isFullUnwind ? MAX_WITHDRAW : flashColBN.neg();
      const debtOpAmount = isFullUnwind ? MAX_REPAY    : new BN(quoteRes.otherAmountThreshold.toString()).neg();

      // 2. Get operate + swap instructions in parallel
      const [operateResult, swapApiRes] = await Promise.all([
        getOperateIx({
          vaultId:    Number(vaultId),
          positionId: Number(positionId),
          colAmount:  colOpAmount,
          debtAmount: debtOpAmount,
          signer:     signerPubkey,
          connection,
        }),
        fetch(`${LITE_API}/swap-instructions`, {
          method:  "POST",
          headers: jupHeaders,
          body:    JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
        }).then(r => r.json()),
      ]);

      if (swapApiRes.error) {
        return res.status(502).json({ error: `Unwind swap instructions failed: ${swapApiRes.error}` });
      }

      const swapIx   = toIx(swapApiRes.swapInstruction);
      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateResult.addressLookupTableAccounts ?? []), ...swapAlts]);

      const allIxs = [flashBorrowIx, swapIx, ...operateResult.ixs, flashPaybackIx];
      console.log(`[unwind] ixs=${allIxs.length}`);

      const transaction = await buildTx(connection, signerPubkey, allIxs, allAlts);
      return res.status(200).json({ transaction });
    }

    // ── SIMPLE OPS: deposit | borrow | repay | withdraw ───────────────────────
    const OPS = {
      deposit:  { col: +1, debt:  0 },
      borrow:   { col:  0, debt: +1 },
      repay:    { col:  0, debt: -1 },
      withdraw: { col: -1, debt:  0 },
    };

    if (OPS[action]) {
      const op        = OPS[action];
      const colBNRaw  = colAmountRaw  ? new BN(Math.abs(parseInt(colAmountRaw)).toString())  : new BN(0);
      const debtBNRaw = debtAmountRaw ? new BN(Math.abs(parseInt(debtAmountRaw)).toString()) : new BN(0);
      const finalCol  = op.col  === 0 ? new BN(0) : op.col  > 0 ? colBNRaw  : colBNRaw.neg();
      const finalDebt = op.debt === 0 ? new BN(0) : op.debt > 0 ? debtBNRaw : debtBNRaw.neg();

      if (finalCol.isZero() && finalDebt.isZero()) {
        return res.status(400).json({ error: `${action} requires colAmount or debtAmount` });
      }

      const { ixs, addressLookupTableAccounts } = await getOperateIx({
        vaultId:    Number(vaultId),
        positionId: Number(positionId),
        colAmount:  finalCol,
        debtAmount: finalDebt,
        signer:     signerPubkey,
        connection,
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

    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("Too many"))
      return res.status(500).json({ error: "RPC rate limited — set SOLANA_RPC to a paid provider in Vercel env vars.", detail: msg });
    if (msg.includes("ssert") || msg.includes("Assertion"))
      return res.status(500).json({ error: "Vault assertion failed — vault may be paused or have insufficient liquidity. Try a smaller amount or retry.", detail: msg });
    if (msg.includes("AccountNotFound") || msg.includes("could not find account"))
      return res.status(500).json({ error: `Account not found — vaultId ${vaultId} may be incorrect.`, detail: msg });
    if (msg.includes("too large") || msg.includes("1232"))
      return res.status(500).json({ error: "Transaction too large. Try reducing position size.", detail: msg });

    return res.status(500).json({ error: msg, detail: stack });
  }
}
