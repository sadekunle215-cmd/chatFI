import { Connection, PublicKey } from "@solana/web3.js";

const DLMM_API = "https://dlmm-api.meteora.ag";
const RPC = process.env.SOLANA_RPC || process.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const params = req.method === "GET" ? req.query : req.body;
  const { action } = params;

  try {
    // ── Read actions (no SDK, pure REST) ──────────────────────────────────────

    if (action === "list_pools") {
      const { search = "", limit = 20 } = params;
      const qs = search
        ? `search_term=${encodeURIComponent(search)}&sort_key=fees_24h&order_by=desc`
        : `sort_key=fees_24h&order_by=desc&limit=${limit}`;
      const r = await fetch(`${DLMM_API}/pair/all?${qs}`);
      if (!r.ok) throw new Error(`DLMM API error ${r.status}`);
      const data = await r.json();
      // Normalise: API returns either array or { data: [] }
      const pools = Array.isArray(data) ? data : (data?.data || data?.pairs || []);
      return res.status(200).json({ pools });
    }

    if (action === "get_pool") {
      const { poolAddress } = params;
      if (!poolAddress) return res.status(400).json({ error: "poolAddress required" });
      const r = await fetch(`${DLMM_API}/pair/${poolAddress}`);
      if (!r.ok) throw new Error(`DLMM API error ${r.status}`);
      const pool = await r.json();
      return res.status(200).json({ pool });
    }

    if (action === "get_positions") {
      const { wallet } = params;
      if (!wallet) return res.status(400).json({ error: "wallet required" });
      const r = await fetch(`${DLMM_API}/position/wallet/${wallet}`);
      if (!r.ok) throw new Error(`DLMM API error ${r.status}`);
      const data = await r.json();
      // data is an object keyed by pool address: { [poolAddr]: { activeBin, userPositions } }
      // Flatten to array
      const positions = Object.entries(data || {}).flatMap(([poolAddr, info]) =>
        (info?.userPositions || []).map(p => ({
          ...p,
          poolAddress: poolAddr,
          activeBin: info.activeBin,
        }))
      );
      return res.status(200).json({ positions });
    }

    // ── TX-building actions (require @meteora-ag/dlmm SDK) ───────────────────

    if (action === "add_liquidity") {
      const { poolAddress, wallet, xAmountRaw, yAmountRaw, strategy = "Spot", rangeHalf = 34 } = params;
      if (!poolAddress || !wallet) return res.status(400).json({ error: "poolAddress and wallet required" });

      const DLMM = (await import("@meteora-ag/dlmm")).default;
      const connection = new Connection(RPC, "confirmed");
      const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));
      const activeBin = await dlmmPool.getActiveBin();

      const STRATEGY_MAP = { Spot: 0, Curve: 1, BidAsk: 2 };
      const strategyType = STRATEGY_MAP[strategy] ?? 0;

      // Client must generate a fresh position keypair and pass positionPubKey + its base58 secret
      // For now we generate one server-side and return pubkey — client uses returned signers
      const { Keypair } = await import("@solana/web3.js");
      const positionKp = Keypair.generate();

      const { transactions, signers } = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: positionKp.publicKey,
        user: new PublicKey(wallet),
        totalXAmount: BigInt(xAmountRaw),
        totalYAmount: BigInt(yAmountRaw),
        strategy: {
          maxBinId: activeBin.binId + parseInt(rangeHalf),
          minBinId: activeBin.binId - parseInt(rangeHalf),
          strategyType,
        },
      });

      const txArray = Array.isArray(transactions) ? transactions : [transactions];
      const serialized = txArray.map(tx => {
        // Pre-sign with position keypair if it's a required signer
        const txSigners = (signers || []).filter(s => s.publicKey.equals(positionKp.publicKey));
        if (txSigners.length) tx.partialSign(...txSigners);
        return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
      });

      return res.status(200).json({
        transactions: serialized,
        positionAddress: positionKp.publicKey.toBase58(),
        activeBinId: activeBin.binId,
        activeBinPrice: activeBin.price,
      });
    }

    if (action === "remove_liquidity") {
      const { poolAddress, wallet, positionAddress, bps = 10000, claimAndClose = false } = params;
      if (!poolAddress || !wallet || !positionAddress) {
        return res.status(400).json({ error: "poolAddress, wallet, positionAddress required" });
      }

      const DLMM = (await import("@meteora-ag/dlmm")).default;
      const connection = new Connection(RPC, "confirmed");
      const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));

      const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(new PublicKey(wallet));
      const position = userPositions.find(p => p.publicKey.toBase58() === positionAddress);
      if (!position) return res.status(404).json({ error: "Position not found" });

      const binIds = position.positionData.positionBinData
        .filter(b => parseFloat(b.positionXAmount) > 0 || parseFloat(b.positionYAmount) > 0)
        .map(b => b.binId);

      if (!binIds.length) return res.status(400).json({ error: "No active bins in position" });

      const bpsArray = Array(binIds.length).fill(parseInt(bps));

      const removeTx = await dlmmPool.removeLiquidity({
        user: new PublicKey(wallet),
        position: position.publicKey,
        binIds,
        liquiditiesBpsToRemove: bpsArray,
        shouldClaimAndClose: claimAndClose === true || claimAndClose === "true",
      });

      const txArray = Array.isArray(removeTx) ? removeTx : [removeTx];
      const serialized = txArray.map(tx =>
        Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64")
      );

      return res.status(200).json({ transactions: serialized });
    }

    if (action === "claim_fees") {
      const { poolAddress, wallet, positionAddress } = params;
      if (!poolAddress || !wallet || !positionAddress) {
        return res.status(400).json({ error: "poolAddress, wallet, positionAddress required" });
      }

      const DLMM = (await import("@meteora-ag/dlmm")).default;
      const connection = new Connection(RPC, "confirmed");
      const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));

      const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(new PublicKey(wallet));
      const position = userPositions.find(p => p.publicKey.toBase58() === positionAddress);
      if (!position) return res.status(404).json({ error: "Position not found" });

      const claimTx = await dlmmPool.claimSwapFee({
        owner: new PublicKey(wallet),
        position,
      });

      const serialized = Buffer.from(claimTx.serialize({ requireAllSignatures: false })).toString("base64");
      return res.status(200).json({ transaction: serialized });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error("[Meteora API]", action, err.message);
    return res.status(500).json({ error: err.message });
  }
}
