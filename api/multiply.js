// api/multiply.js — Vercel Serverless Route
// Jupiter Lend: multiply, unwind, deposit, borrow, repay, withdraw
// REQUIRED env var: SOLANA_RPC — must be a paid RPC (Helius/Triton/Quicknode).

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
import { Client } from "@jup-ag/lend/api";

const MAX_REPAY    = MAX_REPAY_AMOUNT   ?? new BN("9007199254740991");
const MAX_WITHDRAW = MAX_WITHDRAW_AMOUNT ?? new BN("9007199254740991");

// Native SOL mint address — SDK cannot handle this directly in flash loan calls.
// Must always use the WSOL mint (same address, but treated as a wrapped token account).
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
const WSOL_MINT       = "So11111111111111111111111111111111111111112"; // identical address, but used as SPL token

/** For flash loan asset param: native SOL must be passed as a PublicKey of WSOL */
function toFlashAsset(mintPubkey) {
  // If the mint IS native SOL, return as-is (same address) but log so we know.
  // The real fix is that the SDK needs a WSOL *token account* to exist — handled via ATA creation.
  return mintPubkey;
}

const RPC_URL     = process.env.SOLANA_RPC;
const JUP_API_KEY = process.env.JUP_API_KEY || "";
const SWAP_API    = "https://lite-api.jup.ag/swap/v1";

const jupHeaders = {
  "Content-Type": "application/json",
  ...(JUP_API_KEY ? { "x-api-key": JUP_API_KEY } : {}),
};

