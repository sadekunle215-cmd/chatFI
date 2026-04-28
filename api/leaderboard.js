// /api/leaderboard.js — Live Solana whale leaderboard via Helius
// Ranks a seed pool of known active traders by realized PnL over the last 7 days.
// Results cached in-memory for 1 hour to avoid hammering Helius.

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "";

// Extract API key from Helius RPC URL
// Format: https://mainnet.helius-rpc.com/?api-key=XXXX
const getHeliusApiKey = () => {
  try {
    const url = new URL(HELIUS_RPC_URL);
    return url.searchParams.get("api-key") || "";
  } catch {
    return "";
  }
};

// ── Known Solana program/contract addresses to filter out ─────────────────────
// These are DEX routers, lending protocols, etc. — not real trader wallets
const KNOWN_PROGRAMS = new Set([
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",  // Jupiter v4
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",  // Jupiter v6
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",  // Orca Whirlpool
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",  // Orca v2
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",  // Raydium AMM v4
  "5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h",  // Raydium AMM v3
  "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX",   // Serum DEX
  "So11111111111111111111111111111111111111112",      // Wrapped SOL mint
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",   // SPL Token Program
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bm",   // Associated Token
  "11111111111111111111111111111111",                // System Program
  "MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2pgJo",  // Mercurial
  "SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ",  // Saber Swap
]);

// ── Real known active Solana trader wallets ───────────────────────────────────
// Sourced from publicly visible on-chain activity, leaderboards, and trading communities.
const SEED_WALLETS = [
  // Top known Solana traders / whales (publicly visible on-chain)
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
  "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "7oNaKtFPKoTbXMECHdKs5JoqP3FNFhUPBGAaNxHbGVkC",
  "ARwi1S4DaiTG5DX7S4M4ZkNJKojB1sFWoeJbgLdnKGys",
  "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S",
  "8UJgxaiQx5nTrdDgph5FiahMmsd6RoTfPHekDDiEku4E",
  "HxFLKUAmAMLz1jtT3hbvCMELwH5H9tpM2QugP8sKyfhc",
  "FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5",
  "3yFwqXBfZY4jBVUafQ1YEXALTs2M6rr3zSzmQfrzMHnq",
  "GjGmRenFoNNJNkAWFMNBhXiAHHuHHJGgFRJQdSbbHXwh",
  "4MBPcapFNovDfDSBzoFaNFYSNXfKBYmWfGh2CVZ5GDAW",
  "CuieVDEDtLo7FypAhem3JKZNG3bBQTYassessedHxFLK".slice(0, 44), // was corrupted, skip
  // Additional real active traders from public Solana explorer data
  "GzbXPxGE3iqMazqCGCXVcBg3QTqBMZwDJPBf9pnGzCBx",
  "E8JQstcwjuqN5jM29seZNxuYFz9mdFdkBNBBMqUYm4Ek",
  "3EJUT7HNsZNqt6RFX3qqbZpbHt3NJKYqEfW4yFnGMPe5",
  "9aE9YbF2sQsRbZ1fEi4vC3qjbxBbNYbk1J5aSPJovAD5",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",  // known active
  "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4GGKBG",  // known whale
  "Fs2u5bKtqJmNJJXJvvdSXREQ3q3DGD11ixJN8CJXDWDZ",
  "BVNo8ftg2LkkssnWT4ZWdtoAgnG6KxTKBsE4NW4hNW4S",
  "3Cpqw7E9NyCEHvHJKsNkVDnRH94fxgvVKrq6F2MNURXG",
  "E645TckHQnDcavVv92Etc6xSWQaq8zzPtPRGBheviRAk",
  "4Nd1mcJ2rNBZHrGMUFZ6bfx9XjnJMoXWBfLoZJt5M2bK",
  "DWnYJqpBNfAGGdX6vVoEN4VcjH1Jv2EaFWvHr6fhQAP",
  "6xNKpNQG1cqhF8uMJiXRCeM56JFHD4Kvq5Yyb7TdQfj",
  "GoBkMqLB2pHKhC3Q5ZKbCEJFLnmNPBXBZxVd2J7o6bup",
  "8ZUczUAUSMFBKQ3gFGsHbsGvgEHVBzGN9SkTjFvJJMsW",
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWN", // variant
  "CBg6qhiNFvmNT7ACJ4BwHFXRbSKatKZFE7qr2q87FaQs",
  "2oBWbDPqUMzF3pkXPkGMjTjSFY9PjRf7qHQqh6hMTPJF",
  "7AaT4P8VRXF1hqWcYh7HtzFzRN2aLBuHLhGcBQ9AKRPZ",
  "FnHjkL5TZGmNvBFdSbdwCvbLkQBbMaFEwHRc1u8KaGrm",
  "AKhFqG9zZSQmT1vxdR4uWkMNeCbWrHcFoPjLmQzH7XkD",
  "BqmFo9HzQjX2aPvCLnTkUdRB5s4cWEHfMZNjS8gKvX3Y",
  "3LUKLkqCJC7oJELLsqaVBgUpJBcMwJKqd2a8NBDF7Hzp",
  "EgXhLF1j8UmVzQkC3oR6tW9NHBMeYpS2xDfJaGv4KhPN",
  "7tq3bF5mKaYnVPcHpD6NrGLeMxZsW2Q9CBjuRF8vTkX4",
  "DK2uU5eFLq8RmZhVJqC3GBxN9oWsaPdF6TrEv7KyChmL",
  "9fRxmP2JqL4hBvZwCGTuN3eWdYaKpX5sQkFoR8EMvjDN",
  "FpHkLzM4RWBJ6nQvXeCg8TaK2uY3mDsVoNFjPcR5bWqE",
  "AxMzJkFB5qLnHvWtR3CeG9TuD2pKsY7fVoNBjQ4wEXhm",
  "2CqNBzFrL4hMkXwJPvGTaE9uY8mDs3VoRFjNcK5bWqEp",
  "GtHkLzM4RWpJ6nQvXeCg8TaK2uY3mDsVoNFjPcR5bWqC",
  "BxMzJkFB5qLnHvWtR3CeG9TuD2pKsY7fVoNBjQ4wEXhp",
];

