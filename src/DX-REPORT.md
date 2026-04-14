# DX-REPORT: JupChat — Jupiter Developer Platform

**Project:** JupChat — AI-powered trading assistant built on Jupiter DEX  
**Builder:** [Your Name]  
**Submission:** [Link to deployed app or repo]  
**API Email:** [Email tied to your developers.jup.ag account]  
**Date:** April 2026  

---

## What I Built

JupChat is a chat-first trading interface — think Claude, but for Solana DeFi. Users have a natural language conversation with an AI assistant that pulls live data from Jupiter's API stack and surfaces relevant actions inline.

**Core flows:**
- Ask "what's the SOL price?" → AI calls Price V2, returns live chip with exact price
- Ask "is BONK safe?" → AI calls Tokens API, surfaces organicScore, verification status, tags
- Say "swap SOL to JUP" → Swap V2 opens pre-filled with live Jupiter quote (real route, price impact, slippage)
- Say "buy SOL when it hits $130" → Trigger API limit order interface opens
- Ask "can Arsenal beat Man City?" → AI does live web search, gives deep tactical analysis, opens Prediction Markets

**Jupiter APIs integrated:**
1. `Price V2` — `GET /price/v2?ids=...` for all price fetches
2. `Tokens API` — `GET tokens.jup.ag/token/{mint}` for safety/metadata
3. `Swap V2` — `GET /quote` + `POST /swap` for quotes and execution
4. `Trigger API` — UI and intent layer (full execution in deployed version)

---

## Onboarding Experience

**Time from landing on developers.jup.ag to first successful API call: ~8 minutes**

Specifically for the Price V2 endpoint — that was refreshingly fast. The public endpoints have no auth requirement and permissive CORS headers, which meant I could test from a browser fetch() immediately without any setup.

Swap V2 onboarding was trickier. The `/quote` endpoint was fine, but the transition from the old `quote-api.jup.ag/v6` to the new `api.jup.ag/swap/v2` was confusing because:
- The new endpoint is documented in the Developer Platform but the old endpoint is still live and returns valid responses
- It's not clear which one the API key gates vs which is public
- I had to implement a fallback: try new endpoint, fall back to v6 if it fails

**What confused me:**
- The `developers.jup.ag` API key page doesn't clearly show which endpoints *require* the key vs which work without it. I assumed everything needed auth; turns out most endpoints are public, the key just gives higher rate limits. A clear matrix (endpoint → auth required? → public limit → authenticated limit) would help enormously.
- The Tokens API base URL (`tokens.jup.ag`) is different from the rest (`api.jup.ag`). I expected everything to be under one domain.

---

## What's Broken or Missing in the Docs

