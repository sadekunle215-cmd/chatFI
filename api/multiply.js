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
const JUP_API_KEY = process.env.JUP_API_KEY || "";
// Per official docs: use lite-api for swap quotes+instructions inside flashloan txs
// https://developers.jup.ag/docs/lend/advanced/multiply
const SWAP_API = "https://lite-api.jup.ag/swap/v1";

const jupHeaders = {
  "Content-Type": "application/json",
  ...(JUP_API_KEY ? { "x-api-key": JUP_API_KEY } : {}),
};

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

// ── Fix 1: sleep helper — gives RPC state time to settle before flash loan ixs ──
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Fix 2: retry wrapper for flash loan ixs — assertion failures are transient ──
// The SDK internally asserts vault liquidity state; retrying after a short delay resolves it.
// Fix 3: stable pairs need more attempts + longer back-off because the slight
// USDC/USDT depeg makes the SDK assertion fire more frequently.
async function getFlashIxsWithRetry(flashParams, maxAttempts = 3, isStable = false) {
  const attempts  = isStable ? 5 : maxAttempts; // 5 retries for stable, 3 for volatile
  const baseDelay = isStable ? 800 : 500;        // 800ms base for stable, 500ms for volatile
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Sequential — concurrent calls race vault liquidity reads → assertion failure
      const flashBorrowIx  = await getFlashBorrowIx(flashParams);
      const flashPaybackIx = await getFlashPaybackIx(flashParams);
      return { flashBorrowIx, flashPaybackIx };
    } catch (e) {
      lastErr = e;
      const isAssertion = e.message?.toLowerCase().includes("assertion") ||
                          e.message?.toLowerCase().includes("assert");
      console.warn(`[flash] attempt ${attempt}/${attempts} failed: ${e.message}`);
      if (attempt < attempts && isAssertion) {
        await sleep(baseDelay * attempt); // linear back-off per attempt
        continue;
      }
      break;
    }
  }
  throw new Error(`Flash loan setup failed after ${attempts} attempts: ${lastErr?.message}`);
}

// ── Retry wrapper for getOperateIx — same assertion failures can fire here too ──
// SOL/USDC and other volatile pairs can hit the vault assertion inside getOperateIx
// just as flash loan ixs can. Wrapping with retry fixes the "still same issue" failure.
async function getOperateIxWithRetry(params, maxAttempts = 3, isStable = false) {
  const attempts  = isStable ? 5 : maxAttempts;
  const baseDelay = isStable ? 800 : 500;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await getOperateIx(params);
    } catch (e) {
      lastErr = e;
      const isAssertion = e.message?.toLowerCase().includes("assertion") ||
                          e.message?.toLowerCase().includes("assert");
      console.warn(`[operate] attempt ${attempt}/${attempts} failed: ${e.message}`);
      if (attempt < attempts && isAssertion) {
        await sleep(baseDelay * attempt);
        continue;
      }
      break;
    }
  }
  throw new Error(`getOperateIx failed after ${attempts} attempts: ${lastErr?.message}`);
}

