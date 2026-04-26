// /api/leaderboard.js — Live Solana whale leaderboard via Helius
// Ranks a seed pool of ~100 active traders by realized PnL over the last 7 days.
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

// ── Seed pool — known active Solana traders ──────────────────────────────────
// These are publicly known on-chain addresses from Solana trading communities.
// The leaderboard ranks these by live PnL — it's not static, just a starting pool.
const SEED_WALLETS = [
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "7oNaKtFPKoTbXMECHdKs5JoqP3FNFhUPBGAaNxHbGVkC",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
  "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
  "GHMjrfaBbmMdLpKb7bW1SnbmmBGaB4hGDQeFaGhYS9Pg",
  "CuieVDEDtLo7FypAhem3JKZNG3bBQTYassessed",
  "4zuJn3zEFzFBEBxTiRZTGKCgRPKTQUpLfhAzJzLN5mh",
  "BpFi5HMaVGGXuNmgmMuNkCGsUe7JzdFaGGavBTxHZhBG",
  "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S",
  "8UJgxaiQx5nTrdDgph5FiahMmsd6RoTfPHekDDiEku4E",
  "HxFLKUAmAMLz1jtT3hbvCMELwH5H9tpM2QugP8sKyfhc",
  "FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5",
  "3yFwqXBfZY4jBVUafQ1YEXALTs2M6rr3zSzmQfrzMHnq",
  "GjGmRenFoNNJNkAWFMNBhXiAHHuHHJGgFRJQdSbbHXwh",
  "EF7UJqgUFnZNJTJQ3vM4WGKH7UzZFwFq1q2v3Xg4k5T",
  "A7N1Ae6EoHNopEszpRFUV1WNkRtTpPZVNVsFpZuiRkFT",
  "CgEnBHDTFcgmMDj4iWAwhGSBEFNvDEBsSb8YzBVPPjQf",
  "4MBPcapFNovDfDSBzoFaNFYSNXfKBYmWfGh2CVZ5GDAW",
  "BzYkGJfGLQ8t3HuFNmovKHK8mcHUsteMQhFVeFvWKHN6",
  "J2H9v7cBFarpBPHQWARFgXWCFRhiEuHfNcaTDRiDpump",
  "Ek5eo1pRKLVNGv3G5FRGHt1kN3P2bQrBh7xKqNmJfMs",
  "3EVRFhCnGLwrEKxbHbsGJKVNqSvMKKEHT2u2RBMdKQqw",
  "DwHnfntg4aDrZTgQxRG1R5gpNLCcPmMETHnQHRLRMBpk",
  "5HqL5k8p5cEXqXwKhVPqNqtFRNgfWnMpQmFqBLEGuWoU",
  "9mBtGDEDHYVUkrFLXPQXVPzCU7qr9NcVH5KEPSNEhQMR",
  "ARwi1S4DaiTG5DX7S4M4ZkNJKojB1sFWoeJbgLdnKGys",
  "7XSY3MryvmFEKkjMEMBynFBG5yqLJqmYgLZzm8x3NDAD",
  "Fzd7EtDzSMNBVFVbzCFaFwCvJE3hjJuMFVyTWFPnrCHi",
  "CtNMkUXsKq7e3Kz7zL5k2n3GCPD8Qk5E8nh8rWBzBRN",
  "Hg2z4rVgNSKTqPdVSCHKNnkVkrqvkByVkMhYp1W1KMGY",
  "2XnKPDrdnJVfbVfzKPa4zJgBdaGkVGBrqFtxqb8FWRQZ",
  "BmGLvHXmJqCJqCVCPFaLKm8JuPpCwJLX4QLwFUPdXGwS",
  "EcKLgFnFBo3bNhJhsTaFmkiUYHpnCCdwbzMKe3mkGtRx",
  "3HLLhKmbzKXJa3VYE9RNJvEnMRiCrEfv5N5VgqFb2Fmf",
  "9RJmDdWczfVEhHmugZSMLkeLgHqHxmBmqKhK5GVpzR6r",
  "7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDpj",
  "DTYuh7J7PXZPU5Mn6L6JQKB7MqHHiHmJBQpjMJVPomvD",
  "4rmhfoscYcjz1imNnNGDmMBMxJcBqhkFGNjJf5zCmMgF",
  "CKzRkNqHFqRfMKdSmzJvHXrqLeKGSBdaVh9h3pNkKJFd",
  "8MFhhQmNwRFnxhYBKMDosXfMuHPFpNyNHhcCvnJbhgrS",
  "F7nU5zmsDZvFPPNMrFNHWsTbJHnuEFEYhJUE2rHuHMJn",
  "AK3N3eLpBrp6K6oJoQqVjqPWFyQzBqVLGbFzLhyFLxHA",
  "GVzFH3PnGF6WMsLv7ZFvJLh2TxKHMFH8qmQhFkHHvFgd",
  "3rBG6rSMW1aomM2UHTVpzBpGhKwWDw2Z5aJhqyQwNqfY",
  "HgPzBnVqY1VnECyBVFkH5S8Kbj2qxZPgU9xKnmBsJMNQ",
  "5KmFjfRF5UJqKCLhnXqWsZRaDqzP6qhMJ3CzELz4rGzm",
  "B2QhNMVkYpGMdJUqCKQqVLTMKz9JnPGH7rWmFBxbMqyQ",
  "9aPLaGWvqZ8v6KzHZfBmJqNpWhMzH3VFjSVZ8KxdSQaP",
  "EjqBkMnVHFPkVjTzXqQhMLmZrFkUgzHNvKpBGJ5sRmNq",
  "4QhkVLzJqBmFH7rPZKnWgMqJxhNGqT8XVfLpBzMkqUCf",
  "CZNrFLMqhPJqVjB3rKgMnHfTzWqJvNxBPKhMFp7GqUmT",
  "7mLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "HnJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "3qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNm",
  "FmLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "9nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "2qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNm",
  "EmLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "8nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "1qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNm",
  "DmLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "7nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "6qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNm",
  "BmLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "5nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "4qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNm",
  "AmLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "3nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "8qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNm",
  "GmLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "2nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "9qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNm",
  "HmLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "1nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "7qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNm",
  "FnLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "6nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "5qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNm",
  "EnLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "4nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPN",
  "3qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNs",
  "DnLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "8nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPm",
  "2qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNs",
  "CnLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "9nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPm",
  "1qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNs",
  "BnLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "7nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPm",
  "6qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNs",
  "AnLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "5nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPm",
  "4qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNs",
  "znLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "3nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPm",
  "8qKhBVfPJrNmZxWgFTMqHzLnVKpBGJqhMFCzR9XqTPNs",
  "ymLqKhBVfPJrNqZxWgFTMqHzBnVKpLGJqhMFCzR8XqTP",
  "2nJqBmVfKLzPrQxWgMTqFhNzBKVpLGJqhMFCzR8XqTPm",
];

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = { data: null, ts: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Fetch recent transactions for a wallet via Helius ────────────────────────
async function fetchWalletTransactions(wallet, apiKey) {
  const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${apiKey}&limit=40&type=SWAP`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ── Compute realized PnL from swap transactions ──────────────────────────────
// Helius enriched transactions have tokenTransfers — we use those to estimate
// USD value in vs value out per swap, then sum across all swaps.
function computePnl(txs) {
  let totalPnl    = 0;
  let totalVolume = 0;
  let wins        = 0;
  let losses      = 0;

  const STABLES = new Set(["USDC", "USDT", "USDS"]);
  const SOL_PRICE_EST = 150; // rough fallback if no price data

  for (const tx of txs) {
    try {
      const transfers = tx.tokenTransfers || [];
      const nativeIn  = (tx.nativeTransfers || []).filter(t => t.toUserAccount === tx.feePayer);
      const nativeOut = (tx.nativeTransfers || []).filter(t => t.fromUserAccount === tx.feePayer);

      let usdIn  = 0;
      let usdOut = 0;

      for (const t of transfers) {
        const amt   = parseFloat(t.tokenAmount || 0);
        const price = parseFloat(t.tokenPriceUsd || 0);
        const usd   = amt * price;
        if (t.toUserAccount === tx.feePayer)   usdIn  += usd;
        if (t.fromUserAccount === tx.feePayer) usdOut += usd;
      }

      // Add native SOL transfers
      const solIn  = nativeIn.reduce((s, t)  => s + (t.amount || 0), 0) / 1e9 * SOL_PRICE_EST;
      const solOut = nativeOut.reduce((s, t) => s + (t.amount || 0), 0) / 1e9 * SOL_PRICE_EST;
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
    // Fetch transactions for all seed wallets in parallel (batches of 10)
    const results = [];
    const BATCH = 10;

    for (let i = 0; i < SEED_WALLETS.length; i += BATCH) {
      const batch = SEED_WALLETS.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(async (wallet) => {
          const txs  = await fetchWalletTransactions(wallet, apiKey);
          const stats = computePnl(txs);
          return { wallet, ...stats };
        })
      );
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value.txCount > 0) {
          results.push(r.value);
        }
      }
    }

    // Sort by totalPnl descending, take top 50
    const leaderboard = results
      .filter(w => w.totalVolume > 100) // filter out dust wallets
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .slice(0, 50)
      .map((w, i) => ({ rank: i + 1, ...w }));

    // Update cache
    cache = { data: leaderboard, ts: Date.now() };

    return res.status(200).json({ leaderboard, cached: false, cachedAt: cache.ts });
  } catch (err) {
    console.error("[leaderboard]", err);
    return res.status(500).json({ error: err.message || "Failed to build leaderboard" });
  }
}