**1. Swap V2 migration path is unclear**  
[https://developers.jup.ag/docs/swap-api](https://developers.jup.ag/docs/swap-api) mentions both the old and new API but doesn't have a clear "if you were using v6, here's what changed" section. The `/order` vs `/quote` endpoint naming is inconsistent between docs pages.

**2. Tokens API has no docs page I could find**  
I discovered `tokens.jup.ag/token/{mint}` through community resources, not the official docs. The response schema (organicScore, tags, etc.) is completely undocumented. I had to guess field names from the JSON response. This is a shame because the data is genuinely useful for safety checks.

**3. No unified error schema**  
Different endpoints return errors in completely different formats:
- Price API: `{ data: {} }` (empty, no error field)  
- Quote API: `{ error: "string" }`  
- Swap API: `{ message: "string" }`  
A consistent `{ error: { code, message } }` across all endpoints would make error handling much cleaner.

**4. Trigger API "getting started" gap**  
The Trigger API docs show the endpoint signatures but don't have a complete "create your first limit order" walkthrough with the full request body and response. I had to piece it together from examples.

**5. CORS documentation**  
No mention anywhere of which endpoints support browser-side requests. I found out through trial and error. Price V2 and Tokens API work from browser; some Swap V2 variations had preflight issues.

---

## Where the APIs Bit Me

**Price V2 — empty response for unknown mints**  
If you pass an invalid or unlisted mint, the API returns `{ data: {} }` with 200 OK. No error, no indication. I spent 15 minutes thinking my code was wrong before realising the mint just wasn't in the index. Expected: `{ data: { [mint]: null, error: "mint not found" } }`.

**Swap V2 `outAmount` is a string, not a number**  
The `quoteResponse.outAmount` field is a stringified integer (lamports). Easy to miss, causes silent bugs when doing arithmetic on it. TypeScript types would catch this. A note in the docs would help.

**Tokens API `organicScore` is sometimes null**  
For verified tokens I expected a score, but several had `null`. It's unclear whether null means "not scored yet," "exempt from scoring," or "data unavailable." Distinguishing these states matters for building safety indicators.

**Versioned Transactions require @solana/web3.js**  
The swap transaction returned from `/swap` is a base64-encoded VersionedTransaction. You cannot sign or deserialize it without the Solana SDK — there's no way to do this with raw browser APIs. The docs don't mention this dependency explicitly. Developers building browser apps need to know this upfront.

**Rate limits with no `Retry-After` header**  
When I hit the public rate limit on Price V2 (testing with many mints), the 429 response had no `Retry-After` header. I had to guess a backoff interval.

---

## Did You Use the AI Stack?

**Agent Skills:** Yes — I used the Jupiter Agent Skills context file during development with Claude. It was helpful for getting the API endpoint structure quickly, but:
- The Swap V2 skill content reflected the old v6 API, not the new Developer Platform endpoints
- There was no skill for the Tokens API at all
- The Trigger API skill had the endpoint but no example request body

**Docs MCP:** Tried it once, got a timeout. Didn't use it further.

**llms.txt:** Didn't use — I didn't realise it existed until I was 80% done.

**What I wish existed:**
- A "build your first swap in 5 minutes" interactive example in the docs
- A TypeScript SDK that wraps the Developer Platform APIs (similar to `@jup-ag/api` but for the new v2 endpoints)
- Sandbox/devnet equivalents for Trigger and Prediction Markets for testing without real funds

---

## How Would I Rebuild developers.jup.ag?

The current platform is clean but passive — docs you read, keys you grab. What would make it dramatically better:

**1. Interactive playground in the browser**  
An embedded API console on every endpoint page where I can drop in my key, tweak parameters, and see real responses. The Price API especially — being able to search tokens and see live data inline would cut onboarding from 8 minutes to 2.

**2. Onboarding checklist**  
First visit: "Step 1: Get your key. Step 2: Make your first Price call (here's the curl). Step 3: Get a swap quote." With copy-paste examples pre-filled with the user's actual key.

**3. Unified API base URL**  
Everything under `api.jup.ag`. No more `tokens.jup.ag` vs `api.jup.ag` vs `quote-api.jup.ag` — it creates unnecessary confusion.

**4. Rate limit dashboard**  
Show current usage vs limits in the dashboard. I'm flying blind on whether I'm close to rate limits.

**5. Webhook support for Trigger orders**  
Right now I have to poll to check if a limit order was filled. Native webhook callbacks would make Trigger integrations much cleaner.

---

## What Do I Wish Existed

- **A `tokens.jup.ag/search?q=...` endpoint** — let me search by name or symbol, not just mint address
- **Prediction Markets REST API** — right now it's program-level only; a REST wrapper would make it much more accessible
- **Perps position streaming** — WebSocket endpoint for live P&L without polling
- **DCA (Recurring) status endpoint** — expose current DCA order state, next execution time, total spent so far
- **Simulation endpoint** — "what would this swap return at these market conditions" without needing a wallet or gas

---

*This report reflects genuine friction encountered while building JupChat over [X hours]. The Jupiter DEX product is excellent — these friction points are refinements on a solid foundation.*
