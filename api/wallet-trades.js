// api/wallet-trades.js
// Fetches recent swap transactions for a wallet using Helius Enhanced Transactions API.
// Runs server-side so HELIUS_RPC_URL is never exposed to the frontend.

const KNOWN_TOKENS = {
  So11111111111111111111111111111111111111112: { symbol: "SOL",  decimals: 9  },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6  },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", decimals: 6  },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: "JUP",  decimals: 6  },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: "BONK", decimals: 5  },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: "WIF",  decimals: 6  },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY",  decimals: 6  },
  orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE:  { symbol: "ORCA", decimals: 6  },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: "mSOL", decimals: 9  },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: "JitoSOL", decimals: 9 },
};

function resolveToken(mint) {
  if (!mint) return { symbol: "?", decimals: 6 };
  return KNOWN_TOKENS[mint] || { symbol: mint.slice(0, 4) + "…", decimals: 6 };
}

function fmtAmount(raw, decimals) {
  const n = Math.abs(Number(raw)) / Math.pow(10, decimals);
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(4);
  if (n < 1000) return n.toFixed(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { wallet, limit = "5" } = req.query;
  if (!wallet) return res.status(400).json({ error: "wallet parameter required" });

  const heliusRpc = process.env.HELIUS_RPC_URL;
  if (!heliusRpc) return res.status(500).json({ error: "HELIUS_RPC_URL not configured" });

  // Extract API key from RPC URL — Helius Enhanced API uses the same key
  // RPC URL format: https://mainnet.helius-rpc.com/?api-key=KEY
  const apiKeyMatch = heliusRpc.match(/api-key=([^&]+)/);
  if (!apiKeyMatch) return res.status(500).json({ error: "Could not parse Helius API key from HELIUS_RPC_URL" });
  const apiKey = apiKeyMatch[1];

  const parsedLimit = Math.min(Math.max(parseInt(limit) || 5, 1), 20);

  try {
    // Helius Enhanced Transactions API — returns parsed tx with token transfers
    const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${apiKey}&limit=40&type=SWAP`;
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Helius error: ${errText}` });
    }

    const txs = await response.json();
    if (!Array.isArray(txs)) return res.status(200).json([]);

    const swaps = [];

    for (const tx of txs) {
      if (swaps.length >= parsedLimit) break;
      if (tx.type !== "SWAP" && tx.transactionError) continue;

      // Parse from tokenTransfers — find what wallet sent and received
      const transfers = tx.tokenTransfers || [];
      const nativeChanges = tx.nativeTransfers || [];

      let sent = null;
      let received = null;

      // Token transfers sent FROM wallet
      const sentTransfer = transfers.find(t =>
        t.fromUserAccount === wallet && t.tokenAmount > 0
      );
      // Token transfers received BY wallet
      const recvTransfer = transfers.find(t =>
        t.toUserAccount === wallet && t.tokenAmount > 0 &&
        t.mint !== sentTransfer?.mint
      );

      if (sentTransfer) {
        const tok = resolveToken(sentTransfer.mint);
        sent = { mint: sentTransfer.mint, symbol: tok.symbol, amount: fmtAmount(sentTransfer.tokenAmount * Math.pow(10, tok.decimals), tok.decimals) };
      }
      if (recvTransfer) {
        const tok = resolveToken(recvTransfer.mint);
        received = { mint: recvTransfer.mint, symbol: tok.symbol, amount: fmtAmount(recvTransfer.tokenAmount * Math.pow(10, tok.decimals), tok.decimals) };
      }

      // Fallback: SOL native change for SOL swaps
      if (!sent || !received) {
        const solSent = nativeChanges.find(n => n.fromUserAccount === wallet && n.amount > 5000);
        const solRecv = nativeChanges.find(n => n.toUserAccount === wallet && n.amount > 5000);
        if (solSent && !sent) sent = { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", amount: fmtAmount(solSent.amount, 9) };
        if (solRecv && !received) received = { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", amount: fmtAmount(solRecv.amount, 9) };
      }

      if (!sent || !received || sent.mint === received.mint) continue;

      swaps.push({
        signature: tx.signature,
        timestamp: (tx.timestamp || 0) * 1000,
        fromMint: sent.mint,
        fromSymbol: sent.symbol,
        fromAmount: sent.amount,
        toMint: received.mint,
        toSymbol: received.symbol,
        toAmount: received.amount,
      });
    }

    return res.status(200).json(swaps);
  } catch (err) {
    console.error("wallet-trades error:", err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
