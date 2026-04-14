# ChatFi 🤖

**AI-powered trading assistant built on Jupiter DEX — Solana**

Chat naturally to get live token prices, swap assets, set limit orders, and predict sports outcomes — all powered by Jupiter's API stack.

## Features

- 💬 **Chat-first interface** — natural language, Claude-style UX
- 💰 **Live prices** — Jupiter Price V2 API
- 🔍 **Token research** — Jupiter Tokens API (safety score, verification, metadata)
- ⇄ **Swap** — Jupiter Swap V2 with real quotes, route info, price impact
- 📊 **Limit orders** — Jupiter Trigger API
- ⚽ **Sports predictions** — web search + Jupiter Prediction Markets
- 👛 **Real wallet** — Phantom / Solflare connect with on-chain SOL + SPL balances

## Jupiter APIs Used

| API | Endpoint | Purpose |
|-----|----------|---------|
| Price V2 | `api.jup.ag/price/v2` | Live token prices |
| Tokens | `tokens.jup.ag/token/{mint}` | Safety scores, metadata |
| Swap V2 Quote | `api.jup.ag/swap/v2/quote` | Real swap quotes with routing |
| Swap V2 Execute | `api.jup.ag/swap/v2/swap` | Build & broadcast transaction |
| Trigger | `api.jup.ag/trigger/v1` | Limit orders |

## Quick Start

```bash
# Install
npm install

# Dev server
npm run dev

# Build for production
npm run build
```

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or connect your GitHub repo to Vercel for automatic deployments.

## Developer API Key

Get your key at [developers.jup.ag](https://developers.jup.ag).  
Enter it in the sidebar under "Developer API Key" for higher rate limits on Swap V2.

## Wallet Support

- **Phantom** — `window.phantom.solana`
- **Solflare** — `window.solflare`

Real swap execution uses `@solana/web3.js` to deserialize the VersionedTransaction from Jupiter and sign it via the wallet adapter.

## Tech Stack

- React 18 + Vite
- `@solana/web3.js` for transaction handling
- Jupiter APIs (Price V2, Tokens, Swap V2, Trigger)
- Anthropic Claude API (AI chat with web search)
- No backend — fully client-side

## Structure

```
jupchat/
├── src/
│   ├── main.jsx          # React entry point
│   └── JupChat.jsx       # Main app (everything in one file)
├── index.html
├── vite.config.js        # With Node polyfills for @solana/web3.js
├── package.json
└── DX-REPORT.md          # Developer Experience Report
```
