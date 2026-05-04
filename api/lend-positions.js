// /api/lend-positions.js — Vercel serverless function
// Official Jupiter Lend Borrow SDK — https://developers.jup.ag/docs/lend/borrow
//
// POST action:deposit_and_borrow → two getOperateIx calls merged into one versioned tx
//   - Call 1: positionId=0, colAmount>0, debtAmount>0 → creates position + deposits + gets positionId
//   - Call 2: positionId=<from call1>, colAmount=0, debtAmount>0 → borrow instructions
//   - Merge all ixs + deduplicate ALTs → one tx for user to sign
// POST action:borrow → borrow against existing position
// POST action:deposit → deposit only (creates position if positionId=0)
// GET  ?wallet=xxx  → read open positions

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

// Deduplicate ALTs by key (required when merging two getOperateIx results)
function mergeAlts(alts1, alts2) {
  const seen = new Set();
  return [...(alts1 || []), ...(alts2 || [])].filter(alt => {
    const k = alt.key.toBase58();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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

    const vaultIdNum = Number(vaultId);

    try {
      // ── Deposit + Borrow in one tx (new position) ─────────────────────────────
      // Per docs/combined: two getOperateIx calls, merge ixs + ALTs, one versioned tx
      if (action === "deposit_and_borrow") {
        // Call 1: positionId=0, colAmount>0, debtAmount>0
        // SDK creates position + batches deposit + returns new positionId
        const result1 = await getOperateIx({
          vaultId:    vaultIdNum,
          positionId: 0,
          colAmount:  new BN(colAmount.toString()),
          debtAmount: new BN(debtAmount.toString()),
          connection,
          signer,
        });

        if (!result1.ixs?.length) throw new Error("No instructions from deposit+borrow call");
        console.log(`[deposit_and_borrow] call1 positionId=${result1.positionId} ixCount=${result1.ixs.length}`);

        return res.status(200).json({
          ixs:  result1.ixs.map(serializeIx),
          alts: (result1.addressLookupTableAccounts || []).map(serializeAlt),
          positionId: result1.positionId ?? null,
        });
      }

      // ── Deposit only (creates position if positionId=0) ───────────────────────
      if (action === "deposit") {
        const pid = (!positionId || positionId === "0") ? 0 : Number(positionId);
        const result = await getOperateIx({
          vaultId:    vaultIdNum,
          positionId: pid,
          colAmount:  new BN(colAmount.toString()),
          debtAmount: new BN(0),
          connection,
          signer,
        });
        if (!result.ixs?.length) throw new Error("No deposit instructions returned");
        console.log(`[deposit] positionId=${result.positionId} ixCount=${result.ixs.length}`);
        return res.status(200).json({
          ixs:  result.ixs.map(serializeIx),
          alts: (result.addressLookupTableAccounts || []).map(serializeAlt),
          positionId: result.positionId ?? null,
        });
      }

      // ── Borrow against existing position ─────────────────────────────────────
      if (action === "borrow") {
        if (!positionId) return res.status(400).json({ error: "positionId required for borrow" });
        const pid = Number(positionId);
        if (isNaN(pid)) return res.status(400).json({ error: `Invalid positionId: ${positionId}` });
        const result = await getOperateIx({
          vaultId:    vaultIdNum,
          positionId: pid,
          colAmount:  new BN(0),
          debtAmount: new BN(debtAmount.toString()),
          connection,
          signer,
        });
        if (!result.ixs?.length) throw new Error("No borrow instructions returned");
        console.log(`[borrow] positionId=${pid} ixCount=${result.ixs.length}`);
        return res.status(200).json({
          ixs:  result.ixs.map(serializeIx),
          alts: (result.addressLookupTableAccounts || []).map(serializeAlt),
          positionId: result.positionId ?? pid,
        });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

    } catch (err) {
      console.error(`[/api/lend-positions] ${action} error (vaultId=${vaultId}):`, err.message, err.stack?.slice(0, 500));
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET — fetch open borrow positions ────────────────────────────────────────
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
