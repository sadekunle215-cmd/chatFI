# ChatFI — Conversational AI Trading Interface for Jupiter DEX

<p align="center">
  <img src="chatfi-logo.jpg" alt="ChatFI Logo" width="120" />
</p>

> **Type in what you want. ChatFI figures out the rest.**

ChatFI is a production-grade, chat-first DeFi interface built entirely on the [Jupiter Developer Platform](https://developers.jup.ag). Instead of navigating tabs, forms, and confirmations, users describe their intent in plain language and the AI routes it to the correct Jupiter API — swaps, limit orders, DCA, yield vaults, prediction markets, portfolio views, token discovery, and more.

**Live app:** [chatfi.pro](https://chatfi.pro)  
**Repository:** [github.com/sadekunle215-cmd/chatfi](https://github.com/sadekunle215-cmd/chatfi)

---

## Table of Contents

- [What ChatFI Does](#what-chatfi-does)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Jupiter APIs Used](#jupiter-apis-used)
- [Project Structure](#project-structure)
- [Core Modules](#core-modules)
  - [chatFI.jsx — Main Application](#chatfijsx--main-application)
  - [YieldRotatorPlugin.jsx — APY Optimizer](#yieldrotatorpluginjsx--apy-optimizer)
  - [yield-vault.js — Server API & Cron](#yield-vaultjs--server-api--cron)
- [AI Grounding — llms-full.txt](#ai-grounding--llms-fulltxt)
- [Authentication & Security](#authentication--security)
- [Environment Variables](#environment-variables)
- [Plugin System](#plugin-system)
- [Yield Vault — Full Flow](#yield-vault--full-flow)
- [Yield Rotator — Full Flow](#yield-rotator--full-flow)
- [Telegram Integration](#telegram-integration)
- [Known API Limitations & Workarounds](#known-api-limitations--workarounds)
- [Product Lines — Full Breakdown](#product-lines--full-breakdown)
- [chatFI.jsx — File Map (Line by Line)](#chatfijsx--file-map-line-by-line)
- [Getting Started](#getting-started)

---

## What ChatFI Does

| User says | ChatFI does |
|---|---|
| "Swap 10 USDC to SOL" | Routes to Swap V2 `/order` → previews output → `/execute` on confirm |
| "Set a limit order: buy SOL at $120" | Creates a Trigger V2 price order |
| "DCA into JUP over the next 30 days" | Schedules a Recurring V1 DCA plan |
| "What's my portfolio worth?" | Calls Ultra V1 + Portfolio V1, summarises holdings |
| "Deposit 100 USDC into the best earn pool" | Identifies top APY pool, calls Lend V1 deposit |
| "What's trending right now?" | Queries Tokens V2 trending + category endpoints |
| "Bet on SOL hitting $200 by next month" | Opens a Prediction Markets position |
| "Send 5 SOL to my friend" | Generates a Jupiter Send invite link |

---

## Architecture Overview

```
+-------------------------------------------------------+
|                    Browser / Client                   |
|                                                       |
|  +---------------------------------------------------+|
|  |           chatFI.jsx (React + Vite)               ||
|  |                                                   ||
|  |  +------------+   +---------------------------+  ||
|  |  |  Chat UI   |   |  Plugin Panels            |  ||
|  |  |  + Intent  |   |  YieldRotatorPlugin       |  ||
|  |  |  Router    |   |  (+ future plugins)       |  ||
|  |  +-----+------+   +---------------------------+  ||
|  |        |                                         ||
|  |  +-----v-------------------------------------+   ||
|  |  |         Wallet Providers                  |   ||
|  |  |  Reown AppKit (Phantom, Backpack, etc)    |   ||
|  |  |  Privy (email / social login + wallet)    |   ||
|  |  +-------------------------------------------+   ||
|  +---------------------------------------------------+|
+------------------------+------------------------------+
                         | HTTPS
+------------------------v------------------------------+
|                  Vercel (Server-side)                 |
|                                                       |
|  /api/jupiter        -- Jupiter API key proxy         |
|  /api/yield-vault    -- Vault CRUD + Cron Watcher     |
|  /api/solana-rpc     -- RPC proxy (Helius)            |
|                                                       |
+--------+------------------------+--------------------+
         |                        |
+--------v---------+   +----------v-----------------+
|  Jupiter API     |   |   Firebase Firestore        |
|  (13+ APIs)      |   |   yield_vaults collection   |
|                  |   |   chatfi_users collection   |
+------------------+   +-----------------------------+
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Deployment | Vercel (SSR + Edge Functions) |
| Wallet (external) | Reown AppKit — Phantom, Backpack, and all WalletConnect wallets |
| Wallet (social) | Privy — email / Google / Twitter login with embedded Solana wallet |
| Blockchain | Solana Mainnet via Helius RPC |
| Database | Firebase Firestore (vault persistence, Telegram linking) |
| Notifications | Telegram Bot API |
| AI | Anthropic Claude — grounded on Jupiter's `llms-full.txt` |
| Jupiter | Developer Platform (unified API key, 13+ endpoints) |

---

## Jupiter APIs Used

| API | Base Path | What ChatFI Uses It For |
|---|---|---|
| **Swap V2** | `/swap/v2/order` + `/swap/v2/execute` | All token swaps. Split order/execute lets ChatFI show a preview before committing. |
| **Trigger V2** | `/trigger/v2/orders/price` | Limit orders ("buy SOL if it drops to $120") |
| **Recurring V1** | `/recurring/v1` | DCA / scheduled buy orders |
| **Lend / Earn V1** | `/lend/v1/earn` | Yield deposits, withdrawals, position reads |
| **Ultra V1** | `/ultra/v1/holdings` + `/ultra/v1/order` + `/ultra/v1/execute` | Portfolio snapshot, gasless swaps |
| **Portfolio V1** | `/portfolio/v1/positions` | Full position tracking (tokens, LP, earn, perps) |
| **Prediction Markets V1** | `/prediction/v1` | Bet creation, open positions, market state |
| **Tokens V2** | `/tokens/v2` search, tag, category, trending, recent | Token search and discovery |
| **Price V3** | `/price/v3` | Live prices with 24h delta (no extra call needed for change %) |
| **Send** | `/send/v1` | Token transfers via invite link (no recipient wallet needed) |
| **Studio** | `/studio/v1` | Token creation, fee claiming |
| **Lock** | `/lock/v1` | SPL token vesting |

---

## Project Structure

```
chatfi/
├── src/
│   ├── chatFI.jsx                  # Main app — UI, intent routing, all API calls
│   └── plugins/
│       └── YieldRotatorPlugin.jsx  # APY monitor + migration plugin
├── api/
│   ├── jupiter.js                  # Jupiter API key proxy (server-side)
│   ├── yield-vault.js              # Vault CRUD, cron watcher, Telegram bot
│   └── solana-rpc.js               # Helius RPC proxy
├── public/
├── vercel.json                     # Cron schedules
└── README.md
```

---

## Core Modules

### chatFI.jsx — Main Application

The single-file React application (~15,000 lines). Contains:

**Wallet Providers**
- **Reown AppKit** — standard wallet connect flow for Phantom, Backpack, Solflare, and any WalletConnect-compatible wallet
- **Privy** — social/email login with an auto-generated embedded Solana wallet; no seed phrase management for new users

**AI Intent Router**
- On each session start, fetches `https://developers.jup.ag/docs/llms-full.txt` and injects it as the Claude system prompt
- Claude reads the user's message, identifies the intent (swap, limit order, earn, etc.), extracts parameters, and ChatFI executes the corresponding API call
- The AI always has current Jupiter API structure in context — not stale training data

**Plugin System**
- Plugins register a `suggestionGroup` (quick-action buttons) and a React panel component
- Currently active: `YieldRotatorPlugin`
- New plugins drop into `src/plugins/` and are registered in two lines at the top of `chatFI.jsx`

**API Calls**
All Jupiter calls go through `jupFetch()` — a thin wrapper that routes through `/api/jupiter` to keep the API key server-side.

---

### YieldRotatorPlugin.jsx — APY Optimizer

A self-contained React plugin that monitors the user's Jupiter Earn positions and surfaces migration opportunities automatically.

**How it works:**

1. Polls `GET /lend/v1/earn/tokens` every **5 minutes** to get live APYs for all available pools
2. Compares the user's current position APY against every pool (same-asset and cross-asset)
3. When a better pool is found (above a configurable threshold), renders a **"Better APY Available"** banner directly on the Earn position card
4. On "Migrate" tap, executes a sequential transaction chain:

```
Tx 1 — doEarnWithdraw()
         POST /lend/v1/earn/withdraw
         → VersionedTransaction → wallet.signTransaction()
         → sendRawTransaction()

Tx 2 — (Cross-asset only) Swap V2
         POST /ultra/v1/order  →  sign  →  /ultra/v1/execute

Tx 3 — doEarnDeposit()
         POST /lend/v1/earn/deposit
         → VersionedTransaction → wallet.signTransaction()
         → sendRawTransaction()

→ onMigrationDone() → fetchPortfolio() refresh
```

**Props interface:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `walletFull` | `string \| null` | ✅ | Connected wallet public key |
| `earnPositions` | `array` | ✅ | From `portfolioData.earnPositions` |
| `jupFetch` | `function` | ✅ | Shared API helper (handles auth proxy) |
| `getActiveProvider` | `function` | ✅ | Returns active wallet provider for signing |
| `push` | `function` | ✅ | `push("ai", text)` — adds message to chat |
| `T` | `object` | ✅ | Design token object |
| `isMobile` | `boolean` | ✅ | Responsive layout flag |
| `onMigrationDone` | `function` | ❌ | Called after successful migration |

**Integrating the plugin into chatFI.jsx:**

```jsx
// 1. Import
import YieldRotatorPlugin, { suggestionGroup as yieldRotatorSuggestions }
  from "./plugins/YieldRotatorPlugin";

const PLUGIN_SUGGESTION_GROUPS = [yieldRotatorSuggestions];

// 2. Mount — after the Earn Positions section in the portfolio panel
<YieldRotatorPlugin
  walletFull={walletFull}
  earnPositions={portfolioData?.earnPositions || []}
  jupFetch={jupFetch}
  getActiveProvider={getActiveProvider}
  push={push}
  T={T}
  isMobile={isMobile}
  onMigrationDone={() => fetchPortfolio()}
/>
```

---

### yield-vault.js — Server API & Cron

A Vercel serverless function that handles all server-side vault logic. **No private keys are ever in the client.**

**Routes:**

| Method | Path / Query | Description |
|---|---|---|
| `GET` | `?wallet=xxx` | Fetch all active vaults for a wallet |
| `GET` | `?wallet=xxx&checkTelegram=1` | Check if wallet has Telegram linked |
| `POST` | (body) | Create or update a vault config |
| `PATCH` | (body) | Update threshold, target token, or depositedAmount |
| `DELETE` | `?id=xxx&wallet=xxx` | Cancel (soft-delete) a vault |
| `GET` | `?cron=1` | Yield harvest watcher (runs every 5 min via cron) |
| `GET` | `?cron=rotator` | APY rotation alert watcher (runs every 12 hrs) |
| `POST` | `?action=link-telegram` | Generate a magic link token for Telegram linking |
| `POST` | `?action=telegram-webhook` | Telegram bot webhook receiver |
| `POST` | `?action=notify-vault-created` | Push Telegram notification on vault creation |
| `POST` | `?action=notify-vault-cancelled` | Push Telegram notification on vault cancel |
| `POST` | `?action=notify-rotation-complete` | Push Telegram notification after rotation |

**Firestore collections:**

| Collection | Purpose |
|---|---|
| `yield_vaults` | Vault configs — wallet, earnMint, thresholdUSD, targetToken, status |
| `chatfi_users` | User profiles — wallet → telegramChatId mapping |
| `telegram_link_tokens` | One-time magic tokens for Telegram linking (TTL: 10 min) |

---

## AI Grounding — llms-full.txt

Every ChatFI session starts with:

```javascript
const docsRes = await fetch("https://developers.jup.ag/docs/llms-full.txt");
const jupDocs = await docsRes.text();

// Injected as Claude's system prompt
systemPrompt = jupDocs + "\n\n" + CHATFI_INSTRUCTIONS;
```

This means:
- Claude always has the current Jupiter API structure in context
- Endpoint paths, parameter names, and response schemas are live — not from stale training data
- When Jupiter ships a new endpoint or changes a parameter, ChatFI picks it up on the next session without a code deploy

---

## Privacy — No User Data Collected

**ChatFI does not collect, store, or transmit any personal data.**

- No names, emails, IP addresses, or device identifiers are ever recorded
- No trading history, balances, or chat messages are logged server-side
- Your wallet address is never stored by ChatFI — it exists only in your browser session
- Portfolio data is fetched live from the Solana blockchain and Jupiter APIs on every request — nothing is cached or persisted

**Everything is on-chain by default.** Swaps, limit orders, DCA plans, Earn deposits, prediction market bets — every financial action is a Solana transaction signed in your own wallet and settled on-chain. ChatFI is purely the interface.

**Firebase is used only when strictly necessary** — specifically for two opt-in features that have no on-chain alternative:

| Feature | What Firebase stores | Why on-chain is not possible |
|---|---|---|
| **Yield Vault** | Vault config (earnMint, thresholdUSD, targetToken) | A cron job needs to check your yield threshold server-side between sessions |
| **Telegram Linking** | Wallet address -> Telegram chat ID | Telegram notifications require a server-side record to route alerts to the right user |

Both are entirely opt-in. If you never set up a Yield Vault or link Telegram, Firebase is never touched. You can cancel a vault at any time and all associated records are permanently removed.

---

## Authentication & Security

- **Jupiter API key** is stored as a Vercel environment variable and injected server-side via the `/api/jupiter` proxy. It is never present in the client bundle.
- **Wallet signing** always happens in the user's wallet extension or Privy embedded wallet. ChatFI never holds private keys.
- **Delegate keypair** (`DELEGATE_PRIVATE_KEY`) exists only on the server and is used exclusively for automated yield harvests where the user has pre-authorised the action.
- **Telegram linking** uses one-time magic tokens (10-minute TTL) stored in Firestore — no wallet signatures or tokens are sent over Telegram.

---

## Environment Variables

```env
# Jupiter
JUPITER_API_KEY=your_developer_platform_key

# Solana RPC
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=xxx
SOLANA_RPC=https://api.mainnet-beta.solana.com   # fallback

# Firebase Admin (for Firestore)
FIREBASE_ADMIN_KEY={"type":"service_account",...}  # full JSON, stringified

# Delegate wallet (server-side only — for automated yield harvests)
DELEGATE_PRIVATE_KEY=[12,34,56,...]  # Uint8Array as JSON array

# Telegram bot
TELEGRAM_BOT_TOKEN=your_bot_token

# App
NEXT_PUBLIC_APP_URL=https://chatfi.pro

# Privy
VITE_PRIVY_APP_ID=your_privy_app_id

# Reown AppKit
VITE_REOWN_PROJECT_ID=your_reown_project_id
```

---

## Plugin System

ChatFI has a lightweight plugin architecture. Any feature that doesn't belong in the core chat flow lives in its own file under `src/plugins/`.

**To add a new plugin:**

```jsx
// src/plugins/MyPlugin.jsx

// Required: suggestion chips shown in the chat input area
export const suggestionGroup = {
  label: "My Feature",
  color: "#hexcolor",
  items: ["Do thing A", "Do thing B"],
};

// Required: the rendered panel component
export default function MyPlugin({ walletFull, jupFetch, push, T, isMobile }) {
  return <div>...</div>;
}
```

```jsx
// chatFI.jsx — two lines to activate
import MyPlugin, { suggestionGroup as mySuggestions } from "./plugins/MyPlugin";
const PLUGIN_SUGGESTION_GROUPS = [yieldRotatorSuggestions, mySuggestions];

// Mount the panel in the portfolio column:
<MyPlugin walletFull={walletFull} jupFetch={jupFetch} push={push} T={T} isMobile={isMobile} />
```

---

## Yield Vault — Full Flow

The Yield Vault lets users set a USD threshold. When their Jupiter Earn yield accumulates past that amount, ChatFI notifies them via Telegram and lets them harvest in one tap.

```
User configures vault in ChatFI chat
          ↓
POST /api/yield-vault
  Stores { wallet, earnMint, thresholdUSD, targetToken } in Firestore
          ↓
Cron: GET /api/yield-vault?cron=1  (every 5 min)
  fetchEarnPositionValue() — reads live position from /lend/v1/earn/positions
  fetchUSDPrice()          — reads price from /price/v3
  Compares (currentAmount - depositedAmount) × price vs thresholdUSD
          ↓
  If position gone  → auto-cancel vault (PATCH status=cancelled)
  If reduced        → sync depositedAmount down (PATCH depositedAmount)
  If threshold hit  → notifyYieldReady() → Telegram bot pings user
          ↓
User taps "Harvest Now" link in Telegram → lands on ChatFI
  doEarnWithdraw()  → /lend/v1/earn/withdraw → VersionedTransaction → sign
          ↓
  (if targetToken ≠ earnToken)
  Swap V2: /swap/v2/order → /swap/v2/execute
          ↓
  Proceeds land in user's wallet as targetToken
          ↓
POST /api/yield-vault (update depositedAmount + reset pendingHarvest)
```

---

## Yield Rotator — Full Flow

The Yield Rotator runs inside the browser (no server needed) and automatically finds better APY pools for existing Earn positions.

```
YieldRotatorPlugin mounts — polls every 5 min
          ↓
GET /lend/v1/earn/tokens  → all pools + live APYs
          ↓
detectOpportunities()
  For each user earnPosition:
    Find best pool across ALL assets (same-asset and cross-asset)
    apyGap = bestPool.apy - currentPosition.apy
    If apyGap > threshold → push to opportunities[]
          ↓
Renders "Better APY Available" banner on the position card
  Shows: currentToken → bestToken, APY diff, position value
          ↓
User taps "Migrate"
          ↓
doMigrate():

  Tx 1 — Withdraw
    POST /lend/v1/earn/withdraw
    → deserialize VersionedTransaction
    → wallet.signTransaction()
    → connection.sendRawTransaction()
    → confirmTransaction()

  Tx 2 — Swap (cross-asset only)
    POST /ultra/v1/order  { inputMint, outputMint, amount }
    → deserialize + signTransaction()
    → POST /ultra/v1/execute

  Tx 3 — Deposit
    POST /lend/v1/earn/deposit
    → deserialize VersionedTransaction
    → wallet.signTransaction()
    → connection.sendRawTransaction()
    → confirmTransaction()
          ↓
onMigrationDone() → fetchPortfolio() + fetchEarnUserPositions()
Success card shown in chat with tx signature link
```

---

## Telegram Integration

**Setup:**

1. Create a bot via [@BotFather](https://t.me/BotFather) → get token → add to Vercel as `TELEGRAM_BOT_TOKEN`
2. Set the webhook:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://chatfi.pro/api/yield-vault?action=telegram-webhook
   ```

**Linking a wallet to Telegram:**

1. User clicks "Connect Telegram" in ChatFI
2. `POST /api/yield-vault?action=link-telegram` generates a one-time token (10-min TTL) stored in Firestore
3. User opens the bot link with the token as a start parameter
4. Bot webhook handler validates the token, writes `telegramChatId` → `wallet` in `chatfi_users`
5. Token is marked used. All future yield notifications go to that chat ID.

**Cron schedules (vercel.json):**

```json
{
  "crons": [
    { "path": "/api/yield-vault?cron=1",       "schedule": "*/5 * * * *" },
    { "path": "/api/yield-vault?cron=rotator", "schedule": "0 */12 * * *" }
  ]
}
```

---

## Known API Limitations & Workarounds

### 1. Yield Vault: No Delegated Execution

**The gap:** The Lend API requires the user to be present and sign every transaction. There is no way to pre-authorise a withdrawal within defined parameters (e.g. "only withdraw yield, never touch principal").

**Current workaround:** Telegram bot notifies the user when the threshold is hit. The user returns to the app and signs manually. Automated yield harvesting is simulated on the server side only when a delegate keypair is configured.

**Ideal solution:** A delegated execution model — a signed intent or pre-authorised instruction that a keeper can submit within defined parameters (max slippage, time window, vault target). Same mental model as Trigger V2 limit orders, applied to Lend.

---

### 2. Earn Position Migration: No Atomic Path

**The gap:** There is no single-call migration between Earn pools. Withdraw from Pool A and deposit into Pool B are two separate transactions. If the user closes the app between steps, funds sit idle in their wallet.

**Current workaround:** `YieldRotatorPlugin` chains the steps sequentially with step-by-step progress feedback in the UI. Two signatures are still required.

**Ideal solution:** A `/lend/v1/earn/migrate` endpoint (or composable instruction) that batches withdraw + optional swap + deposit into one atomic transaction. All steps succeed or all revert.

---

## Product Lines — Full Breakdown

This is a complete breakdown of every product line built inside `chatFI.jsx` — what each one does, what APIs it calls, and exactly what the user can say to trigger it.

---

### 1. Token Swaps (Swap V2)

The core of ChatFI. Any two Solana tokens can be swapped through Jupiter's meta-aggregator, which automatically finds the best route across 20+ DEXs.

**What users can say:**
- "Swap 5 SOL to USDC"
- "Swap all my JUP to BONK"
- "Exchange $200 worth of SOL for ETH"
- "Show route for SOL to USDC" — displays exact DEX hops, price impact, and fees before committing

**How it works:**

```
POST /swap/v2/order   → builds transaction + previews output amount + fees
User reviews the panel (sent, received, slippage, route)
POST /swap/v2/execute → submits signed VersionedTransaction to Solana
```

The order/execute split is intentional — users always see a preview card before anything hits the chain. After execution, a receipt card is shown with amounts, fees, a copyable transaction signature, and a Solscan link.

**Token resolution:** ChatFI searches Jupiter Tokens V2 + V1 in parallel to resolve any ticker or contract address — including meme coins that aren't in the default list.

---

### 2. Basket Swaps

Multiple swaps bundled into a single chat command. ChatFI prepares all transactions in parallel, presents them together, then executes each on-chain sequentially.

**What users can say:**
- "Buy $100 each of SOL, JUP, BONK, and WIF"
- "Swap all my JUP and FARTCOIN into USDC"
- "Buy half of my USDC worth of SOL and a quarter worth of BONK"
- "Dump my bags" — reads full wallet balances and swaps everything to USDC

**Supports:** exact USD amounts, exact token amounts, wallet-percentage amounts ("50% of my SOL"), "all", "max", "half" — and mixes of all of these in one message.

Each swap in the basket gets individual slippage protection. If one trade fails the rest continue — failures are reported individually in chat.

---

### 3. Limit Orders & Trigger V2

Off-chain trigger orders that execute automatically when a token hits a target price. Built on Jupiter Trigger V2 — supports USD price targets, vault-based orders, OCO, and OTOCO brackets.

**What users can say:**
- "Buy SOL if it drops below $140"
- "Sell 5 JUP when it hits $2"
- "OCO on SOL: take profit at $200, stop loss at $120"
- "OTOCO: buy SOL at $150, then auto-set TP $200 SL $130"
- "Show my open limit orders" / "Cancel all my trigger orders"

**API flow:**
```
POST /trigger/v2/orders/price  → creates the order (stored off-chain in Jupiter's system)
GET  /trigger/v2/orders        → fetches user's active orders for the management panel
DELETE /trigger/v2/orders/{id} → cancels a specific order
```

Minimum order size is $10. Orders are stored in Jupiter's vault and monitored by Jupiter's keeper network — no server-side polling needed from ChatFI.

---

### 4. DCA / Recurring Orders

Dollar-cost averaging and scheduled buys powered by Jupiter Recurring V1. Orders run automatically at the user's chosen interval until cancelled.

**What users can say:**
- "DCA $10 USDC into SOL every day for 30 days"
- "Buy $50 of JUP every week"
- "Schedule a monthly buy of $200 BONK"
- "Show my recurring orders" / "Cancel my DCA"

**API flow:**
```
POST /recurring/v1/createOrder  → schedules the series
GET  /recurring/v1/getRecurringOrders → lists active series
POST /recurring/v1/cancelOrder  → stops the series
```

Intervals supported: minutely, hourly, daily, weekly, monthly. Each execution is an on-chain transaction signed by Jupiter's keeper — the user only signs once to create the series.

---

### 5. Perpetual Futures (Perps)

Leveraged long and short positions on Solana, BTC, ETH, and other supported assets via Jupiter Perps.

**What users can say:**
- "Long SOL 10x with $200"
- "Short BTC with $500 at 5x leverage"
- "Show my perps positions"
- "Close my SOL long"
- "Increase my SOL position by $100"

**API flow:**
```
GET  /perps/v1/markets          → available markets + funding rates
GET  /perps/v1/positions        → user's open positions with PnL + liquidation price
POST /perps/v1/open             → open a new position
POST /perps/v1/close            → close or reduce a position
```

The Perps panel shows real-time unrealised PnL, current leverage, liquidation price, and position size. Users can adjust or close positions directly from the panel without re-typing a command.

---

### 6. Jupiter Earn (Yield Deposits)

Deposit tokens into Jupiter's yield-bearing Earn pools. Assets are deployed into curated lending protocols automatically. Users receive jlTokens representing their share of the pool.

**What users can say:**
- "Earn yield on 100 USDC"
- "Deposit 5 SOL into the best earn pool"
- "Show earn vaults" — lists all available pools with live APY
- "Show my earn positions" / "Withdraw my USDC"
- "What's the highest APY vault right now?"

**API flow:**
```
GET  /lend/v1/earn/tokens              → all available pools + live APY
GET  /lend/v1/earn/positions?users=... → user's active deposits
POST /lend/v1/earn/deposit             → deposit transaction (VersionedTransaction)
POST /lend/v1/earn/withdraw            → withdraw transaction (VersionedTransaction)
```

APYs are variable and update continuously based on protocol demand. No lock-up periods — withdrawals settle on-chain immediately.

---

### 7. Borrow (Lend V1)

Deposit collateral and borrow assets against it without selling. Supports up to 95% LTV depending on the asset.

**What users can say:**
- "Borrow 200 USDC using 2 SOL as collateral"
- "Show my borrow positions"
- "What's my LTV health?"
- "Repay my USDC loan"

The Borrow panel shows LTV ratio, liquidation price, current interest rate, and health factor in real time. ChatFI warns users when LTV is approaching unsafe levels.

---

### 8. Multiply (Leveraged Yield Loops)

Loop a yield position using flashloans to amplify returns — e.g. deposit JupSOL, borrow SOL, convert to more JupSOL, repeat. Produces 2x–5x leveraged staking yield.

**What users can say:**
- "Multiply my JupSOL position 3x"
- "Show multiply vaults"
- "Set up a 2x leverage loop on SOL"

ChatFI explains the mechanics before the user confirms, shows the effective APY at the chosen multiplier, and handles the loop construction via the Lend SDK.

---

### 9. Prediction Markets

Decentralised betting on sports results, crypto price targets, and other real-world events. Payouts come from the losing side's pool — no bookmaker spread.

**What users can say:**
- "Show EPL predictions"
- "Who's playing in the Champions League final?"
- "Bet $10 on Arsenal to win"
- "Show crypto predictions" — price-based on-chain markets
- "Claim my winnings" / "Show my open bets"
- "Scan prediction odds for value bets" — AI scans all live markets and flags edges

**API flow:**
```
GET  /prediction/v1/markets   → all live markets with odds + pool sizes
GET  /prediction/v1/positions → user's active bets
POST /prediction/v1/bet       → place a bet (USDC transaction)
POST /prediction/v1/claim     → claim winnings after resolution
```

**Prediction Vault (advanced):** Users can deposit USDC into a yield-gated vault that earns Lend yield while idle and auto-bets prediction markets when the AI detects edge. Winnings compound back into the vault. Capital is always working.

---

### 10. Token Tools — Jupiter Studio (DBC)

Create and manage tokens using Jupiter's Dynamic Bonding Curve engine. Full token launch flow from ChatFI.

**What users can say:**
- "Create a token on Jupiter Studio"
- "Launch a new token called MYTOKEN"
- "Claim my creator trading fees"
- "Check fees from my DBC pool"

**API flow:**
```
POST /studio/v1/create  → launches a DBC token with bonding curve
GET  /studio/v1/fees    → creator fee balances across all pools
POST /studio/v1/claim   → claims accrued trading fees
```

---

### 11. Token Lock (Vesting)

Lock SPL tokens with configurable cliff and linear vesting schedules. Used for team allocations, investor locks, and personal commitment mechanisms.

**What users can say:**
- "Lock 1000 JUP for 1 year"
- "Lock 500 USDC for 10 minutes" (converted to days: 0.00694)
- "Show my locked positions"
- "Claim my vested tokens"

**API flow:**
```
POST /lock/v1/lock    → creates a vesting schedule (cliff + linear release)
GET  /lock/v1/locks   → user's active locks with vesting progress
POST /lock/v1/claim   → claims unlocked tokens
```

Time is always converted to days internally: minutes ÷ 1440, hours ÷ 24.

---

### 12. Send (Invite Links)

Send tokens to anyone via an invite link — the recipient does not need a Solana wallet to claim. ChatFI uses Jupiter Send's keypair-based invite system.

**What users can say:**
- "Send 1 SOL via invite link"
- "Send 100 USDC to my friend"
- "Claw back my unclaimed invite"
- "Show pending invites" / "Show send history"

**API flow:**
```
POST /send/v1/craft-send      → builds the send transaction + generates invite keypair
POST /send/v1/craft-clawback  → reclaims tokens from an unclaimed invite
GET  /send/v1/pending-invites → lists all unclaimed outbound sends
GET  /send/v1/invite-history  → full send history
```

The generated invite link can be shared via any messaging platform. The recipient taps it, connects or creates a wallet, and the tokens are transferred.

---

### 13. Copy Trading / Wallet Mirroring

Paste any Solana wallet address to analyse their recent trades and replicate them instantly.

**What users can say:**
- "Copy trades from \`<wallet address>\`"
- "Mirror wallet \`<address>\`"
- "What is this wallet buying?"
- "Show top wallets leaderboard" — live ranking of most profitable traders by 7-day PnL

**What the analyser returns:**
- Trading style profile (scalper / swing / position trader)
- Top tokens traded by volume
- Sentiment (accumulating vs distributing)
- Average trade size and frequency
- A list of recent swaps with one-tap "Mirror this trade" buttons

---

### 14. Portfolio & Research

Unified view of everything in the connected wallet — spot balances, DeFi positions, open orders, earn deposits, perps, and LP positions.

**What users can say:**
- "Show my portfolio" / "What's in my wallet?"
- "What's my total portfolio value?"
- "Show my open orders" / "Show my DCA orders"
- "My trade journal" — chronological swap history with estimated PnL
- "Alert me when SOL hits $200" — in-session price monitor, fires a chat notification

**Data sources used in parallel:**
```
GET /ultra/v1/holdings          → spot token balances
GET /portfolio/v1/positions     → full DeFi position snapshot
GET /lend/v1/earn/positions     → earn deposits
GET /perps/v1/positions         → leveraged positions
GET /trigger/v2/orders          → open limit orders
GET /recurring/v1/orders        → active DCA series
GET /prediction/v1/positions    → open bets
```

---

### 15. Token Research & Discovery

Deep-dive on any Solana token — price, metadata, safety, organic volume, holders, and liquidity — plus market-wide discovery tools.

**What users can say:**
- "Deep dive BONK" — full metadata, organic score, safety flags, liquidity depth
- "What's the SOL price?" — live price with 24h delta from Price V3
- "Top trending tokens" — toptrending / toptraded / toporganicscore across 5m, 1h, 6h, 24h
- "New token listings" — tokens that just launched their first liquidity pool
- "Show verified tokens" / "Show LST tokens"
- "Top xStocks" — tokenized real-world stocks (RWA) tradeable on Solana 24/7
- "Check if my token is eligible for Jupiter verification"

**APIs used:**
```
GET /price/v3?ids=...                        → live price + 24h change (single call)
GET /tokens/v2/search?query=...              → token search
GET /tokens/v2/{toptrending|toptraded}/...   → market category rankings
GET /tokens/v2/recent                        → new listings
GET /tokens/v2/tag?query=verified|lst        → filtered token lists
GET /tokens/v2/verify/express/check-eligibility → verification eligibility
```

Price V3 includes the 24h change baked into the same response — no second call needed to say "SOL is up 3.2% today."

---

### 16. Power Commands (AI Analysis Shortcuts)

Pre-built analytical workflows triggered by specific phrases. These chain multiple API calls in parallel and synthesise the results into a single AI-written report.

| Command | What it does |
|---|---|
| `Smart entry <TOKEN>` | Live price + trending rank + swap quote analysis. Answers: is now a good time to buy? |
| `Exit my <TOKEN>` | Momentum check + current balance + best swap route. Answers: should I sell now, and how? |
| `Deep dive <TOKEN>` | Full metadata, organic score, safety flags, liquidity depth, holder stats |
| `Morning briefing` / `Portfolio pulse` | Parallel snapshot of balances, earn positions, and open orders |
| `Scan prediction odds` | AI scans all live prediction markets and flags statistical edges |
| `Detect volatility on <TOKEN>` | Monitors price movement and triggers an alert or action on a volatility spike |

---

### 17. Chained Actions

Any combination of the above product lines can be chained into a single message. ChatFI executes them sequentially, with each step opening automatically after the previous one completes.

**Examples:**
- "Buy $50 each of SOL, JUP, BONK — then set a limit sell on SOL at $200" → Basket Swap → Trigger V2
- "Swap SOL to USDC then send it via invite link" → Swap → Send
- "Earn yield on my USDC then lock the jlTokens for 6 months" → Earn → Lock
- "Lock 1000 JUP for 10 minutes then swap the unlocked tokens to SOL" → Lock → Swap (auto-opens after vest)
- "Buy SOL, wait 4 seconds, then sell it back to USDC" → Basket Swap → delayed Basket Swap
- "Place bets on these 3 matches then show my portfolio" → Basket Prediction → Portfolio

All 30+ actions are valid chain steps. Steps are fully parameterised from the single original message — the user never needs to re-type details between steps.

---


## chatFI.jsx — File Map (Line by Line)

`chatFI.jsx` is ~15,000 lines. This map tells you exactly what lives where so you can jump straight to any feature.

```
LINE RANGE       WHAT'S THERE
---------------------------------------------------------------------------
1    – 22        Imports: React hooks, Solana web3.js, SPL token, nacl,
                 Reown AppKit, Privy, YieldRotatorPlugin registration

24   – 145       SVG icon components (inline — no icon library dependency)
                 SvgChat, SvgWallet, SvgZap, SvgBarChart, SvgLink,
                 SvgTwitterX, SvgDiscord, SvgTelegram, SvgGithub,
                 SvgRocket, SvgWarning, SvgSearch, etc.

147  – 178       Jupiter API endpoint constants — every base URL used
                 JUP_BASE, JUP_SWAP_ORDER, JUP_TRIGGER_V2, JUP_EARN_API,
                 JUP_PERPS_API, JUP_STUDIO_API, JUP_LOCK_API, etc.

180  – 233       Token constants
                 TOKEN_MINTS  — 20 popular tokens with mint addresses
                 TOKEN_DECIMALS — decimal map per token
                 TOKEN_LOGO_URLS — CDN logo URLs (avoids CORS issues)
                 PRED_CATEGORIES — prediction market categories
                 MULTIPLY_VAULTS — 7 leveraged yield loop configs

252  – 532       AI system prompt (CLAUDE_PROMPT constant)
                 Full intent routing instructions for Claude:
                 all supported actions, chaining rules, slang handling,
                 full feature list, power command triggers

534  – 561       SUGGESTION_GROUPS — chat quick-action chip definitions
                 Power / Market / Trade / Earn / Tools + plugin groups

563  – 590       Design token object (T) — all colours, fonts, spacing
                 Mobile detection (isMobile)

592  – 607       Reown AppKit initialisation (wallet connect setup)

609  – 812       fmt() — markdown-to-HTML renderer for chat messages
                 Handles: numbered lists → card grids, bullet points,
                 section headers, price lines, swap receipt cards,
                 inline markdown (bold, italic, code, links)

814  – 908       TokenPicker component
                 Live token search: queries Tokens V2 + V1 in parallel,
                 deduplicates, sorts by exact match then 24h volume,
                 renders 300ms-debounced dropdown

910  – 1041      TokenMiniChart component
                 Price chart using GeckoTerminal (primary) → CoinGecko
                 (fallback). SVG sparkline with 1D / 7D / 30D toggle,
                 gradient fill, live % change badge

1043 – 1209      TrendingTicker component
                 Auto-scrolling live ticker bar at top of app.
                 Fetches toptrending tokens every 60s from Tokens V2,
                 renders horizontally scrolling price chips

1211 – 1463      BLOG_POSTS array — 7 in-app blog articles
                 How ChatFI Works, Token Swaps, Basket Swaps,
                 Limit Orders & DCA, Earn & Yield, Predictions,
                 Portfolio Guide

1465 – 1853      LandingPage component (~390 lines)
                 Full marketing landing page shown on first visit:
                 hero section, feature grid, command examples,
                 how-it-works steps, integrations list, CTA + footer
                 Includes injectLandingStyles() — CSS injected at
                 module load to prevent flash of unstyled content

1855 – 1974      MyLocks helper components
                 MLBadge (status pill), MLLockCard (vesting card UI)
                 Shows: escrow address, total/claimed/claimable amounts,
                 vesting progress bar, claim button

1976 – 2055      YieldVaultPromptCard component
                 The "Jupiter Earn Position Detected" upsell banner
                 that appears after a deposit, prompting vault setup

2056 – 2099      Yield Vault Panel helpers
                 formatAPY(), formatEarned(), TokenLogo component
                 (with multi-level logo fallback chain)

2100 – 2243      YieldVaultPanel component
                 Full vault setup form: earnMint picker, threshold
                 input, target token picker, Telegram link button,
                 save/cancel actions

2244 – 2409      VaultCard + YieldVaultTracker components
                 Live vault monitoring dashboard: current position
                 value, yield accrued, threshold progress bar,
                 cancel / update vault buttons

2411 – 2425      JupChatWithLanding — root wrapper
                 Checks sessionStorage to show landing or app

2426 – 2510      JupChatInner — main component state declarations
                 All useState / useRef definitions:
                 messages, wallet state, WalletConnect (wcStatus/wcUri),
                 Privy hooks, Reown hooks

2512 – 2730      Feature panel state declarations (all useState)
                 Swap, Trigger V1/V2, Recurring, Predictions,
                 Earn / Lend, Send, Portfolio, Token Info, Perps,
                 Studio, Lock, Route Inspector, Price Alerts,
                 Volatility Monitor, Prediction CLI, Trade Journal,
                 Copy Trade, Plugin state

2731 – 2815      App-level effects
                 jupDocs fetch (llms-full.txt), multiply vault ID
                 fetch, global CSS injection, scroll-to-bottom logic,
                 textarea auto-resize, window.__chatfiSend bridge,
                 WalletConnect QR render, swap quote debounce

2816 – 2860      Global CSS injection (useEffect)
                 hover states, spinner animation, vault card styles

2862 – 2910      Scroll + QR effects

2911 – 2941      jupFetch() — Jupiter API proxy helper
                 Routes all Jupiter calls through /api/jupiter to
                 keep the API key server-side. Handles JSON + error.

2943 – 2979      resolveToken() — symbol → { mint, decimals }
                 Tries token cache → V2 search → V1 fallback.
                 Also handles raw base58 mint address paste.

2980 – 2997      fetchPrices() — Price V3 batch price fetch
                 Fetches live USD prices + 24h delta for any
                 list of token mints in one call.

2998 – 3029      Wallet change effect
                 Reloads price alerts, vol monitors, trade journal,
                 and Telegram link status when wallet connects/changes.

3030 – 3161      fetchTokenInfo() — full token metadata
                 Priority: hardcoded mint → V2 by mint → V2 search
                 → V1 fallback. Normalises all field variants into
                 a single consistent shape (price, mcap, fdv, holders,
                 organic score, audit flags, social links, etc.)

3163 – 3226      Token discovery helpers
                 fetchTokensByTag() — verified / LST tokens
                 fetchTokensByCategory() — toptrending / toptraded
                 fetchXStocks() — RWA / tokenized stocks filter

3228 – 3246      fetchRecentTokens() — newly listed tokens

3237 – 3367      Trade Journal helpers
                 logTrade() — writes swap to localStorage
                 fetchOnChainTrades() — fetches last 20 on-chain
                 txs, diffs pre/post token balances to detect swaps

3369 – 3404      Price Alert polling (setInterval every 30s)
                 Checks all active alerts against live prices,
                 fires chat notification on trigger

3405 – 3543      Volatility Monitor polling (setInterval every 30s)
                 10-sample rolling std-dev per token. Fires alert
                 and optionally auto-places OCO order on spike.
                 Also handles metric-based triggers (price/mc/volume/
                 liquidity/holders/priceChange).

3545 – 3650      fetchWalletTrades() + wallet behaviour analyser
                 Fetches trade history for any wallet via DexScreener.
                 Builds a profile: trading style, top tokens, sentiment,
                 avg trade size.

3652 – 3789      fetchLeaderboard() — top traders leaderboard
                 Fetches on-chain top wallets from /api/wallet-trades.
                 Falls back to seed wallets if backend returns nothing.

3790 – 4101      fetchPortfolioData() — full portfolio snapshot
                 Calls in parallel:
                   /ultra/v1/holdings (spot balances)
                   /portfolio/v1/positions (DeFi positions)
                   /lend/v1/earn/positions (earn deposits)
                   /perps/v1/positions (leveraged positions)
                   /trigger/v2/orders (limit orders)
                   /recurring/v1/orders (DCA series)
                   /prediction/v1/positions (open bets)
                   /send/v1/pending-invites (unclaimed sends)
                 Normalises all into a single portfolioData object.

4102 – 5683      fetchEarnUserPositions() + Earn panel rendering
                 Fetches user's earn deposits, renders position cards
                 with live APY, balance, yield earned, withdraw buttons,
                 and YieldVaultPromptCard upsell.

5684 – 5931      doSend() — Jupiter Send execution
                 Builds invite keypair (nacl), crafts send transaction
                 via /send/v1/craft-send, signs with wallet, submits.
                 Also handles clawback and pending invite fetch.

5932 – 6112      doPredictionBet() — on-chain prediction market bet
                 Resolves market ID, posts to /prediction/v1/bet,
                 deserialises VersionedTransaction, signs, submits.

6113 – 6414      doEarnDeposit() + doEarnWithdraw()
                 Deposit: POST /lend/v1/earn/deposit → VersionedTx
                 → sign → sendRawTransaction → confirmTransaction.
                 Withdraw: same pattern with /lend/v1/earn/withdraw.

6415 – 7160      doBorrow() — borrow panel execution
                 Posts collateral + borrow amount, signs SDK transaction.

7161 – 7453      Wallet connection logic
                 getActiveProvider() — returns the right signing
                 provider (Privy, Reown/Phantom, or embedded wallet).
                 Wallet connect/disconnect handlers for all three paths.

7454 – 7551      doSwap() — Swap V2 execution
                 POST /swap/v2/order → preview data → user confirms
                 → POST /swap/v2/execute → sign + submit + receipt card.

7552 – 7687      doTrigger() — Trigger V1 execution (legacy)

7688 – 7827      doTriggerV2() — Trigger V2 execution
                 Supports limit, OCO, OTOCO order types.
                 POST /trigger/v2/orders/price → sign VersionedTx.

7828 – 8199      doRecurring() — DCA / Recurring V1 execution
                 POST /recurring/v1/createOrder → sign → submit.
                 Also handles cancel + list fetch.

8200 – 8255      doBasketSwap() — batch swap resolver
                 Resolves all token mints in parallel, fetches all
                 /swap/v2/order calls in parallel, signs as batch,
                 executes sequentially.

8256 – 8534      Power Commands orchestrator
                 smartEntry(), exitStrategy(), deepDive(),
                 portfolioPulse() — each calls multiple APIs in
                 parallel, passes raw data to Claude for synthesis.

8535 – 8748      send() — main AI message handler (entry point)
                 Reads user input, intercepts power commands and
                 keyword shortcuts client-side, then calls Claude
                 with the full system prompt + conversation history.

8749 – 9909      Action dispatcher — Claude's JSON response → UI
                 SHOW_SWAP, SHOW_TRIGGER_V2, SHOW_RECURRING,
                 FETCH_EARN, SHOW_SEND, FETCH_PORTFOLIO,
                 FETCH_TOKEN_INFO, FETCH_XSTOCKS, SHOW_PERPS,
                 SHOW_BORROW, SHOW_MULTIPLY, SHOW_STUDIO,
                 SHOW_LOCK, SHOW_PREDICTION, FETCH_PREDICTIONS,
                 PLACE_PREDICTION, BASKET_PREDICTION,
                 SET_PRICE_ALERT, DETECT_VOLATILITY,
                 SCAN_PRED_ODDS, SHOW_TRADE_JOURNAL,
                 BASKET_SWAP, SWAP_ALL_WALLET

9910 – 10118     CHAINED_ACTIONS executor
                 Processes multi-step action arrays sequentially.
                 Handles inter-step data passing (swap proceeds →
                 next step amount).

10118 – 10510    Remaining action handlers
                 SHOW_PERPS, FETCH_PERPS_POSITIONS, SHOW_BORROW,
                 SHOW_MULTIPLY, CLAIM_PAYOUTS, SHOW_STUDIO,
                 FETCH_STUDIO_FEES, FETCH_LOCKS, FETCH_SEND_HISTORY,
                 SHOW_PREDICTION, FETCH_PREDICTIONS, SHOW_ROUTE,
                 FETCH_PORTFOLIO, FETCH_TOKEN_INFO, FETCH_XSTOCKS,
                 FETCH_TRIGGER_ORDERS, FETCH_RECURRING_ORDERS,
                 COPY_TRADE

10511 – 14993    JSX render tree — the entire UI
                 10511  Root layout, sidebar, mobile nav
                 10600  TrendingTicker bar mount
                 10700  Wallet connect modal (Privy + Reown tabs)
                 11000  Chat message list + typing indicator
                 11400  Swap panel (token pickers, quote, confirm)
                 11600  Trigger V2 panel (limit / OCO / OTOCO)
                 11800  Recurring / DCA panel
                 11900  Earn deposit + position cards
                 12100  YieldVaultPanel + VaultCard tracker
                 12200  Prediction market panel + bet form
                 12380  YieldRotatorPlugin mount
                 12450  Send panel (invite link builder)
                 12600  Portfolio panel (all positions)
                 12800  Perps panel
                 12900  Borrow panel
                 13000  Multiply panel
                 13100  Studio panel (token creation + fees)
                 13200  Lock panel (vesting setup + MyLocks)
                 13400  Route inspector panel
                 13500  Copy Trade panel + leaderboard
                 13700  Trade Journal panel
                 13900  Volatility + Price Alert panels
                 14100  Prediction CLI / odds scanner
                 14300  Blog panel (article list + reader)
                 14500  Input box + suggestion chips
                 14700  How It Works modal
                 14800  PWA install banner
                 14900  Socials nav + misc modals
---------------------------------------------------------------------------
Total: ~15,000 lines | 1 file | 30+ product features
```

## Getting Started


```bash
# Clone
git clone https://github.com/sadekunle215-cmd/chatfi.git
cd chatfi

# Install
npm install

# Configure environment
cp .env.example .env.local
# Fill in all values from the Environment Variables section above

# Dev server
npm run dev

# Deploy
vercel --prod
```

**Firebase setup:**
1. Create a Firestore database in the Firebase console
2. Add two collections: `yield_vaults` and `chatfi_users`
3. Generate a service account key (JSON) and set it as `FIREBASE_ADMIN_KEY`

**Telegram setup:**
1. Create bot via @BotFather
2. Add `TELEGRAM_BOT_TOKEN` to Vercel
3. Set the webhook URL (see Telegram Integration section)

---

*Built for the Jupiter Developer Platform bounty — Build with the New Unified API.*