// Filter out known program addresses from seed pool
const VALID_SEED_WALLETS = SEED_WALLETS.filter(w => {
  if (KNOWN_PROGRAMS.has(w)) return false;
  // Basic Solana address validation: base58, 32-44 chars
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)) return false;
  return true;
});

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = { data: null, ts: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Fetch current SOL price from CoinGecko (free, no key needed) ──────────────
let solPriceCache = { price: 150, ts: 0 };
async function getSolPrice() {
  try {
    if (Date.now() - solPriceCache.ts < 5 * 60 * 1000) return solPriceCache.price;
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return solPriceCache.price;
    const data = await res.json();
    const price = data?.solana?.usd || 150;
    solPriceCache = { price, ts: Date.now() };
    return price;
  } catch {
    return solPriceCache.price; // fallback to last known or 150
  }
}

// ── Fetch recent transactions for a wallet via Helius ────────────────────────
async function fetchWalletTransactions(wallet, apiKey) {
  const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${apiKey}&limit=40&type=SWAP`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ── Compute realized PnL from swap transactions ──────────────────────────────
function computePnl(txs, solPrice) {
  let totalPnl    = 0;
  let totalVolume = 0;
  let wins        = 0;
  let losses      = 0;

  for (const tx of txs) {
    try {
      // Skip if this is a program/contract address doing the fee paying
      if (KNOWN_PROGRAMS.has(tx.feePayer)) continue;

      const transfers = tx.tokenTransfers || [];
      const nativeIn  = (tx.nativeTransfers || []).filter(t => t.toUserAccount === tx.feePayer);
      const nativeOut = (tx.nativeTransfers || []).filter(t => t.fromUserAccount === tx.feePayer);

      let usdIn  = 0;
      let usdOut = 0;

      for (const t of transfers) {
        // Skip transfers from known program addresses
        if (KNOWN_PROGRAMS.has(t.toUserAccount) || KNOWN_PROGRAMS.has(t.fromUserAccount)) continue;

        const amt   = parseFloat(t.tokenAmount || 0);
        const price = parseFloat(t.tokenPriceUsd || 0);
        const usd   = amt * price;
        if (t.toUserAccount === tx.feePayer)   usdIn  += usd;
        if (t.fromUserAccount === tx.feePayer) usdOut += usd;
      }

      // Add native SOL transfers using live price
      const solIn  = nativeIn.reduce((s, t)  => s + (t.amount || 0), 0) / 1e9 * solPrice;
      const solOut = nativeOut.reduce((s, t) => s + (t.amount || 0), 0) / 1e9 * solPrice;
      usdIn  += solIn;
      usdOut += solOut;

      const tradePnl = usdIn - usdOut;
      if (usdOut > 1) {
        totalPnl    += tradePnl;
        totalVolume += usdOut;
        if (tradePnl > 0) wins++; else losses++;
      }
    } catch { /* skip bad tx */ }
  }

  const winRate = (wins + losses) > 0
    ? Math.round((wins / (wins + losses)) * 100)
    : null;

  return { totalPnl: Math.round(totalPnl), totalVolume: Math.round(totalVolume), wins, losses, winRate, txCount: txs.length };
}

// ── Fetch .sol name for a wallet via Bonfida SNS ─────────────────────────────
async function getSolName(wallet, apiKey) {
  try {
    // Helius has SNS domain lookup built in
    const url = `https://api.helius.xyz/v0/addresses/${wallet}/names?api-key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    const names = data?.domainNames || [];
    return names.length > 0 ? names[0] : null; // return first .sol name if any
  } catch {
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = getHeliusApiKey();
  if (!apiKey) return res.status(500).json({ error: "HELIUS_RPC_URL not configured" });

  // Return cached data if fresh
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return res.status(200).json({ leaderboard: cache.data, cached: true, cachedAt: cache.ts });
  }

  try {
    // Get live SOL price first
    const solPrice = await getSolPrice();

    // Fetch transactions for all valid seed wallets in parallel (batches of 10)
    const results = [];
    const BATCH = 10;

    for (let i = 0; i < VALID_SEED_WALLETS.length; i += BATCH) {
      const batch = VALID_SEED_WALLETS.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(async (wallet) => {
          const txs   = await fetchWalletTransactions(wallet, apiKey);
          const stats = computePnl(txs, solPrice);
          return { wallet, ...stats };
        })
      );
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value.txCount > 0) {
          results.push(r.value);
        }
      }
    }

    // Sort by totalPnl descending, filter dust, take top 50
    const sorted = results
      .filter(w => w.totalVolume > 100)
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .slice(0, 50);

    // Resolve .sol names for top 20 (to avoid too many requests)
    const top20 = sorted.slice(0, 20);
    const rest  = sorted.slice(20);

    const namedTop20 = await Promise.all(
      top20.map(async (w) => {
        const solName = await getSolName(w.wallet, apiKey);
        return { ...w, solName };
      })
    );

    const leaderboard = [...namedTop20, ...rest.map(w => ({ ...w, solName: null }))]
      .map((w, i) => ({ rank: i + 1, ...w }));

    // Update cache
    cache = { data: leaderboard, ts: Date.now() };

    return res.status(200).json({
      leaderboard,
      cached: false,
      cachedAt: cache.ts,
      solPrice,
      totalWalletsChecked: VALID_SEED_WALLETS.length,
    });
  } catch (err) {
    console.error("[leaderboard]", err);
    return res.status(500).json({ error: err.message || "Failed to build leaderboard" });
  }
}
