# ChatFI — Jupiter Developer Platform DX Report

**Project:** ChatFI — Conversational AI trading interface for Jupiter DEX  
**Bounty:** Jupiter Developer Platform — Build with the New Unified API  
**Live app:** [chatfi.pro](https://chatfi.pro)  
**Repo:** [github.com/sadekunle215-cmd/chatfi](https://github.com/sadekunle215-cmd/chatfi)

---

## What I Built

ChatFI is a chat-first interface for Jupiter. Instead of navigating tabs and forms, users type what they want — and the AI routes their intent to the right Jupiter API. Swap, limit order, DCA, yield vault, prediction market, portfolio overview, token search — all accessible through natural language.

The AI is grounded in Jupiter's own documentation. On every session start, ChatFI fetches:

```
https://developers.jup.ag/docs/llms-full.txt
```

…and injects it as the Claude system prompt. The assistant always has current Jupiter API structure, parameters, and endpoint paths in context — not stale training data. This is Jupiter's own AI stack being used the way it was meant to be.

**Stack:** React + Vite, deployed on Vercel. Jupiter API key stored as a Vercel environment variable, injected server-side via `/api/jupiter` proxy — never exposed in the client bundle.

---

## APIs Used

| API | Endpoint | Used For |
|---|---|---|
| Swap V2 | `/swap/v2/order` + `/swap/v2/execute` | All token swaps |
| Trigger V2 | `/trigger/v2/orders/price` | Limit orders |
| Prediction Markets | `/prediction/v1` | Bets + open positions |
| Lend / Earn | `/lend/v1/earn` | Yield deposits + withdrawals |
| Ultra V1 | `/ultra/v1/holdings` | Portfolio snapshot |
| Portfolio V1 | `/portfolio/v1/positions` | Position tracking |
| Tokens V2 | search, tag, category, trending, recent | Token discovery |
| Price V3 | — | Live prices with 24h delta |
| Recurring V1 | — | DCA / scheduled orders |
| Send | — | Token transfers via invite link |
| Studio | — | Token creation + fee claiming |
| Lock | — | SPL token vesting |

---

## Onboarding

Getting started with `developers.jup.ag` was faster than expected. The unified key concept — one key, all endpoints — is the right call. No per-endpoint token management.

**Where I lost time:** The distinction between `api.jup.ag` (old public endpoints) and the new Developer Platform-gated endpoints is not surfaced loudly at the top of the docs. I had working calls against the legacy base URLs before I realised the bounty specifically wanted me on the Developer Platform.

> **Suggestion:** A banner or migration callout at the top of each endpoint doc: *"Authenticated Developer Platform users should use [X] instead."* Would have saved me the confusion.

---

## AI Stack

I used `llms-full.txt` directly — fetched at runtime, injected as system prompt. Works well. The file is well-structured for LLM consumption.

**Feedback:** Some response schemas are underspecified. Error shapes in particular are inconsistent — some endpoints document error codes, most don't. When the AI tries to explain a failed call to the user, I had to write my own error normalisation layer. Standardising error response schemas across all endpoints would significantly improve AI-assisted DX.

---

## Real Issues I Hit

### Issue 1 — Yield Vault: No Delegated Execution

**What I wanted to build:**  
A "set and forget" yield optimiser. User sets a threshold — when their Earn yield accumulates past $X, ChatFI auto-withdraws and swaps it into their chosen token. User doesn't need to be online.

**What actually happened:**  
The Lend API requires the user to be present and sign every transaction. No way to pre-authorise or delegate execution. My workaround: a Telegram bot that pings the user when the threshold is hit, asking them to return to the app and sign manually. This completely breaks the automated UX the product concept depends on.

**How I solved it (within current API constraints):**

```
User sets vault config in ChatFI
        ↓
POST /api/yield-vault  →  stores { wallet, earnMint, thresholdUSD, targetToken }
        ↓
fetchEarnUserPositions() runs on every portfolio refresh
        ↓
Compares live earn balance against depositedAmount
        ↓
If position gone  →  auto-cancel vault (DELETE /api/yield-vault)
If reduced        →  sync depositedAmount down (PATCH /api/yield-vault)
        ↓
Telegram bot notifies user when yield threshold hit
        ↓
User returns → signs doEarnWithdraw() → VersionedTransaction → Solana RPC
        ↓
Proceeds auto-swapped into target token via Swap V2
```

**What I want Jupiter to build:**  
A delegated execution model — a signed intent or pre-authorised instruction that a keeper/bot can submit within defined parameters (max slippage, time window, vault target). Same mental model as Trigger V2 limit orders, applied to Lend.

---

### Issue 2 — Earn Position Migration: No Atomic Path

**What I wanted to build:**  
"Move my yield from Vault A to Vault B" — one user action, one signature.

**What actually happened:**  
No atomic migration path exists. Withdraw from Vault A → sign. Deposit into Vault B → sign again. Two separate transactions. If the user closes the app between steps, funds sit idle.

**How I solved it (within current API constraints):**

I built a **YieldRotatorPlugin** that:

1. Fetches all available Jupiter Earn pools
2. Compares APYs against the user's current position
3. Shows a blue **"Better APY Available"** banner when a better pool is found
4. On "Migrate" tap — chains the steps sequentially:

```
doEarnWithdraw()  →  Earn API /withdraw  →  VersionedTransaction  →  sign (tx 1)
        ↓
[optional] Swap V2 if tokens differ
        ↓
doEarnDeposit()   →  Earn API /deposit   →  VersionedTransaction  →  sign (tx 2)
        ↓
onMigrationDone() → fetchPortfolioData() + fetchEarnUserPositions()
```

Still two signatures. Still not atomic. The UX is as smooth as I can make it within the current API — but the gap is real.

**What I want Jupiter to build:**  
A single `/lend/v1/earn/migrate` endpoint (or composable instruction) that batches withdraw + optional swap + deposit into one transaction the user signs once. Atomic migration. All steps succeed or all revert.

---

## What Worked Really Well

**Swap V2** — The split between `/order` (construction) and `/execute` (submission) is the right design. ChatFI shows the user a preview with expected output and fees before committing. Slippage parameters are well-documented and behaved exactly as documented.

**Trigger V2** — Limit orders via chat feel genuinely magical. "Buy SOL if it drops to $120" works end-to-end. The order structure is clean and predictable.

**Tokens V2** — The category and trending endpoints made it trivial to build "what's hot right now" queries inside chat. This is a rare case where the API gives you more than you asked for in a good way.

**Price V3 with 24h delta** — Having the change baked into the price response means ChatFI can say "SOL is up 3.2% today" without a second call.

**Prediction Markets** — Well-structured. Bets and positions endpoints let me build accordion cards showing live market state, current odds, and the user's open positions with one call chain.

**Ultra V1** — Clean portfolio snapshot. Used to generate the user's "what do I own" context before answering any portfolio question.

---

## Summary

ChatFI is a real product built on the Jupiter Developer Platform, not a demo. It uses 13+ Jupiter API endpoints, routes intent through an AI layer grounded in Jupiter's own `llms-full.txt`, and authenticates through the Developer Platform key stored server-side on Vercel.

The two issues I documented — delegated execution for Lend and atomic position migration — are not edge cases. They are the exact friction points that prevent "set it and forget it" DeFi UX from existing. Every yield automation product building on Jupiter will hit these walls. The current workarounds are patches. The platform is strong enough that fixing these would be genuinely impactful.
