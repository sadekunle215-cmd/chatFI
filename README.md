# ChatFi — Project Structure

Refactored from a single 13,000-line file into a clean, feature-modular architecture.

---

## Directory Layout

```
src/
├── JupChat.jsx                    ← Main orchestrator (thin shell)
│
├── config/
│   └── features.js                ← Feature flags (toggle on/off)
│
├── constants/
│   ├── index.js                   ← Design tokens, token mints, API URLs
│   ├── systemPrompt.js            ← AI system prompt
│   └── blogPosts.js               ← Blog/help content
│
├── providers/
│   └── AppProviders.jsx           ← Privy + Reown AppKit init
│
├── hooks/
│   ├── useChat.js                 ← Messages state, send, push
│   ├── useWallet.js               ← Wallet connection, balances, Privy/Reown
│   ├── useSwap.js                 ← Swap config, quote, execution
│   └── useTokenData.js            ← Token info, prices, categories
│
├── utils/
│   └── solana.js                  ← jupFetch, fmt, fmtNum, fmtPrice, resolveToken
│
└── components/
    ├── icons/
    │   └── Icons.jsx              ← All SVG icon components
    ├── Chat/
    │   ├── MessageBubble.jsx      ← Single message renderer
    │   ├── ChatInput.jsx          ← Input bar + suggestion chips
    │   └── TickerBar.jsx          ← Scrolling price ticker
    ├── Wallet/
    │   └── WalletModal.jsx        ← Wallet picker modal
    ├── Portfolio/
    │   └── PortfolioPanel.jsx     ← Portfolio sheet (tokens/earn/orders)
    ├── Token/
    │   └── TokenCard.jsx          ← Token deep-dive card modal
    ├── Swap/
    │   └── SwapPanel.jsx          ← Inline swap form
    ├── Orders/
    │   ├── TriggerOrderPanel.jsx  ← Limit/OCO/OTOCO orders
    │   └── RecurringPanel.jsx     ← DCA/recurring buy orders
    └── Blog/
        └── BlogPanel.jsx          ← Blog/help articles panel
```

---

## Adding a New Feature

1. **Add feature flag** in `config/features.js`:
   ```js
   myFeature: true,
   ```

2. **Create component** in `components/MyFeature/MyFeaturePanel.jsx`

3. **Add hook** (if needed) in `hooks/useMyFeature.js`

4. **Add action** in `JupChat.jsx` dispatcher:
   ```js
   case "SHOW_MY_FEATURE":
     setShowMyFeature(true);
     push("ai", text || "Opening...");
     break;
   ```

5. **Register action in AI** in `constants/systemPrompt.js`:
   ```
   SHOW_MY_FEATURE
     → actionData: { param1, param2 }
   ```

6. **Render panel** in JupChat.jsx message area:
   ```jsx
   {isEnabled("myFeature") && showMyFeature && (
     <MyFeaturePanel onClose={() => setShowMyFeature(false)} ... />
   )}
   ```

---

## Feature Flags

Edit `src/config/features.js` to enable/disable any feature without touching UI code.

```js
const FEATURES = {
  swap:            true,   // Token swaps
  limitOrders:     true,   // Limit / trigger orders
  dcaRecurring:    true,   // DCA recurring buys
  earn:            true,   // Jupiter Earn vaults
  perps:           true,   // Perpetual futures
  portfolio:       true,   // Portfolio view
  tokenCard:       true,   // Token deep-dive
  tickerBar:       true,   // Price ticker
  // ...
};
```

---

## Environment Variables

```env
VITE_PRIVY_APP_ID=your_privy_app_id
VITE_SOLANA_RPC=https://your-rpc-url.com
```

---

## API Proxy

All Jupiter API calls go through `/api/jupiter` (Vercel serverless) to inject the API key.
See `utils/solana.js → jupFetch()`.
