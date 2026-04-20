// api/multiply.js — Vercel Serverless Route
// Full Jupiter Multiply flow: Flashloan → Swap → Operate → Flashpayback
// Per official docs: https://developers.jup.ag/docs/lend/advanced/multiply
//
// npm install @jup-ag/lend @solana/web3.js @solana/spl-token bn.js

import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import { getFlashBorrowIx, getFlashPaybackIx } from "@jup-ag/lend/flashloan";
import { getOperateIx }                         from "@jup-ag/lend/borrow";

// NOTE: @jup-ag/lend-read was removed — that package does not exist.
// It caused Vercel to crash at cold-start → HTML "A server error occurred"
// → "Unexpected token 'A'" on the frontend JSON.parse.
//
// Mint addresses resolve server-side from VAULT_MINTS.
// Frontend may also send colMint/debtMint as an override.

const RPC_URL  = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const LITE_API = "https://lite-api.jup.ag/swap/v1";

// Server-side vault mint map — keyed by vaultId integer.
const VAULT_MINTS = {
  1: { colMint: "So11111111111111111111111111111111111111112",     debtMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // SOL/USDC
  2: { colMint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", debtMint: "So11111111111111111111111111111111111111112"   },      // JitoSOL/SOL
  3: { colMint: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",  debtMint: "So11111111111111111111111111111111111111112"   },      // JupSOL/SOL
  4: { colMint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", debtMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // WBTC/USDC
  5: { colMint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", debtMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // JLP/USDC
  6: { colMint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",   debtMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // JUP/USDC
  7: { colMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", debtMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"  }, // USDC/USDT
};

// ── Helper: resolve address lookup tables ─────────────────────────────────────
async function resolveAlts(connection, keys = []) {
  if (!keys.length) return [];
  const infos = await connection.getMultipleAccountsInfo(keys.map(k => new PublicKey(k)));
  return infos.reduce((acc, info, i) => {
    if (info) {
      acc.push(new AddressLookupTableAccount({
        key:   new PublicKey(keys[i]),
        state: AddressLookupTableAccount.deserialize(info.data),
      }));
    }
    return acc;
  }, []);
}

// ── Helper: convert Jupiter Lite API instruction JSON → TransactionInstruction ─
function toIx(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map(a => ({
      pubkey:     new PublicKey(a.pubkey),
      isSigner:   a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

// ── Helper: idempotent ATA init ix (no-op if ATA already exists) ─────────────
function makeAtaIx(payer, mint, owner) {
  const ata = getAssociatedTokenAddressSync(
    mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return createAssociatedTokenAccountIdempotentInstruction(
    payer, ata, owner, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    vaultId,
    initialColAmount,
    debtAmount,
    positionId = 0,
    signer,
    colMint:  colMintOverride,
    debtMint: debtMintOverride,
  } = req.body ?? {};

  const missing = [];
  if (!vaultId)          missing.push("vaultId");
  if (!initialColAmount) missing.push("initialColAmount");
  if (!debtAmount)       missing.push("debtAmount");
  if (!signer)           missing.push("signer");
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  const vaultMints  = VAULT_MINTS[Number(vaultId)];
  const colMintStr  = colMintOverride  || vaultMints?.colMint;
  const debtMintStr = debtMintOverride || vaultMints?.debtMint;

  if (!colMintStr || !debtMintStr) {
    return res.status(400).json({
      error: `Unknown vaultId ${vaultId}. Use vault ID 1–7 or pass colMint and debtMint explicitly.`,
    });
  }

  const colRaw  = initialColAmount.toString().replace("-", "");
  const debtRaw = debtAmount.toString().replace("-", "");
  if (colRaw === "0" || debtRaw === "0") {
    return res.status(400).json({ error: "Amounts must be non-zero." });
  }

  let signerPubkey, colMint, debtMint;
  try { signerPubkey = new PublicKey(signer); }
  catch { return res.status(400).json({ error: `Invalid signer: ${signer}` }); }
  try { colMint = new PublicKey(colMintStr); }
  catch { return res.status(400).json({ error: `Invalid colMint: ${colMintStr}` }); }
  try { debtMint = new PublicKey(debtMintStr); }
  catch { return res.status(400).json({ error: `Invalid debtMint: ${debtMintStr}` }); }

  const colBN  = new BN(colRaw);
  const debtBN = new BN(debtRaw);

  try {
    const connection = new Connection(RPC_URL, { commitment: "confirmed" });

    console.log("[multiply] vault", vaultId, {
      colMint:    colMint.toBase58(),
      debtMint:   debtMint.toBase58(),
      colAmount:  colBN.toString(),
      debtAmount: debtBN.toString(),
    });

    // ── 1. ATA init instructions (idempotent — no-op if already exist) ────────
    // Required: getOperateIx simulation fails if the user's colMint or debtMint
    // ATA doesn't exist yet (e.g. wallet has never held USDT).
    const ataColIx  = makeAtaIx(signerPubkey, colMint,  signerPubkey);
    const ataDebtIx = makeAtaIx(signerPubkey, debtMint, signerPubkey);

    // ── 2. Flash borrow the debt token ────────────────────────────────────────
    const flashParams   = { connection, signer: signerPubkey, asset: debtMint, amount: debtBN };
    const flashBorrowIx = await getFlashBorrowIx(flashParams);
    const flashPayIx    = await getFlashPaybackIx(flashParams);

    // ── 3. Jupiter Lite API: swap debt token → collateral token ───────────────
    const quoteUrl = `${LITE_API}/quote?inputMint=${debtMint.toBase58()}&outputMint=${colMint.toBase58()}&amount=${debtBN.toString()}&slippageBps=100`;
    const quoteRes = await fetch(quoteUrl).then(r => r.json());

    if (quoteRes.error || !quoteRes.routePlan) {
      return res.status(502).json({
        error: `Jupiter swap quote failed: ${quoteRes.error ?? "No route found for this pair"}`,
      });
    }

    const swapApiRes = await fetch(`${LITE_API}/swap-instructions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ quoteResponse: quoteRes, userPublicKey: signerPubkey.toBase58() }),
    }).then(r => r.json());

    if (swapApiRes.error) {
      return res.status(502).json({ error: `Jupiter swap instructions failed: ${swapApiRes.error}` });
    }

    const swapIx = toIx(swapApiRes.swapInstruction);

    // ── 4. getOperateIx: total supply = initial collateral + swap output ───────
    const swapOutput  = new BN(quoteRes.outAmount.toString());
    const supplyTotal = colBN.add(swapOutput);

    console.log("[multiply] supplyTotal:", supplyTotal.toString(), "swapOutput:", swapOutput.toString());

    let operateIxs, operateAlts;
    try {
      ({ ixs: operateIxs, addressLookupTableAccounts: operateAlts } = await getOperateIx({
        vaultId:    Number(vaultId),
        positionId: Number(positionId),
        colAmount:  supplyTotal,
        debtAmount: debtBN,
        signer:     signerPubkey,
        connection,
      }));
    } catch (sdkErr) {
      const msg = sdkErr?.message || "";
      console.error("[multiply] getOperateIx error:", msg);
      if (msg.includes("return data") || msg.includes("No return data")) {
        return res.status(500).json({
          error: `Vault ${vaultId} simulation failed. The vault may be paused or amounts are outside its limits. Try a smaller amount or different vault.`,
        });
      }
      throw sdkErr;
    }

    if (!operateIxs?.length) {
      return res.status(400).json({ error: "getOperateIx returned no instructions." });
    }

    // ── 5. Assemble: ATA inits → borrow → swap → operate → payback ───────────
    const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
    const allAlts  = [...(operateAlts ?? []), ...swapAlts];

    const { blockhash } = await connection.getLatestBlockhash("finalized");
    const message = new TransactionMessage({
      payerKey:        signerPubkey,
      recentBlockhash: blockhash,
      instructions:    [ataColIx, ataDebtIx, flashBorrowIx, swapIx, ...operateIxs, flashPayIx],
    }).compileToV0Message(allAlts);

    const tx         = new VersionedTransaction(message);
    const serialized = Buffer.from(tx.serialize()).toString("base64");

    console.log("[multiply] transaction assembled OK — returning to client.");
    return res.status(200).json({ transaction: serialized });

  } catch (err) {
    console.error("[multiply] unhandled error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
