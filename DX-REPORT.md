# DX Report — ChatFi × Jupiter Developer Platform

**Project:** ChatFi (chatfi.pro)  
**Builder:** Sagjha  
**APIs Used:** Swap V2, Lend/Earn, Lock, Trigger, DCA, Perps, Portfolio, Price V3, Tokens V2, Send, Studio (DBC)

---

## What I Built

ChatFi is a conversational DeFi terminal. You type natural language, ChatFi interprets your intent, and the app maps it to on-chain Jupiter actions. "Swap 50 USDC to SOL," "Set a limit order if JUP drops to $0.80," "Deposit 100 USDC into the highest-APY earn vault" — all of that flows through a single chat UI.

The core idea came from a frustration I had personally using Jupiter. I'd open the app, forget what each product did, and have to read docs before doing anything. I wanted something that just knew what I was trying to do and handled the API routing for me. So I built ChatFi as the routing layer.

Under the hood the app uses: Swap V1/V2, Price API V3, Tokens V2, Earn/Lend, DCA, Trigger (Single/OCO/OTOCO), Lock (vesting), Send (invite-link transfers), Studio (DBC pool creation), and Portfolio. I also built a Yield Vault system on top of the Earn API that monitors positions, detects harvestable yield, and either sends a Telegram alert or auto-executes a harvest swap via a delegate keypair.

---

## Onboarding: Time to First Successful API Call

Roughly 40 minutes from landing on developers.jup.ag to my first successful Swap quote response. That's actually pretty good.

What helped: the API key was one field, one button. I was expecting OAuth flows and dashboard setup and billing — it was just an API key. That was the right call.

What slowed me down: I assumed the key worked across all Jupiter APIs immediately. It didn't for the Trigger endpoints. I spent about 20 minutes getting 401s on `trigger.jup.ag/v2` before I realized trigger orders use JWT Bearer tokens, not the standard API key header. This is documented, but it's buried. When you're scanning docs quickly on a phone, "Bearer JWT" appearing mid-page without a prominent callout is easy to miss.

My suggestion: put a banner at the top of the Trigger API docs that says "⚠️ This endpoint uses a different auth method." One line would have saved me 20 minutes.

---

## What Broke, What Bit Me, and What I Had to Work Around

Here's my actual API usage data from the Jupiter Developer Platform dashboard:

![ChatFi Jupiter Developer Platform Analytics](./screenshots/jupiter-dev-platform-analytics.png)

A few things jump out from this: Lend API is sitting at a **17.88% error rate** with a **6.7s p99 latency**. Token API at **52.70% error rate**. These aren't edge cases — this is what production traffic actually looks like hitting these endpoints. The numbers below explain where most of those errors came from.

### The `@jup-ag/lend` Package (Killed My Vercel Deployment)

This was the worst moment of the build. I added `@jup-ag/lend` to power the Multiply and Borrow features. Everything worked locally (in Codespaces on Android). Then I deployed to Vercel and my entire serverless backend crashed. Every route — not just the lend routes, *every* route — returned 500s.

After two days of debugging production logs on my phone, I traced it to the `@jup-ag/lend` package importing Node.js internals in a way that Vercel's edge runtime couldn't handle. There was no error message that said "hey this package is incompatible with edge functions." The entire function bundle just failed silently.

The fix was to remove the package entirely and rewrite the Earn/Lend integration as direct REST calls to `lend-api.jup.ag`. That worked perfectly. But I lost two full days to it. The NPM package and the REST API should have the same documentation standing — right now the REST endpoint docs are clearly better maintained.

**Specific docs page this affected:** The Lend API section doesn't warn that the `@jup-ag/lend` package has edge runtime compatibility issues. It should.

### Portfolio API: 15–55 Second Response Times

The Portfolio endpoint at `api.jup.ag/portfolio` aggregates across all Jupiter products and is genuinely useful — it's one of my app's marquee features. But the response time is brutal. I saw 15 seconds on a good day, 55 seconds on a bad one.

For a serverless function on Vercel, the default max execution time is 10 seconds. I had to explicitly set `maxDuration: 60` in the function config and move the portfolio route to Vercel's extended compute. That's not obvious if you're new.

The bigger problem: there's no streaming or progressive response from the Portfolio endpoint. Users see a loading spinner for 55 seconds with no feedback. I worked around this by adding a typing animation and status messages ("Fetching your positions…", "Almost there…"), but that's a band-aid. A streaming response or a structured partial-result format would make this endpoint dramatically better for production apps.

### Earn Positions: Two Different Endpoints That Do Different Things

When I needed to show a user's active Earn positions, I found two endpoints:

- `lend-api.jup.ag/api/v1/positions?wallet=...` — returns position data
- `api.jup.ag/lend/v1/earn` — handles deposit/withdraw transactions

These are documented in different places with different base URLs and I spent time confused about whether they were the same API or different ones. One response includes `jlMint` receipt tokens, the other doesn't in the same structure. The relationship between `supplyApy` and `rewardsApy` wasn't immediately clear — I had to experiment to confirm that total APY = supplyApy + rewardsApy.

**Suggestion:** A single unified Lend API reference page that shows both the data endpoints and the transaction endpoints side by side, with a clear note explaining receipt tokens (jlUSDC, jlSOL) and how APY is composed.

### Price API V3 Response Shape

The Price API V3 response changed shape between versions. V2 returned `data[mint].price`, V3 returns `data[mint].usdPrice`. I only caught this when I noticed prices weren't rendering and traced it to a property lookup returning `undefined`. Not a big deal — but the migration guide doesn't have a before/after comparison. "Here's what changed" tables would save a lot of people quiet bugs.

