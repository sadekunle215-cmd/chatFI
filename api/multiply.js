// api/multiply.js — Vercel Serverless Route
// Full Jupiter Lend operations: multiply, unwind, deposit, borrow, repay, withdraw
// Docs: https://developers.jup.ag/docs/lend/advanced/multiply
//       https://developers.jup.ag/docs/lend/advanced/unwind
//       https://developers.jup.ag/docs/lend/borrow/combined
//
// npm install @jup-ag/lend @jup-ag/lend-read @solana/web3.js bn.js

// ── ALL imports at the top — no top-level await, no import after code ─────────
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
import { getOperateIx, MAX_REPAY_AMOUNT, MAX_WITHDRAW_AMOUNT } from "@jup-ag/lend/borrow";
import { Client } from "@jup-ag/lend-read";

// ── MAX sentinel fallbacks (in case SDK version doesn't export them) ──────────
// Jupiter Lend docs: pass these to signal "repay/withdraw everything" on full unwind
const MAX_REPAY   = MAX_REPAY_AMOUNT   ?? new BN("9007199254740991");
const MAX_WITHDRAW = MAX_WITHDRAW_AMOUNT ?? new BN("9007199254740991");

// Known stablecoin mints — used for adaptive slippage selection
const STABLE_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  // USDT
  "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD",  // JupUSD
  "USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX",  // USDH
  "A9mUU4qviSctJVPJdBJWkb28deg915LYJKrzQ19ji3FM",  // USDCet (wormhole)
]);

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
  // Always return JSON — never let Vercel serve its default HTML error page
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    action = "open",     // open | unwind | deposit | borrow | repay | withdraw
    vaultId,
    positionId = 0,
    initialColAmount,    // open: initial collateral amount (raw units)
    targetLeverageBps,   // open: leverage x100 e.g. 200=2x, 300=3x (preferred over debtAmount)
    withdrawAmount,      // unwind: partial withdraw amount (undefined = full unwind)
    colAmount,           // simple ops
    debtAmount,          // simple ops (also accepted for open as legacy fallback)
    signer,
  } = req.body;

  if (!vaultId || !signer) return res.status(400).json({ error: "Missing vaultId or signer" });

  let signerPubkey;
  try { signerPubkey = new PublicKey(signer); }
  catch { return res.status(400).json({ error: `Invalid signer: ${signer}` }); }

  try {
    const connection = new Connection(RPC_URL, { commitment: "confirmed", confirmTransactionInitialTimeout: 60000 });
    const readClient = new Client(connection);

    // Resolve vault mints from on-chain config
    let vaultConfig;
    try { vaultConfig = await readClient.vault.getVaultConfig(Number(vaultId)); }
    catch (e) { return res.status(400).json({ error: `Vault ${vaultId} not found: ${e.message}` }); }

    const colMint  = vaultConfig.supplyToken;
    const debtMint = vaultConfig.borrowToken;

    console.log(`[multiply] action=${action} vault=${vaultId} positionId=${positionId}`, {
      colMint: colMint.toBase58(), debtMint: debtMint.toBase58(),
    });

    // ── Resolve positionId: find user's existing position on this vault, or first free slot ──
    // Jupiter Lend positionId = slot index (0,1,2…) per vault per user.
    // For "open": reuse existing slot if found, otherwise use next free slot.
    const resolvePositionId = async (targetVaultId, signerPk) => {
      try {
        for (let slot = 0; slot <= 9; slot++) {
          const pos = await readClient.vault.getUserPosition({ vaultId: Number(targetVaultId), positionId: slot });
          if (!pos) return slot; // free slot — use for new position
          try {
            const owner = await readClient.vault.getNftOwner(pos.positionMint);
            if (owner && owner.toBase58() === signerPk.toBase58()) return slot; // user's existing position
          } catch {}
        }
      } catch {}
      return 0;
    };

    // ── OPEN (Multiply) ───────────────────────────────────────────────────────
    // Flow per docs: FlashBorrow(debt) → Swap(debt→col) → Operate(+col,+debt) → FlashPayback
    if (action === "open") {
      if (!initialColAmount)
        return res.status(400).json({ error: "open requires initialColAmount" });
      if (!targetLeverageBps && !debtAmount)
        return res.status(400).json({ error: "open requires targetLeverageBps (e.g. 200 for 2x) or debtAmount" });

      const colBN = new BN(initialColAmount.toString());
      if (colBN.isZero())
        return res.status(400).json({ error: "initialColAmount must be non-zero" });

      // Derive debtBN from targetLeverageBps (preferred) or fall back to raw debtAmount.
      // targetLeverageBps = leverage * 100, so debt = col * (leverage - 1)
      // debtBN = col * (targetLeverageBps - 100) / 100
      let debtBN;
      if (targetLeverageBps) {
        const leverageBps = Number(targetLeverageBps);
        if (leverageBps <= 100) return res.status(400).json({ error: "targetLeverageBps must be > 100 (leverage > 1x)" });
        // Use BN arithmetic to avoid float precision loss
        debtBN = colBN.muln(leverageBps - 100).divn(100);
      } else {
        debtBN = new BN(debtAmount.toString());
      }
      if (debtBN.isZero())
        return res.status(400).json({ error: "Derived debtAmount is zero — check leverage/collateral values" });

      const resolvedPositionId = await resolvePositionId(vaultId, signerPubkey);
      console.log(`[multiply] resolved positionId=${resolvedPositionId} for vault=${vaultId} signer=${signerPubkey.toBase58()}`);

      const flashParams = { connection, signer: signerPubkey, asset: debtMint, amount: debtBN };
      const [flashBorrowIx, flashPayIx] = await Promise.all([
        getFlashBorrowIx(flashParams),
        getFlashPaybackIx(flashParams),
      ]);

      // Adaptive slippage: stable-stable pairs use 30bps; volatile pairs use 150bps.
      // This prevents 6025 SlippageExceeded errors where tight slippage gets breached on-chain.
      const isStable = STABLE_MINTS.has(colMint.toBase58()) && STABLE_MINTS.has(debtMint.toBase58());
      const slippageBps = isStable ? 30 : 150;

      const quoteRes = await fetch(
        `${LITE_API}/quote?inputMint=${debtMint.toBase58()}&outputMint=${colMint.toBase58()}&amount=${debtBN.toString()}&slippageBps=${slippageBps}`
      ).then(r => r.json());
      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Swap quote failed: ${quoteRes.error ?? "No route"}` });

      const swapApiRes = await fetch(`${LITE_API}/swap-instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());
      if (swapApiRes.error) return res.status(502).json({ error: `Swap instructions failed: ${swapApiRes.error}` });

      const swapIx = toIx(swapApiRes.swapInstruction);
      // Use otherAmountThreshold (guaranteed min output after slippage) not outAmount (optimistic).
      // Passing the optimistic outAmount to getOperateIx causes 6025 when actual output is lower.
      const swapMinOutput = new BN((quoteRes.otherAmountThreshold ?? quoteRes.outAmount).toString());
      const supplyTotal   = colBN.add(swapMinOutput);

      const { ixs: operateIxs, addressLookupTableAccounts: operateAlts } = await getOperateIx({
        vaultId: Number(vaultId), positionId: resolvedPositionId,
        colAmount: supplyTotal, debtAmount: debtBN,  // supplyTotal uses min guaranteed swap output
        signer: signerPubkey, connection,
      });

      const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
      const allAlts  = dedupeAlts([...(operateAlts ?? []), ...swapAlts]);
      const allIxs   = [flashBorrowIx, swapIx, ...operateIxs, flashPayIx];
      return buildAndReturn(res, connection, signerPubkey, allIxs, allAlts);
    }

    // ── UNWIND (Close/Deleverage) ─────────────────────────────────────────────
    // Flow per docs: FlashBorrow(col) → Swap(col→debt) → Operate(-col,-debt) → FlashPayback
    if (action === "unwind") {
      if (!positionId) return res.status(400).json({ error: "unwind requires positionId" });
      const isFullUnwind = !withdrawAmount;

      // For full unwind, read current position to size the flashloan
      let flashColBN;
      if (isFullUnwind) {
        try {
          const pos   = await readClient.vault.getUserPosition({ vaultId: Number(vaultId), positionId: Number(positionId) });
          const state = await readClient.vault.getCurrentPositionState({ vaultId: Number(vaultId), position: pos });
          // Add 1% buffer for price movement between quote and execution
          flashColBN = state.colRaw.muln(101).divn(100);
        } catch {
          return res.status(400).json({ error: `Could not read position ${positionId}. Check vaultId and positionId are correct.` });
        }
      } else {
        flashColBN = new BN(withdrawAmount.toString());
      }

      const flashParams = { connection, signer: signerPubkey, asset: colMint, amount: flashColBN };
      const [flashBorrowIx, flashPayIx] = await Promise.all([
        getFlashBorrowIx(flashParams),
        getFlashPaybackIx(flashParams),
      ]);

      // Use same adaptive slippage for unwind swap
      const isStableUnwind = STABLE_MINTS.has(colMint.toBase58()) && STABLE_MINTS.has(debtMint.toBase58());
      const unwindSlippageBps = isStableUnwind ? 30 : 150;

      const quoteRes = await fetch(
        `${LITE_API}/quote?inputMint=${colMint.toBase58()}&outputMint=${debtMint.toBase58()}&amount=${flashColBN.toString()}&slippageBps=${unwindSlippageBps}`
      ).then(r => r.json());
      if (quoteRes.error || !quoteRes.routePlan)
        return res.status(502).json({ error: `Swap quote failed for unwind: ${quoteRes.error ?? "No route"}` });

      const swapApiRes = await fetch(`${LITE_API}/swap-instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
      }).then(r => r.json());
      if (swapApiRes.error) return res.status(502).json({ error: `Swap instructions failed: ${swapApiRes.error}` });

      const swapIx = toIx(swapApiRes.swapInstruction);

      // Full unwind: MAX sentinels tell the protocol to close everything
      const opColAmount  = isFullUnwind ? MAX_WITHDRAW : new BN(withdrawAmount.toString()).neg();
      const opDebtAmount = isFullUnwind ? MAX_REPAY    : new BN(quoteRes.otherAmountThreshold.toString()).neg();

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
    // Direct vault operations via getOperateIx — no flashloan needed
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

      // For deposit/borrow (may be new position), resolve positionId from chain
      // For repay/withdraw, use the provided positionId (must be existing position)
      const resolvedPosId = (action === "deposit" || action === "borrow")
        ? await resolvePositionId(vaultId, signerPubkey)
        : Number(positionId);

      const { ixs, addressLookupTableAccounts } = await getOperateIx({
        vaultId: Number(vaultId), positionId: resolvedPosId,
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
