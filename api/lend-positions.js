// /api/lend-positions.js — Vercel serverless function
// GET  ?wallet=xxx  → reads all open borrow positions (existing)
// POST action:borrow → returns raw instructions + ALT keys (client builds tx with fresh blockhash)

import { Connection, PublicKey } from "@solana/web3.js";
import { Client } from "@jup-ag/lend-read";
import { getOperateIx } from "@jup-ag/lend/borrow";
import BN from "bn.js";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const VAULT_META = {
  1: { collateral: "SOL",    debt: "USDC", colDecimals: 9, debtDecimals: 6 },
  2: { collateral: "JitoSOL",debt: "SOL",  colDecimals: 9, debtDecimals: 9 },
  3: { collateral: "JupSOL", debt: "SOL",  colDecimals: 9, debtDecimals: 9 },
  4: { collateral: "WBTC",   debt: "USDC", colDecimals: 8, debtDecimals: 6 },
  5: { collateral: "JLP",    debt: "USDC", colDecimals: 6, debtDecimals: 6 },
  6: { collateral: "JUP",    debt: "USDC", colDecimals: 6, debtDecimals: 6 },
  7: { collateral: "USDC",   debt: "USDT", colDecimals: 6, debtDecimals: 6 },
};

// Serialize a TransactionInstruction to a plain JSON-safe object
function serializeIx(ix) {
  return {
    programId: ix.programId.toBase58(),
    keys: ix.keys.map(k => ({
      pubkey:     k.pubkey.toBase58(),
      isSigner:   k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data).toString("base64"),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const connection = new Connection(RPC_URL, { commitment: "confirmed" });

  // ── POST — return raw instructions so client can build tx with fresh blockhash
  if (req.method === "POST") {
    const { action, vaultId, positionId, signer: signerStr, colAmount, debtAmount } = req.body || {};

    if (action !== "borrow") {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }
    if (!signerStr || !vaultId || !colAmount || !debtAmount) {
      return res.status(400).json({ error: "Missing required fields: signer, vaultId, colAmount, debtAmount" });
    }

    let signer;
    try { signer = new PublicKey(signerStr); }
    catch { return res.status(400).json({ error: "Invalid signer public key" }); }

    try {
      const { ixs, addressLookupTableAccounts } = await getOperateIx({
        vaultId:    Number(vaultId),
        positionId: Number(positionId ?? 0),
        colAmount:  new BN(colAmount.toString()),
        debtAmount: new BN(debtAmount.toString()),
        signer,
        connection,
      });

      if (!ixs?.length) throw new Error("No instructions returned from getOperateIx");

      // Return serialized instructions + ALT pubkeys — NO blockhash baked in
      // Client will fetch a fresh blockhash and build the versioned tx itself
      const serializedIxs   = ixs.map(serializeIx);
      const altKeys = (addressLookupTableAccounts || []).map(a => a.key.toBase58());

      // Split: setup ixs (all but last) + main ix (last)
      const setupIxs = serializedIxs.length > 1 ? serializedIxs.slice(0, -1) : [];
      const mainIxs  = serializedIxs.length > 1 ? [serializedIxs[serializedIxs.length - 1]] : serializedIxs;

      return res.status(200).json({ mainIxs, setupIxs, altKeys });
    } catch (err) {
      console.error("[/api/lend-positions] borrow error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET — fetch open borrow positions (original unchanged) ────────────────
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: "Missing wallet query param" });

  let userPubkey;
  try { userPubkey = new PublicKey(wallet); }
  catch { return res.status(400).json({ error: "Invalid wallet address" }); }

  try {
    const client = new Client(connection);
    const rawPositions = await client.vault.getAllUserPositions(userPubkey);

    const positions = rawPositions.map(p => {
      const vaultId   = p.vault?.constantViews?.vaultId ?? null;
      const meta      = VAULT_META[vaultId] || {};
      const supplyRaw = p.supply?.toString()     ?? "0";
      const borrowRaw = p.borrow?.toString()     ?? "0";
      const dustRaw   = p.dustBorrow?.toString() ?? "0";

      let riskRatio = null;
      const supplyNum = parseFloat(supplyRaw);
      const borrowNum = parseFloat(borrowRaw);
      if (supplyNum > 0) riskRatio = borrowNum / supplyNum;

      const lt = p.vault?.configs?.liquidationThreshold ?? null;

      return {
        positionId:           p.nftId,
        vaultId,
        owner:                p.owner?.toBase58() ?? wallet,
        collateral:           meta.collateral  ?? "Unknown",
        debt:                 meta.debt        ?? "Unknown",
        colDecimals:          meta.colDecimals ?? 9,
        debtDecimals:         meta.debtDecimals ?? 6,
        supply:               supplyRaw,
        borrow:               borrowRaw,
        dustBorrow:           dustRaw,
        riskRatio,
        liquidationThreshold: lt,
        isLiquidated:         p.isLiquidated ?? false,
        tick:                 p.tick   ?? null,
        tickId:               p.tickId ?? null,
        isSupplyOnly:         p.isSupplyPosition ?? false,
      };
    });

    const borrowPositions = positions.filter(p => !p.isSupplyOnly);

    return res.status(200).json({
      positions: borrowPositions,
      total:     borrowPositions.length,
      wallet,
    });

  } catch (err) {
    console.error("[/api/lend-positions] error:", err);
    return res.status(500).json({
      error:     err?.message || "Failed to fetch positions",
      positions: [],
    });
  }
}
