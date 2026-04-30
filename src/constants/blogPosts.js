// ── Blog Posts ────────────────────────────────────────────────────────────────
// Static knowledge base / help articles shown in the Blog panel.
// Add new posts here — they'll automatically appear in the UI.

export const BLOG_POSTS = [
  {
    id: 1,
    title: "What is ChatFi? Your AI Trading Copilot on Solana",
    category: "Overview",
    readTime: "4 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "ChatFi is the first AI-native trading interface built on Jupiter — the largest DEX aggregator on Solana.",
    sections: [
      { heading: "The Problem With DeFi Today", body: "DeFi is powerful but brutal to use. You need to know which DEX has the best price, understand slippage, manage multiple tabs, and decode transaction errors — all before you've made a single trade." },
      { heading: "What ChatFi Does Differently", body: "ChatFi wraps Jupiter's entire trading suite — swaps, limit orders, DCA, lending, yield, and prediction markets — behind a natural language interface. You just type what you want." },
      { heading: "Built on Jupiter — The #1 Solana DEX", body: "Jupiter processes billions in monthly swap volume and aggregates liquidity from every major Solana DEX: Orca, Raydium, Meteora, Phoenix, and more." },
      { heading: "Non-Custodial & Trustless", body: "ChatFi never holds your funds. Your wallet stays in your control at all times. When you execute a trade, ChatFi prepares the transaction and your wallet signs it." },
      { heading: "Who Is It For?", body: "ChatFi is built for anyone who wants to trade smarter on Solana — from first-time DeFi users to experienced traders who want to automate strategies." },
    ],
    tips: [
      "Connect your wallet in one tap — Phantom, Backpack, Solflare, and social login all supported",
      "You don't need to know token addresses — just use ticker symbols like SOL, JUP, BONK",
      "All transactions happen via Jupiter's audited smart contracts — no middleman",
    ],
  },
  {
    id: 2,
    title: "How to Swap Any Token on Solana Instantly",
    category: "Guide",
    readTime: "3 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "A step-by-step guide to swapping tokens with ChatFi — from simple SOL→USDC trades to obscure meme coins.",
    sections: [
      { heading: "Basic Swaps", body: "To swap tokens, just describe what you want. \"Swap 1 SOL to USDC\" — ChatFi parses your intent and opens the swap panel pre-filled and ready to confirm." },
      { heading: "What You Can Say", body: "\"Swap 1 SOL to USDC\" · \"Buy $50 of JUP\" · \"Exchange half my USDC for SOL\" · \"Sell all my BONK\" — any natural phrasing works." },
      { heading: "Unknown & Meme Tokens", body: "ChatFi uses Jupiter's live token search API to resolve any token — not just the big ones. Paste a contract address directly if you want to be precise." },
      { heading: "Slippage & Price Impact", body: "ChatFi applies sensible slippage defaults (0.5% for most swaps). For low-liquidity meme coins, slippage is auto-adjusted upward." },
    ],
    tips: [
      "\"Swap all my X\" automatically reads your wallet balance",
      "Use \"show route for X to Y\" to preview which DEXes Jupiter will route through",
    ],
  },
  {
    id: 3,
    title: "Basket Swaps: Trade Multiple Tokens in One Command",
    category: "Feature",
    readTime: "4 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "Basket swaps let you execute multiple trades simultaneously with a single chat message.",
    sections: [
      { heading: "What Is a Basket Swap?", body: "A basket swap bundles multiple individual swaps into a single workflow. ChatFi prepares all transactions in parallel, requests one batch approval, and executes each trade sequentially." },
      { heading: "Buying a Basket of Tokens", body: "\"Buy $100 each of SOL, JUP, BONK, and WIF\" — ChatFi creates 4 swaps from USDC to each token and submits them for approval together." },
      { heading: "Selling Multiple Tokens", body: "\"Swap 5.4 JUP, 113.7 PENGU, and 158.4k BONK to USDC\" — ChatFi recognises each token and amount and prepares all three sell orders." },
    ],
    tips: [
      "Use \"k\" shorthand for thousands: \"158.4k BONK\" = 158,400 BONK",
      "To split $500 evenly across 5 tokens: \"buy $100 each of SOL JUP BONK WIF PENGU\"",
    ],
  },
  {
    id: 4,
    title: "Automate Your Trades: Limit Orders, DCA & Recurring Buys",
    category: "Guide",
    readTime: "5 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "Stop watching charts 24/7. ChatFi lets you set limit orders, brackets, and scheduled recurring buys.",
    sections: [
      { heading: "Limit Orders", body: "\"Buy 100 USDC of SOL if it drops below $140\" — ChatFi creates a Jupiter trigger order that fires automatically when the condition is met." },
      { heading: "OCO: Take Profit + Stop Loss Together", body: "OCO lets you set a take-profit and stop-loss at the same time. If either triggers, the other cancels automatically." },
      { heading: "DCA / Recurring Buys", body: "\"Buy $10 of SOL every day for 30 days\" — ChatFi schedules recurring orders via Jupiter's DCA engine at your chosen interval." },
    ],
    tips: [
      "Limit orders are free to set — you only pay the swap fee when they execute",
      "DCA is ideal for entering volatile positions over time rather than all at once",
    ],
  },
  {
    id: 5,
    title: "Earn Passive Yield on Your Solana Assets",
    category: "Feature",
    readTime: "4 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "Your idle USDC and SOL can be earning yield right now via Jupiter Earn and Lend.",
    sections: [
      { heading: "What Is Jupiter Earn?", body: "Jupiter Earn deploys assets into curated lending protocols optimised for the best APY. You receive jlTokens which accrue yield in real time." },
      { heading: "How to Deposit", body: "\"Earn yield on 100 USDC\" — ChatFi opens the Earn panel showing available vaults, current APY, and deposit limits." },
      { heading: "Withdrawing Your Funds", body: "\"Show my earn positions\" — ChatFi pulls up your current positions with live balances and one-click withdraw buttons." },
      { heading: "Multiply: Leveraged Yield", body: "Multiply lets you loop your position using flashloans to amplify yield exposure — e.g. 2x–5x leveraged staking yield." },
    ],
    tips: [
      "APYs are variable and update continuously based on protocol demand",
      "Withdrawals settle on-chain instantly; no lock-up periods",
    ],
  },
  {
    id: 6,
    title: "Copy Trading: Mirror the Best Solana Wallets",
    category: "Feature",
    readTime: "3 min read",
    date: new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
    summary: "Find profitable wallets and copy their trades automatically using ChatFi's copy trading system.",
    sections: [
      { heading: "How Copy Trading Works", body: "Type \"copy trades from <wallet>\" to see and replicate recent swaps from any Solana wallet. ChatFi shows you what they traded and lets you mirror each one with a tap." },
      { heading: "Top Wallets Leaderboard", body: "\"Show top wallets\" — browse a live ranking of the most profitable Solana traders by 7-day PnL. Tap Mirror on any entry to copy their strategy." },
      { heading: "Wallet Behaviour Analysis", body: "ChatFi profiles any wallet — trading style (scalper/swing/position), top tokens, sentiment (accumulating/distributing), and average trade size." },
    ],
    tips: [
      "Always DYOR before copying any wallet — past performance is not indicative of future results",
      "Use wallet analysis to understand the style before committing capital",
    ],
  },
];
