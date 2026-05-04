// /api/lend-positions.js — Vercel serverless function
// GET  ?wallet=xxx        → reads all open borrow positions
// POST action:deposit     → deposit collateral only (creates position, returns positionId)
// POST action:borrow      → borrow against existing position (colAmount=0, debtAmount>0)

import { Connection, PublicKey } from "@solana/web3.js";
import { Client } from "@jup-ag/lend-read";
import { getOperateIx } from "@jup-ag/lend/borrow";
import BN from "bn.js";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const VAULT_META = {
  1: { collateral: "SOL",     debt: "USDC", colDecimals: 9, debtDecimals: 6 },
  2: { collateral: "JitoSOL", debt: "SOL",  colDecimals: 9, debtDecimals: 9 },
  3: { collateral: "JupSOL",  debt: "SOL",  colDecimals: 9, debtDecimals: 9 },
  4: { collateral: "WBTC",    debt: "USDC", colDecimals: 8, debtDecimals: 6 },
  5: { collateral: "JLP",     debt: "USDC", colDecimals: 6, debtDecimals: 6 },
  6: { collateral: "JUP",     debt: "USDC", colDecimals: 6, debtDecimals: 6 },
  7: { collateral: "USDC",    debt: "USDT", colDecimals: 6, debtDecimals: 6 },
};

function serializeIx(ix) {
  return {
    programId: ix.programId.toBase58(),
    keys: ix.keys.map(k => ({
      pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data).toString("base64"),
  };
}

function serializeAlt(alt) {
  return {
    key: alt.key.toBase58(),
    addresses: alt.state.addresses.map(a => a.toBase58()),
  };
}

async function buildOp({ vaultId, positionId, colAmount, debtAmount, signer, connection }) {
  // positionId=0 → create new position
  // positionId=<number> → existing position NFT ID (the SDK uses numbers, not PublicKeys)
  const resolvedPositionId = (!positionId || positionId === "0" || positionId === 0)
    ? 0
    : Number(positionId); // nftId is always a number per SDK docs

  if (resolvedPositionId !== 0 && isNaN(resolvedPositionId)) {
    throw new Error(`Invalid positionId: ${positionId} — expected a number`);
  }

  const { ixs, addressLookupTableAccounts, nftId } = await getOperateIx({
    vaultId:    Number(vaultId),
    positionId: resolvedPositionId,
    colAmount:  new BN(colAmount.toString()),
    debtAmount: new BN(debtAmount.toString()),
    connection,
    signer,
    cluster:    "mainnet",
  });
  if (!ixs?.length) throw new Error("No instructions returned from getOperateIx");
  // Debug: log instruction programs to help diagnose on-chain errors
  console.log(`[buildOp] vaultId=${vaultId} positionId=${positionId} ixCount=${ixs.length} programs=${ixs.map(ix => ix.programId.toBase58().slice(0,8)).join(",")}`);
  return {
    ixs:  ixs.map(serializeIx),
    alts: (addressLookupTableAccounts || []).map(serializeAlt),
    nftId: nftId ?? null,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const connection = new Connection(RPC_URL, { commitment: "confirmed" });

  if (req.method === "POST") {
    const { action, vaultId, positionId, signer: signerStr, colAmount, debtAmount } = req.body || {};

    if (!signerStr || !vaultId) {
      return res.status(400).json({ error: "Missing required fields: signer, vaultId" });
    }
    let signer;
    try { signer = new PublicKey(signerStr); }
    catch { return res.status(400).json({ error: "Invalid signer public key" }); }

    try {
      if (action === "deposit") {
        // Deposit only (colAmount>0, debtAmount=0), positionId=0 creates new position
        const result = await buildOp({ vaultId, positionId: 0, colAmount, debtAmount: "0", signer, connection });
        return res.status(200).json(result);
      }

      if (action === "deposit_and_borrow") {
        // New position: deposit + borrow in one tx (positionId=0, both amounts > 0)
        const result = await buildOp({ vaultId, positionId: 0, colAmount, debtAmount, signer, connection });
        return res.status(200).json(result);
      }

      if (action === "borrow") {
        // Borrow against existing position (colAmount=0, debtAmount>0, positionId = nftId number)
        if (!positionId) return res.status(400).json({ error: "positionId required for borrow action" });
        const result = await buildOp({ vaultId, positionId, colAmount: "0", debtAmount, signer, connection });
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

    } catch (err) {
      console.error(`[/api/lend-positions] ${action} error (vaultId=${vaultId}, positionId=${positionId}):`, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET — fetch open borrow positions ────────────────────────────────────
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

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
      let riskRatio   = null;
      const supplyNum = parseFloat(supplyRaw);
      const borrowNum = parseFloat(borrowRaw);
      if (supplyNum > 0) riskRatio = borrowNum / supplyNum;
      return {
        positionId: p.nftId, vaultId,
        owner: p.owner?.toBase58() ?? wallet,
        collateral: meta.collateral ?? "Unknown", debt: meta.debt ?? "Unknown",
        colDecimals: meta.colDecimals ?? 9, debtDecimals: meta.debtDecimals ?? 6,
        supply: supplyRaw, borrow: borrowRaw, dustBorrow: dustRaw,
        riskRatio, liquidationThreshold: p.vault?.configs?.liquidationThreshold ?? null,
        isLiquidated: p.isLiquidated ?? false,
        tick: p.tick ?? null, tickId: p.tickId ?? null,
        isSupplyOnly: p.isSupplyPosition ?? false,
      };
    });

    const borrowPositions = positions.filter(p => !p.isSupplyOnly);
    const all = req.query.all === "1";
    return res.status(200).json({ positions: all ? positions : borrowPositions, total: borrowPositions.length, wallet });

  } catch (err) {
    console.error("[/api/lend-positions] GET error:", err);
    return res.status(500).json({ error: err?.message || "Failed to fetch positions", positions: [] });
  }
}