### Lock API: Token-2022 Rejection Had No Clear Error

The Lock (vesting) API silently rejects Token-2022 mints. I found this out the hard way when a user tried to lock a Token-2022 token and got a generic error from the program. I had to add server-side validation to catch this before the transaction even gets built. The docs should have a prominent note: Token-2022 mints are not supported by the Lock program.

### Ultra Swap (Migration from Metis)

I'm currently on the Metis Swap API (`/swap/v1/quote` + `/swap/v1/swap`). I started the migration to Ultra Swap (`/order` + `/execute`) during this build. The Ultra flow is cleaner — `POST /order` for the quote and `POST /execute` for broadcast is a nicer separation of concerns than building and signing a raw transaction yourself. I'll finish the migration after this submission, but I wanted to be honest that Ultra wasn't fully integrated yet.

One confusion during Ultra exploration: the docs mention "managed landing" as the default but don't explain concretely what that means for a developer integrating it. Does the server retry broadcast? Does it handle blockhash expiry? I still don't have a clear answer. A "What managed landing does under the hood" section in the docs would help.

---

## Did I Use the AI Stack?

Yes — I used the `llms.txt` file and fed it into ChatFi's AI prompts during build. It helped the AI give more accurate suggestions for Jupiter API shapes, especially for the Trigger and Send endpoints.

I didn't use the CLI or Docs MCP. Here's why: I deploy exclusively through Vercel serverless functions — there's no persistent process running on a server I control. The CLI is designed for terminal environments where you can run a long-lived agent or script. That's not my setup. The MCP similarly assumes a local agent serving SSE connections, which doesn't fit a serverless architecture.

This is a real gap for a category of builders — developers working serverless-first or in cloud environments — who can't use CLI tools designed around a persistent local process. I'd genuinely like to see a web-based version of the CLI or a stateless API endpoint that accepts CLI-style JSON commands. The current CLI is powerful but it assumes infrastructure that serverless builders don't have.

The Agent Skills files (context files for coding agents) are a great idea. I used a version of this pattern manually by including Jupiter API shapes in ChatFi's system prompt. An official, curated version of those context files I could paste directly into my prompts — not just for Claude Code but for any prompt-based workflow — would be very useful.

---

## How I'd Rebuild developers.jup.ag

I'll be specific because vague product feedback isn't useful.

**The first thing I'd change:** the landing page shouldn't be about the platform, it should be about the APIs. Right now you land and there's navigation and copy and explanations. What I wanted when I arrived was: "here are the 10 APIs, here's a one-line description of each, click the one you want to use." The discovery experience is slower than it needs to be.

**Interactive examples in the docs.** The Swap quote endpoint takes `inputMint`, `outputMint`, `amount`, `slippageBps`. I should be able to type those values into the docs page, hit a button, and see the live response right there. Not a sandbox that requires setup — just a form input on the docs page that calls the API with my key. This is the fastest path from "reading docs" to "understanding the response shape." I've seen this done well on Stripe's docs. It would be a meaningful upgrade here.

**Unified error code reference.** Right now when something fails you get a raw HTTP status or a program error from the Solana runtime. There's no central "if you see this error, here's what it means and here's how to fix it" page. I built up my own mental model through trial and error. A community-maintained error glossary would save every new integrator significant time.

**API Changelog.** I can't tell when an endpoint changed. I discovered the Price API V3 response shape change by accident. A changelog on the docs site — even just a simple dated list of "what changed in which endpoint" — would mean I could check it when something breaks instead of hunting through response shapes.


---

## What I Wish Existed

**A webhook or SSE stream for position events.** Right now my Yield Vault feature works by polling the Earn API every 5 minutes via a Vercel cron. That's inefficient and I'm burning cron quota on checks that return nothing most of the time. If Jupiter could push an event when a position's yield crosses a threshold, or when an order fills, that would change what's possible for notification and automation products.

**A "dry run" mode for transaction building.** Before I broadcast a swap or a limit order, I'd love to be able to send the transaction to a Jupiter endpoint that simulates it and returns what the outcome would be — estimated output, slippage, fees — without spending SOL. Solana has simulation at the RPC level, but a Jupiter-native simulation that also shows routing details would be better.

**Batch Price API support.** The Price API is great but it's one request per token. When my Portfolio feature loads, I need prices for 20+ tokens simultaneously. I'm batching them by appending comma-separated mints to the query string, which works but isn't documented as the intended pattern. An explicit batch endpoint with a documented limit would be cleaner.

**JavaScript/TypeScript SDK for REST endpoints.** The `@jup-ag/lend` package broke my deployment but the concept is right — I'd rather call a typed function than construct raw fetch calls. If the SDK was maintained as a thin REST wrapper (no native bindings, no heavy dependencies) I'd use it. Right now the safest option is raw REST, which works but produces repetitive code.

---

## Closing Thought

I'm a developer in Ibadan building consumer DeFi products without a local dev environment. The fact that I was able to integrate ten Jupiter APIs into a production app entirely through Vercel serverless functions speaks to how solid the underlying APIs are. The gaps I documented above are real friction points but they didn't stop me — they slowed me down. Fix the auth callout on Trigger, add streaming or partial results to Portfolio, and build an interactive API explorer into the docs. Those three changes would have saved me the most time and I think they'd have the biggest ROI across your entire developer community.

ChatFi is live at [chatfi.pro](https://chatfi.pro). Every Jupiter API I integrated is production-tested with real wallets.
