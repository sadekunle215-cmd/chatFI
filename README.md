# ChatFi — Full System Architecture

> **AI-native DeFi terminal powered by Jupiter API on Solana**
> Built on Next.js / Vercel · Claude AI · Firebase · Helius · Reown AppKit · Privy

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Authentication Layer](#4-authentication-layer)
5. [API Proxy Layer — `/api/jupiter.js`](#5-api-proxy-layer)
6. [AI Brain — `/api/claude.js`](#6-ai-brain)
7. [Feature: Swap](#7-feature-swap)
8. [Feature: Jupiter Send](#8-feature-jupiter-send)
9. [Feature: Jupiter Lock (Token Vesting)](#9-feature-jupiter-lock)
10. [Feature: Jupiter Earn (Lend / Supply)](#10-feature-jupiter-earn)
11. [Feature: Yield Vault (Auto-Harvest)](#11-feature-yield-vault)
12. [Feature: DCA — Dollar-Cost Averaging](#12-feature-dca)
13. [Feature: Trigger / Limit Orders](#13-feature-trigger--limit-orders)
14. [Feature: Portfolio Aggregator](#14-feature-portfolio-aggregator)
15. [Feature: Wallet Trade History](#15-feature-wallet-trade-history)
16. [Feature: Leaderboard](#16-feature-leaderboard)
17. [Feature: Rebalance / Autopilot](#17-feature-rebalance--autopilot)
18. [Feature: Jupiter Studio (DBC Pool)](#18-feature-jupiter-studio-dbc-pool)
19. [Feature: Yield Rotator Plugin](#19-feature-yield-rotator-plugin)
20. [Coming Soon Features](#20-coming-soon-features)
21. [Database Schema (Firestore)](#21-database-schema-firestore)
22. [Environment Variables](#22-environment-variables)
23. [Cron Jobs](#23-cron-jobs)
24. [Security Architecture](#24-security-architecture)
25. [Data Flow Summary](#25-data-flow-summary)
26. [chatFI.jsx — Line-by-Line Code Guide](#26-chatfijsx--line-by-line-code-guide)

---

## 1. Overview

ChatFi is a conversational DeFi interface where users type natural-language commands and the AI translates them into on-chain Solana transactions using the Jupiter API ecosystem. Every feature is accessible through a single chat UI — no separate pages, no complex forms.

**Core Philosophy:**
- The AI (Claude/GPT-4o) understands user intent and maps it to Jupiter API actions
- The server proxy layer keeps all API keys secret and bypasses geo-restrictions
- All transactions are built server-side but **signed client-side** — the server never holds user private keys
- Firebase Firestore persists user state (vaults, prefs, Telegram links)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS |
| Hosting | Vercel (serverless functions + edge) |
| Blockchain | Solana Mainnet-Beta |
| Jupiter APIs | Swap v1/v2, Send v1, Lock, Earn/Lend, DCA, Trigger, Perps, Studio, Portfolio |
| AI | Anthropic Claude (primary) → OpenAI GPT-4o (fallback) |
| Wallet — External | Reown AppKit + Solana Adapter (Phantom, Backpack, etc.) |
| Wallet — Embedded | Privy (email / social login with embedded Solana wallet) |
| Database | Firebase Firestore (Admin SDK, server-side only) |
| Indexer | Helius Enhanced Transactions API + DAS |
| Notifications | Telegram Bot API |
| Price Data | Jupiter Price API v2/v3, CoinGecko |
| Token Metadata | Jupiter Tokens API, Helius DAS |

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER / CLIENT                      │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │  Reown   │  │  Privy   │  │   React Chat UI         │ │
│  │ AppKit   │  │ Embedded │  │   (chatFI.jsx)          │ │
│  │ (Phantom)│  │  Wallet  │  │                         │ │
│  └────┬─────┘  └────┬─────┘  └──────────┬──────────────┘ │
│       └─────────────┴───────────────────┘                 │
│                    Wallet Signer                           │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼───────────────────────────────┐
│                  VERCEL SERVERLESS                        │
│                                                          │
│  /api/claude.js     /api/jupiter.js    /api/send.js      │
│  /api/lock.js       /api/yield-vault.js                  │
│  /api/portfolio.js  /api/wallet-trades.js                │
│  /api/leaderboard.js /api/rebalance.js                   │
│  /api/lend-positions.js  /api/studio-submit.js           │
│  /api/config.js                                          │
└──────┬──────────┬──────────┬──────────┬─────────────────┘
       │          │          │          │
  ┌────▼───┐ ┌───▼────┐ ┌───▼────┐ ┌──▼──────────┐
  │Jupiter │ │Anthropic│ │Helius  │ │  Firebase   │
  │  APIs  │ │ / OpenAI│ │  RPC   │ │  Firestore  │
  └────────┘ └────────┘ └────────┘ └─────────────┘
```

---

## 4. Authentication Layer

ChatFi supports two parallel wallet authentication paths that converge at the signing layer.

### 4.1 External Wallets — Reown AppKit

Handles browser-extension wallets (Phantom, Backpack, Solflare, etc.).

```
createAppKit({
  adapters: [SolanaAdapter],
  networks: [solanaMainnet],
  projectId: VITE_REOWN_PROJECT_ID
})
```

Hooks used: `useAppKitAccount`, `useAppKitProvider`, `useDisconnect`

The `walletProvider` from AppKit exposes `signAndSendTransaction` and `signTransaction` — used for all on-chain actions.

### 4.2 Embedded Wallets — Privy

Handles email / Google / Twitter login. Privy auto-creates a Solana embedded wallet for every user.

```
embeddedWallets: {
  ethereum: { createOnLogin: "off" },   // ETH disabled
  solana:   { createOnLogin: "all-users" }
}
```

Hooks used: `useSolanaWallets`, `usePrivy`

The embedded wallet's `sendTransaction` method is used for signing — identical interface to AppKit for the rest of the app.

### 4.3 Unified Signing

Both paths expose a `signAndBroadcast(transaction)` function that the feature plugins call. The app detects which wallet type is active and routes accordingly. The server **never receives private keys**.

---

## 5. API Proxy Layer

**File:** `api/jupiter.js`

All Jupiter API calls from the browser go through this single proxy. It:

- Injects the `JUPITER_API_KEY` server-side (never exposed to client)
- Strips user IP headers so Jupiter sees Vercel's US server IP (bypasses geo-blocking for users in restricted regions)
- Applies per-endpoint timeouts (55s for portfolio, 20s for everything else)
- Handles safe JSON parsing (some endpoints return empty bodies or HTML on error)

```
POST /api/jupiter
Body: { url, method, body, triggerJwt? }
```

The `triggerJwt` field is forwarded as a Bearer token for Trigger order endpoints that require JWT authentication.

**Special case:** `url: "SOLANA_RPC"` is resolved to the configured Helius/custom RPC URL server-side.

`maxDuration: 60` is set for Vercel's extended function timeout (portfolio aggregation can take 15–55s).

---

## 6. AI Brain

**File:** `api/claude.js`

The AI backend routes requests to Anthropic Claude first, falling back to OpenAI GPT-4o if Claude is unavailable.

### Request format

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "system": "<system prompt with wallet context, balances, feature list>",
  "messages": [{ "role": "user", "content": "swap 10 USDC to SOL" }]
}
```

### Response format

The AI always returns a structured JSON action object:

```json
{
  "text": "I'll swap 10 USDC to SOL for you...",
  "action": "SWAP",
  "actionData": {
    "inputMint": "EPjFWdd5...",
    "outputMint": "So11111...",
    "amount": 10
  }
}
```

### Fallback logic

1. Try Anthropic Claude (`claude-sonnet-4-5`)
2. On error/timeout → try OpenAI GPT-4o with `response_format: { type: "json_object" }`
3. If both fail → return 500 error

---

## 7. Feature: Swap

**Jupiter API:** `https://api.jup.ag/swap/v1/quote` + `/swap`

1. **Quote** — `GET /swap/v1/quote?inputMint=...&outputMint=...&amount=...&slippageBps=50`
2. **Build transaction** — `POST /swap/v1/swap` with `quoteResponse`, `userPublicKey`, `wrapAndUnwrapSol: true`, `dynamicComputeUnitLimit: true`, `prioritizationFeeLamports: "auto"`
3. **Client signs** — returned base64 transaction is deserialized, signed by wallet, and broadcast

---

## 8. Feature: Jupiter Send

**File:** `api/send.js` | **Jupiter API:** `https://api.jup.ag/send/v1`

```
inviteCode → SHA-256("invite:" + code) → 32-byte seed → ed25519 keypair
POST /send/v1/craft-send → server partial-signs → client signs → broadcast
```

Clawback: `POST /api/send { action: "clawback" }` → server partial-signs → client signs.

---

## 9. Feature: Jupiter Lock (Token Vesting)

**File:** `api/lock.js` | **Program:** `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`

58-byte instruction data encodes: discriminator, vesting_start_time, cliff_time, frequency, cliff_unlock_amount, amount_per_period, number_of_period, update_recipient_mode, cancel_mode. Token-2022 mints are rejected server-side.

---

## 10. Feature: Jupiter Earn (Lend / Supply)

**Jupiter API:** `https://lend-api.jup.ag/api/v1/positions` + `https://api.jup.ag/lend/v1/earn`

Returns `jlMint` receipt tokens (jlUSDC, jlSOL) that accrue value. APY = supplyApy + rewardsApy.

---

## 11. Feature: Yield Vault (Auto-Harvest)

**File:** `api/yield-vault.js` | **Cron:** every 5 min

Monitors earn positions. When `yieldUSD >= thresholdUSD`: sends Telegram notification or auto-executes harvest swap via delegate keypair. Rotator cron (every 12h) alerts users about higher-APY pools.

---

## 12. Feature: DCA

**Jupiter API:** `https://dca-api.jup.ag/user/{wallet}?status=active`

Read/create DCA orders. intervalSecs: 60=1min, 3600=1hr, 86400=1day, 604800=1wk.

---

## 13. Feature: Trigger / Limit Orders

**Jupiter API:** `https://trigger.jup.ag/v2/trigger-orders`

Single / OCO / OTOCO types. JWT auth via `triggerJwt` Bearer header. Min $10 USD.

---

## 14. Feature: Portfolio Aggregator

**File:** `api/portfolio.js` | **`maxDuration: 60`**

9 data sources fetched via `Promise.allSettled`: token balances (Helius), prices (Jupiter v2), metadata (Jupiter/Helius DAS), earn positions, DCA orders, trigger orders, perp positions, lock positions, yield vaults (Firestore).

---

## 15. Feature: Wallet Trade History

**File:** `api/wallet-trades.js` | **Helius:** Enhanced Transactions API

Token resolution waterfall: Jupiter verified → all routable → lite search → mint address fallback. All resolved in parallel.

---

## 16. Feature: Leaderboard

**File:** `api/leaderboard.js` | **Cache:** 1-hour in-memory

PnL = usdIn - usdOut per swap tx across last 40 txs per wallet. Filters protocol addresses. Resolves .sol names for top 20. SOL price from CoinGecko (5-min cache).

---

## 17. Feature: Rebalance / Autopilot

**File:** `api/rebalance.js`

EXTREME volatility gate blocks execution. Client-sign (default) or server-sign (autopilot via `REBALANCE_KEYPAIR_SECRET`) modes.

---

## 18. Feature: Jupiter Studio (DBC Pool)

**File:** `api/studio-submit.js` | `bodyParser: false` — streams raw multipart to Jupiter.

---

## 19. Feature: Yield Rotator Plugin

**File:** `plugins/YieldRotatorPlugin` — registered in `PLUGIN_SUGGESTION_GROUPS`. Handles `YIELD_ROTATE` action, compares APYs across all Earn pools.

---

## 20. Coming Soon Features

**Multiply** — leveraged looping via `@jup-ag/lend-read` (infrastructure already in `lend-positions.js`)
**Borrow** — same lend-read client, 7 vaults (SOL/USDC, JitoSOL/SOL, JupSOL/SOL, WBTC/USDC, JLP/USDC, JUP/USDC, USDC/USDT)
**Perpetuals** — `https://perp.jup.ag/v1`, portfolio already fetches open positions

---

## 21. Database Schema (Firestore)

### `yield_vaults`
`wallet`, `earnMint`, `earnSymbol`, `earnJlMint`, `depositedAmount`, `depositedValueUSD`, `thresholdUSD`, `targetTokenSymbol`, `targetTokenMint`, `targetTokenDecimals`, `status` (active/cancelled), `autoHarvest`, `pendingHarvest`, `pendingHarvestPingCount`, `totalSwapped`, `swapCount`, `lastCheckedAt`, `lastTriggeredAt`, `lastTxSig`, `createdAt`, `updatedAt`

### `chatfi_users`
`wallet`, `telegramChatId`, `telegramLinkToken`, `telegramLinkExpiry`

### `harvest_prefs` (doc ID: `{wallet}_{SYM}`)
`wallet`, `sym`, `earnMint`, `autoHarvest`, `updatedAt`

---

## 22. Environment Variables

| Variable | Used In | Description |
|---|---|---|
| `JUPITER_API_KEY` | All api/ files | Jupiter API key — server-side only |
| `ANTHROPIC_API_KEY` | `claude.js` | Claude API key |
| `OPENAI_API_KEY` | `claude.js` | GPT-4o fallback |
| `SOLANA_RPC` | `jupiter.js`, `send.js`, `lock.js` | Primary RPC |
| `HELIUS_RPC_URL` | `portfolio.js`, `wallet-trades.js`, `leaderboard.js` | Helius RPC |
| `FIREBASE_ADMIN_KEY` | `yield-vault.js`, `portfolio.js` | Firebase service account JSON |
| `DELEGATE_PRIVATE_KEY` | `yield-vault.js` | Auto-harvest signing keypair |
| `TELEGRAM_BOT_TOKEN` | `yield-vault.js` | Telegram bot |
| `NEXT_PUBLIC_APP_URL` | `yield-vault.js` | App URL for Telegram deeplinks |
| `REBALANCE_KEYPAIR_SECRET` | `rebalance.js` | Server-side autopilot signing |
| `VITE_REOWN_PROJECT_ID` | `chatFI.jsx` | Reown AppKit (public) |
| `VITE_PRIVY_APP_ID` | `chatFI.jsx` | Privy (public) |
| `VITE_SOLANA_RPC` | `chatFI.jsx` | Client-side RPC |

---

## 23. Cron Jobs

```json
{ "path": "/api/yield-vault?cron=1",       "schedule": "*/5 * * * *"  }
{ "path": "/api/yield-vault?cron=rotator", "schedule": "0 */12 * * *" }
```

---

## 24. Security Architecture

- All API keys in Vercel env vars — never in client bundle
- Transactions built server-side, **signed client-side** — server never holds private keys
- Geo-bypass: proxy strips `x-forwarded-for`, `cf-connecting-ip` headers
- Firestore accessed only via Firebase Admin SDK on server
- Lock server validates: mint exists, not Token-2022, sender has token account, cliff >= start

---

## 25. Data Flow Summary

**"Swap 50 USDC to SOL":**
User → /api/claude → action:SHOW_SWAP → /api/jupiter quote → /api/jupiter swap → client signs → broadcast → swap-card in chat

**"Set up Yield Vault":**
User → /api/claude → action:SET_YIELD_VAULT → /api/yield-vault CREATE → Firestore → cron every 5min checks yield → Telegram alert or delegate auto-harvest

---

## 26. chatFI.jsx — Line-by-Line Code Guide

> `chatFI.jsx` is the entire React frontend in a single file — **16,681 lines**. Every feature the user sees lives here. This section annotates every 100-line block so a contest reviewer can navigate the code without reading all 16,681 lines.

---

### Lines 1–23 · Imports & Plugin Registration

| Lines | What it is | What it does |
|---|---|---|
| 1 | `React, { useState, useEffect, useRef, useCallback }` | Core React hooks used throughout the component |
| 2 | `@solana/web3.js` — Connection, Transaction, VersionedTransaction, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL | Solana primitives for building, deserialising, and broadcasting transactions |
| 3 | `@solana/spl-token` — getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID | SPL Token helpers for ATA creation and token transfers |
| 4 | `tweetnacl` as `nacl` | Used specifically for `nacl.sign.detached` in the Jupiter Send flow — signs the invite keypair slot of a partially-signed transaction |
| 7 | `@reown/appkit/react` — createAppKit, useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect, useWalletInfo | Reown AppKit hooks: open wallet modal, read address, get signing provider, disconnect |
| 8 | `SolanaAdapter` from `@reown/appkit-adapter-solana` | Bridges Reown to Solana's signing interface (Phantom, Backpack, etc.) |
| 9 | `solana as solanaMainnet` from `@reown/appkit/networks` | Mainnet-beta network config object passed to `createAppKit` |
| 12 | `PrivyProvider, usePrivy, useWallets, useSolanaWallets` | Privy hooks: login/logout control, access to embedded Solana wallet for email/social users |
| 18 | `YieldRotatorPlugin, { suggestionGroup as yieldRotatorSuggestions }` | The only active plugin at launch — imports both the panel component and the suggestion chips it registers |
| 19–22 | `PLUGIN_SUGGESTION_GROUPS` array | Registry for all plugin suggestion groups. Adding a new plugin = import it + push its `suggestionGroup` here. Drives the quick-suggestion chips in the sidebar |

---

### Lines 24–99 · SVG Icon Components

| Lines | What it is | What it does |
|---|---|---|
| 25–28 | `SvgChat` | Speech bubble icon — chat nav tab and chat history sidebar |
| 30–34 | `SvgWallet` | Wallet rectangle icon — wallet connect buttons and portfolio tab |
| 36–40 | `SvgZap` | Lightning bolt — Yield Vault, auto-harvest toggles, and power-user features |
| 41–44 | `SvgBarChart` | Bar chart lines — portfolio, leaderboard, and analytics UI |
| 45–50 | `SvgZapSm` | Smaller 14px lightning bolt — used inside compact cards and inline status indicators |
| 51–56 | `SvgClose` | ✕ icon — closes every overlay panel and modal |
| 57–62 | `SvgRefresh` | Circular arrow — refresh buttons on leaderboard, portfolio, vault tracker |
| 63–68 | `SvgCheck` | Checkmark circle — success states after transactions confirm |
| 69–74 | `SvgAlertTriangle` | Warning triangle — error messages and validation warnings in panels |
| 75–80 | `SvgTelegram` | Telegram paper-plane logo — Telegram link button on vault cards |
| 81–99 | Remaining small utility SVGs | Arrow, external link, copy, info circle — used in transaction cards, Solscan links, copy-to-clipboard buttons |

All SVG components accept `({size=16, color="currentColor"})` props. They are pure render functions with no state — no third-party icon library needed.

---

### Lines 100–140 · Jupiter API Endpoint Constants

| Lines | Constant | What it is | What it does |
|---|---|---|---|
| 101 | `JUP_BASE` | `https://api.jup.ag` | Root URL for all main Jupiter API calls |
| 102 | `JUP_TOKEN_SEARCH` | `/tokens/v2/search` | Token search endpoint — verified + community tokens |
| 103 | `JUP_PRICE_API` | `/price/v3` | Live USD price feed — response: `{ mint: { usdPrice, priceChange24h } }` |
| 104 | `JUP_DCA_API` | `https://dca-api.jup.ag` | Dollar-cost averaging order management |
| 105 | `JUP_TRIGGER_API` | `https://trigger.jup.ag/v2` | Limit / OCO / OTOCO trigger orders |
| 106 | `JUP_EARN_API` | `https://lend-api.jup.ag/api/v1` | Jupiter Earn (lending) — positions, deposit, withdraw |
| 107 | `JUP_PERPS_API` | `https://perp.jup.ag/v1` | Perpetual futures — positions, open/close |
| 108 | `JUP_LOCK_API` | `https://lock.jup.ag/v1` | Token vesting escrow — create, claim, list |
| 109 | `JUP_PORTFOLIO_API` | `/portfolio` | Aggregated wallet snapshot across all Jupiter products |
| 110 | `JUP_SEND_API` | `/send/v1` | Invite-link token transfers — craft-send, craft-clawback |
| 111 | `JUP_STUDIO_API` | `/studio/v1` | Dynamic Bonding Curve pool creation + fee claiming |

Centralised here — any Jupiter API migration requires only one-line changes in this block.

---

### Lines 141–200 · Token Registry — `TOKEN_MINTS` + `TOKEN_DECIMALS`

| Lines | Constant | What it is | What it does |
|---|---|---|---|
| 141–175 | `TOKEN_MINTS` | Object: `{ SYMBOL: "base58MintAddress" }` for ~30 common tokens | First-pass cache for resolveToken(). Prevents a Jupiter token search round-trip for SOL, USDC, USDT, JUP, BONK, WIF, JLP, mSOL, JitoSOL, JupSOL, WBTC, ETH, and other common tokens |
| 176–199 | `TOKEN_DECIMALS` | Object: `{ SYMBOL: number }` for same ~30 tokens | Used when converting raw lamport/base-unit amounts to human-readable values. USDC = 6, SOL = 9, most SPL tokens = 6. Fallback for unknown tokens: 6 |

---

### Lines 200–258 · Theme Object + `createAppKit()` Initialisation

| Lines | What it is | What it does |
|---|---|---|
| 201–230 | `T` (Theme object) | Single source of truth for every colour in the UI: `bg` (deep navy), `surface`, `surface2`, `border`, `border2`, `text1/2/3`, `accent` (#c7f284 Jupiter green), `red`, `redBd`. Changing `T.accent` recolours the entire app |
| 231–258 | `createAppKit({...})` | Runs at module level (outside React) — must be called before any component mounts. Registers the Reown wallet modal with the Solana adapter, project ID from `VITE_REOWN_PROJECT_ID`, and `solanaMainnet` network config |

---

### Lines 260–310 · AI System Prompt — Identity + Jupiter Protocol Knowledge

| Lines | What it is | What it does |
|---|---|---|
| 261–263 | Persona definition | Sets Claude's identity as "ChatFi — a sharp, honest AI trading assistant." Tone: "thoughtful, direct, warm — never hyped." Lists all capabilities the AI should claim access to |
| 265–273 | `JUPITER LEND KNOWLEDGE` block | Teaches the AI the exact mechanics of Earn, Borrow, Multiply (looping), Unwind (deleverage), Repay-with-Collateral, and Flashloans. Prevents hallucination on Jupiter-specific lend details |
| 274–278 | `JUPITER SEND KNOWLEDGE` | Invite-link flow, clawback mechanics, use cases (gifting, payroll, airdrops, onboarding). Ensures AI describes the "no wallet needed" mechanic accurately |
| 280–286 | `JUPITER PERPS KNOWLEDGE` | Leverage limits (100x), collateral tokens per market (USDC for shorts; SOL/BTC/ETH for longs), fee structure (0.06% open/close, hourly borrow), liquidation mechanics |
| 288–294 | `JUPITER STUDIO KNOWLEDGE` | DBC pool creation params, creator fee auto-accumulation, claim flow via `FETCH_STUDIO_FEES` |
| 296–302 | `JUPITER LOCK KNOWLEDGE` | Cliff + linear vesting semantics, SOL cannot be locked (AI suggests USDC/JUP instead), `FETCH_LOCKS` shows claimable amounts |
| 305–310 | `JUPITER ROUTING KNOWLEDGE` | Explains `SHOW_ROUTE` — DEX path inspection: which AMMs, split %, price impact per hop. Powered by Jupiter aggregator across Orca, Raydium, Meteora, Lifinity |

---

### Lines 311–370 · AI Output Format Contract + Action Registry (Part 1)

| Lines | What it is | What it does |
|---|---|---|
| 311–316 | `CRITICAL OUTPUT FORMAT` | Instructs the AI: entire response must be a single raw JSON object starting with `{` and ending with `}`. No markdown fences, no preamble. Format: `{ "text": "...", "action": null, "actionData": {} }`. This is the binding contract between AI output and the frontend router |
| 319 | `action: null` | Plain chat response — no UI action triggered |
| 320 | `FETCH_PRICE` | `actionData: { tokens: ["SOL","JUP"] }` — batch price fetch via Jupiter Price API v3 |
| 321 | `FETCH_TOKEN_INFO` | `actionData: { symbol: "BONK" }` — full deep-dive: price, supply, holders, liquidity, 24h stats, audit score, social links |
| 322 | `FETCH_TOKEN_TAG` | `actionData: { tag: "verified"|"lst", limit: 20 }` — list tokens by Jupiter tag |
| 323 | `FETCH_TOKEN_CATEGORY` | `actionData: { category: "toptrending"|"toporganicscore"|"toptraded", interval: "5m"|"1h"|"6h"|"24h", limit: 20 }` |
| 324 | `FETCH_TOKEN_RECENT` | `actionData: { limit: 30 }` — newest tokens with first liquidity pool |
| 325 | `CHECK_TOKEN_VERIFY` | `actionData: { symbol: "BONK" }` — Jupiter express verification eligibility |
| 326 | `FETCH_PORTFOLIO` | `actionData: { wallet: "address_or_connected" }` — full DeFi snapshot |
| 327–332 | `SHOW_SWAP` | `actionData: { from, to, amount, amountUSD, portion, reason }`. Amount rules: `portion` ("all"/"half"/"quarter"/"N%") OR `amount` (token units) OR `amountUSD` (dollar value) — only one non-null |
| 333–338 | `SHOW_TRIGGER_V2` | `actionData: { orderType: "single"|"oco"|"otoco", from, to, amount, triggerCondition, triggerPriceUsd, tpPriceUsd, slPriceUsd, slippageBps, expiryDays }`. Min $10. Default 7-day expiry |
| 339 | `FETCH_TRIGGER_ORDERS` | `actionData: { state: "active"|"past" }` — list orders with cancel buttons |
| 340 | `SHOW_RECURRING` | `actionData: { from, to, amountPerCycle, numberOfOrders, intervalSecs, reason }`. intervalSecs: 60=1min, 86400=1day, 604800=1wk |
| 341 | `FETCH_RECURRING_ORDERS` | `actionData: { status: "active"|"history" }` — DCA orders with cancel buttons |
| 342 | `SHOW_PREDICTION` | `actionData: { teamA, teamB, sport, league, analysis, searchQuery }` — prediction market browser. Always sets `searchQuery` |
| 343 | `FETCH_PREDICTIONS` | `actionData: { sport, query, limit }`. Infers category from intent: "football" → "sports", "crypto" → "crypto", "election" → "politics" |
| 344 | `PLACE_PREDICTION` | `actionData: { searchQuery, outcome, side: "yes"|"no", amount }` — direct bet placement. Min $5 |
| 345 | `BASKET_PREDICTION` | `actionData: { bets: [...] }` — up to 10 bets in one command |
| 346 | `FETCH_EARN` | `actionData: { filter, vault, amount, portion }` — Jupiter Earn vaults + user positions |
| 347 | `SET_YIELD_VAULT` | `actionData: { buyToken, autoHarvest: true|false }` — opens vault setup panel pre-filled |
| 348 | `SHOW_YIELD_VAULT` | `actionData: {}` — show active vault stats and edit options |
| 349 | `HARVEST_YIELD` | `actionData: { vaultId, sym }` — manual harvest from a specific vault |
| 350 | `MIGRATE_EARN` | `actionData: { fromSym, toSym, fromApy, toApy }` — move earn position to higher-APY pool |
| 351 | `EARN_DEPOSIT` | `actionData: { sym, amount, portion }` — direct deposit into Jupiter Earn vault |
| 352 | `EARN_WITHDRAW` | `actionData: { sym, amount, portion }` — withdraw from Earn vault |
| 353 | `SHOW_MULTIPLY` | `actionData: { asset, leverage }` — leveraged looping (Coming Soon) |
| 354 | `SHOW_BORROW` | `actionData: { collateral, debt, colAmount, borrowAmount, reason }`. Lists 7 available vaults |
| 355 | `SHOW_LEND_POSITIONS` | `actionData: {}` — open borrow/multiply positions with unwind buttons + earn with withdraw |
| 356 | `CLAIM_PAYOUTS` | `actionData: {}` — fetch and display claimable prediction winnings |
| 357 | `SHOW_SEND` | `actionData: { token, amount, reason }` — Jupiter Send invite-link panel |
| 358 | `FETCH_SEND_HISTORY` | `actionData: { type: "pending"|"history" }` — pending invites (with clawback) or full history |
| 359 | `SHOW_PERPS` | `actionData: { market, side, collateral, leverage, reason }` — perp position (Coming Soon) |
| 360 | `FETCH_PERPS_POSITIONS` | `actionData: {}` — open perps with close/increase/decrease buttons |
| 361 | `SHOW_STUDIO` | `actionData: { name, symbol, supply, decimals, description, website, twitter }` — DBC pool creation |
| 362 | `FETCH_STUDIO_FEES` | `actionData: {}` — unclaimed creator trading fees for all DBC pools |
| 363 | `SHOW_LOCK` | `actionData: { token, amount, cliffDays, vestingDays, recipient }`. Native SOL rejected — AI suggests USDC/JUP |
| 364 | `FETCH_LOCKS` | `actionData: {}` — all locks where user is creator or recipient, with claimable amounts |
| 365 | `SHOW_ROUTE` | `actionData: { from, to, amount }` — DEX route inspector: AMMs, split %, price impact per hop |
| 366 | `FETCH_XSTOCKS` | `actionData: { limit, sort }` — tokenized real-world stocks (RWA) on Solana |
| 367 | `SET_PRICE_ALERT` | `actionData: { token, condition: "above"|"below", price }` — in-session price alert |
| 368 | `DETECT_VOLATILITY` | `actionData: { token, triggerType, condition, thresholdPct, thresholdValue, autoOrder, from, amount }` — metric monitor polled every 30s. `autoOrder:true` places OCO on trigger |
| 369 | `FETCH_VOL_MONITORS` | `actionData: {}` — list active monitors with cancel buttons |

---

### Lines 370–530 · Action Registry (Part 2) + Natural Language Routing Rules

| Lines | What it is | What it does |
|---|---|---|
| 370–390 | `COPY_TRADE` | `actionData: { wallet }` — fetch and display recent swaps from any wallet address with Mirror buttons |
| 371 | `WALLET_ANALYSIS` | `actionData: { wallet }` — full trading profile: style (scalper/swing/position), top tokens, sentiment (accumulating/distributing), avg trade size |
| 372 | `SHOW_LEADERBOARD` | `actionData: {}` — top Solana traders by 7d realised PnL from Helius data |
| 373 | `FETCH_LEADERBOARD` | `actionData: {}` — forces a fresh leaderboard fetch bypassing 1h cache |
| 374 | `SHOW_TRADE_JOURNAL` | `actionData: {}` — local trade history with estimated PnL per swap |
| 375 | `BASKET_SWAP` | `actionData: { trades: [{from, to, amount, amountUSD, portion}] }` — buy/sell multiple tokens in one command |
| 376 | `SWAP_ALL_WALLET` | `actionData: { to, exclude: [] }` — sell everything except excluded tokens into target |
| 377 | `SCAN_PRED_ODDS` | `actionData: { minEdge, sortBy }` — scan all prediction markets, score by edge (|implied prob - fair prob|) |
| 378 | `AUTO_PRED_BET` | `actionData: { maxAmount, dryRun }` — auto-place bets on best-edge markets up to maxAmount |
| 379 | `CHAINED_ACTIONS` | `actionData: { steps: [{action, actionData}] }` — multi-step execution engine, up to 15+ steps |
| 380 | `FETCH_WALLET_TRADES` | `actionData: { wallet, limit }` — recent swap history for any wallet via Helius |
| 381 | `SWAP_QUOTE` | `actionData: { from, to, amount }` — live quote without executing |
| 382 | `SHOW_WALLET_CONNECT` | `actionData: {}` — opens the wallet connect modal |
| 383 | `SHOW_DIRECT_MODE` | `actionData: {}` — toggles direct-action mode bypassing AI |
| 420–530 | Routing rules | Natural language → action mappings the AI must follow. Examples: "swap X to Y" → `SHOW_SWAP`, "buy $N of X" → `SHOW_SWAP amountUSD`, "all my X" → `portion:"all"`, "flip it" → `BASKET_SWAP`, "park it" → `EARN_DEPOSIT`, "loop it" → `SHOW_MULTIPLY`, "nuke my bags" → `SWAP_ALL_WALLET` |

---

### Lines 530–560 · Step Ordering Rules

| Lines | What it is | What it does |
|---|---|---|
| 545–560 | 16 step-ordering rules | Governs the sequence of steps in CHAINED_ACTIONS. Key rules: (1) Research/info steps first, (2) Sells before buys, (3) Sells grouped into one BASKET_SWAP, (4) Earn deposit after acquiring the asset, (5) Lock after acquiring the token, (6) Alerts/monitors/portfolio always last. These rules prevent "buy SOL before selling USDC" type ordering errors |

---

### Lines 560–660 · Mega Chain Examples (A–E) + Critical Chain Rules

| Lines | What it is | What it does |
|---|---|---|
| 563–578 | Example A (12 steps) | "research BONK, sell half SOL + all BONK, buy JUP + WIF equally, send quarter JUP, lock half JUP 6mo, earn USDC, find best APY + migrate, set yield vault auto-harvest SOL, price alert SOL $200, show portfolio." Demonstrates the full ordering rules in a realistic 12-step chain |
| 580–593 | Example B (11 steps) | Leveraged strategy: swap → long SOL perp 5x → OCO TP/SL → DCA JUP daily → borrow USDC against SOL → earn → migrate → vol monitor + auto-OCO → perps positions → portfolio |
| 595–606 | Example C (10 steps) | Token launch: Studio → lock team 20% → send airdrop 10% → check fees → buy own token → limit order → scan odds → auto-bet → trade journal |
| 608–624 | Example D (13 steps) | Copy trade + full portfolio overhaul across all Jupiter products |
| 626–639 | Example E (10 steps) | Prediction + earn + send + lend positions combo |
| 641–659 | Critical chain rules | NEVER cap steps, NEVER split across turns, NEVER ask for clarification unless genuinely ambiguous, NEVER reorder steps, slang maps to actions, "check everything at the end" → append FETCH_PORTFOLIO + SHOW_TRADE_JOURNAL |

---

### Lines 660–750 · Full Feature List (AI Help Response)

| Lines | What it is | What it does |
|---|---|---|
| 663–750 | `FULL FEATURE LIST` | The exhaustive catalogue Claude returns when a user asks "what can you do?". Grouped by category: 🔄 TRADING (swaps, basket, limit, OCO, OTOCO, DCA, perps, route viewer, quote), 💰 EARN & LEND (Earn, Borrow, Multiply, Flashloans, JupSOL), 📊 PORTFOLIO & RESEARCH (snapshot, token deep-dive, trending, new, verified, LST, xStocks, trade journal, price alerts, verification, wallet analyser), 🔁 COPY TRADING (mirror wallet, behaviour analysis, leaderboard), 🚀 TOKEN TOOLS (Studio, Lock, Send), 🎯 PREDICTION MARKETS (betting, odds scan, auto-bet, payouts, basket), ⚙️ AUTOMATION (Yield Vault, Volatility Monitor, Price Alerts, Autopilot Rebalance) |

---

### Lines 750–896 · `renderMarkdown()` — Custom DeFi Markdown Renderer

| Lines | What it is | What it does |
|---|---|---|
| 750 | `renderMarkdown(text)` | Converts the AI's text response into rich HTML. Not a standard markdown parser — a custom token-by-token renderer that produces DeFi-specific UI components inline with text |
| 760–790 | `inlineMd()` helper | Handles inline formatting: `**bold**` → `<strong>`, `*italic*` → `<em>`, `` `code` `` → `<code>`, `[text](url)` → `<a target="_blank">`, `~~strike~~` → `<del>` |
| 795–840 | Horizontal rule detection | Lines of dashes/equals → branded `<hr>` with accent colour gradient |
| 841–870 | Table detection | Lines starting with `|` forming a markdown table → HTML `<table>` with styled header and data rows |
| 871–940 | Numbered list detection + token cards | Consecutive lines matching `N. content` → token cards if content has token data (logo from `img.jup.ag/tokens/{mint}`, symbol, name, verified checkmark SVG, price, 24h change badge, volume, safety score). Click handler: `window.__chatfiSend('SYMBOL info')` — clicking any token card in a list immediately triggers a token deep-dive |
| 943–948 | Section header detection | ALL-CAPS lines ending with `:` → uppercase small-caps section labels |
| 950–955 | Bullet list | Lines starting with `-` or `•` → `▸` accent bullet (never raw bullet character) |
| 957–962 | Blank line | → 6px vertical spacer `<div>` |
| 964–975 | Price line shortcut | Lines matching `TOKEN: $price` → price card with large number, muted label, optional inline change text |
| 977–1027 | `[swap-card]` custom token | AI embeds `[swap-card\|from\|to\|sent\|out\|fee\|sig\|status]` marker → full swap confirmation card with green ✓ or red ✗, Sent → Received layout, fee line, signature copy button + Solscan link |
| 1029–1031 | Default fallback | Unmatched lines → plain text `<span>` paragraph |

---

### Lines 1037–1131 · `TokenPicker` Component

| Lines | What it is | What it does |
|---|---|---|
| 1038 | `TokenPicker({ value, onSelect, jupFetch })` | Live-search dropdown for selecting any Solana token. Used in swap, earn deposit/withdraw, yield vault setup, lock, and send panels |
| 1039–1043 | State | `query` (display text), `results` (search hits), `busy` (loading), `focused` (dropdown visible) |
| 1048–1084 | `search()` function | 300ms debounce → fires two parallel Jupiter token searches: V2 (verified tokens) + V1 (all routable including memes). Results merged with deduplication by address. Sort: exact symbol match → V2 before V1 → 24h volume descending. Top 50 kept |
| 1087–1094 | `pick(t)` function | Called on dropdown item click. Extracts symbol, mint address (V2 uses `"id"`, V1 uses `"address"`), decimals. Calls `onSelect(sym, mint, decimals)` to update parent state |
| 1096–1130 | Render | Input with focus/blur managing dropdown visibility. `onBlur` uses `setTimeout(200ms)` to allow `mousedown` on results before blur fires — prevents dropdown closing before click registers |

---

### Lines 1133–1264 · `TokenMiniChart` Component

| Lines | What it is | What it does |
|---|---|---|
| 1134 | `TokenMiniChart({ mint, T })` | SVG sparkline chart for any token. Used in the token info deep-dive panel |
| 1135–1138 | State | `data` (array of `{t, p}` points), `loading`, `range` (1D/7D/30D). `abortRef` cancels in-flight fetches on mint/range change |
| 1149–1159 | `tryGeckoTerminal()` | Fetches OHLCV candles — no API key. Granularity adapts: 1D → hourly, 7D → 4h, 30D → daily |
| 1161–1169 | `tryCoinGecko()` | Fallback when GeckoTerminal has no data. Fetches `/market_chart`, downsamples to 36 points |
| 1171–1174 | Fetch chain | `tryGeckoTerminal().catch(() => tryCoinGecko())` — if both fail, shows "No chart data" placeholder |
| 1196–1263 | Render | SVG `<polyline>` + area fill with gradient. Green if price up, red if down. Range buttons (1D/7D/30D), % change label, start/end time axis, dot at current price |

---

### Lines 1266–1433 · `TrendingTicker` Component

| Lines | What it is | What it does |
|---|---|---|
| 1267 | `TrendingTicker({ onTokenClick })` | Live scrolling ticker bar at the top of the app. Shows top 15 trending tokens with live prices and 24h change |
| 1271–1312 | `useEffect` load | Fetches top 20 trending from Jupiter Tokens v2 `toptrending/24h`. Extracts mints, batch-fetches prices from Jupiter Price API v3. Enriches with `{ price, priceChange24h }`. Filters to tokens with valid price, takes top 15. Refreshes every 60 seconds |
| 1314 | Early return | Returns `null` until loaded — no flash of empty bar |
| 1316–1321 | `fmtPrice()` | Price formatter covering all magnitudes: `≥1000` → integer with commas, `≥1` → 2 decimals, `≥0.01` → 4 decimals, `≥0.000001` → 8 decimals trimmed, else → scientific notation |
| 1324–1325 | Duplicate list | `items = [...tokens, ...tokens]` — doubles the list so the CSS marquee loops seamlessly without a visible jump at the midpoint |
| 1327–1432 | Render | Fixed position bar (top: 58px, below the 58px nav header). Backdrop-blur background. "TRENDING" label. CSS `tickerScroll` animation runs 45s linear infinite. Hover pauses the animation. Each token is a `<button>` calling `onTokenClick(symbol)` → fires `"${symbol} info"` in chat |

---

### Lines 1435–1812 · Blog Posts Data + Landing Page CSS

| Lines | What it is | What it does |
|---|---|---|
| 1436–1798 | `BLOG_POSTS` array | 6 embedded blog articles: "What is ChatFi?", swap guide, earn/yield guide, prediction markets, DCA strategy, Jupiter Lock guide. Each has `id, title, category, readTime, date, summary, sections[], tips[]`. No CMS — content lives in the component, zero external dependency |
| 1799–1812 | Landing page CSS injection | `<style>` block appended to `document.head` at module load. All classes prefixed `lp-` to avoid collision with app CSS. Key animations: `lp-floatUp` (hero slide in), `lp-spin` (gradient border rotation via CSS `@property --lp-rotate`), `lp-pulse` (live status dot), `tickerScroll` (marquee). `lp-mockup-wrap` creates the spinning rainbow gradient border effect around the chat mockup |

---

### Lines 1906–2200 · `LandingPage` Component

| Lines | What it is | What it does |
|---|---|---|
| 1906 | `LandingPage({ onEnter })` | Full marketing page shown to unauthenticated visitors. `onEnter()` transitions to the chat UI |
| 1910–1940 | Nav | ChatFi logo, nav links (Features, How it Works, Blog, Docs), "Launch App" CTA |
| 1942–2010 | Hero | Animated "● LIVE ON SOLANA" badge, H1 with accent-coloured word, subtitle, two CTA buttons (Launch App + Watch Demo), animated mockup showing fake chat + swap confirmation card |
| 2010–2080 | Stats | 4 stat cards (liquidity sourced, tokens, DEXs, chains) + mini live price ticker |
| 2080–2150 | Features grid | 8 `lp-card` feature cards: Swap, Earn & Lend, Predictions, Portfolio, Copy Trading, Token Tools, DCA & Automation, Perpetuals |
| 2150–2200 | Example commands | Grid of `lp-cmd` chips showing sample natural language commands the user can type |

---

### Lines 2200–2515 · Earn Position Card + Yield Vault Prompt + Auto-Harvest Toggle

| Lines | What it is | What it does |
|---|---|---|
| 2200–2340 | `EarnPositionCard` component | Renders a single Jupiter Earn position in the portfolio panel. Shows symbol, deposited amount in green, APY, and auto-harvest toggle |
| 2341–2400 | `persistHarvest(val)` | Saves auto-harvest preference to both localStorage (instant, survives reload) and Firebase via `POST /api/yield-vault?action=set-harvest-pref`. If API fails, localStorage value is preserved — user experience is unaffected |
| 2402–2454 | `toggleAutoHarvest()` | Three paths: (1) No vault + turning ON → confirm dialog prompting Yield Vault setup. (2) Vault exists → calls `enable-auto-harvest` or `disable-auto-harvest` API. (3) No vault + turning OFF → clears localStorage pref only |
| 2456–2480 | `EarnPositionCard` render | Earn token symbol, deposited amount, auto-harvest toggle pill, Withdraw button (sends "show my earn positions" to chat) |
| 2483–2514 | `YieldVaultPromptCard` | Upsell card: "Jupiter Earn Position Detected." Feature chips: "Auto-detects yield", "No action needed", "Any target token", "Cancels with position". CTA: "Set Yield Vault" |

---

### Lines 2516–2844 · Yield Vault Panel Components

| Lines | What it is | What it does |
|---|---|---|
| 2517–2522 | `formatAPY(apy)` | Converts Jupiter's APY format (basis points from lend-api, e.g. 41500 = 4.15%) to display percentage. Handles both raw decimal (0.0415) and basis-point (41500) forms |
| 2523–2600 | `VaultCard` state | `editing` (form vs stats view), `saving`, `error`, `autoHarvest`, `harvestToggling` |
| 2601–2680 | `VaultCard` edit mode | Form: `thresholdUSD` input (minimum yield in USD to trigger harvest), `targetToken` picker via `TokenPicker`. `handleSave()` calls `PATCH /api/yield-vault` |
| 2681–2843 | `VaultCard` view mode | Stats: "Times Triggered" + "Total Rotated" (cumulative USD). Last swap date + Solscan link. Auto-harvest toggle (backed by vault-specific enable/disable API). "Cancel Vault" button (soft-delete → status: "cancelled"). "Connect Telegram Alerts" — disabled if already linked, else triggers magic-link flow |
| 2845–2900 | `YieldVaultTracker` | Panel showing all vaults and un-vaulted earn positions. Splits into: configured (have vault) and unconfigured (have earn position, no vault). Un-vaulted positions get a simplified harvest toggle backed by `harvest_prefs` Firestore collection |

---

### Lines 2900–3200 · Main Feature Panel State Declarations

| Lines | What it is | What it does |
|---|---|---|
| 2900–2960 | `PortfolioPanel` | Full DeFi snapshot panel: tokens, earn positions, DCA orders, trigger orders, perp positions, locked positions, yield vaults — each section with relevant action buttons |
| 2960–3100 | Swap panel state | `swapCfg` (fromMint, toMint, amount, slippage), `swapQuote` (Jupiter quote response), `swapStatus` (null/signing/done/error) |
| 3100–3200 | Trigger panel state | `triggerCfg` with `orderType` (single/oco/otoco), token pair, amounts, prices, expiry |
| 3200–3250 | Feature panel flags (all features) | One state pair per feature: `showX` (boolean) + `xCfg` (config object) + `xStatus` (null/signing/done/error). Features: swap, trigger, recurring, perps, borrow, earn, earnDeposit, earnWithdraw, earnUserPositions |
| 3211–3229 | Yield Vault state | `showYieldVault`, `yieldVaultPositions`, `yieldVaultCfg` (`{selectedPositions, thresholdUSD, targetTokenSymbol, targetTokenMint, targetTokenDecimals}`), `yieldVaultStatus`, `yieldVaultSaved`, `yieldVaultSavedRef` (useRef mirror for async callbacks), `yieldVaultNotifs`, `showYieldVaultTracker`, `showYieldRotator`, `telegramLinked`, `telegramLinking`, `showTelegramPrompt` |
| 3232–3250 | Studio + Lock state | `showStudio`, `studioCfg`, `studioImage` ({file, dataUrl, type}), `studioStatus`, `studioResult` ({mintAddress, txSig, poolAddress}), `studioFees`, `showStudioFees`, `showLock`, `lockCfg`, `lockStatus`, `lockResult`, `showLocks`, `lockFilter`, `lockList`, `locksLoading`, `claimingLock` |
| 3252–3280 | Monitor state | `showRoute`, `routeData`, `routeLoading`, `priceAlerts`, `alertIntervalRef`, `volMonitors`, `showVolMonitors`, `priceHistoryRef` ({[SYM]: [{price, ts}]} rolling window), `volIntervalRef`, `volMonitorsRef` |
| 3282–3294 | Prediction CLI state | `showPredCLI`, `predCLIMarkets`, `predCLILoading`, `predCLIFilter` ({category, minEdge, sortBy}), `predCLILog`, `predCLIBetting`, `appendCLILog()` (caps at 200 lines) |
| 3296–3314 | UI state | `tradeJournal`, `copyTradeData`, `showCopyTrade`, `leaderboard`, `leaderboardLoading`, `leaderboardCachedAt`, `leaderboardExpanded`, `activePlugin`, `jupDocs`, `sidebarOpen`, `directMode`, `pendingDirectAction`, `tokenWizard`, `chatHistory`, `deferredPrompt`, `showHowItWorks`, `showSocialsNav`, `showBlog`, `blogPostIndex` |
| 3318–3320 | Token cache | `tokenCacheRef` (grows as user searches any token), `tokenDecimalsRef` — both seeded from `TOKEN_MINTS`/`TOKEN_DECIMALS` constants |
| 3321–3324 | Refs | `histRef` (conversation history in sessionStorage — survives hot reload, resets on tab close), `endRef` (chat scroll anchor), `textareaRef` (input focus) |

---

### Lines 3326–3480 · Side Effects — PWA Install, QR Code, Swap Quote Debounce

| Lines | What it is | What it does |
|---|---|---|
| 3326–3344 | PWA install banner detection | Checks if already installed (standalone display mode, `android-app://` referrer, or localStorage flag). iOS: shows "Add to Home Screen" guide after 1.5s. Android/Desktop: listens for `beforeinstallprompt`, stores prompt, shows native install banner |
| 3420–3470 | WalletConnect QR Code | When `wcStatus === "waiting"` and `wcUri` is set, dynamically loads `qrcode.js` from jsDelivr CDN and renders the WalletConnect URI as a green-on-dark QR code into a `<canvas>` ref |
| 3472–3477 | Swap quote debounce | Watches `swapCfg.fromMint`, `toMint`, `amount`, `showSwap`. After 600ms of no changes, calls `fetchSwapQuote()`. The `clearTimeout` cleanup prevents stale quote fetches when user is still typing |

---

### Lines 3479–3600 · Core Utility Functions

| Lines | What it is | What it does |
|---|---|---|
| 3482–3490 | `predFetch(url, options)` | Direct browser fetch — bypasses the `/api/jupiter` proxy. Used exclusively for prediction market endpoints because prediction markets must see the user's real IP, not Vercel's US datacenter IP |
| 3493–3509 | `jupFetch(url, options)` | Central Jupiter API client. Routes all requests through `POST /api/jupiter` where the API key is injected server-side. Handles GET/POST, body serialisation, special `apiKey` pass-through for Lend + Studio endpoints, safe text→JSON parse (returns Error on HTML/non-JSON) |
| 3511–3546 | `resolveToken(symbolOrName)` | Converts any symbol ("SOL", "BONK") or raw base58 mint address to `{ mint, decimals }`. Resolution order: (1) in-memory cache hit, (2) base58 address bypass (32–44 char regex), (3) Jupiter V2 token search, (4) Jupiter V1 token search. Results cached in `tokenCacheRef`/`tokenDecimalsRef` for the session |
| 3548–3564 | `fetchPrices(tokens)` | Fetches live USD prices via Jupiter Price API v3. Maps symbol → mint, sends all in one batch request, maps response back from mint → symbol, updates `prices` state. Returns the prices object for immediate use |

---

### Lines 3566–3800 · Wallet Effect + Token Info + Action Handlers (Part 1)

| Lines | What it is | What it does |
|---|---|---|
| 3566–3596 | `walletFull` useEffect | Fires on wallet connect/disconnect. On connect: loads per-wallet localStorage data (alerts, vol monitors, trade journal). Checks Telegram link status via localStorage first (instant), then verifies with Firestore in background to sync cross-device state |
| 3598–3680 | `fetchTokenInfo(symbol)` | Full token deep-dive. Calls Jupiter Tokens V2 API for: `holderCount, circSupply, totalSupply, fdv, mcap, usdPrice, liquidity, stats24h.{priceChange, buyVolume, sellVolume, numBuys, numSells, numTraders}, organicScore, tags`. Also fetches 30d volume from V1 as supplemental. Formats result into markdown string rendered as a rich token card |
| 3680–3750 | `handleFetchPrice(tokens)` | Batch price fetcher for `FETCH_PRICE` action. Resolves each symbol → mint, calls Jupiter Price API v3, formats as a markdown price list rendered as price cards |
| 3750–3800 | `handleShowSwap(actionData)` | Called for `SHOW_SWAP`. Extracts from/to symbols, resolves mints, applies portion logic: `"all"` → wallet balance, `"half"` → balance × 0.5, `"quarter"` → balance × 0.25, `"N%"` → balance × N/100, `amountUSD` → converts via current price. Sets `swapCfg` → debounce fires `fetchSwapQuote()` |

---

### Lines 3800–4200 · Action Handlers — Swap Execution, Send, Lock, Earn

| Lines | What it is | What it does |
|---|---|---|
| 3800–3880 | `executeSwap()` | Transaction builder + signer. (1) POST /api/jupiter quote. (2) POST /api/jupiter swap → builds `VersionedTransaction`. (3) Deserialise base64. (4) Route to wallet signer: AppKit uses `provider.signAndSendTransaction()`, Privy uses `wallet.sendTransaction()`. (5) Confirm via `connection.confirmTransaction()`. (6) Append swap-card to chat + log to trade journal |
| 3880–3960 | Send flow | `executeSend()`: POST /api/send → server derives invite keypair, partial-signs, returns `{ partiallySignedTx, blockhash, lastValidBlockHeight }`. Client deserialises, signs own keypair, broadcasts via `connection.sendRawTransaction()`. Confirms via blockhash strategy. On success: stores inviteCode in localStorage for future clawback |
| 3960–4060 | Lock flow | `executeLock()`: POST /api/lock `{action:"create"}` → server builds `CreateVestingEscrow` transaction with 58-byte instruction + ATA pre-creation. Client signs + broadcasts. Shows escrow PDA address on success |
| 4060–4150 | Earn deposit | `executeEarnDeposit()`: POST /api/jupiter → Jupiter Earn deposit endpoint. Client signs returned transaction. On success: refreshes earn positions, appends confirmation |
| 4150–4200 | Earn withdraw | Same pattern as deposit but calls Earn withdraw endpoint. `portion: "all"` uses full position amount from `earnUserPositions` |

---

### Lines 4200–4600 · Action Handlers — Yield Vault, DCA, Trigger Orders

| Lines | What it is | What it does |
|---|---|---|
| 4200–4300 | `handleSetYieldVault(actionData)` | (1) Fetches active earn positions via Jupiter Earn API. (2) Pre-fills `yieldVaultCfg` with: earnMint, earnSymbol, earnJlMint, depositedAmount from the user's largest position. (3) If `actionData.buyToken` → resolves mint + decimals. (4) If `actionData.autoHarvest` → sets toggle. (5) Opens vault setup panel |
| 4300–4380 | `saveYieldVault()` | (1) POST /api/yield-vault. (2) Firestore writes `yield_vaults` doc. (3) Fetches updated vault list. (4) Sends "vault created" Telegram notification if linked |
| 4380–4430 | `handleHarvestYield(actionData)` | (1) Finds vault by `vaultId` from `yieldVaultSaved`. (2) POST /api/yield-vault?action=harvest. (3) If `autoHarvest` delegate: server executes swap, returns `txSig`. (4) If manual: shows confirmation with yield amount and target token |
| 4430–4520 | DCA setup | `handleShowRecurring()` pre-fills from AI actionData. `executeRecurring()`: POST /api/jupiter → DCA API create → client signs `VersionedTransaction` → confirmation card in chat |
| 4520–4600 | Trigger/Limit orders | `handleShowTrigger()` + `executeTrigger()`. OCO: creates two orders sharing one input deposit (TP above + SL below). OTOCO: entry trigger auto-creates OCO on fill. All orders client-signed. `triggerJwt` forwarded as Bearer token via the proxy |

---

### Lines 4600–5200 · Action Handlers — Predictions, Portfolio, Copy Trade

| Lines | What it is | What it does |
|---|---|---|
| 4600–4720 | Prediction flow | `handleShowPrediction()`: `predFetch()` (direct browser) hits Jupiter prediction API, displays odds browser with team/outcome cards. `handlePlacePrediction()`: resolves outcome + side, places bet, signs transaction. `BASKET_PREDICTION`: loops up to 10 bets sequentially, awaiting confirmation before next |
| 4720–4830 | Odds scanner | `SCAN_PRED_ODDS`: fetches all open markets, computes edge = `|implied probability - fair probability|`. Filters by `minEdge` (default 5%), sorts descending. `AUTO_PRED_BET`: iterates through markets, places bets up to `maxAmount` total, logs each action to `predCLILog` in CLI-style terminal output |
| 4830–4920 | Claim payouts | `CLAIM_PAYOUTS`: fetches claimable prediction positions, renders each with "Claim" button. Each claim builds + signs a transaction via prediction API claim endpoint |
| 4920–5050 | `handleFetchPortfolio()` | (1) GET /api/portfolio?wallet= (60s timeout). (2) Merges `yieldVaultSaved` with Firestore vault data. (3) Sets `portfolioData` → triggers `PortfolioPanel` render. (4) If earn positions exist + no vaults → shows `YieldVaultPromptCard` |
| 5050–5200 | Copy trade | `handleCopyTrade()`: GET /api/wallet-trades for target wallet. Renders trade cards with "Mirror" button → pre-fills `SHOW_SWAP`. `SHOW_LEADERBOARD`: GET /api/leaderboard → rank cards with PnL, volume, win rate, .sol name, "Mirror" button |

---

### Lines 5200–5800 · Action Handlers — Studio, Lock View, Route, Monitors

| Lines | What it is | What it does |
|---|---|---|
| 5200–5340 | Studio flow | `executeStudio()`: builds FormData (name, symbol, description, website, twitter, preset, image file). POST /api/studio-submit (raw multipart proxy). On success: `{ mintAddress, poolAddress, txSig }` → result card with Solscan link |
| 5340–5430 | Studio fees | `FETCH_STUDIO_FEES`: Jupiter Studio fees endpoint → array of DBC pools with unclaimed SOL + token amounts. "Claim" button builds + signs fee claim transaction |
| 5430–5550 | Lock view | `handleFetchLocks()`: POST /api/lock `{action:"accounts"}` → scans all escrow PDAs (sender OR recipient). Returns `{ mint, sender, recipient, cliffEnd, totalRaw, claimableRaw, vestedPercent }`. Filter tabs: All / Claimable / Locked / Claimed. "Claim Tokens": POST /api/lock `{action:"claim"}` → client signs. `claimingLock` state manages per-lock spinner |
| 5550–5620 | Route Inspector | `handleShowRoute()`: fetches Jupiter quote, stores full `quoteResponse` in `routeData`. Renders `routePlan[]` as hop-by-hop table: AMM name, token pair, amounts, price impact % |
| 5620–5750 | Price Alert system | `handleSetPriceAlert()`: adds `{ token, condition, price, triggered: false }` to `priceAlerts` + localStorage keyed by wallet. `setInterval(30s)`: fetches prices, checks each alert. On trigger: in-chat notification, marks `triggered`, removes from active |
| 5750–5800 | Volatility Monitor | `handleDetectVolatility()`: adds monitor to `volMonitors`. 30s polling loop: (1) Fetch current price → append to `priceHistoryRef` rolling window. (2) Compute rolling std-dev. (3) `triggerType:"volatility"` → fires if σ/mean > `thresholdPct/100`. (4) Other types → fires on condition/threshold cross. (5) `autoOrder:true` → auto-creates OCO (TP = current + 2σ, SL = current - 1.5σ) |

---

### Lines 5800–7000 · `send()` Function — The AI Message Pipeline

| Lines | What it is | What it does |
|---|---|---|
| 5800 | `send(userText)` | The core function called for every user message. The entire AI → action pipeline. ~1200 lines because it contains the complete `CHAINED_ACTIONS` execution engine |
| 5810–5840 | Input validation | Trims message, prevents empty sends. Appends user bubble to chat. Shows typing indicator |
| 5840–5900 | System prompt builder | Starts with `SYSTEM_PROMPT` constant, appends live context: wallet address, current token prices, wallet balances, active earn positions + APYs, active yield vaults, DCA orders, trigger orders, vol monitors, price alerts, trade journal count. Ensures AI knows user's full current state without re-asking |
| 5900–5960 | POST /api/claude | Sends `{ model, max_tokens:1024, system: fullSystemPrompt, messages: histRef.current }`. `histRef` is the rolling conversation history in sessionStorage |
| 5960–6020 | Response parse | Raw text from Claude parsed as JSON `{ text, action, actionData }`. If JSON parse fails → `text` used as-is, `action` = null |
| 6020–6100 | Single action routing | Large `if/else` chain: `"FETCH_PRICE"` → `handleFetchPrice()`, `"SHOW_SWAP"` → `handleShowSwap()`, `"SET_YIELD_VAULT"` → `handleSetYieldVault()`, etc. ~40 action handlers routed here |
| 6100–6300 | `CHAINED_ACTIONS` executor | `steps = actionData.steps` (array of `{action, actionData}`). For each step: (1) Appends step-separator message showing current step #. (2) Calls matching handler. (3) For transaction steps (SHOW_SWAP, SHOW_SEND, etc.): awaits user wallet approval before proceeding. (4) On error: logs, offers retry or skip. (5) After all steps: summary message |
| 6300–6400 | Direct Mode | When `directMode === true`: bypasses Claude, runs `handleDirectMessage()` regex parser. Patterns: `swap N X to Y` → `handleShowSwap`, `buy $N of X` → amountUSD swap, `send N X` → `handleShowSend`, `earn X` → earn deposit, `portfolio` → `handleFetchPortfolio`. Unmatched → falls through to AI |

---

### Lines 7000–9000 · UI Render — Chat Window, Input Bar, Feature Panels

| Lines | What it is | What it does |
|---|---|---|
| 7000–7100 | Chat message render loop | Maps `messages` state to chat bubbles. `role:"user"` → right-aligned bubble. `role:"assistant"` → `renderMarkdown()` → rich HTML via `dangerouslySetInnerHTML`. Loading: three-dot pulse while AI responds |
| 7100–7200 | Suggestion chips | Shown when chat is empty or after first message. Sources from `PLUGIN_SUGGESTION_GROUPS` + hardcoded defaults. Clicking calls `send(suggestion)` |
| 7200–7350 | Input bar | Textarea (auto-resize, Enter sends, Shift+Enter newlines), voice input button (Web Speech API), send button. `textareaRef` auto-focuses on mount and after each AI response |
| 7350–7500 | Header / Nav (fixed 58px) | ChatFi logo, connected wallet badge (first 4 + last 4 chars, copy on click), disconnect button, Direct Mode ⚡ toggle, sidebar hamburger, connect button |
| 7500–7700 | Sidebar | Chat history list, "New Chat" button (clears messages + `histRef`), feature quick-links (Portfolio, Leaderboard, Earn, Studio), plugin panels, How It Works modal, Socials nav, Blog modal, Direct Mode toggle |
| 7700–9000 | Feature panel conditional renders | All panels mounted in the DOM tree (not lazy-loaded) — avoids mount delay when triggered. Pattern: `{showX && <XPanel onClose={() => setShowX(false)} ... />}` for SwapPanel, TriggerPanel, RecurringPanel, EarnPanel, YieldVaultPanel, YieldVaultTracker, StudioPanel, LockPanel, SendPanel, PortfolioPanel, CopyTradePanel, LeaderboardPanel, RouteInspector, PredictionBrowser, PredCLI, VolMonitorPanel, TelegramLinkModal, InstallBanner, BlogModal, HowItWorksModal |

---

### Lines 9000–12000 · Feature Panel Implementations (Swap, Trigger, Earn, Lock, Send)

| Lines | What it is | What it does |
|---|---|---|
| 9000–9400 | SwapPanel | `TokenPicker` for from/to. Amount input + MAX button. Slippage: auto / 0.1% / 0.5% / 1% / custom. Live quote showing output amount, price impact, route summary. Warning: yellow >1%, red >3%. Confirm → `executeSwap()`. Shows swap-card result after execution |
| 9400–9800 | TriggerPanel | Tab switcher: Single / OCO / OTOCO. Single: one trigger price. OCO: TP + SL sharing one deposit, validates TP > SL. OTOCO: entry trigger auto-creates OCO on fill. Min $10 validation. `executeTrigger()` → Jupiter Trigger API |
| 9800–10200 | EarnPanel | Fetches all Jupiter Earn vaults + user positions. Sorted by APY descending. Shows: asset, supply APY, rewards APY, total APY, utilisation, deposit cap. Deposit/Withdraw panels with portion selector. `YieldVaultPromptCard` shown if positions exist but no vault |
| 10200–10600 | LockPanel | Token picker (WSOL excluded). Amount + MAX. Cliff duration (days → seconds). Vesting duration. Recipient address (defaults to connected wallet). Preview: "Tokens unlock on: [date]". `executeLock()`. `LockList` with filter tabs + per-lock vestedPercent bar + "Claim" button |
| 10600–11000 | SendPanel | Token picker + amount. Generates unique `inviteCode` via `crypto.getRandomValues`. Shows invite link preview. "Copy Link" button. `executeSend()`. Pending invites list with "Clawback" button per invite |
| 11000–12000 | StudioPanel + PortfolioPanel + PredictionBrowser | Studio: name/symbol/description/website/twitter fields, image upload (drag-and-drop), preset selector. Portfolio: tabbed sections (tokens, earn, DCA, triggers, perps, locks, vaults). Prediction: market cards with odds, bet amount input, Yes/No toggle |

---

### Lines 12000–14000 · Leaderboard, Volatility Monitor, Telegram, Direct Mode

| Lines | What it is | What it does |
|---|---|---|
| 12000–12400 | LeaderboardPanel | GET /api/leaderboard. Rank cards: medal (🥇🥈🥉 top 3), wallet/.sol name, 7d PnL (green/red), volume, win rate, tx count, "Mirror" button. "Refresh" respects 1h cache with `cachedAt` timestamp. `leaderboardExpanded`: top 5 default, "Show All 50" expands |
| 12400–12800 | VolMonitorPanel | Lists active monitors: token, trigger type, condition, threshold, current live value. "Cancel" removes from `volMonitors` + saves to localStorage. Setup form: token picker, trigger type selector, condition, threshold, `autoOrder` toggle with TP=+2σ / SL=-1.5σ explanation |
| 12800–13200 | Telegram Link Modal | (1) POST /api/yield-vault?action=link-telegram. (2) Server generates 32-byte hex magic token → Firestore. (3) Shows: "Send this code to @ChatFiBot: [token]". (4) "Done" button polls `checkTelegram=1` every 2s for up to 60s. (5) On success: sets `telegramLinked`, shows confirmation |
| 13200–13600 | Direct Mode | `handleDirectMessage()` regex parser: `swap N X to Y`, `buy $N of X`, `send N X`, `earn X`, `lock X`, `portfolio/wallet/balance`. Power users skip the AI round-trip for common well-formed commands |
| 13600–14000 | TokenWizard | 5-step DBC pool creation wizard: name → symbol (auto-uppercase, max 10 chars) → description → image (drag-and-drop preview) → confirm (summary + Launch). Each step rendered as a chat bubble with input. On confirm: fires `executeStudio()` |

---

### Lines 14000–16000 · Blog Modal, How It Works, PWA Banner, Prediction CLI

| Lines | What it is | What it does |
|---|---|---|
| 14000–14400 | Blog Modal | Full-screen overlay. List view: post cards with title, category badge, readTime, summary. Detail view: `sections[{heading, body}]` + `tips[]`. "← Back" returns to list. "✕" closes |
| 14400–14700 | How It Works Modal | 3-step explainer: (1) Connect wallet, (2) Type what you want, (3) Confirm in wallet. Numbered circles, titles, descriptions. Closes on backdrop click |
| 14700–15000 | InstallBanner | iOS: "Add to Home Screen" slide-up sheet with step-by-step instructions (tap Share → Add to Home Screen → Add). Android/Desktop: persistent bottom banner, `deferredPrompt.prompt()` triggers native install. "Not now" dismisses for 7 days |
| 15000–15400 | PredCLI | Terminal-style panel (green text on dark). `predCLILog` as scrolling output: `[HH:MM:SS] message` format. Used by `SCAN_PRED_ODDS` and `AUTO_PRED_BET` for real-time execution progress: "Scanning markets...", "Found edge: Arsenal +12%", "Placing bet...", "✓ Bet placed — tx: abc123" |
| 15400–16000 | Root component wrapping | `JupChat` is the main inner component. `JupChatWithLanding` decides: `showApp === false` → `LandingPage`, `showApp === true` → `JupChat`. User clicks "Launch App" → `setShowApp(true)` → `JupChat` mounts |

---

### Lines 16000–16681 · Root Export, PrivyProvider Config, App Bootstrap

| Lines | What it is | What it does |
|---|---|---|
| 16000–16100 | Jupiter docs fetch useEffect | On mount, fetches a summary of Jupiter documentation and appends to the system prompt. Gives the AI up-to-date Jupiter API knowledge beyond training data. Cached in `jupDocs` state for the session |
| 16100–16200 | `window.__chatfiSend` | Exposes `send()` globally. Allows `onclick` handlers in `dangerouslySetInnerHTML` HTML strings (the `renderMarkdown` output) to call `send()` without React event prop drilling. Example: clicking a token card fires `window.__chatfiSend("BONK info")` → triggers `FETCH_TOKEN_INFO` |
| 16200–16400 | Main JSX return | Full app layout: outer dark-bg flex column → `TrendingTicker` (absolute, top 58px) → header (fixed top 0, 58px) → chat scroll area (flex-grow, overflow-y:auto, `endRef` scroll anchor) → input bar (sticky bottom) → all feature panels (conditionally rendered, all mounted in DOM to avoid trigger delay) |
| 16400–16550 | PrivyProvider config | `appId: VITE_PRIVY_APP_ID`. `loginMethods: ["email","google","twitter","wallet"]`. `appearance: { theme:"dark", accentColor:"#c7f284" }`. `embeddedWallets: { ethereum:{createOnLogin:"off"}, solana:{createOnLogin:"all-users"}, noPromptOnSignature:true }`. ETH wallet suppressed. Every user gets a Solana embedded wallet. Signature prompts suppressed for smooth UX |
| 16600–16681 | Default export | `PrivyProvider`-wrapped root component. File ends. **Total: 16,681 lines — the entire ChatFi frontend in one file** |

---

*Built with ❤️ on Jupiter API · Solana · Claude AI*
