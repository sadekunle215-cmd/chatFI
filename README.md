<p align="center">
  <img src="./logo.png" alt="ChatFi Logo" width="120" />
</p>

# ChatFi

> AI-powered DeFi trading assistant built on Jupiter DEX (Solana). Swap, earn, lend, predict, and manage your entire on-chain portfolio — all through a single chat interface.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-9945FF)](https://solana.com)
[![Powered by Jupiter](https://img.shields.io/badge/Powered%20by-Jupiter-00C2FF)](https://jup.ag)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Jupiter API Integration](#jupiter-api-integration)
- [Wallet Support](#wallet-support)
- [Yield Vault](#yield-vault)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

ChatFi is a conversational DeFi interface that abstracts the complexity of on-chain interactions behind a natural language chat UI. Users connect their Solana wallet and interact with Jupiter's full API suite — swaps, limit orders, DCA, lending, perpetuals, prediction markets, and more — by typing plain English commands.

The core insight: most DeFi users don't need another dashboard. They need to say *"swap $50 of SOL to BONK"* and have it just work.

**Live at:** [chatfi.pro](https://chatfi.pro)

---

## Features

### Trading
- **Swaps** — token swaps via Jupiter Swap V2 (`/order` + `/execute`) with gasless support and best-price routing across all DEX aggregators
- **Limit & Trigger Orders** — single, OCO (take-profit + stop-loss), and OTOCO order types via Jupiter Trigger V2
- **DCA / Recurring Orders** — time-based dollar-cost averaging via Jupiter Recurring API
- **Perpetual Futures** — leveraged longs and shorts on SOL, BTC, ETH via Jupiter Perps (up to 100x) *(coming soon)*
- **Basket Swaps** — sell multiple tokens to USDC in a single flow

### Earn & Lend
- **Jupiter Earn** — deposit assets into lending vaults, earn live APY, withdraw at any time
- **Borrow** — deposit collateral, borrow against it, manage LTV health *(coming soon)*
- **Multiply / Leverage Yield** — looped lending positions via flash-borrow for amplified staking returns *(coming soon)*
- **Flashloans** — zero-fee atomic loans for arbitrage and collateral swaps

### Yield Vault *(flagship feature)*
- Deposit USDC/SOL/JLP → earns live APY in Jupiter Lend while idle
- Two modes: **Predict** (auto-bets prediction markets with accrued yield) and **Auto-DCA** (auto-buys a chosen token when yield threshold is reached)
- Principal is never touched — only yield is deployed
- Winnings sweep back into Lend to compound

### Prediction Markets
- Browse and bet on live sports, crypto, politics, and culture markets
- AI-assisted match analysis with edge detection
- Auto-scan odds for value bets above a configurable edge threshold
- Claim winnings directly in chat

### Portfolio & Research
- Full wallet snapshot — spot balances, DeFi positions, earn deposits, open orders, LP positions, airdrops
- Token deep-dive — price, 24h change, market cap, holders, liquidity, audit score, organic volume
- Trending, top-traded, and newly listed tokens
- Wallet behaviour analysis and copy trading

### Token Tools
- Create tokens via Jupiter Studio (Dynamic Bonding Curves)
- Claim creator trading fees
- Lock tokens with cliff + linear vesting schedules

### Send
- Send tokens to anyone via Jupiter invite links — recipient does not need a wallet to claim
- Claw back unclaimed sends

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (React)                        │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │  Chat UI     │  │  Wallet Layer │  │  Panels / Modals│  │
│  │  (NL → JSON) │  │  Privy + Reown│  │  Swap, Earn,    │  │
│  └──────┬───────┘  └───────┬───────┘  │  Perps, Vault…  │  │
│         │                  │          └─────────────────┘  │
└─────────┼──────────────────┼──────────────────────────────-─┘
          │                  │
          ▼                  ▼
┌─────────────────┐  ┌───────────────────┐
│  Anthropic API  │  │   Solana RPC      │
│  (Claude Sonnet)│  │   (sign & send tx)│
└────────┬────────┘  └───────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Vercel Serverless (/api/jupiter)            │
│              (injects Jupiter API key, proxies requests)     │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Jupiter APIs                           │
│  Swap V2 · Trigger V2 · Recurring · Lend · Perps ·         │
│  Prediction · Portfolio · Price · Tokens · Studio · Lock   │
└─────────────────────────────────────────────────────────────┘
```

**Flow:**
1. User types a message in the chat UI
2. The message is sent to Claude (Anthropic API) with a structured system prompt
3. Claude returns a JSON action descriptor (e.g. `{ "action": "SHOW_SWAP", "actionData": { "from": "SOL", "to": "BONK", "amount": "10" } }`)
4. The client interprets the action, calls the appropriate Jupiter API via the Vercel proxy, and renders the relevant UI panel
5. The user signs transactions directly in their connected wallet — keys never leave the client

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Styling | Inline styles with design tokens |
| AI | Anthropic Claude Sonnet (`claude-sonnet-4-20250514`) |
| Wallet (external) | Reown AppKit + Solana Adapter (Phantom, Backpack, etc.) |
| Wallet (social/email) | Privy embedded Solana wallets |
| Blockchain | Solana Mainnet-Beta |
| Transaction parsing | `@solana/web3.js`, `@solana/spl-token` |
| API proxy | Vercel Serverless Functions |
| DEX / DeFi | Jupiter APIs (full suite) |
| Deployment | Vercel |

---

## Prerequisites

- Node.js ≥ 18
- A Jupiter Developer Platform API key — [developers.jup.ag](https://developers.jup.ag)
- An Anthropic API key — [console.anthropic.com](https://console.anthropic.com)
- A Privy app ID — [privy.io](https://privy.io)
- A Reown (WalletConnect) project ID — [cloud.reown.com](https://cloud.reown.com)
- A Solana RPC endpoint (Helius, QuickNode, or the public mainnet endpoint)

---

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/your-org/chatfi.git
cd chatfi

# 2. Install dependencies
npm install

# 3. Copy the environment template and fill in your keys
cp .env.example .env

# 4. Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

For the Vercel API proxy to work locally, install the Vercel CLI and run:

```bash
npm install -g vercel
vercel dev
```

This starts both the Vite dev server and the `/api/jupiter` serverless function locally.

---

## Environment Variables

Create a `.env` file in the project root. All variables prefixed `VITE_` are exposed to the client bundle. Variables without the prefix are server-only (Vercel Functions).

```env
# Jupiter Developer Platform API key
JUPITER_API_KEY=your_jupiter_api_key_here

# Anthropic API key (server-side only — never expose to client)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Privy app ID (client-side)
VITE_PRIVY_APP_ID=your_privy_app_id_here

# Reown / WalletConnect project ID (client-side)
VITE_REOWN_PROJECT_ID=your_reown_project_id_here

# Solana RPC endpoint (client-side)
# Defaults to https://api.mainnet-beta.solana.com if not set
VITE_SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=your_key_here
```

> **Security note:** `JUPITER_API_KEY` and `ANTHROPIC_API_KEY` must never be exposed in the client bundle. They are only accessed inside Vercel serverless functions (`/api/jupiter` and `/api/chat`).

---

## Project Structure

```
chatfi/
├── api/
│   └── jupiter.js          # Vercel serverless proxy — injects Jupiter API key
├── src/
│   ├── chatFI.jsx          # Main application component (~14,000 lines)
│   ├── plugins/            # Optional feature plugins
│   │   └── ExamplePlugin.jsx
│   └── main.jsx            # React entry point
├── public/
│   └── index.html
├── .env.example            # Environment variable template
├── vite.config.js
├── package.json
└── README.md
```

### Key sections inside `chatFI.jsx`

| Line range | Description |
|---|---|
| 1–200 | Imports, API endpoint constants, token mint addresses |
| 247–524 | AI system prompt and action definitions |
| 526–553 | Suggestion chip groups |
| 555–800 | Design token system |
| 2450–2600 | State declarations |
| 2691–2870 | Core `useEffect` hooks and wallet connection listeners |
| 3561–4000 | Portfolio fetch logic |
| 4781–4880 | Earn vault and position fetch helpers |
| 5257–5460 | Yield Vault withdraw and deposit flows |
| 7046–9800 | AI action dispatcher (maps JSON actions → UI/tx) |
| 11700–14413 | JSX render tree |

---

## Jupiter API Integration

ChatFi uses Jupiter's full API suite via a Vercel proxy at `/api/jupiter`. All requests from the client pass through this proxy, which appends the `x-api-key` header before forwarding to `api.jup.ag` or `lite-api.jup.ag`.

### Endpoints in use

| API | Base URL | Usage |
|---|---|---|
| Swap V2 | `api.jup.ag/swap/v2` | `/order`, `/execute` |
| Trigger V2 | `api.jup.ag/trigger/v2` | Single, OCO, OTOCO limit orders |
| Recurring V1 | `api.jup.ag/recurring/v1` | DCA order create/cancel |
| Lend Earn V1 | `api.jup.ag/lend/v1/earn` | Deposit, withdraw, positions |
| Lend Borrow V1 | `api.jup.ag/lend/v1/borrow` | Borrow vaults |
| Price V3 | `api.jup.ag/price/v3` | USD prices with 24h change |
| Tokens V2 | `api.jup.ag/tokens/v2` | Search, trending, metadata |
| Portfolio V1 | `api.jup.ag/portfolio/v1` | Wallet + DeFi positions |
| Prediction V1 | `lite-api.jup.ag/prediction/v1` | Markets, orders, claims |
| Perps V1 | `api.jup.ag/perps/v1` | Positions, open/close |
| Studio V1 | `api.jup.ag/studio/v1` | Token creation (DBC) |
| Lock V1 | `api.jup.ag/lock/v1` | Token vesting |
| Send V1 | `api.jup.ag/send/v1` | Invite-link token sends |

### Transaction flow

```
Client requests transaction → Jupiter API returns base64-encoded transaction
→ Client deserializes via VersionedTransaction.deserialize()
→ User signs via active wallet provider (Privy or Reown)
→ Client sends signed transaction to Solana RPC via sendTransaction
→ Client polls RPC for confirmation via getSignatureStatuses
→ UI updates on confirm
```

---

## Wallet Support

ChatFi supports two wallet integration paths:

### External wallets (Reown AppKit)
Phantom, Backpack, Solflare, and any WalletConnect-compatible wallet. Suitable for users who already have a Solana wallet.

### Embedded wallets (Privy)
Email, Google, Twitter, and SMS login with an auto-provisioned embedded Solana wallet. Suitable for users new to Solana. Privy creates a Solana wallet for all users on login (`createOnLogin: "all-users"`). Ethereum wallet creation is disabled.

The active wallet is resolved at transaction time via `getActiveProvider()`, which checks Privy first and falls back to the Reown provider.

---

## Yield Vault

The Yield Vault is ChatFi's flagship automated strategy feature.

### How it works

1. User deposits USDC, SOL, or JLP via Jupiter Lend Earn
2. Principal earns live APY (USDC ~4–5%, JLP ~10–15%)
3. In **Predict mode**: every 3 minutes, ChatFi scans Jupiter prediction markets for bets with edge ≥ configured threshold. When found, it bets the accrued yield — the principal stays in Lend untouched
4. In **Auto-DCA mode**: when accrued yield reaches the configured USD threshold, it auto-buys the target token (e.g. SOL, JUP) via Jupiter Swap
5. Winnings/proceeds are swept back into Lend to compound
6. Users can pause/resume auto-betting or withdraw at any time

### Configuration

| Parameter | Description | Default |
|---|---|---|
| `depositAmount` | Amount to deposit | — |
| `depositToken` | `USDC` / `SOL` / `JLP` | `USDC` |
| `vaultMode` | `predict` / `dca` | `predict` |
| `dcaToken` | Target token for DCA swaps | `SOL` |
| `dcaThreshold` | Yield threshold (USD) to trigger a DCA swap | `2` |
| `minEdge` | Minimum edge % to place a prediction bet | `8` |
| `maxBet` | Maximum USDC per prediction bet | `5` |
| `category` | `sports` / `crypto` / `politics` / `null` (all) | `null` |

### Vault state persistence

Vault configuration and activity logs are stored in `localStorage` keyed by wallet address (`chatfi-yieldvault-{address}`). Stats and log entries are stored separately under `chatfi-yieldvault-stats-{address}` and `chatfi-yieldvault-log-{address}`.

---

## Deployment

ChatFi is designed for zero-config deployment on Vercel.

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Set all environment variables in the Vercel dashboard under **Project → Settings → Environment Variables**. Make sure `JUPITER_API_KEY` and `ANTHROPIC_API_KEY` are set as **Server** variables only (not exposed to the browser).

### Vercel API proxy (`/api/jupiter.js`)

All Jupiter API calls from the browser are routed through this serverless function. It receives a `{ url, method, body }` payload from the client, injects the `x-api-key` header, and proxies the request to Jupiter. This keeps the API key server-side at all times.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

### Adding a plugin

ChatFi supports optional feature plugins. To add one:

1. Create `src/plugins/YourPlugin.jsx`
2. Export a default component and a `suggestionGroup` named export
3. Uncomment the import line in `chatFI.jsx` and add your `suggestionGroup` to `PLUGIN_SUGGESTION_GROUPS`

---

## License

MIT © ChatFi

---

> Built with [Jupiter APIs](https://developers.jup.ag) · Deployed on [Vercel](https://vercel.com) · Transactions secured on [Solana](https://solana.com)
