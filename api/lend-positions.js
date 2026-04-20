// api/lend-positions.js — Vercel Serverless Route
// Reads user's open Jupiter Lend borrow positions via @jup-ag/lend-read
// GET /api/lend-positions?wallet=<pubkey>

import { Connection, PublicKey } from "@solana/web3.js";
import { Client } from "@jup-ag/lend-read";

const RPC_URL = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: "Missing wallet query param" });

  let userPubkey;
  try { userPubkey = new PublicKey(wallet); }
  catch { return res.status(400).json({ error: `Invalid wallet: ${wallet}` }); }

  try {
    const connection = new Connection(RPC_URL, { commitment: "confirmed" });
    const client = new Client(connection);

    const positions = await client.vault.getAllUserPositions(userPubkey);

    const result = positions.map(p => ({
      vaultId:     p.vault.constantViews.vaultId,
      positionId:  p.nftId,
      colToken:    p.vault.constantViews.supplyToken.toBase58(),
      debtToken:   p.vault.constantViews.borrowToken.toBase58(),
      // Supply/borrow with exchange price applied
      supply:      p.supply.toString(),
      borrow:      p.borrow.toString(),
      isLiquidated: p.isLiquidated,
      // Risk ratio: borrow/supply (0–1, closer to liquidation threshold = danger)
      riskRatio: p.supply.gtn(0)
        ? (p.borrow.muln(1000).div(p.supply).toNumber() / 1000)
        : 0,
      // Vault info
      collateralFactor:       p.vault.configs?.collateralFactor,
      liquidationThreshold:   p.vault.configs?.liquidationThreshold,
    }));

    return res.status(200).json({ positions: result });

  } catch (err) {
    console.error("[lend-positions] error:", err?.message);
    return res.status(500).json({ error: err?.message || "Failed to fetch positions" });
  }
}
