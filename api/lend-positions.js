// /api/lend-positions.js — Vercel serverless function
// Reads all open borrow positions for a wallet using @jup-ag/lend-read SDK.
// Install: npm install @jup-ag/lend-read @solana/web3.js

import { Connection, PublicKey } from "@solana/web3.js";
import { Client } from "@jup-ag/lend-read";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Vault metadata map (vaultId → collateral/debt symbols & decimals)
// Matches MULTIPLY_VAULTS in the frontend
const VAULT_META = {
  1: { collateral: "SOL",    debt: "USDC", colDecimals: 9, debtDecimals: 6 },
  2: { collateral: "JitoSOL",debt: "SOL",  colDecimals: 9, debtDecimals: 9 },
  3: { collateral: "JupSOL", debt: "SOL",  colDecimals: 9, debtDecimals: 9 },
  4: { collateral: "WBTC",   debt: "USDC", colDecimals: 8, debtDecimals: 6 },
  5: { collateral: "JLP",    debt: "USDC", colDecimals: 6, debtDecimals: 6 },
  6: { collateral: "JUP",    debt: "USDC", colDecimals: 6, debtDecimals: 6 },
  7: { collateral: "USDC",   debt: "USDT", colDecimals: 6, debtDecimals: 6 },
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { wallet } = req.query;
  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet query param" });
  }

  let userPubkey;
  try {
    userPubkey = new PublicKey(wallet);
  } catch {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  try {
    const connection = new Connection(RPC_URL, { commitment: "confirmed" });

    // @jup-ag/lend-read Client — reads all vault positions from on-chain accounts
    const client = new Client(connection);

    // getAllUserPositions returns NftPosition & { vault: VaultEntireData }[]
    // — every borrow/multiply position owned by this wallet across all vaults
    const rawPositions = await client.vault.getAllUserPositions(userPubkey);

    const positions = rawPositions.map(p => {
      const vaultId = p.vault?.constantViews?.vaultId ?? null;
      const meta    = VAULT_META[vaultId] || {};

      // supply/borrow are BN — convert to string for JSON serialisation
      const supplyRaw = p.supply?.toString()  ?? "0";
      const borrowRaw = p.borrow?.toString()  ?? "0";
      const dustRaw   = p.dustBorrow?.toString() ?? "0";

      // Compute risk ratio: borrow / supply (0–1, or null if no supply)
      let riskRatio = null;
      const supplyNum = parseFloat(supplyRaw);
      const borrowNum = parseFloat(borrowRaw);
      if (supplyNum > 0) riskRatio = borrowNum / supplyNum;

      // liquidationThreshold from vault config (0–1 float)
      const lt = p.vault?.configs?.liquidationThreshold ?? null;

      return {
        positionId:            p.nftId,
        vaultId,
        owner:                 p.owner?.toBase58() ?? wallet,
        collateral:            meta.collateral  ?? "Unknown",
        debt:                  meta.debt        ?? "Unknown",
        colDecimals:           meta.colDecimals ?? 9,
        debtDecimals:          meta.debtDecimals ?? 6,
        supply:                supplyRaw,   // raw base units
        borrow:                borrowRaw,   // raw base units
        dustBorrow:            dustRaw,
        riskRatio,             // 0–1 float, null if no supply
        liquidationThreshold:  lt,
        isLiquidated:          p.isLiquidated ?? false,
        tick:                  p.tick   ?? null,
        tickId:                p.tickId ?? null,
        isSupplyOnly:          p.isSupplyPosition ?? false,
      };
    });

    // Filter out supply-only positions (those have no debt — not borrow positions)
    const borrowPositions = positions.filter(p => !p.isSupplyOnly);

    return res.status(200).json({
      positions:  borrowPositions,
      total:      borrowPositions.length,
      wallet,
    });

  } catch (err) {
    console.error("[/api/lend-positions] error:", err);
    return res.status(500).json({
      error:    err?.message || "Failed to fetch positions",
      positions: [],
    });
  }
}