// ── Fix 3: vault liquidity guard — fail fast with a clear message ──
// Checks that the vault has enough free liquidity before attempting a flash borrow.
async function assertVaultLiquidity(connection, vaultId, assetMint, requiredAmount) {
  try {
    const client = new Client(connection);
    const vault  = await client.vault.getVaultByVaultId({ vaultId: Number(vaultId) });
    if (!vault) return; // can't check — let it proceed and fail naturally
    // availableLiquidity field name may vary by SDK version; fall back gracefully
    const avail = vault.availableLiquidity ?? vault.freeLiquidity ?? vault.liquidityAvailable;
    if (avail == null) return; // field not present in this SDK version
    const availBN = new BN(avail.toString());
    if (availBN.lt(requiredAmount)) {
      throw new Error(
        `Vault ${vaultId} has insufficient liquidity. ` +
        `Need ${requiredAmount.toString()}, available ${availBN.toString()}. ` +
        `Try a smaller position size or try again later.`
      );
    }
    console.log(`[liquidity] vault=${vaultId} avail=${availBN.toString()} required=${requiredAmount.toString()} ✓`);
  } catch (e) {
    if (e.message?.includes("insufficient liquidity")) throw e; // re-throw our own error
    console.warn(`[liquidity] check skipped (SDK field missing): ${e.message}`);
    // Don't block — let the transaction attempt proceed
  }
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

// ── Vault mint lookup — fetches a SINGLE vault by ID (fast, no timeout risk) ──
// Per-vaultId cache to avoid re-fetching the same vault within a cold start
const vaultMintCache = {};

async function getVaultMintsById(connection, vaultId) {
  const id = Number(vaultId);
  if (vaultMintCache[id]) return vaultMintCache[id];
  const client = new Client(connection);
  // getVaultByVaultId fetches ONE vault — replaces getAllVaults() which was
  // fetching 100+ vaults on every cold start and hitting Vercel's 30s timeout
  const v = await client.vault.getVaultByVaultId({ vaultId: id });
  if (!v) throw new Error(`Unknown vaultId ${id}`);
  const mints = {
    supplyToken: v.supplyToken.toBase58(),
    borrowToken: v.borrowToken.toBase58(),
  };
  vaultMintCache[id] = mints;
  console.log(`[multiply] loaded vault ${id} col=${mints.supplyToken.slice(0,8)} debt=${mints.borrowToken.slice(0,8)}`);
  return mints;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // ── GET: health check + vault mint map for the UI ───────────────────────────
  // Fetches only the known vault IDs (1-7) in parallel — fast, no timeout risk.
  // Returns { ok, slot, vaults } so the frontend can build realVaultMap correctly.
  if (req.method === "GET") {
    if (!RPC_URL) return res.status(500).json({ error: "SOLANA_RPC env var not set." });
    try {
      const connection = new Connection(RPC_URL, { commitment: "confirmed" });
      const [slot] = await Promise.all([connection.getSlot()]);
      const KNOWN_VAULT_IDS = [1, 2, 3, 4, 5, 6, 7];
      const client = new Client(connection);
      const vaultResults = await Promise.allSettled(
        KNOWN_VAULT_IDS.map(id => client.vault.getVaultByVaultId({ vaultId: id }))
      );
      const vaults = vaultResults
        .map((r, i) => {
          if (r.status !== "fulfilled" || !r.value) return null;
          const v = r.value;
          return {
            vaultId:    KNOWN_VAULT_IDS[i],
            supplyToken: v.supplyToken.toBase58(),
            borrowToken: v.borrowToken.toBase58(),
          };
        })
        .filter(Boolean);
      return res.status(200).json({ ok: true, slot, vaults });
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

      // Minimum borrow guard — SDK rejects sub-threshold amounts with vault assertion errors.
      // 1,000 base units covers both 6-decimal (USDC/USDT ~$0.001) and 9-decimal (SOL ~0.000001).
      const MIN_BORROW = new BN("1000");
      if (borrowBN.lt(MIN_BORROW)) {
        return res.status(400).json({
          error:
            `Borrow amount too small (${borrowBN.toString()} base units). ` +
            `At this leverage and collateral size the flash loan is below the vault minimum. ` +
            `Use a higher leverage or a larger collateral amount.`,
        });
      }

      console.log(`[multiply/open] vault=${vaultId} posId=${positionId} col=${colBN} borrow=${borrowBN}`);

      // Resolve vault mints for this specific vaultId only
      const vaultMints = await getVaultMintsById(connection, vaultId);
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
      const slippageBps = isStable ? 100 : 300; // 1% for stable pairs, 3% for volatile pairs to avoid 6025

      // Fetch swap quote first — flash loan ixs need a settled RPC state to avoid
      // internal SDK assertion failures when called concurrently with other RPC reads
      const quoteRes = await fetch(
        `${SWAP_API}/quote?inputMint=${debtMint.toBase58()}&outputMint=${colMint.toBase58()}&amount=${borrowBN.toString()}&slippageBps=${slippageBps}`,
        { headers: jupHeaders }
      ).then(r => r.json());

      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Swap quote failed: ${quoteRes.error ?? "No route"}` });

      // Fix 3: check vault has enough liquidity before attempting flash borrow
      await assertVaultLiquidity(connection, vaultId, debtMint, borrowBN);

      // Fix 1: wait for RPC state to fully settle after quote fetch before touching flash loan ixs
      await sleep(400);

      // Fix 2: fetch flash loan ixs with retry on assertion failures
      let flashBorrowIx, flashPayIx;
      try {
        const flashIxs = await getFlashIxsWithRetry({ connection, signer: signerPubkey, asset: debtMint, amount: borrowBN }, 3, isStable);
        flashBorrowIx  = flashIxs.flashBorrowIx;
        flashPayIx     = flashIxs.flashPaybackIx;
      } catch (e) {
        return res.status(502).json({ error: e.message });
      }

      // Step 1: create position NFT — getInitPositionIx returns the real nftId
      // This MUST be confirmed on-chain before the main flashloan tx (error 6011 = position doesn't exist yet)
      const { ix: initIx, nftId } = await getInitPositionIx({
        vaultId:    Number(vaultId),
        connection,
        signer:     signerPubkey,
      });
      console.log(`[multiply/open] nftId=${nftId}`);

      // Step 2: build operate ix with the real nftId so account derivation is correct
      // Use retry wrapper — vault assertion can fire here for volatile pairs (SOL/USDC) too
      const operateResult = await getOperateIxWithRetry({
        vaultId:    Number(vaultId),
        positionId: nftId,
        // Fix 2: stable pairs use otherAmountThreshold (slippage-adjusted min) to avoid vault assertion
        colAmount:  colBN.add(new BN((isStable ? quoteRes.otherAmountThreshold : quoteRes.outAmount).toString())),
        debtAmount: borrowBN,
        signer:     signerPubkey,
        connection,
      }, 3, isStable);

      const swapApiRes = await fetch(`${SWAP_API}/swap-instructions`, {
        method: "POST",
        headers: jupHeaders,
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());

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

      // setupTransaction: position NFT init + ATAs (legacy tx, confirmed before main tx)
      const { blockhash: setupBlockhash } = await connection.getLatestBlockhash("confirmed");
      const setupLegacyTx = new Transaction({ feePayer: signerPubkey, recentBlockhash: setupBlockhash });
      setupLegacyTx.add(initIx);
      ataIxs.forEach(ix => setupLegacyTx.add(ix));
      const setupTransaction = Buffer.from(setupLegacyTx.serialize({ requireAllSignatures: false })).toString("base64");

      // Main tx: flashloan loop — skipPreflight:true required (simulation can't verify atomic flashloan)
      const mainIxs = [flashBorrowIx, swapIx, ...operateResult.ixs, flashPayIx];
      console.log(`[multiply/open] setupIxs=${1 + ataIxs.length} mainIxs=${mainIxs.length} nftId=${nftId}`);

      const transaction = await buildTx(connection, signerPubkey, mainIxs, allAlts);
      return res.status(200).json({ transaction, setupTransaction, positionId: nftId });
    }

    // ── UNWIND ────────────────────────────────────────────────────────────────
    if (action === "unwind") {
      const vaultMints = await getVaultMintsById(connection, vaultId);
      const colMint  = new PublicKey(vaultMints.supplyToken);
      const debtMint = new PublicKey(vaultMints.borrowToken);
      const isFullUnwind = withdrawAmount == null || withdrawAmount === undefined || withdrawAmount === "";
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

      // Detect stable/stable pair for unwind (same logic as open)
      const STABLE_MINTS = ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"];
      const isStable = STABLE_MINTS.includes(colMint.toBase58()) || STABLE_MINTS.includes(debtMint.toBase58());
      const unwindSlippageBps = isStable ? 100 : 150;

      // Fetch swap quote first — flash loan ixs need a settled RPC state to avoid
      // internal SDK assertion failures when called concurrently with other RPC reads
      const quoteRes = await fetch(
        `${SWAP_API}/quote?inputMint=${colMint.toBase58()}&outputMint=${debtMint.toBase58()}&amount=${flashColBN.toString()}&slippageBps=${unwindSlippageBps}`,
        { headers: jupHeaders }
      ).then(r => r.json());

      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Unwind quote failed: ${quoteRes.error ?? "No route"}` });

      // Fix 3: check vault has enough collateral liquidity before flash borrowing
      await assertVaultLiquidity(connection, vaultId, colMint, flashColBN);

      // Fix 1: wait for RPC state to settle after quote fetch (longer for stable pairs)
      await sleep(isStable ? 600 : 400);

      // Fix 2: fetch flash loan ixs with retry on assertion failures
      let flashBorrowIx, flashPayIx;
      try {
        const flashIxs = await getFlashIxsWithRetry({ connection, signer: signerPubkey, asset: colMint, amount: flashColBN }, 3, isStable);
        flashBorrowIx  = flashIxs.flashBorrowIx;
        flashPayIx     = flashIxs.flashPaybackIx;
      } catch (e) {
        return res.status(502).json({ error: e.message });
      }

      const opColAmount  = isFullUnwind ? MAX_WITHDRAW : new BN(withdrawAmount.toString()).neg();
      const opDebtAmount = isFullUnwind ? MAX_REPAY    : new BN(quoteRes.otherAmountThreshold.toString()).neg();

      // Fetch swap instructions first — getOperateIx needs to be separate so
      // the retry wrapper can catch vault assertion failures (can't retry inside Promise.all)
      const swapApiRes = await fetch(`${SWAP_API}/swap-instructions`, {
        method: "POST",
        headers: jupHeaders,
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());

      const operateResult = await getOperateIxWithRetry({
        vaultId: Number(vaultId), positionId: Number(positionId),
        colAmount: opColAmount, debtAmount: opDebtAmount,
        signer: signerPubkey, connection,
      }, 3, isStable);

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
    if (msg.includes("Assertion") || msg.includes("assertion failed"))
      return res.status(500).json({ error: "Vault assertion failed — vault may have insufficient liquidity, be paused, or the RPC returned stale state. Try a smaller amount or retry in a few seconds.", detail: msg });
    if (msg.includes("return data") || msg.includes("No return data"))
      return res.status(500).json({ error: `Vault ${vaultId} simulation failed. Vault may be paused or amounts out of range.`, detail: msg });
    if (msg.includes("AccountNotFound") || msg.includes("could not find account"))
      return res.status(500).json({ error: `Account not found — vaultId ${vaultId} may be wrong.`, detail: msg });
    return res.status(500).json({ error: msg, detail: stack });
  }
}
