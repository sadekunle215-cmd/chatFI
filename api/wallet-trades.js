// api/wallet-trades.js
// Fetches recent swap transactions for a wallet using Helius Enhanced Transactions API.
// Runs server-side so HELIUS_RPC_URL is never exposed to the frontend.

const KNOWN_TOKENS = {
  So11111111111111111111111111111111111111112:  { symbol: "SOL",     name: "Solana",   decimals: 9,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC",  name: "USD Coin", decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT",  name: "Tether",   decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg" },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN:  { symbol: "JUP",   name: "Jupiter",  decimals: 6,  logoURI: "https://static.jup.ag/jup/icon.png" },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: "BONK",  name: "Bonk",     decimals: 5,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png" },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: "WIF",   name: "dogwifhat",decimals: 6,  logoURI: "https://img.jup.ag/tokens/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY", name: "Raydium",  decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png" },
  orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE:  { symbol: "ORCA",  name: "Orca",     decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png" },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So:  { symbol: "mSOL",  name: "Marinade SOL", decimals: 9, logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png" },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: "JitoSOL", name: "Jito Staked SOL", decimals: 9, logoURI: "https://img.jup.ag/tokens/J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn" },
};

// In-process cache so repeated mints in same request don't re-fetch
const mintMetaCache = {};

// Fetch token metadata from Jupiter — tries 3 endpoints in order
async function fetchJupiterMeta(mint) {
  if (mintMetaCache[mint]) return mintMetaCache[mint];

  // 1. Jupiter strict/verified token list
  try {
    const r = await fetch(`https://tokens.jup.ag/token/${mint}`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      if (d?.symbol) {
        const meta = { symbol: d.symbol, name: d.name || d.symbol, decimals: d.decimals ?? 6, logoURI: d.logoURI || `https://img.jup.ag/tokens/${mint}` };
        mintMetaCache[mint] = meta;
        return meta;
      }
    }
  } catch {}

  // 2. Jupiter tokens by ID (covers all routable tokens incl. unlisted memes)
  try {
    const r = await fetch(`https://tokens.jup.ag/tokens?ids=${mint}`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      const token = Array.isArray(d) ? d[0] : null;
      if (token?.symbol) {
        const meta = { symbol: token.symbol, name: token.name || token.symbol, decimals: token.decimals ?? 6, logoURI: token.logoURI || `https://img.jup.ag/tokens/${mint}` };
        mintMetaCache[mint] = meta;
        return meta;
      }
    }
  } catch {}

  // 3. Jupiter lite search endpoint
  try {
    const r = await fetch(`https://lite-api.jup.ag/tokens/v1/search?query=${mint}&limit=1`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      const token = Array.isArray(d) ? d[0] : null;
      if (token?.symbol) {
        const meta = { symbol: token.symbol, name: token.name || token.symbol, decimals: token.decimals ?? 6, logoURI: token.icon || token.logoURI || `https://img.jup.ag/tokens/${mint}` };
        mintMetaCache[mint] = meta;
        return meta;
      }
    }
  } catch {}

  return null;
}

// Resolve a mint → { symbol, name, decimals, logoURI }
// Checks KNOWN_TOKENS first, then fetches from Jupiter
async function resolveToken(mint) {
  if (!mint) return { symbol: "?", name: "Unknown", decimals: 6, logoURI: null };
  if (KNOWN_TOKENS[mint]) return KNOWN_TOKENS[mint];

  const meta = await fetchJupiterMeta(mint);
  if (meta) return meta;

  // Final fallback — still attach the CDN logo URL so the frontend can try it
  return {
    symbol: mint.slice(0, 4) + "…" + mint.slice(-4),
    name: null,
    decimals: 6,
    logoURI: `https://img.jup.ag/tokens/${mint}`,
  };
}

function fmtAmount(raw, decimals) {
  // raw here is already the human-readable tokenAmount from Helius (not lamports)
  const n = Math.abs(Number(raw));
  if (isNaN(n)) return "0";
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

    // Collect all unique unknown mints across all txs first, resolve in parallel
    const allMints = new Set();
    for (const tx of txs) {
      for (const t of (tx.tokenTransfers || [])) {
        if (t.mint && !KNOWN_TOKENS[t.mint]) allMints.add(t.mint);
      }
    }
    await Promise.allSettled([...allMints].map(mint => resolveToken(mint)));

    const swaps = [];

    for (const tx of txs) {
      if (swaps.length >= parsedLimit) break;
      if (tx.type !== "SWAP" && tx.transactionError) continue;

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
        const tok = await resolveToken(sentTransfer.mint);
        // tokenAmount from Helius is already human-readable (not raw lamports)
        sent = {
          mint: sentTransfer.mint,
          symbol: tok.symbol,
          name: tok.name || tok.symbol,
          logoURI: tok.logoURI || null,
          amount: fmtAmount(sentTransfer.tokenAmount, tok.decimals),
        };
      }
      if (recvTransfer) {
        const tok = await resolveToken(recvTransfer.mint);
        received = {
          mint: recvTransfer.mint,
          symbol: tok.symbol,
          name: tok.name || tok.symbol,
          logoURI: tok.logoURI || null,
          amount: fmtAmount(recvTransfer.tokenAmount, tok.decimals),
        };
      }

      // Fallback: SOL native change for SOL swaps
      if (!sent || !received) {
        const solTok = KNOWN_TOKENS["So11111111111111111111111111111111111111112"];
        const solSent = nativeChanges.find(n => n.fromUserAccount === wallet && n.amount > 5000);
        const solRecv = nativeChanges.find(n => n.toUserAccount === wallet && n.amount > 5000);
        if (solSent && !sent) sent = {
          mint: "So11111111111111111111111111111111111111112",
          symbol: "SOL", name: "Solana",
          logoURI: solTok.logoURI,
          amount: fmtAmount(solSent.amount / 1e9, 9),
        };
        if (solRecv && !received) received = {
          mint: "So11111111111111111111111111111111111111112",
          symbol: "SOL", name: "Solana",
          logoURI: solTok.logoURI,
          amount: fmtAmount(solRecv.amount / 1e9, 9),
        };
      }

      if (!sent || !received || sent.mint === received.mint) continue;

      swaps.push({
        signature: tx.signature,
        timestamp: (tx.timestamp || 0) * 1000,
        fromMint:    sent.mint,
        fromSymbol:  sent.symbol,
        fromName:    sent.name,
        fromLogoURI: sent.logoURI,
        fromAmount:  sent.amount,
        toMint:      received.mint,
        toSymbol:    received.symbol,
        toName:      received.name,
        toLogoURI:   received.logoURI,
        toAmount:    received.amount,
      });
    }

    return res.status(200).json(swaps);
  } catch (err) {
    console.error("wallet-trades error:", err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
