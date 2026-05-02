# ChatFi — Full Architectural & Product README

> **File:** `chatFI.jsx` — 14,591 lines · Single-file React application
> **Product:** ChatFi — AI-powered DeFi assistant built on Solana & Jupiter DEX

---

## Table of Contents

1. [What Is ChatFi?](#1-what-is-chatfi)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack & Dependencies](#3-technology-stack--dependencies)
4. [Design System & Tokens](#4-design-system--tokens)
5. [Jupiter API Layer (Lines 144–199)](#5-jupiter-api-layer-lines-144199)
6. [AI Brain — System Prompt & Intent Engine (Lines 200–526)](#6-ai-brain--system-prompt--intent-engine-lines-200526)
7. [Suggestion Groups & Power Commands (Lines 528–555)](#7-suggestion-groups--power-commands-lines-528555)
8. [SVG Icon System (Lines 22–143)](#8-svg-icon-system-lines-22143)
9. [Markdown Formatter — `fmt()` (Lines 600–803)](#9-markdown-formatter--fmt-lines-600803)
10. [TokenPicker Component (Lines 806–899)](#10-tokenpicker-component-lines-806899)
11. [TokenMiniChart Component (Lines 902–1032)](#11-tokenminichartt-component-lines-902-1032)
12. [TrendingTicker Component (Lines 1035–~1160)](#12-trendingticker-component)
13. [Blog / Docs Articles (Lines ~1161–1454)](#13-blog--docs-articles)
14. [Landing Page System (Lines 1456–~1750)](#14-landing-page-system)
15. [Token Lock Card — `MLocker` (Lines ~1751–1960)](#15-token-lock-card--mlocker)
16. [Yield Vault System (Lines 1962–~2500)](#16-yield-vault-system)
17. [WalletConnect QR / WC v2 Flow (Lines ~2500–2870)](#17-walletconnect-qr--wc-v2-flow)
18. [Proxy Layer — `jupFetch` & `predFetch` (Lines 2876–2906)](#18-proxy-layer--jupfetch--predfetch-lines-28762906)
19. [Token Resolution Engine (Lines 2908–3108)](#19-token-resolution-engine-lines-29083108)
20. [Portfolio Data Fetcher (Lines ~3900–4221)](#20-portfolio-data-fetcher-lines-39004221)
21. [Transaction Execution Layer (Lines ~4222–5632)](#21-transaction-execution-layer-lines-42225632)
22. [Send & Invite Link System (Lines ~5200–5507)](#22-send--invite-link-system-lines-52005507)
23. [Perps / Perpetual Futures (Lines 5509–5550)](#23-perps--perpetual-futures-lines-55095550)
24. [Prediction Markets Engine (Lines 5552–5700)](#24-prediction-markets-engine-lines-55525700)
25. [Wallet Connection Architecture (Lines 6853–7135)](#25-wallet-connection-architecture-lines-68537135)
26. [Main Chat Engine — `sendMessage()` (Lines ~8330–8600)](#26-main-chat-engine--sendmessage-lines-83308600)
27. [Action Dispatcher — All 40+ Actions (Lines ~8460–10150)](#27-action-dispatcher--all-40-actions-lines-846010150)
28. [CHAINED_ACTIONS System (Lines ~9700–10050)](#28-chained_actions-system-lines-970010050)
29. [UI Panels — Full Component Map (Lines ~10150–13600)](#29-ui-panels--full-component-map)
30. [Prediction CLI Dashboard (Lines ~12800–13050)](#30-prediction-cli-dashboard-lines-1280013050)
31. [Trade Journal & On-Chain History (Lines ~10010–10050)](#31-trade-journal--on-chain-history)
32. [Price Alerts & Volatility Monitors (Lines ~9997–10015)](#32-price-alerts--volatility-monitors)
33. [Plugin Architecture (Lines 14–19)](#33-plugin-architecture-lines-1419)
34. [App Root & Auth Providers (Lines 14540–14591)](#34-app-root--auth-providers-lines-1454014591)
35. [Server-Side API Routes (Referenced Throughout)](#35-server-side-api-routes-referenced-throughout)
36. [State Management Map](#36-state-management-map)
37. [Data Flow Diagram](#37-data-flow-diagram)
38. [Feature Reference — Complete List](#38-feature-reference--complete-list)
39. [Environment Variables](#39-environment-variables)
40. [How to Extend ChatFi](#40-how-to-extend-chatfi)

---

## 1. What Is ChatFi?

ChatFi is a **conversational DeFi terminal** — a single-page React app that lets users trade, invest, and manage their entire Solana DeFi portfolio using natural language chat. Instead of navigating multiple dApps, users type commands like:

- `"Swap $100 of SOL to BONK"`
- `"Buy $50 each of JUP, WIF, and POPCAT"`
- `"Set a limit order: buy SOL if it drops below $140"`
- `"Bet $20 on Arsenal to win the Champions League"`
- `"Show my earn positions and compound my yield into JUP"`
- `"Lock 10,000 JUP for 1 year with a 6-month cliff"`

An AI model (Claude Sonnet) reads those commands, returns a structured JSON response with an `action` field, and the app's dispatcher executes that action — opening a swap panel, fetching real-time data, signing a transaction, or chaining multiple operations together in sequence.

ChatFi is **not a wrapper around jup.ag**. It constructs Jupiter API calls directly in-browser, handles transaction signing, broadcasts to mainnet, and confirms on Solscan — all inside one `.jsx` file.

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        ChatFi.jsx                            │
│                                                              │
│  ┌────────────┐   ┌──────────────┐   ┌───────────────────┐  │
│  │  Landing   │   │  Auth Layer  │   │   Chat Interface  │  │
│  │  Page      │   │  Privy +     │   │   (messages,      │  │
│  │  (HTML/CSS)│   │  Reown AppKit│   │    panels, state) │  │
│  └────────────┘   └──────────────┘   └───────────────────┘  │
│                                               │              │
│                                               ▼              │
│                          ┌────────────────────────────────┐  │
│                          │     sendMessage() → /api/claude │  │
│                          │     Claude Sonnet 4 (AI Brain) │  │
│                          │     Returns: { text, action,   │  │
│                          │               actionData }     │  │
│                          └────────────────────────────────┘  │
│                                               │              │
│                                               ▼              │
│                          ┌────────────────────────────────┐  │
│                          │       Action Dispatcher        │  │
│                          │  SHOW_SWAP / FETCH_PORTFOLIO / │  │
│                          │  BASKET_SWAP / SHOW_TRIGGER /  │  │
│                          │  PLACE_PREDICTION / SHOW_LOCK  │  │
│                          │  ... 40+ action handlers       │  │
│                          └────────────────────────────────┘  │
│                                               │              │
│               ┌───────────────────────────────┤              │
│               ▼                               ▼              │
│   ┌──────────────────┐           ┌────────────────────────┐  │
│   │   Jupiter API    │           │  Solana RPC + Wallet   │  │
│   │   /api/jupiter   │           │  Sign & Broadcast Tx   │  │
│   │   (Vercel proxy) │           │  @solana/web3.js       │  │
│   └──────────────────┘           └────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Core architectural decisions

**Single-file monolith.** Everything — UI, business logic, API calls, transaction execution — lives in one `.jsx` file. This makes the app trivially deployable with no build complexity beyond Vite.

**AI as the router.** Instead of a traditional UI navigation system, the AI model decides what screen or operation to open. The frontend never hard-codes routing logic — it maps AI action strings to component visibility flags.

**Proxy-mediated API calls.** All Jupiter API calls go through `/api/jupiter` (a Vercel serverless function) that injects the API key. Prediction market calls go direct from the browser (to avoid server-side geo-blocks). This hybrid approach keeps credentials secure while respecting Jupiter's geo-access requirements.

**Two-layer wallet architecture.** Social login (email, Google, Twitter via Privy) creates an embedded Solana wallet automatically. External wallets (Phantom, Backpack, Solflare, OKX, etc.) connect via Reown AppKit (WalletConnect v2). Both pathways normalise to a `{ signTransaction, signAllTransactions, signMessage }` interface.

---

## 3. Technology Stack & Dependencies

### Frontend
| Library | Version | Purpose |
|---|---|---|
| React | 18+ | UI rendering with hooks |
| `@solana/web3.js` | latest | Solana RPC, Transaction, PublicKey |
| `@solana/spl-token` | latest | SPL token ATA creation + transfer |
| `@reown/appkit` | latest | WalletConnect v2, multi-wallet modal |
| `@reown/appkit-adapter-solana` | latest | Solana adapter for AppKit |
| `@privy-io/react-auth` | latest | Social/email login + embedded wallets |

### Backend (Vercel Serverless)
| Route | Purpose |
|---|---|
| `/api/claude` | Proxies messages to Claude Sonnet 4 API |
| `/api/jupiter` | Proxies all Jupiter API calls (injects API key) |
| `/api/send` | Crafts + partially signs Jupiter Send invite transactions |
| `/api/lock` | Queries Jupiter Lock API for vesting accounts |

### External APIs
| API | Endpoint Base | Usage |
|---|---|---|
| Jupiter Price v3 | `api.jup.ag/price/v3` | Live USD prices, 24h change |
| Jupiter Tokens v2 | `api.jup.ag/tokens/v2` | Token search, categories, verification |
| Jupiter Swap v2 | `api.jup.ag/swap/v2` | Swap orders + execution |
| Jupiter Trigger v2 | `api.jup.ag/trigger/v2` | Limit, OCO, OTOCO orders |
| Jupiter Recurring v1 | `api.jup.ag/recurring/v1` | DCA / scheduled orders |
| Jupiter Earn v1 | `api.jup.ag/lend/v1/earn` | Yield deposits, withdrawals |
| Jupiter Borrow v1 | `api.jup.ag/lend/v1/borrow` | Collateral borrowing |
| Jupiter Prediction v1 | `lite-api.jup.ag/prediction/v1` | Sports/crypto prediction markets |
| Jupiter Portfolio v1 | `api.jup.ag/portfolio/v1` | Full DeFi portfolio |
| Jupiter Perps v1 | `api.jup.ag/perps/v1` | Perpetual futures positions |
| Jupiter Studio v1 | `api.jup.ag/studio/v1` | DBC token creation + fee claims |
| Jupiter Lock v1 | `api.jup.ag/lock/v1` | Token vesting / cliff locks |
| Jupiter Send v1 | `api.jup.ag/send/v1` | Invite-link token sends |
| GeckoTerminal | `api.geckoterminal.com` | Price charts (primary) |
| CoinGecko | `api.coingecko.com` | Price charts (fallback) |
| Solana RPC | `api.mainnet-beta.solana.com` | Transaction broadcast + balance |
| Solscan | `solscan.io` | Transaction explorer links |
| Jupiter ASR | `vote.jup.ag/api/asr` | Staking reward claimable amounts |

---

## 4. Design System & Tokens

Defined at **line 558** as the constant `T` — a single object that every inline-styled component references. This ensures visual consistency across the entire 14,000-line file without any CSS framework.

```js
const T = {
  bg:       "#0d1117",   // Page background — near-black navy
  sidebar:  "#111820",   // Sidebar / drawer
  surface:  "#161e27",   // Card / panel surface
  border:   "#1e2d3d",   // Borders between elements
  text1:    "#e8f4f0",   // Primary text — off-white
  text2:    "#8fa8b8",   // Secondary text — muted blue-grey
  text3:    "#4d6a7a",   // Tertiary / labels — darker
  accent:   "#c7f284",   // Jupiter green — primary CTA colour
  accentBg: "#1a2e1a",   // Green-tinted background for highlights
  green:    "#c7f284",   // Success states
  greenBg:  "#1a2e1a",
  greenBd:  "#2d4d1a",   // Green border
  red:      "#f28484",   // Error / sell / bear
  redBg:    "#2e1a1a",
  redBd:    "#4d2d2d",
  purple:   "#a78bfa",   // Trigger orders, premium features
  purpleBg: "#1e1a2e",
  teal:     "#38bdf8",   // Links, lock/vest statuses
  tealBg:   "#0f2233",
  body:     "'DM Sans','Segoe UI',sans-serif",
  serif:    "'Lora','Georgia',serif",         // Panel titles
  mono:     "'JetBrains Mono',monospace",     // Addresses, signatures
};
```

**Font loading** is injected at runtime (line 1463) via a `<style>` tag inserted into `<head>` — preventing FOUC (Flash Of Unstyled Content) without relying on an external CSS file.

```
DM Sans        → Body text (weights 300–800)
JetBrains Mono → Wallet addresses, transaction signatures, CLI
Lora           → Serif panel headings for hierarchy contrast
```

---

## 5. Jupiter API Layer (Lines 144–199)

All API endpoint strings are defined as module-level constants so they're referenced by name throughout the file rather than as repeated strings.

```
JUP_BASE         = "https://api.jup.ag"
JUP_LITE         = "https://lite-api.jup.ag"

JUP_PRICE_API    → /price/v3          — usdPrice, priceChange24h per mint
JUP_TOKENS_API   → /tokens/v1/token   — detail by mint address
JUP_TOKEN_SEARCH → /tokens/v2/search  — fuzzy + exact token search
JUP_TOKEN_TAG    → /tokens/v2/tag     — filter by tag (lst, verified)
JUP_TOKEN_CAT    → /tokens/v2/{cat}   — toporganicscore, toptraded, toptrending
JUP_TOKEN_RECENT → /tokens/v2/recent  — newly listed tokens
JUP_SWAP_ORDER   → /swap/v2/order     — get swap transaction (v2 meta-aggregator)
JUP_SWAP_EXEC    → /swap/v2/execute   — execute swap
JUP_TV2          → /trigger/v2        — limit, OCO, OTOCO orders (JWT auth)
JUP_TV2_LITE     → lite-api.jup.ag/trigger/v2
JUP_RECUR_BASE   → /recurring/v1      — DCA / scheduled orders
JUP_PORTFOLIO    → /portfolio/v1      — full DeFi portfolio snapshot
JUP_PRED_API     → lite-api.jup.ag/prediction/v1  — prediction markets
JUP_EARN_API     → /lend/v1/earn      — yield vaults
JUP_BORROW_API   → /lend/v1/borrow    — borrow vaults
JUP_SEND_API     → /send/v1           — invite-link sends + clawback
JUP_PERPS_API    → /perps/v1          — perpetual futures
JUP_STUDIO_API   → /studio/v1         — DBC token creation
JUP_LOCK_API     → /lock/v1           — token vesting
JUP_ROUTE_API    → /swap/v1/quote     — raw quote with full DEX route breakdown
```

**Special constants (line 172–176):**
- `JUPUSD_MINT` — JupUSD stablecoin used as prediction market deposit fallback
- `USDC_MINT` — Primary stable for predictions, earn, borrow
- `CHATFI_REFERRAL` — The ChatFi referral account; Jupiter swap fees accrue here

**`TOKEN_MINTS` (line 178):** A pre-seeded lookup table of popular Solana tokens (SOL, JUP, BONK, WIF, USDC, USDT, RAY, PYTH, mSOL, JitoSOL, bSOL, ORCA, POPCAT, TRUMP, BTC, ETH). This prevents meme-token namespace collisions — e.g. if a meme coin uses ticker "BTC", the real Wormhole WBTC mint is used for lookups instead.

**`TOKEN_DECIMALS` (line 201):** Decimal places per token, used for raw-to-display amount conversion throughout all transaction flows.

---

## 6. AI Brain — System Prompt & Intent Engine (Lines 200–526)

### What it is

The constant `SYSTEM_PROMPT` (starting around line 200 after the token definitions) is a multi-thousand-word instruction set fed to Claude Sonnet on every chat turn. It defines:

1. **Response format** — Claude must always return valid JSON: `{ "text": "...", "action": "ACTION_NAME", "actionData": { ... } }`
2. **All supported actions** — Every action string the app's dispatcher recognises, with the exact `actionData` shape required for each
3. **Intent flexibility** — Typo tolerance, slang, abbreviation handling ("swp" → SHOW_SWAP, "porftolio" → FETCH_PORTFOLIO)
4. **Chaining rules** — How to structure multi-step `CHAINED_ACTIONS`
5. **Full feature list** — What to respond when the user asks "what can you do?"
6. **Critical constraints** — Never say "I can't", always fire the relevant action, never fabricate prices

### How the AI stays current

At message-send time (line 8405), if `jupDocs` is available (a cached copy of Jupiter's `llms-full.txt` documentation), it's prepended to the system prompt:

```
system: `## Jupiter Official API Documentation\n\n${jupDocs}\n\n---\n\n${SYSTEM_PROMPT}${walletContext}`
```

This means Claude has live Jupiter API documentation context — it knows current endpoint shapes, supported parameters, and product semantics.

### Dynamic wallet context

Also injected at message-send time:

```js
const walletContext = walletFull
  ? `\nWallet connected: YES\nWallet address: ${walletFull}\n...`
  : `\nWallet connected: NO\nIf user requests wallet actions, prompt connect.`
```

This tells Claude whether to suggest wallet connection or proceed directly with on-chain actions.

### Supported action strings (full list)

```
FETCH_PRICE            FETCH_TOKEN_INFO       FETCH_PORTFOLIO
SHOW_SWAP              BASKET_SWAP            SWAP_ALL_WALLET
SHOW_TRIGGER           SHOW_TRIGGER_V2        SHOW_RECURRING
FETCH_TRIGGER_ORDERS   FETCH_RECURRING_ORDERS SHOW_PREDICTION
FETCH_PREDICTIONS      PLACE_PREDICTION       BASKET_PREDICTION
CLAIM_PAYOUTS          SCAN_PRED_ODDS         AUTO_PRED_BET
SHOW_PRED_CLI          FETCH_EARN             SHOW_EARN_DEPOSIT
SHOW_BORROW            SHOW_MULTIPLY          SHOW_LEND_POSITIONS
SHOW_PERPS             FETCH_PERPS_POSITIONS  SHOW_STUDIO
FETCH_STUDIO_FEES      SHOW_LOCK              FETCH_LOCKS
SHOW_SEND              FETCH_SEND_HISTORY     SHOW_ROUTE
SHOW_TRADE_JOURNAL     SET_PRICE_ALERT        DETECT_VOLATILITY
FETCH_VOL_MONITORS     FETCH_XSTOCKS          FETCH_TOKEN_CATEGORY
FETCH_TOKEN_TAG        FETCH_RECENT_TOKENS    FETCH_TOKEN_VERIFY
COPY_TRADE             CHAINED_ACTIONS
```

---

## 7. Suggestion Groups & Power Commands (Lines 528–555)

`SUGGESTION_GROUPS` is an array of categorised prompt suggestions displayed in the chat interface as clickable chips. Five built-in groups:

| Group | Colour | Example items |
|---|---|---|
| ⚡ Power | Purple `#a78bfa` | "Smart entry SOL", "Morning briefing" |
| Market | Green `#c7f284` | "Top trending tokens today", "Top xStocks" |
| Trade | Teal `#63b3ed` | "Basket swap: $50 each of SOL JUP BONK", "Long SOL 10x perps" |
| Earn | Green `#68d391` | "Show earn vaults", "DCA $10 USDC into SOL daily" |
| Tools | Orange `#f6ad55` | "Create token on Jupiter Studio", "Arsenal vs Man City prediction" |

**Power Commands** are not AI actions — they are client-side analytics workflows that trigger parallel data fetches before showing the result:

- `"Smart entry X"` → price + trending rank + swap quote, all in parallel
- `"Exit my X"` → momentum check + balance + best route
- `"Deep dive X"` → metadata, organic score, safety flags, liquidity depth
- `"Morning briefing"` → balances + earn positions + open orders in parallel

**Plugin extension point (line 17):** `PLUGIN_SUGGESTION_GROUPS` is spread into the main array, allowing external plugins to add their own suggestion categories with no modification to core code.

---

## 8. SVG Icon System (Lines 22–143)

ChatFi uses zero icon libraries. Every icon is an inline SVG functional React component, defined at the top of the file. This eliminates icon library bundle size and guarantees pixel-perfect control.

Icons defined (with purpose):

| Component | Used for |
|---|---|
| `SvgChat` | Chat bubbles, message indicators |
| `SvgWallet` | Wallet connect buttons |
| `SvgZap` | Lightning / instant swap actions |
| `SvgBarChart` | Portfolio, analytics |
| `SvgLink` | URL / link icons |
| `SvgTwitterX` | Twitter/X social links |
| `SvgDiscord` | Discord links |
| `SvgTelegram` | Telegram links |
| `SvgGithub` | GitHub links |
| `SvgBlog` | Blog / documentation |
| `SvgPhone` | Mobile / Jupiter Mobile |
| `SvgLock` | Token vesting / lock panels |
| `SvgPalette` | Theme / colour features |
| `SvgCoin` | Token / coin displays |
| `SvgMap` | Location / navigation |
| `SvgUpload` | File / image upload (Studio) |
| `SvgCalendar` | DCA scheduling |
| `SvgRocket` | Launch / Studio / token creation |
| `SvgWarning` | Risk warnings, slippage alerts |
| `SvgFrog` | PEPE / meme token category |
| `SvgArrowReturn` | Undo / clawback actions |
| `SvgSearch` | Token search input |

All accept `size` (px) and `color` (CSS colour string) props, defaulting to `16` and `"currentColor"` respectively.

---

## 9. Markdown Formatter — `fmt()` (Lines 600–803)

The `fmt()` function is ChatFi's custom message renderer. It converts raw text (with markdown-like syntax) into styled HTML strings that are injected via `dangerouslySetInnerHTML`. It is one of the most complex sub-systems in the file.

### What it handles

**Inline markdown (via `inlineMd()`):**
- `**bold**` → `<strong>`
- `*italic*` → `<em>`
- `` `code` `` → `<code>`
- `[text](url)` → green underlined anchor with `target="_blank"`

**Numbered token lists (lines 616–660):**
When Claude responds with numbered items in the format `1. TOKEN — Name $price (+change%) · extra`, `fmt()` renders them as rich token cards with:
- Rank badge (gold/silver/bronze for #1/#2/#3)
- Optional logo image (`[img:URL]` tag parsed from the content)
- Token symbol, name, price, percentage change
- Volume/score metadata
- Clickable card (calls `onTokenClick` callback)

**Swap receipt cards (lines ~700–795):**
When Claude sends a special `__SWAP_RECEIPT__` marker with swap metadata encoded, `fmt()` renders a styled swap confirmation card showing:
- Sent amount and token → Received amount and token
- Transaction fee
- Transaction signature (with one-click copy)
- Solscan link (opens explorer)

**Normal text:** Falls through to a plain `<span>` with line-break rendering, passing through the inline markdown processor.

### Why it matters

This means ChatFi's entire display layer is HTML-string-based (not React component trees), which enables very efficient streaming-style message rendering and allows the AI to directly influence visual output by changing the text it returns.

---

## 10. TokenPicker Component (Lines 806–899)

A debounced, async-search dropdown for selecting any Solana token. Used inside the swap, trigger, recurring, lock, send, earn, and borrow panels — anywhere the user needs to pick a token.

### Architecture

**State:** `query` (display string), `results` (array), `busy` (loading), `focused` (dropdown visible)

**Search logic (line 825):**
Fires after 300ms debounce. Runs two parallel requests:
1. Jupiter Tokens v2 search (verified + community tokens)
2. Jupiter Tokens v1 search (fallback for unverified / new / meme tokens)

Results are merged and deduplicated by mint address. Sort priority:
1. Exact symbol match (case-insensitive)
2. v2 tokens before v1
3. 24h volume descending

**Display:** Shows up to 50 results. Each row shows the token logo (graceful fallback if broken), symbol, name truncated to 24 chars, and daily volume in `$Xk` format.

**onSelect callback:** Returns `(symbol, mint, decimals)` — the three pieces of information all transaction panels need to construct on-chain operations.

---

## 11. TokenMiniChart Component (Lines 902–1032)

An inline price chart for any token, rendered as a pure SVG polyline. Uses no charting library.

### Data sources

**Primary:** GeckoTerminal OHLCV API — hourly or daily candles for the token's Solana pool
**Fallback:** CoinGecko market chart — if GeckoTerminal returns empty or errors

Both requests use `AbortController` — if the user changes the time range mid-fetch, the previous request is cancelled immediately.

### Time ranges

| Range | GeckoTerminal config | Displayed points |
|---|---|---|
| 1D | Hour candles, 24 points | ~24 |
| 7D | 4h aggregate, 42 points | ~42 |
| 30D | Day candles, 30 points | ~30 |

### SVG rendering

The chart draws:
- A filled `<polygon>` gradient area (green if price up, red if down)
- A `<polyline>` stroke line showing price movement
- A `<circle>` dot at the final price point
- Time labels (start and end timestamps) below

The SVG viewport is always 300×72 — it scales responsively via `width: 100%` on the container.

### Skeleton

While loading, a shimmer animation (`linear-gradient` + `@keyframes shimmer`) placeholder is shown. If neither API returns data, the component renders `null` (no empty border box).

---

## 12. TrendingTicker Component

A horizontally scrolling ticker bar at the top of the chat interface showing live trending tokens from Jupiter's category API. Tokens are fetched on mount (category: `toptrending`, interval: `24h`) and displayed as a continuously animating strip. Clicking a token name sends a fetch-token-info query to the AI.

---

## 13. Blog / Docs Articles

An in-app documentation system. Seven articles are hard-coded as JavaScript objects (~lines 1161–1454), each with:
- `id`, `title`, `category`, `readTime`, `summary`
- `sections[]` — heading + body paragraph pairs
- `tips[]` — bullet-point pro tips

Articles cover:
1. Getting Started — First swap walkthrough
2. How ChatFi Swaps Work — Jupiter routing, slippage, referral fees
3. Basket Swaps — Multi-token trades in one command
4. Automating Trades — Limit orders, DCA, OCO
5. Earning Passive Yield — Jupiter Earn, Borrow, Multiply
6. Prediction Markets — How to bet on sports/crypto outcomes
7. Understanding Your Portfolio — Balances, positions, alerts, journal

These articles are rendered inside the chat as an in-app blog reader — no external CMS or network request required.

---

## 14. Landing Page System

### Style injection (line 1458)

A self-invoking function `injectLandingStyles()` inserts a `<style>` block into `<head>` with all landing page CSS (using CSS custom properties and class names). This fires synchronously at module load time, preventing any flash of unstyled content when the landing page renders.

### CSS architecture

Uses CSS custom properties (`--lp-bg`, `--lp-accent`, etc.) on `.lp-root`, plus purpose-built class names for every element. Key classes:

| Class | Purpose |
|---|---|
| `.lp-root` | Full-screen overlay (position: fixed, z-index: 200) |
| `.lp-dot-bg` | Animated dot grid background (CSS mask + radial-gradient) |
| `.lp-mockup-wrap` | The rotating rainbow-gradient border around the chat mockup |
| `.lp-btn-primary` | Jupiter-green CTA buttons |
| `.lp-btn-ghost` | Secondary bordered buttons |
| `.lp-hero` | Full-width hero section with radial glow |
| `.lp-badge` | "Built on Jupiter" pill badge |

### Animations defined

```css
@keyframes lp-pulse    — pulsing green dot (live indicator)
@keyframes lp-floatUp  — content enters from below on load
@keyframes lp-spin     — rotating gradient border on mockup card
@keyframes lp-reveal   — section reveal on scroll
```

### Key sections

- **Nav** — Sticky header with blur backdrop, logo, nav links, CTA button
- **Hero** — Headline with `.acc` span (green), sub-copy, CTA row, animated chat mockup
- **Features grid** — Six feature cards with icons, colour-coded by category
- **Token ticker preview** — Live token prices inline in the landing page
- **Stats bar** — "$X volume routed", "X tokens", "X+ wallets"
- **Blog preview** — Three article cards from the in-app docs
- **Footer** — Logo, social links (Twitter/X, Discord, Telegram, GitHub), tagline

---

## 15. Token Lock Card — `MLocker`

Used by the `FETCH_LOCKS` action to display each vesting account as a rich card.

### What it shows per lock

- Token symbol + mint address (truncated, linked to Solscan)
- Status badge: `locked` / `claimable` / `fully vested`
- Three amount tiles: Total Locked / Claimed / Claimable Now
- Animated progress bar (claimed % of total)
- Cliff date and recipient address
- Mint address link
- One-click **Claim** button (only visible when `status === "claimable"`)

### Cliff + claimable calculation (lines 4156–4172)

The component computes whether the cliff has passed (current timestamp vs cliff timestamp), then estimates claimable amount:
```
if (claimRaw is 0 but cliff passed and unlockedPct > 0):
  effectiveClaimRaw = (totalRaw × unlockedPct / 100) − claimedRaw
```
This handles APIs that return percentage-based vesting data rather than raw claimable amounts.

---

## 16. Yield Vault System

One of ChatFi's most unique features — a compound-yield automation layer that sits on top of Jupiter Earn.

### YieldVaultPromptCard (line 2009)

A promotional card that appears in chat after the user's earn positions are detected. It describes the Yield Vault feature and offers a "Set Yield Vault" button.

### YieldVaultPanel (line 2082)

The three-step setup UI:

**Step 1 — Select positions:** Shows the user's live Jupiter Earn deposits. Already-vaulted positions appear greyed out. New positions are selectable. If a vaulted position has received additional deposits since last config, a `+X.XXXX new` indicator shows a top-up option.

**Step 2 — Set threshold:** A USD amount (e.g. "$10") — when accrued yield crosses this threshold, the vault fires.

**Step 3 — Choose target token:** A `TokenPicker` dropdown to select what token the yield auto-swaps into. The principal is never touched — only the yield above the threshold is converted.

### How it works at runtime

The vault configuration is stored in `localStorage` (keyed by wallet address). A polling mechanism checks the user's earn positions on an interval. When yield balance exceeds `principal + threshold`, a swap is triggered automatically using the stored target token.

### Helper utilities

```js
formatAPY(apy)          — Converts basis points (e.g. 41500) to "4.15%"
formatEarned(earned, sym) — Formats yield delta as "+0.0042 USDC earned"
```

### TokenLogo component (line 2059)

A robust token logo resolver with three fallback sources:
1. Provided `logo` prop
2. `raw.githubusercontent.com/solana-labs/token-list` legacy CDN
3. `img.jup.ag/tokens/{mint}` Jupiter's image CDN

If all fail, renders a monogram circle with the token's first two characters.

---

## 17. WalletConnect QR / WC v2 Flow

For Jupiter Mobile and any WalletConnect-compatible wallet, ChatFi generates a QR code using the `qrcode` library (loaded dynamically from jsDelivr CDN). The QR code contains the WalletConnect URI (`wc:...`) that the mobile wallet scans.

### Flow

1. Reown AppKit generates a WC URI
2. ChatFi loads `qrcode.min.js` dynamically if not already present
3. `QRCode.toCanvas()` renders the code into a `<canvas>` element
4. The user scans with Jupiter Mobile (or any WC wallet)
5. Wallet approves → `reownAccount` populates → `walletFull` is set

This allows the app to connect to Jupiter Mobile's in-app browser even when `window.solana` is not yet injected (which happens when the page loads before the wallet's browser context is fully ready).

---

## 18. Proxy Layer — `jupFetch` & `predFetch` (Lines 2876–2906)

### `jupFetch(url, options)` (line 2890)

All Jupiter API calls (except prediction markets) go through this function, which POSTs to `/api/jupiter`:

```js
const payload = { url, method, body }
// For Lend and Studio endpoints, passes apiKey
fetch("/api/jupiter", { method: "POST", body: JSON.stringify(payload) })
```

The Vercel serverless function at `/api/jupiter` adds the Jupiter API key header before forwarding to `api.jup.ag`. Responses are returned as parsed JSON. If the proxy returns an error (HTML 404/500), `jupFetch` throws a descriptive error rather than crashing on JSON parse.

### `predFetch(url, options)` (line 2879)

Used exclusively for prediction market endpoints. Goes **directly** from the browser to `lite-api.jup.ag/prediction/v1` — bypassing the server proxy — so Jupiter sees the user's actual IP address (avoiding server-side geo-blocks). This is intentional architecture, documented in the code comments.

---

## 19. Token Resolution Engine (Lines 2908–3108)

### `resolveToken(symbolOrName)` (line 2910)

Resolves any token ticker, name, or Solana address to `{ mint, decimals }`.

**Resolution order:**
1. In-memory cache (`tokenCacheRef`) hit → return immediately
2. Base58 address detection (32–44 chars) → use as mint directly
3. Jupiter Tokens v2 search → prefer exact symbol match
4. Jupiter Tokens v1 search → fallback for unverified / meme tokens

Caches results in `tokenCacheRef` (symbol → mint) and `tokenDecimalsRef` (symbol → decimals) for the session lifetime.

### `fetchTokenInfo(symbol)` (line 2982)

Fetches rich metadata for a token. Returns a normalised object including:

```js
{
  address, logo_url,
  usdPrice, market_cap, fdv, liquidity, circSupply, totalSupply, holderCount,
  daily_volume, priceChange24h,
  numBuys24h, numSells24h, numTraders24h, buyVolume24h, sellVolume24h,
  stats1h, stats6h,
  firstPoolId, firstPoolAt,   // token age
  organicScore, organicScoreLabel,
  freezeAuthority, mint_authority, topHoldersPercentage, devMints,
  twitter, website, telegram, discord,
  launchpad, graduatedAt, tags
}
```

**Resolution priority (lines 3039–3107):**
1. Known hardcoded mint (from `TOKEN_MINTS`) or direct base58 address → hit v1 token detail endpoint
2. v2 token search by symbol (preferred exact match + cachedMint cross-validation)
3. v1 token search fallback
4. Last-resort: cached mint + v1 detail

### `fetchXStocks(limit, sort)` (line 3139)

Fetches tokenized real-world stocks from Jupiter. Searches for 37 known xStock symbols in parallel (SPYx, QQQx, AAPLx, NVDAx, etc.) using `Promise.allSettled`. Results are sorted by volume or by symbol before slicing to the requested limit.

---

## 20. Portfolio Data Fetcher (Lines ~3900–4221)

### `fetchPortfolioData(walletAddress)` (line ~3900)

The most complex data fetch in the application. Fetches 11 data sources in parallel and returns a merged portfolio object.

```
1. SPL token balances     — getTokenAccountsByOwner via Solana RPC
2. SOL balance            — getBalance via Solana RPC
3. Wallet portfolio       — Jupiter Portfolio API /positions/{wallet}
   ↳ Extracts: portfolioElements, earn positions (from portfolio), lock positions (from portfolio)
4. Open trigger orders    — Jupiter Trigger v2 /orders?inputAccount=...
5. Recurring orders       — Jupiter Recurring /getRecurringOrders?user=...
6. Prediction orders      — Jupiter Prediction /orders?ownerPubkey=...
7. Earn positions         — Jupiter Earn /positions?users=...
   ↳ Falls back to: portfolio-extracted earn data
8. Staked JUP             — Jupiter Portfolio /staked-jup/{wallet}
8b. ASR rewards           — vote.jup.ag/api/asr/claimable (governance staking rewards)
9. Perps positions        — Jupiter Portfolio /positions/{wallet}?platforms=jupiter-perps
10. LP positions          — Extracted from portfolio elements (Orca, Raydium, Meteora labels)
11. Lock positions        — Jupiter Lock API /locks?wallet=...
    ↳ Falls back to: /api/lock server proxy
    ↳ Falls back to: portfolio-extracted lock data
```

All amounts are normalised to human-readable values (raw integer / 10^decimals).

---

## 21. Transaction Execution Layer (Lines ~4222–5632)

### Studio Token Creation — `doCreateToken()` (line 4244)

Five-step flow for launching a new token via Jupiter Studio Dynamic Bonding Curves:

1. **POST `/studio/v1/dbc-pool/create-tx`** → returns unsigned transaction + presigned S3 URLs
2. **PUT image** to the presigned image URL (S3 direct upload)
3. **PUT metadata JSON** to the presigned metadata URL
4. **Sign transaction** with the connected wallet provider
5. **POST multipart/form-data** to `/studio/v1/dbc-pool/submit` with the signed transaction + description

Three launch presets are built in:
- `meme` — $16K → $69K market cap curve, 100bps fee, LP locked
- `indie` — $32K → $240K curve, anti-sniping, 1-year vesting for 100M tokens
- `chatfi` — 80% community locked 2 years, single release, zero cliff

### Swap Execution — `doSwap()` (implied by swap panel)

Standard Jupiter swap flow:
1. Fetch swap quote from `/swap/v2/order`
2. Present to user (price impact, fees, out amount)
3. User clicks "Swap" → get `transaction` field from order response
4. Deserialise `VersionedTransaction`
5. Sign with active wallet provider
6. Send via `connection.sendRawTransaction()`
7. Confirm via `connection.confirmTransaction()`
8. Post swap receipt card to chat

### Claim Payouts — `doClaimPayouts()` (line ~5100)

Fetches all open prediction market orders for the user's wallet, filters for claimable positions (event resolved, user on winning side), and executes claim transactions for each.

### Close Perps Position — `doClosePerp()` (line 5509)

1. POST to `/perps/v1/close` with wallet + position key
2. Deserialise returned base64 transaction
3. Sign with wallet provider
4. Broadcast via Solana RPC JSON-RPC call
5. Remove position from local state on success

### Prediction Bet — `doPredictionBet()` (line 5552)

1. Build order payload: `{ ownerPubkey, marketId, isYes, isBuy, depositAmount, depositMint }`
2. Try USDC mint first, fall back to JupUSD mint
3. POST to `/prediction/v1/orders` via `predFetch` (direct browser request)
4. Deserialise + sign transaction
5. Broadcast via Solana RPC
6. Post bet confirmation card to chat

Handles geo-restriction errors specifically — detects `unsupported_region` in the error message and shows a helpful explanation rather than a generic failure.

---

## 22. Send & Invite Link System (Lines ~5200–5507)

### Invite Send — `doInviteSend()` (line ~5200)

Six-step flow for sending tokens to anyone via a link (recipient needs no wallet upfront):

1. Generate a random `Keypair` as the invite keypair
2. Derive invite code from the keypair
3. Look up the token mint and resolve recipient ATA
4. POST to `/api/send` server route → server calls Jupiter `/send/v1/craft-send`
5. **Dual-sign** the returned transaction: first the invite keypair, then the sender wallet
6. Broadcast + confirm on-chain, return `https://jup.ag/send?code=XXXX` invite link

Recipients claim by visiting the Jupiter Mobile link. Tokens auto-return to sender on expiry.

### Direct Send — `doDirectSend()` (line 5401)

Constructs a raw Solana transaction:
- **SOL:** `SystemProgram.transfer()` instruction
- **SPL tokens:** Creates recipient ATA if missing (`createAssociatedTokenAccountInstruction`), then `createTransferInstruction`

Signs and broadcasts without going through Jupiter's API.

### Clawback — `doClawback()` (line 5470)

Recalls unclaimed invite tokens:
1. POST to `/api/send?action=clawback` with the invite code
2. Server derives the invite keypair, calls Jupiter `/send/v1/craft-clawback`, partially signs
3. Returns partially-signed tx for the sender wallet to co-sign
4. Broadcasts the dual-signed transaction

---

## 23. Perps / Perpetual Futures (Lines 5509–5550)

ChatFi exposes Jupiter's perpetual futures via two flows:

**Open position** — `SHOW_PERPS` action opens the perps panel with pre-filled market (SOL, BTC, ETH), direction (long/short), leverage, and collateral amount. The panel links to `jup.ag/perps` for the actual order UI.

**Close position** — `doClosePerp()` closes a position directly in-app: POSTs to `/perps/v1/close`, signs, and broadcasts. The closed position is removed from local state immediately.

**View positions** — `FETCH_PERPS_POSITIONS` action fetches all open perps from the portfolio API and displays them with unrealised PnL, liquidation price, leverage, and close buttons.

---

## 24. Prediction Markets Engine (Lines 5552–5700)

### `fetchPredictionMarkets(sport, query, limit)` (line ~5652)

Fetches live markets from `lite-api.jup.ag/prediction/v1`. Supports:
- Sport/category filter (`sports`, `crypto`, `politics`, `esports`)
- Free-text query for team/event name matching
- Limit on number of results

Each market object is normalised to include `marketId`, `title`, outcome probabilities (yes/no), pool size (volume), close timestamp, and outcome array.

### `scanPredOdds(params)` (line ~5700)

Used by the Prediction CLI dashboard. Fetches a large set of markets, computes an "edge" score for each outcome:

```
edge = |impliedProbability − marketProbability| × 100%
bestSide = "yes" if yesEdge > noEdge else "no"
payoutRatio = 1 / bestSideProbability
```

Markets are ranked by edge descending. Only markets above `minEdge` threshold are shown.

---

## 25. Wallet Connection Architecture (Lines 6853–7135)

ChatFi's wallet layer is the most complex part of the codebase — it needs to support every Solana wallet on both desktop and mobile.

### Detection hierarchy

**1. Wallet Standard** (line 6856) — The modern browser standard. Wallets that register via `window.__wallet_standard__` are detected first. ChatFi wraps them into a normalised `{ connect, signTransaction }` shape via `wrapStandardWallet()`.

**2. Legacy injected providers** (line 6866) — Desktop browser extensions that inject into `window`:
```
Phantom      → window.phantom.solana
Solflare     → window.solflare (with isSolflare check)
Backpack     → window.backpack.solana
Jupiter      → window.solana (with isJupiter flag)
Trust Wallet → window.trustwallet.solana
Coin98       → window.coin98.sol
OKX          → window.okxwallet.solana
```

**3. Generic `window.solana` catch-all** (line 6996) — Jupiter Mobile's in-app browser injects `window.solana` but doesn't set `window.jupiter` and doesn't register via Wallet Standard. ChatFi detects this with flag inspection (`isJupiter`, `isPhantom`, etc.) and adds it to the list.

**4. Mobile deep links** (line 7025) — On mobile, for any wallet not detected, a deep link entry is added. These open the respective wallet app, which then redirects back to the current URL.

**5. Desktop install links** (line 7044) — On desktop, for undetected wallets, a "Download" entry links to the wallet's official install page.

### Late injection handling (line 7075)

Many wallets (Backpack, OKX, Jupiter Mobile) inject their providers asynchronously after page load. ChatFi handles this with:
- `window.addEventListener("wallet-standard:register-wallet", rebuild)` — catches standard registrations
- Three `setTimeout` rebuilds at 300ms, 800ms, and 2000ms — catches late injection

### `getActiveProvider()` (line 7136)

Returns the currently-active signing provider, trying in order:
1. Reown AppKit provider (if Reown-connected and not in Privy mode)
2. `connectedProviderRef.current` (manually connected legacy provider)
3. First Wallet Standard wallet found
4. Privy embedded wallet (`useSolanaWallets()` hook)

Each path normalises to `{ signTransaction, signAllTransactions, signMessage }`.

### Wallet logos (line 6901)

- **Phantom:** Inline SVG data URI (Phantom blocks hotlinks from external domains)
- **OKX:** Inline SVG data URI (same reason)
- **All others:** Favicon URLs from official domains (Solflare, Backpack, Jupiter, Trust Wallet, Coin98)

---

## 26. Main Chat Engine — `sendMessage()` (Lines ~8330–8600)

The central function that handles every user message submission.

### Pre-AI shortcuts

Before hitting the AI, `sendMessage()` checks for exact-match shortcuts that bypass the network call entirely:

```
"clear" / "clear chat" / "reset"  → clears message history + all panel state
"disconnect wallet" / "sign out"  → calls disconnectWallet()
"yield vault" / "my vault"        → triggers vault panel directly
"set yield vault"                 → triggers vault setup panel
```

### AI call flow

1. Build `walletContext` string (inject wallet address or "not connected" note)
2. POST to `/api/claude`:
   ```json
   {
     "model": "claude-sonnet-4-20250514",
     "max_tokens": 2048,
     "system": "<jupDocs if available> + SYSTEM_PROMPT + walletContext",
     "messages": histRef.current (last 40 turns)
   }
   ```
3. Receive raw text → strip markdown fences → strip JS inline comments → extract JSON
4. If JSON parse fails → attempt to auto-repair (close unclosed `{}[]`) → retry parse
5. If still failing → regex-salvage just the `"text"` field
6. Call action dispatcher with `{ text, action, actionData }`

### Conversation history

`histRef.current` stores the last 40 message pairs. Persisted to `sessionStorage` as `"chatfi-hist"` so it survives page reloads within the same session. Cleared on "clear chat".

---

## 27. Action Dispatcher — All 40+ Actions (Lines ~8460–10150)

Each `if/else if` branch in the dispatcher handles one action type. Here is what each does:

| Action | What happens |
|---|---|
| `FETCH_PRICE` | Resolves unknown tokens, calls `fetchPrices()`, formats price lines, pushes to chat |
| `FETCH_TOKEN_INFO` | Calls `fetchTokenInfo()`, opens `TokenCard` panel |
| `FETCH_PORTFOLIO` | Calls `fetchPortfolioData()`, opens Portfolio panel, merges logo maps, fetches live prices for all positions |
| `SHOW_SWAP` | Resolves both token mints, resolves amount (number / "half" / "25%" / USD), sets `swapCfg`, shows swap panel |
| `BASKET_SWAP` | Queues multiple swaps, executes sequentially, posts individual receipts |
| `SWAP_ALL_WALLET` | Reads wallet balances, creates sell trades for all non-USDC tokens, executes basket |
| `SHOW_TRIGGER` | Sets `trigCfg` with token/direction/price/amount, shows legacy trigger panel |
| `SHOW_TRIGGER_V2` | Sets `trigV2Cfg` with OCO/OTOCO support, shows v2 trigger panel |
| `SHOW_RECURRING` | Sets `recurringCfg` with DCA params, shows DCA setup panel |
| `FETCH_TRIGGER_ORDERS` | Fetches v2 trigger orders from Jupiter API, shows orders list |
| `FETCH_RECURRING_ORDERS` | Fetches DCA orders, shows list with cancel buttons |
| `SHOW_PREDICTION` | Sets prediction panel data, shows prediction selector |
| `FETCH_PREDICTIONS` | Fetches live prediction markets by sport/query, shows market list |
| `PLACE_PREDICTION` | Looks up market by query, pre-fills bet panel |
| `BASKET_PREDICTION` | Queues multiple prediction bets in sequence |
| `CLAIM_PAYOUTS` | Calls `doClaimPayouts()` |
| `SCAN_PRED_ODDS` | Fetches markets, computes edges, shows CLI dashboard |
| `AUTO_PRED_BET` | Scans odds and auto-places bets on high-edge outcomes |
| `SHOW_PRED_CLI` | Opens prediction CLI terminal panel |
| `FETCH_EARN` | Fetches earn vaults, shows vault list with APYs |
| `SHOW_EARN_DEPOSIT` | Pre-fills earn deposit panel with vault + amount |
| `SHOW_BORROW` | Sets borrow vault config, shows borrow panel |
| `SHOW_MULTIPLY` | Filters multiply vaults, shows leverage yield panel |
| `SHOW_LEND_POSITIONS` | Fetches and shows all lend/earn/borrow positions |
| `SHOW_PERPS` | Pre-fills perps panel (market/direction/leverage), shows panel |
| `FETCH_PERPS_POSITIONS` | Fetches open perps from portfolio API |
| `SHOW_STUDIO` | Pre-fills token name/symbol/description, shows token creation form |
| `FETCH_STUDIO_FEES` | POSTs to studio API to get unclaimed DBC creator fees |
| `SHOW_LOCK` | Pre-fills lock amount/token/vesting params, shows lock panel |
| `FETCH_LOCKS` | Fetches vesting accounts via `fetchPortfolioData` + lock APIs |
| `SHOW_SEND` | Sets send token/amount, shows send panel (invite vs direct) |
| `FETCH_SEND_HISTORY` | Fetches pending invites or full send history |
| `SHOW_ROUTE` | Calls `fetchRouteBreakdown()`, shows DEX path visualisation |
| `SHOW_TRADE_JOURNAL` | Fetches on-chain trade history, merges with local journal, displays |
| `SET_PRICE_ALERT` | Creates new price alert, persists to localStorage, starts monitoring |
| `DETECT_VOLATILITY` | Sets up volatility monitor for a token |
| `FETCH_VOL_MONITORS` | Shows active volatility monitors |
| `FETCH_XSTOCKS` | Calls `fetchXStocks()`, formats as numbered token card list |
| `FETCH_TOKEN_CATEGORY` | Fetches trending/organic/traded categories, formats list |
| `FETCH_TOKEN_TAG` | Fetches verified or LST token lists |
| `FETCH_RECENT_TOKENS` | Fetches newest token listings |
| `FETCH_TOKEN_VERIFY` | Checks if user's token qualifies for Jupiter verification |
| `COPY_TRADE` | Fetches wallet's recent transactions, shows mirroring panel |
| `CHAINED_ACTIONS` | Processes `steps[]` array sequentially (see Section 28) |

---

## 28. CHAINED_ACTIONS System (Lines ~9700–10050)

One of ChatFi's most powerful features. When the AI returns `action: "CHAINED_ACTIONS"`, the `actionData.steps` array contains a sequence of sub-actions, each with its own `action` and `actionData`. The dispatcher executes these sequentially:

```js
for (const step of actionData.steps) {
  const stepAction = step.action;
  const stepData   = step.actionData || {};
  // ... giant if/else chain handles every possible step type
  await new Promise(r => setTimeout(r, 300)); // 300ms pause between steps
}
```

**All 40+ action types are supported as chain steps.** This enables compound commands like:

```
"Swap SOL to BONK then alert me when it hits $0.00003"
→ CHAINED_ACTIONS steps: [SHOW_SWAP, SET_PRICE_ALERT]

"Create a token then lock 80% of supply for 2 years"
→ CHAINED_ACTIONS steps: [SHOW_STUDIO, SHOW_LOCK]

"Buy $100 each of SOL JUP BONK then DCA $10 daily into each"
→ CHAINED_ACTIONS steps: [BASKET_SWAP, SHOW_RECURRING × 3]

"Lock 10 USDC for 10 minutes then swap to SOL"
→ CHAINED_ACTIONS steps: [SHOW_LOCK, SHOW_SWAP]
  (lock vesting days = 10 minutes ÷ 1440 = 0.00694 days)
```

Time conversion for lock steps is handled by the AI system prompt (minutes → days formula) and validated client-side.

---

## 29. UI Panels — Full Component Map

All panels are conditionally rendered inline within the main message feed (`{showSwap && <SwapPanel />}`). Each panel is an accordion/card below the AI's message that triggered it. State variables control visibility:

| Panel | State flag | Trigger action |
|---|---|---|
| Swap | `showSwap` | `SHOW_SWAP` |
| Basket swap queue | internal | `BASKET_SWAP` |
| Swap route | `showRoute` | `SHOW_ROUTE` |
| Limit order (legacy) | `showTrig` | `SHOW_TRIGGER` |
| Limit/OCO/OTOCO (v2) | `showTrigV2` | `SHOW_TRIGGER_V2` |
| Trigger orders list | `showTrigOrders` | `FETCH_TRIGGER_ORDERS` |
| DCA setup | `showRecurring` | `SHOW_RECURRING` |
| DCA orders list | `showRecurringOrders` | `FETCH_RECURRING_ORDERS` |
| Portfolio | `showPortfolio` | `FETCH_PORTFOLIO` |
| Token card | `showTokenCard` | `FETCH_TOKEN_INFO` |
| Earn vaults | `showEarn` | `FETCH_EARN` |
| Earn deposit | `showEarnDeposit` | `SHOW_EARN_DEPOSIT` |
| Earn withdraw | `earnWithdraw` | (portfolio panel) |
| Lend positions | `showLendPos` | `SHOW_LEND_POSITIONS` |
| Borrow | `showBorrow` | `SHOW_BORROW` |
| Multiply | `showMultiply` | `SHOW_MULTIPLY` |
| Prediction selector | `showPred` | `SHOW_PREDICTION` |
| Prediction list | `showPredList` | `FETCH_PREDICTIONS` |
| Prediction bet | `showBet` | set by bet selection |
| Prediction CLI | `showPredCLI` | `SHOW_PRED_CLI` / `SCAN_PRED_ODDS` |
| Perps | `showPerps` | `SHOW_PERPS` |
| Perps positions | `showPerpsPos` | `FETCH_PERPS_POSITIONS` |
| Send (invite) | `showSend` | `SHOW_SEND` |
| Lock setup | `showLock` | `SHOW_LOCK` |
| Lock list | `showLocks` | `FETCH_LOCKS` |
| Studio (create token) | `showStudio` | `SHOW_STUDIO` |
| Studio fees | `showStudioFees` | `FETCH_STUDIO_FEES` |
| Copy trade | `showCopyTrade` | `COPY_TRADE` |
| Yield vault setup | `showYieldVault` | `__YIELD_VAULT_PANEL__` |
| Yield vault tracker | `showYieldVaultTracker` | `__YIELD_VAULT_TRACKER__` |
| Blog | `showBlog` | (blog button) |

### Trigger v2 panel detail

The Trigger v2 panel supports three order types selectable by tab:
- **Limit (Single)** — buy/sell when price crosses a threshold
- **OCO** — take-profit AND stop-loss at the same time (one cancels other)
- **OTOCO** — entry order that auto-creates TP/SL brackets on fill

Each uses JWT authentication with Jupiter's v2 API (`signMessage` to generate auth token) and supports USD-denominated price targets.

### DCA panel detail (lines 11469–11544)

Shows:
- From/To token pickers (via `TokenPicker`)
- Amount per cycle input
- Frequency selector (1 min → 1 month)
- Number of orders input
- Live summary line: "Total X TOKEN spent over Y days (N× Z TOKEN)"

On submit, calls Jupiter `/recurring/v1/createOrder` which sets up the on-chain DCA schedule.

### DCA orders list (lines 11547–~11700)

Shows each recurring order with:
- Token pair (symbol ← resolved from mint → symbol map)
- Amount + frequency
- Animated progress bar (% of total deposited that has been executed)
- Active / Closed status badge
- Cancel & Withdraw button (calls Jupiter cancel endpoint)

---

## 30. Prediction CLI Dashboard (Lines ~12800–13050)

A terminal-themed panel styled to look like a Unix terminal — black background, green monospace text, macOS-style traffic light dots.

### Sections

**Filter/control bar:**
- `min-edge` slider (0–40%) — filters markets below this edge
- Sort selector (edge / volume / probability)
- Category buttons (all / sports / crypto / politics / esports)
- Refresh button

**Odds table:** A scrollable table with columns:
`# | OUTCOME | EVENT | YES% | NO% | EDGE | PAYOUT | VOL | CLOSES | BET`

Each row shows computed edge (colour-coded: green ≥20%, orange ≥10%), best side highlighted in green, and a one-click BET button that opens the bet panel pre-filled.

**CLI log terminal:** A scrolling stdout-style log showing each market as it's scanned: `> scanning [event] [outcome] → YES: X% | edge: Y%`

### `scanPredOdds()` algorithm

```
1. Fetch up to 50 markets from prediction API
2. For each market outcome:
   - yesProb = outcome.yesAmount / totalAmount
   - noProb = 1 - yesProb
   - yesEdge = |yesProb - 0.5| * 100   (vs fair odds)
   - noEdge  = |noProb  - 0.5| * 100
   - bestSide = higher edge side
   - bestEdge = max(yesEdge, noEdge)
3. Filter: bestEdge >= minEdge
4. Sort: by edge / volume / probability
5. Stream results to predCLILog for terminal display
```

---

## 31. Trade Journal & On-Chain History

### Local journal

Every swap executed through ChatFi is appended to `tradeJournal` state and persisted to `localStorage` (keyed by `chatfi-journal-${walletAddress}`). Each entry:
```js
{ type:"swap", from, to, amount, out, ts, sig, source:"chatfi" }
```

Basket trades are stored as `{ type:"basket", summary, ts, source:"chatfi" }`.

### On-chain fetch — `fetchOnChainTrades(walletAddress)` (referenced in SHOW_TRADE_JOURNAL)

Fetches recent transaction signatures from the Solana RPC (`getSignaturesForAddress`), then fetches transaction details for each, parses Jupiter swap instructions from the transaction logs, and returns a normalised trade list. On-chain entries are marked with `source:"onchain"` and displayed with a 🔗 indicator.

### Display

The trade journal merges local + on-chain records, deduplicates by signature, sorts by timestamp, and shows up to 50 entries. Filters: today, this week, all time.

---

## 32. Price Alerts & Volatility Monitors

### Price alerts

Stored in `priceAlerts` state + `localStorage`. Each alert:
```js
{ token, condition: "above"|"below", target: number, triggered: false, id: timestamp }
```

A polling interval (background) checks live prices via Jupiter Price v3 every N seconds. When a condition is met, the alert is marked triggered and a notification message is pushed to chat: `"🔔 Alert fired: SOL dropped below $140"`.

### Volatility monitors

Similar structure but trigger on percentage price movement within a time window rather than absolute price levels. Used for the `DETECT_VOLATILITY` action and the `Auto-order on SOL volatility spike` suggestion.

Both alert types are loaded from localStorage when the wallet address changes (line 2969), so alerts persist across sessions and are scoped per wallet.

---

## 33. Plugin Architecture (Lines 14–19)

```js
// ── Plugins (add new feature files here) ─────────────────────────────────────
// import ExamplePlugin, { suggestionGroup as exampleSuggestions } from "./plugins/ExamplePlugin";
const PLUGIN_SUGGESTION_GROUPS = [
  // exampleSuggestions,
];
```

The plugin system is designed for minimal integration. A plugin consists of:
1. A default export React component (rendered in the chat message stream)
2. A named export `suggestionGroup` (an object matching the `{ label, color, items[] }` shape)

To activate a plugin:
1. Uncomment the import line
2. Add the suggestion group to `PLUGIN_SUGGESTION_GROUPS`
3. Add the action handler in the dispatcher's `if/else if` chain

The plugin component can receive `jupFetch`, `walletFull`, `push` (add message to chat), and `T` (design tokens) as props.

---

## 34. App Root & Auth Providers (Lines 14540–14591)

The root component `App` wraps everything in `PrivyProvider`:

```jsx
export default function App() {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "twitter", "discord", "wallet"],
        appearance: { showWalletLoginFirst: false },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana:   { createOnLogin: "all-users" },  // auto-create Solana wallet for everyone
          noPromptOnSignature: true,
          requireUserPasswordOnCreate: false,
        },
        solanaClusters: [
          { name: "mainnet-beta", rpcUrl: VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com" }
        ]
      }}
    >
      <JupChatWithLanding />
    </PrivyProvider>
  );
}
```

**Reown AppKit** is initialised at module level (line 587) — once, when the module loads:
```js
createAppKit({
  adapters: [_solanaAdapter],
  networks: [solanaMainnet],
  projectId: REOWN_PROJECT_ID,
  metadata: { name: "ChatFi", ... },
  features: { analytics: false },
});
```

`JupChatWithLanding` renders either the landing page or the chat interface based on whether the user has clicked "Launch App".

---

## 35. Server-Side API Routes (Referenced Throughout)

### `/api/claude` (POST)
Proxies to Anthropic's Claude API. Injects API key from server env. Accepts `{ model, max_tokens, system, messages }`. Returns Claude's raw response.

### `/api/jupiter` (POST)
Proxies to `api.jup.ag` or `lite-api.jup.ag`. Injects `x-api-key`. Accepts `{ url, method, body, apiKey }`. For Lend and Studio endpoints, `apiKey` is passed in the `x-api-key` header. Returns parsed JSON.

### `/api/send` (POST)
Handles invite-link send operations. Two modes:
- Default: calls Jupiter `/send/v1/craft-send`, derives invite keypair server-side, returns unsigned tx
- `action: "clawback"`: calls `/send/v1/craft-clawback`, partially signs with invite keypair, returns partially-signed tx

### `/api/lock` (POST)
Fallback proxy for Jupiter Lock API. Action `"accounts"` fetches all vesting accounts for a wallet.

---

## 36. State Management Map

All state lives in the main `JupChat` component via `useState`. Key state variables:

```
msgs[]            — Chat message array { role, content, meta }
typing            — Boolean: AI is generating
input             — Chat input string
walletFull        — Connected wallet address (string or null)
privyMode         — Boolean: using Privy vs Reown
prices{}          — Live USD prices by token symbol
portfolio{}       — Raw wallet balances (not portfolio panel data)
portfolioData     — Full portfolio data object (from fetchPortfolioData)
portfolioLoading  — Boolean
priceAlerts[]     — Active price alert configs
volMonitors[]     — Active volatility monitor configs
tradeJournal[]    — Local trade history
swapCfg{}         — Current swap panel config {from, to, amount, mints}
swapQuote         — Current swap quote result
trigCfg{}         — Legacy trigger order config
trigV2Cfg{}       — Trigger v2 order config (OCO/OTOCO/single)
trigV2Orders[]    — Fetched trigger orders list
recurringCfg{}    — DCA setup config
recurringOrders[] — Fetched DCA orders list
earnCfg{}         — Earn deposit config
earnVaults[]      — Available earn vaults
earnWithdraw{}    — Withdraw config
borrowCfg{}       — Borrow vault config
multiplyFilter    — Asset filter for multiply panel
perpsPosition{}   — Perps trade config
perpPositions[]   — Open perps list
perpLoading       — Boolean
sendCfg{}         — Send token/amount config
sendRecipient     — Direct send recipient address
sendStatus        — "idle" | "signing" | "done" | "error"
sendLink          — Generated invite link URL
lockCfg{}         — Token lock vesting config
lockPositions[]   — Fetched vesting accounts
studioCfg{}       — Token creation form data
studioImage       — Uploaded token image { file, type, preview }
studioStatus      — "idle" | "signing" | "done" | "error"
studioResult      — Created token mint address
studioFees        — Fetched creator fees data
predMarkets[]     — Fetched prediction markets
betMarket         — Selected market for betting
betSide           — "yes" | "no"
betAmount         — String USD amount
betStatus         — Bet transaction status
predCLIMarkets[]  — Markets for CLI scanner
predCLILog[]      — CLI terminal output lines
copyTradeData     — Copy trade analysis result
routeData         — Swap route breakdown result
tokenCardData     — Rich token info for card display
portfolioElements[]— Portfolio API elements
earnPositions[]   — Earn position list
lockPositions[]   — Lock vesting list
yieldVaultCfg{}   — Yield vault automation config
showXxx           — Boolean visibility flags for each panel (30+ flags)
```

`useRef` is used for values that shouldn't trigger re-renders:
```
histRef          — Full conversation history (avoids re-render on each turn)
tokenCacheRef    — Symbol → mint address map
tokenDecimalsRef — Symbol → decimals map
connectedProviderRef — Active signing provider object
```

---

## 37. Data Flow Diagram

```
User types message
        │
        ▼
Pre-AI shortcuts check
(clear/disconnect/yield vault)
        │
        ▼ (not a shortcut)
Build system prompt:
  SYSTEM_PROMPT + jupDocs + walletContext
        │
        ▼
POST /api/claude
  model: claude-sonnet-4-20250514
  messages: last 40 turns
        │
        ▼
Parse JSON response: { text, action, actionData }
        │
        ▼
push("ai", text)  → renders in chat
        │
        ▼
Action dispatcher: switch on action string
        │
    ┌───┴───────────────────────────────────────┐
    ▼                                           ▼
Token resolution                        CHAINED_ACTIONS loop
(resolveToken / fetchTokenInfo)                │
    │                                          ▼
    ▼                                   step 1 → execute
Jupiter API call                        step 2 → execute
(jupFetch → /api/jupiter → jup.ag)      ...
    │
    ▼
Panel state update (showSwap = true, swapCfg = {...})
    │
    ▼
React re-render → panel appears in chat
    │
    ▼
User interacts (fills amount, clicks Swap)
    │
    ▼
Transaction execution:
  1. Get quote / build tx
  2. getActiveProvider() → signTransaction(tx)
  3. connection.sendRawTransaction()
  4. connection.confirmTransaction()
  5. push("ai", receipt)
```

---

## 38. Feature Reference — Complete List

### Trading
- Instant token swaps (any Solana token, best route across 20+ DEXs via Jupiter v2)
- Basket swaps (buy/sell multiple tokens in one natural-language command)
- Swap All Wallet (sell all non-stablecoin holdings to USDC/SOL at once)
- Limit orders v2 (single / OCO bracket / OTOCO entry with auto-bracket)
- DCA / recurring orders (minute to monthly schedule, any token pair)
- Perpetual futures (SOL, BTC, ETH — up to 100x leverage, long/short)
- Swap route viewer (DEX path, AMMs used, price impact per hop)
- Copy trading / wallet mirroring

### Earn & Lend
- Jupiter Earn (deposit USDC/SOL/JLP → live APY, jlToken receipt)
- Borrow (deposit collateral, borrow against it, LTV display)
- Multiply / leveraged yield (flashloan loop for amplified staking returns)
- View & manage all earn, borrow, multiply, lend positions
- JupSOL (liquid staking)
- Yield Vault (auto-compound yield above threshold into any target token)

### Portfolio & Research
- Full portfolio (spot balances, DeFi positions, earn, perps, LP, locks, predictions)
- Token deep dive (price, 24h change, market cap, holders, organic score, audit flags)
- Token categories (top organic / top traded / top trending, 5m–24h)
- New token listings
- Verified tokens list
- LST tokens list
- xStocks / RWA tokenized stocks (SPY, QQQ, AAPL, NVDA, and 30+ others)
- Trade journal (local + on-chain history, rough PnL)
- Price alerts (in-chat notification when threshold crossed)
- Volatility monitors
- Token verification eligibility check

### Token Tools
- Create token via Jupiter Studio (Dynamic Bonding Curves, 3 presets)
- Claim creator trading fees from DBC pools
- Lock tokens with cliff + linear vesting
- View and claim vested tokens

### Send & Social
- Send tokens via invite link (recipient needs no wallet)
- Claw back unclaimed sends
- View send history

### Prediction Markets
- Browse live sports markets (EPL, Champions League, NBA, crypto, politics)
- Place YES/NO bets (USDC or JupUSD)
- Basket predictions (multiple markets at once)
- Claim winnings
- Prediction CLI scanner (edge analysis + auto-bet)
- Yield-Gated Prediction Vault (earn + predict simultaneously)

---

## 39. Environment Variables

```env
VITE_SOLANA_RPC        — Custom Solana RPC endpoint (mainnet-beta)
VITE_PRIVY_APP_ID      — Privy application ID (from privy.io)
REOWN_PROJECT_ID       — WalletConnect v2 project ID (from cloud.reown.com)

# Server-side (not exposed to client)
ANTHROPIC_API_KEY      — Claude API key
JUPITER_API_KEY        — Jupiter API key (for /api/jupiter proxy)
```

The Reown project ID (`21a9551a7eeedcd3c442d912b6ea336f`) is currently hardcoded at line 585 — it should be moved to an environment variable before production deployment.

---

## 40. How to Extend ChatFi

### Add a new AI action

1. Add the action name and `actionData` shape to `SYSTEM_PROMPT` in the full feature list and the intent mapping section
2. Add an `else if (action === "YOUR_ACTION")` handler in the dispatcher (~line 8460)
3. If it needs a UI panel, add a `showYourPanel` state flag, a `setShowYourPanel` state setter, and render the panel conditionally in the message feed
4. Add it to the `CHAINED_ACTIONS` step handler block (~line 9700)

### Add a new token to the hardcoded list

Add to `TOKEN_MINTS` (line 178) and `TOKEN_DECIMALS` (line 201):
```js
TOKEN_MINTS.MYTOKEN = "MintAddressBase58Here";
TOKEN_DECIMALS.MYTOKEN = 6;
```

### Add a new Jupiter API endpoint

1. Define the URL constant at the top of the file (line 144 area)
2. Call it via `jupFetch(YOUR_ENDPOINT, options)` — the proxy handles authentication

### Add a plugin

Create `./plugins/MyPlugin.jsx` exporting:
```js
export default function MyPlugin({ jupFetch, walletFull, push, T }) { ... }
export const suggestionGroup = {
  label: "My Plugin",
  color: "#38bdf8",
  items: ["Do something", "Do something else"],
};
```
Then uncomment the import and add `suggestionGroup` to `PLUGIN_SUGGESTION_GROUPS` in the main file.

### Deploy

The app is designed for **Vercel deployment**:
- `chatFI.jsx` is the Vite React frontend entry point
- `/api/*.js` files are Vercel serverless functions
- Set all env vars in the Vercel project settings
- No database required — all persistence is localStorage/sessionStorage

---

*README generated from full source analysis of `chatFI.jsx` (14,591 lines)*
*ChatFi — AI-powered DeFi terminal · Built on Jupiter · Powered by Solana*
