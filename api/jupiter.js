// api/jupiter.js — Vercel Serverless Proxy
// Injects Jupiter API key. Strips user IP headers so requests appear from Vercel's US server.
// Also handles Meteora DLMM actions (merged to stay within Hobby plan 12-function limit).

// Extend Vercel function timeout — portfolio/positions can take 5-15s aggregating 200+ protocols.
// Hobby plan max is 60s. Pro plan allows up to 300s if needed.
export const maxDuration = 60;

const DLMM_API  = "https://dlmm.datapi.meteora.ag"; // New API (dlmm-api.meteora.ag is legacy)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Meteora DLMM block — intercept if meteora_action present ─────────────
  if (req.body?.meteora_action) {
    const { meteora_action: action, ...params } = req.body;
    const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

    try {
      // ── Read actions (pure REST, no SDK) ───────────────────────────────────

      if (action === "list_pools") {
        const { search = "", limit = 20 } = params;
        // Normalise: AI may pass "SOL/USDC" — API expects "SOL-USDC"
        const cleanSearch = (search || "").replace(/\//g, "-").trim();
        // New API: GET /pools?page=1&limit=N&order_by=fees_24h&sort=desc&search=X
        const qs = new URLSearchParams({
          page: "1",
          limit: String(Math.min(parseInt(limit), 50)),
          order_by: "fees_24h",
          sort: "desc",
          ...(cleanSearch ? { search: cleanSearch } : {}),
        }).toString();
        const r = await fetch(DLMM_API + "/pools?" + qs);
        if (!r.ok) throw new Error("DLMM API error " + r.status + " " + await r.text().then(t=>t.slice(0,80)));
        const raw = await r.text();
        let data;
        try { data = JSON.parse(raw); } catch { throw new Error("DLMM non-JSON: " + raw.slice(0,100)); }
        // Response shape: { data: [...], total, page, limit } or plain array
        let pools = [];
        if (Array.isArray(data))             pools = data;
        else if (Array.isArray(data?.data))  pools = data.data;
        else if (Array.isArray(data?.pools)) pools = data.pools;
        return res.status(200).json({ pools });
      }

      if (action === "get_pool") {
        const { poolAddress } = params;
        if (!poolAddress) return res.status(400).json({ error: "poolAddress required" });
        const r = await fetch(DLMM_API + "/pools/" + poolAddress);
        if (!r.ok) throw new Error(`DLMM API error ${r.status}`);
        return res.status(200).json({ pool: await r.json() });
      }

      if (action === "get_positions") {
        const { wallet } = params;
        if (!wallet) return res.status(400).json({ error: "wallet required" });
        // positions endpoint — try new API first, fall back to legacy
        let posData;
        const rNew = await fetch(DLMM_API + "/positions?wallet=" + wallet);
        if (rNew.ok) {
          posData = await rNew.json();
        } else {
          const rLeg = await fetch("https://dlmm-api.meteora.ag/position/wallet/" + wallet);
          if (!rLeg.ok) throw new Error("DLMM positions API error " + rLeg.status);
          posData = await rLeg.json();
        }
        const data = posData;
        const positions = Object.entries(data || {}).flatMap(([poolAddr, info]) =>
          (info?.userPositions || []).map(p => ({
            ...p,
            poolAddress: poolAddr,
            activeBin: info.activeBin,
          }))
        );
        return res.status(200).json({ positions });
      }

      // ── TX-building actions (require @meteora-ag/dlmm SDK) ────────────────

      if (action === "add_liquidity") {
        const { poolAddress, wallet, xAmountRaw, yAmountRaw, strategy = "Spot", rangeHalf = 34 } = params;
        if (!poolAddress || !wallet) return res.status(400).json({ error: "poolAddress and wallet required" });

        const DLMM = require("@meteora-ag/dlmm").default;
        const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
        const connection = new Connection(SOLANA_RPC, "confirmed");
        const dlmmPool   = await DLMM.create(connection, new PublicKey(poolAddress));
        const activeBin  = await dlmmPool.getActiveBin();

        const STRATEGY_MAP = { Spot: 0, Curve: 1, BidAsk: 2 };
        const positionKp   = Keypair.generate();

        const { transactions, signers } = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
          positionPubKey: positionKp.publicKey,
          user:           new PublicKey(wallet),
          totalXAmount:   BigInt(xAmountRaw),
          totalYAmount:   BigInt(yAmountRaw),
          strategy: {
            maxBinId:     activeBin.binId + parseInt(rangeHalf),
            minBinId:     activeBin.binId - parseInt(rangeHalf),
            strategyType: STRATEGY_MAP[strategy] ?? 0,
          },
        });

        const txArray    = Array.isArray(transactions) ? transactions : [transactions];
        const serialized = txArray.map(tx => {
          const needSign = (signers || []).filter(s => s.publicKey.equals(positionKp.publicKey));
          if (needSign.length) tx.partialSign(...needSign);
          return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
        });

        return res.status(200).json({
          transactions:    serialized,
          positionAddress: positionKp.publicKey.toBase58(),
          activeBinId:     activeBin.binId,
          activeBinPrice:  activeBin.price,
        });
      }

      if (action === "remove_liquidity") {
        const { poolAddress, wallet, positionAddress, bps = 10000, claimAndClose = false } = params;
        if (!poolAddress || !wallet || !positionAddress)
          return res.status(400).json({ error: "poolAddress, wallet, positionAddress required" });

        const DLMM = require("@meteora-ag/dlmm").default;
        const { Connection, PublicKey } = require("@solana/web3.js");
        const connection = new Connection(SOLANA_RPC, "confirmed");
        const dlmmPool   = await DLMM.create(connection, new PublicKey(poolAddress));

        const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(new PublicKey(wallet));
        const position = userPositions.find(p => p.publicKey.toBase58() === positionAddress);
        if (!position) return res.status(404).json({ error: "Position not found" });

        const binIds = position.positionData.positionBinData
          .filter(b => parseFloat(b.positionXAmount) > 0 || parseFloat(b.positionYAmount) > 0)
          .map(b => b.binId);
        if (!binIds.length) return res.status(400).json({ error: "No active bins in position" });

        const removeTx   = await dlmmPool.removeLiquidity({
          user:                    new PublicKey(wallet),
          position:                position.publicKey,
          binIds,
          liquiditiesBpsToRemove:  Array(binIds.length).fill(parseInt(bps)),
          shouldClaimAndClose:     claimAndClose === true || claimAndClose === "true",
        });

        const txArray    = Array.isArray(removeTx) ? removeTx : [removeTx];
        const serialized = txArray.map(tx =>
          Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64")
        );
        return res.status(200).json({ transactions: serialized });
      }

      if (action === "claim_fees") {
        const { poolAddress, wallet, positionAddress } = params;
        if (!poolAddress || !wallet || !positionAddress)
          return res.status(400).json({ error: "poolAddress, wallet, positionAddress required" });

        const DLMM = require("@meteora-ag/dlmm").default;
        const { Connection, PublicKey } = require("@solana/web3.js");
        const connection = new Connection(SOLANA_RPC, "confirmed");
        const dlmmPool   = await DLMM.create(connection, new PublicKey(poolAddress));

        const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(new PublicKey(wallet));
        const position = userPositions.find(p => p.publicKey.toBase58() === positionAddress);
        if (!position) return res.status(404).json({ error: "Position not found" });

        const claimTx    = await dlmmPool.claimSwapFee({ owner: new PublicKey(wallet), position });
        const serialized = Buffer.from(claimTx.serialize({ requireAllSignatures: false })).toString("base64");
        return res.status(200).json({ transaction: serialized });
      }

      return res.status(400).json({ error: `Unknown meteora_action: ${action}` });

    } catch (err) {
      console.error("[api/jupiter] Meteora error:", action, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Jupiter proxy (original — completely unchanged) ───────────────────────
  const { url, method = "GET", body, triggerJwt } = req.body;

  if (!url) return res.status(400).json({ error: "Missing url" });

  const API_KEY    = process.env.JUPITER_API_KEY || "";
  const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

  // Resolve special RPC placeholder
  const targetUrl = url === "SOLANA_RPC" ? SOLANA_RPC : url;

  // Only send clean headers — no user IP, no country hints.
  // This ensures Jupiter sees Vercel's US server IP, not the user's Nigerian IP.
  const headers = {
    "Content-Type": "application/json",
    ...(API_KEY    ? { "x-api-key": API_KEY }              : {}),
    ...(triggerJwt ? { "Authorization": `Bearer ${triggerJwt}` } : {}),
  };

  // Per-endpoint timeout — portfolio/positions needs more time than price/swap calls
  const isPortfolio = targetUrl.includes("/portfolio/v1/positions");
  const timeoutMs   = isPortfolio ? 55_000 : 20_000;
  const controller  = new AbortController();
  const timer       = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
      signal: controller.signal,
    };

    if (body && method.toUpperCase() !== "GET") {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timer);

    // Safe parse: some endpoints (e.g. Lock API) return empty body or HTML on error.
    // response.json() would throw "Unexpected end of JSON input" in those cases.
    const text = await response.text();
    let data;
    try {
      data = text.trim() ? JSON.parse(text) : {};
    } catch {
      data = { error: `Non-JSON response (${response.status}): ${text.slice(0, 200)}` };
    }
    return res.status(response.status).json(data);

  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err?.name === "AbortError";
    console.error("[api/jupiter] error:", isTimeout ? `Timeout after ${timeoutMs}ms — ${targetUrl}` : err);
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? `Jupiter API timed out after ${timeoutMs / 1000}s` : (err?.message || "Proxy error"),
    });
  }
}