// ── Hardcoded vault mints (verified from jup.ag on-chain) ─────────────────────
// supplyToken = collateral mint, borrowToken = debt mint
const KNOWN_VAULT_MINTS = {
  1: { supplyToken: "So11111111111111111111111111111111111111112",    borrowToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // SOL/USDC
  2: { supplyToken: "So11111111111111111111111111111111111111112",    borrowToken: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"  }, // SOL/USDT
  3: { supplyToken: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",  borrowToken: "So11111111111111111111111111111111111111112"    }, // JupSOL/SOL
  4: { supplyToken: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", borrowToken: "So11111111111111111111111111111111111111112"    }, // JLP/SOL
  5: { supplyToken: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", borrowToken: "So11111111111111111111111111111111111111112"    }, // WETH/SOL
  6: { supplyToken: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", borrowToken: "So11111111111111111111111111111111111111112"    }, // WBTC/SOL
  7: { supplyToken: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  borrowToken: "So11111111111111111111111111111111111111112"    }, // mSOL/SOL
};

const vaultMintCache = {};

async function getVaultMintsById(vaultId) {
  const id = Number(vaultId);
  if (vaultMintCache[id]) return vaultMintCache[id];
  if (KNOWN_VAULT_MINTS[id]) {
    vaultMintCache[id] = KNOWN_VAULT_MINTS[id];
    console.log(`[multiply] vault ${id} from map col=${KNOWN_VAULT_MINTS[id].supplyToken.slice(0,8)} debt=${KNOWN_VAULT_MINTS[id].borrowToken.slice(0,8)}`);
    return KNOWN_VAULT_MINTS[id];
  }
  throw new Error(`Unknown vaultId ${id}. Not in vault map.`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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
    seen.add(k);
    return true;
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Retry wrappers ─────────────────────────────────────────────────────────────
async function getFlashIxsWithRetry(flashParams, maxAttempts = 5, isStable = false) {
  const attempts  = isStable ? 7 : maxAttempts;
  const baseDelay = isStable ? 1000 : 700;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const flashBorrowIx  = await getFlashBorrowIx(flashParams);
      const flashPaybackIx = await getFlashPaybackIx(flashParams);
      return { flashBorrowIx, flashPaybackIx };
    } catch (e) {
      lastErr = e;
      console.warn(`[flash] attempt ${attempt}/${attempts} failed: ${e.message}`);
      if (attempt < attempts) { await sleep(baseDelay * attempt); continue; }
      break;
    }
  }
  throw new Error(`Flash loan setup failed after ${attempts} attempts: ${lastErr?.message}`);
}

async function getOperateIxWithRetry(params, maxAttempts = 5, isStable = false) {
  const attempts  = isStable ? 7 : maxAttempts;
  const baseDelay = isStable ? 1000 : 700;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await getOperateIx(params);
    } catch (e) {
      lastErr = e;
      console.warn(`[operate] attempt ${attempt}/${attempts} failed: ${e.message}`);
      if (attempt < attempts) { await sleep(baseDelay * attempt); continue; }
      break;
    }
  }
  throw new Error(`getOperateIx failed after ${attempts} attempts: ${lastErr?.message}`);
}

// ── ATA helper ────────────────────────────────────────────────────────────────
async function getAtaCreateIxIfNeeded(connection, mint, owner) {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  try {
    const info = await connection.getAccountInfo(ata);
    if (info) return null;
  } catch {}
  return createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint, TOKEN_PROGRAM_ID);
}

// ── WSOL wrapping helper ───────────────────────────────────────────────────────
// When the flash loan asset is native SOL (So111...112), the SDK calls getMint()
// on it which fails because native SOL has no mint struct. We must ensure a WSOL
// token account (ATA) exists for the signer before the flash loan instruction runs.
async function ensureWsolAtaIx(connection, owner) {
  const wsolMint = new PublicKey(WSOL_MINT);
  const ata = getAssociatedTokenAddressSync(wsolMint, owner, false, TOKEN_PROGRAM_ID);
  try {
    const info = await connection.getAccountInfo(ata);
    if (info) return null; // already exists
  } catch {}
  return createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, wsolMint, TOKEN_PROGRAM_ID);
}

function isNativeSOL(mintPubkey) {
  return mintPubkey.toBase58() === NATIVE_SOL_MINT;
}
async function buildTx(connection, signerPubkey, ixs, alts) {
  if (!ixs?.length) throw new Error("No instructions returned from SDK.");
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
  console.log(`[buildTx] tx size=${txBytes.length} bytes`);
  if (txBytes.length > 1232) throw new Error(`Transaction too large: ${txBytes.length} bytes (max 1232).`);
  return Buffer.from(txBytes).toString("base64");
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // ── GET: health check + vault map ──────────────────────────────────────────
  if (req.method === "GET") {
    if (!RPC_URL) return res.status(500).json({ error: "SOLANA_RPC env var not set." });
    try {
      const connection = new Connection(RPC_URL, { commitment: "confirmed" });
      const slot = await connection.getSlot();
      const vaults = Object.entries(KNOWN_VAULT_MINTS).map(([id, m]) => ({
        vaultId: Number(id), supplyToken: m.supplyToken, borrowToken: m.borrowToken,
      }));
      return res.status(200).json({ ok: true, slot, vaults });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!RPC_URL) return res.status(500).json({ error: "SOLANA_RPC environment variable is not set." });

  const {
    action = "open", vaultId, positionId = 0,
    initialColAmount, targetLeverageBps,
    withdrawAmount, colAmount, debtAmount, signer,
  } = req.body;

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
        if (bps <= 100) return res.status(400).json({ error: "targetLeverageBps must be > 100" });
        borrowBN = colBN.muln(bps - 100).divn(100);
      } else {
        borrowBN = new BN(debtAmount.toString());
      }
      if (borrowBN.isZero()) return res.status(400).json({ error: "Derived borrow amount is zero" });
      if (borrowBN.lt(new BN("1000")))
        return res.status(400).json({ error: `Borrow amount too small (${borrowBN.toString()} units). Use higher leverage or larger collateral.` });

      console.log(`[multiply/open] vault=${vaultId} col=${colBN} borrow=${borrowBN}`);

      const vaultMints = await getVaultMintsById(vaultId);
      const colMint    = new PublicKey(vaultMints.supplyToken);
      const debtMint   = new PublicKey(vaultMints.borrowToken);

      const STABLE = ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"];
      const isStable = STABLE.includes(colMint.toBase58()) || STABLE.includes(debtMint.toBase58());

      const quoteRes = await fetch(
        `${SWAP_API}/quote?inputMint=${debtMint.toBase58()}&outputMint=${colMint.toBase58()}&amount=${borrowBN.toString()}&slippageBps=${isStable ? 100 : 300}`,
        { headers: jupHeaders }
      ).then(r => r.json());
      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Swap quote failed: ${quoteRes.error ?? "No route"}` });

      await sleep(isStable ? 800 : 500);

      // If debt is native SOL, ensure WSOL ATA exists before flash loan (SDK calls getMint internally)
      const debtIsSOL = isNativeSOL(debtMint);
      const wsolAtaIxOpen = debtIsSOL ? await ensureWsolAtaIx(connection, signerPubkey) : null;

      let flashBorrowIx, flashPayIx;
      try {
        // NOTE: getFlashBorrowIx does NOT accept a cluster param — only { connection, signer, asset, amount }
        const r = await getFlashIxsWithRetry({ connection, signer: signerPubkey, asset: debtMint, amount: borrowBN }, 5, isStable);
        flashBorrowIx = r.flashBorrowIx;
        flashPayIx    = r.flashPaybackIx;
      } catch (e) {
        return res.status(502).json({ error: e.message });
      }

      const { ix: initIx, nftId } = await getInitPositionIx({ vaultId: Number(vaultId), connection, signer: signerPubkey, cluster: "mainnet" });
      console.log(`[multiply/open] nftId=${nftId}`);

      const operateResult = await getOperateIxWithRetry({
        vaultId:    Number(vaultId),
        positionId: nftId,
        colAmount:  colBN.add(new BN((isStable ? quoteRes.otherAmountThreshold : quoteRes.outAmount).toString())),
        debtAmount: borrowBN,
        signer:     signerPubkey,
        connection,
        cluster:    "mainnet",
      }, 5, isStable);

      const swapApiRes = await fetch(`${SWAP_API}/swap-instructions`, {
        method: "POST", headers: jupHeaders,
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());
      if (swapApiRes.error) return res.status(502).json({ error: `Swap instructions failed: ${swapApiRes.error}` });

      const swapIx   = toIx(swapApiRes.swapInstruction);
      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateResult.addressLookupTableAccounts ?? []), ...swapAlts]);

      const [colAtaIx, debtAtaIx] = await Promise.all([
        getAtaCreateIxIfNeeded(connection, colMint, signerPubkey),
        getAtaCreateIxIfNeeded(connection, debtMint, signerPubkey),
      ]);
      const ataIxs = [wsolAtaIxOpen, colAtaIx, debtAtaIx].filter(Boolean);

      const { blockhash: setupBh } = await connection.getLatestBlockhash("confirmed");
      const setupTx = new Transaction({ feePayer: signerPubkey, recentBlockhash: setupBh });
      setupTx.add(initIx);
      ataIxs.forEach(ix => setupTx.add(ix));
      const setupTransaction = Buffer.from(setupTx.serialize({ requireAllSignatures: false })).toString("base64");

      const mainIxs = [flashBorrowIx, swapIx, ...operateResult.ixs, flashPayIx];
      const transaction = await buildTx(connection, signerPubkey, mainIxs, allAlts);
      return res.status(200).json({ transaction, setupTransaction, positionId: nftId });
    }

    // ── UNWIND ────────────────────────────────────────────────────────────────
    if (action === "unwind") {
      const vaultMints   = await getVaultMintsById(vaultId);
      const colMint      = new PublicKey(vaultMints.supplyToken);
      const debtMint     = new PublicKey(vaultMints.borrowToken);
      const isFullUnwind = withdrawAmount == null || withdrawAmount === undefined || withdrawAmount === "";
      let flashColBN;

      if (isFullUnwind) {
        const client = new Client(JUP_API_KEY ? { apiKey: JUP_API_KEY } : undefined);
        const pos    = await client.vault?.getUserPosition?.({ vaultId: Number(vaultId), positionId: Number(positionId) });
        if (!pos) return res.status(400).json({ error: `Position ${positionId} not found in vault ${vaultId}` });
        const state  = await client.vault?.getCurrentPositionState?.({ vaultId: Number(vaultId), position: pos });
        flashColBN   = state.colRaw.muln(101).divn(100);
      } else {
        flashColBN = new BN(withdrawAmount.toString());
      }

      const STABLE   = ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"];
      const isStable = STABLE.includes(colMint.toBase58()) || STABLE.includes(debtMint.toBase58());

      const quoteRes = await fetch(
        `${SWAP_API}/quote?inputMint=${colMint.toBase58()}&outputMint=${debtMint.toBase58()}&amount=${flashColBN.toString()}&slippageBps=${isStable ? 100 : 150}`,
        { headers: jupHeaders }
      ).then(r => r.json());
      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Unwind quote failed: ${quoteRes.error ?? "No route"}` });

      await sleep(isStable ? 800 : 500);

      // If collateral is native SOL, ensure WSOL ATA exists before flash loan
      const colIsSOL = isNativeSOL(colMint);
      const wsolAtaIxUnwind = colIsSOL ? await ensureWsolAtaIx(connection, signerPubkey) : null;

      let flashBorrowIx, flashPayIx;
      try {
        // NOTE: getFlashBorrowIx does NOT accept a cluster param — only { connection, signer, asset, amount }
        const r = await getFlashIxsWithRetry({ connection, signer: signerPubkey, asset: colMint, amount: flashColBN }, 5, isStable);
        flashBorrowIx = r.flashBorrowIx;
        flashPayIx    = r.flashPaybackIx;
      } catch (e) {
        return res.status(502).json({ error: e.message });
      }

      const opColAmount  = isFullUnwind ? MAX_WITHDRAW : new BN(withdrawAmount.toString()).neg();
      const opDebtAmount = isFullUnwind ? MAX_REPAY    : new BN(quoteRes.otherAmountThreshold.toString()).neg();

      const swapApiRes = await fetch(`${SWAP_API}/swap-instructions`, {
        method: "POST", headers: jupHeaders,
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());

      const operateResult = await getOperateIxWithRetry({
        vaultId: Number(vaultId), positionId: Number(positionId),
        colAmount: opColAmount, debtAmount: opDebtAmount,
        signer: signerPubkey, connection, cluster: "mainnet",
      }, 5, isStable);

      if (swapApiRes.error) return res.status(502).json({ error: `Unwind swap failed: ${swapApiRes.error}` });

      const swapIx   = toIx(swapApiRes.swapInstruction);
      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateResult.addressLookupTableAccounts ?? []), ...swapAlts]);
      const unwindSetupIxs = [wsolAtaIxUnwind].filter(Boolean);
      const mainUnwindIxs  = [...unwindSetupIxs, flashBorrowIx, swapIx, ...operateResult.ixs, flashPayIx];
      const transaction = await buildTx(connection, signerPubkey, mainUnwindIxs, allAlts);
      return res.status(200).json({ transaction });
    }

    // ── SIMPLE OPS ────────────────────────────────────────────────────────────
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
        signer: signerPubkey, connection, cluster: "mainnet",
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
      return res.status(500).json({ error: "RPC rate limited — set SOLANA_RPC to a paid provider.", detail: msg });
    if (msg.toLowerCase().includes("assert"))
      return res.status(500).json({ error: `Vault assertion failed — vault may have insufficient liquidity or be paused. [SDK: ${msg}]`, detail: stack });
    if (msg.includes("return data") || msg.includes("No return data"))
      return res.status(500).json({ error: `Vault ${vaultId} simulation failed. Vault may be paused.`, detail: msg });
    if (msg.includes("AccountNotFound") || msg.includes("could not find account"))
      return res.status(500).json({ error: `Account not found — vaultId ${vaultId} may be wrong.`, detail: msg });
    return res.status(500).json({ error: msg, detail: stack });
  }
}
