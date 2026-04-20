// api/multiply.js — Vercel Serverless Route
// Full Jupiter Multiply flow: Flashloan → Swap → Operate → Flashpayback
// Per official docs: https://developers.jup.ag/docs/lend/advanced/multiply
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
import { getOperateIx }                         from "@jup-ag/lend/borrow";
import { Client }                               from "@jup-ag/lend-read";

const RPC_URL  = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const LITE_API = "https://lite-api.jup.ag/swap/v1";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Frontend sends:
  //   vaultId          — integer vault ID (1–7)
  //   initialColAmount — collateral in raw token units (e.g. lamports for SOL, µUSDC for USDC)
  //   debtAmount       — debt to borrow in raw DEBT token units (e.g. µUSDC @ 6 dec)
  //   positionId       — 0 for new position, or existing NFT position ID
  //   signer           — user wallet public key string
  const {
    vaultId,
    initialColAmount,
    debtAmount,
    positionId = 0,
    signer,
  } = req.body;

  if (!vaultId || !initialColAmount || !debtAmount || !signer) {
    return res.status(400).json({
      error: "Missing fields: vaultId, initialColAmount, debtAmount, signer",
    });
  }

  const colRaw  = initialColAmount.toString().replace("-", "");
  const debtRaw = debtAmount.toString().replace("-", "");

  if (colRaw === "0" || debtRaw === "0") {
    return res.status(400).json({ error: "Amounts must be non-zero." });
  }

  let signerPubkey;
  try { signerPubkey = new PublicKey(signer); }
  catch { return res.status(400).json({ error: `Invalid signer: ${signer}` }); }

  const colBN  = new BN(colRaw);
  const debtBN = new BN(debtRaw);

  try {
    const connection = new Connection(RPC_URL, { commitment: "confirmed" });

    // ── 1. Get vault token mints from @jup-ag/lend-read ──────────────────────
    const readClient = new Client(connection);
    let vaultConfig;
    try {
      vaultConfig = await readClient.vault.getVaultConfig(Number(vaultId));
    } catch (e) {
      return res.status(400).json({
        error: `Vault ${vaultId} not found. Check vaultId is valid. Details: ${e.message}`,
      });
    }

    const colMint  = vaultConfig.supplyToken;  // collateral token mint
    const debtMint = vaultConfig.borrowToken;  // debt token mint

    console.log("[multiply] vault", vaultId, {
      colMint:   colMint.toBase58(),
      debtMint:  debtMint.toBase58(),
      colAmount: colBN.toString(),
      debtAmount: debtBN.toString(),
    });

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
          error: `Vault ${vaultId} simulation failed. The vault may be paused, or the amounts are outside its limits. Try a smaller amount or a different vault.`,
        });
      }
      throw sdkErr;
    }

    if (!operateIxs?.length) {
      return res.status(400).json({ error: "getOperateIx returned no instructions." });
    }

    // ── 5. Assemble full transaction: borrow → swap → operate → payback ───────
    const swapAlts = await resolveAlts(connection, swapApiRes.addressLookupTableAddresses ?? []);
    const allAlts  = [...(operateAlts ?? []), ...swapAlts];

    const { blockhash } = await connection.getLatestBlockhash("finalized");
    const message = new TransactionMessage({
      payerKey:        signerPubkey,
      recentBlockhash: blockhash,
      instructions:    [flashBorrowIx, swapIx, ...operateIxs, flashPayIx],
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
