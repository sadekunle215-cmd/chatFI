// ── Feature Flags ─────────────────────────────────────────────────────────────
// Toggle features on/off without touching component code.
// New features can be added here and conditionally rendered in JupChat.jsx.

const FEATURES = {
  // ── Core trading
  swap:            true,   // Instant token swaps
  basketSwap:      true,   // Multi-token basket swaps
  limitOrders:     true,   // Limit / trigger v2 orders
  ocoOrders:       true,   // OCO bracket orders
  otocoOrders:     true,   // OTOCO orders
  dcaRecurring:    true,   // DCA / recurring buy orders
  perps:           true,   // Perpetual futures

  // ── Earn & lend
  earn:            true,   // Jupiter Earn vaults
  lend:            true,   // Borrow / lend
  multiply:        true,   // Multiply / leverage yield
  flashloans:      false,  // Flashloans (advanced, hide by default)
  jupSol:          true,   // JupSOL liquid staking

  // ── Portfolio & research
  portfolio:       true,   // Full portfolio view
  tokenCard:       true,   // Token deep-dive card
  trendingTokens:  true,   // Trending / top tokens
  recentListings:  true,   // Newly listed tokens
  xStocks:         true,   // Tokenized stocks
  tradeJournal:    true,   // Local trade history + PnL
  priceAlerts:     true,   // In-chat price alerts
  volMonitor:      true,   // Volatility monitor
  tokenVerify:     true,   // Token verify eligibility check
  walletAnalyzer:  true,   // Wallet analyser / behaviour

  // ── Copy trading
  copyTrade:       true,   // Copy trades from wallet
  topWallets:      true,   // Top wallets leaderboard

  // ── Token tools
  jupiterStudio:   true,   // Create tokens (DBC)
  lockTokens:      true,   // Lock / vesting
  claimVested:     true,   // Claim vested tokens
  rebalancer: true,
  
  // ── Send
  sendInvite:      true,   // Send via invite link
  sendHistory:     true,   // View send history

  // ── Predictions
  predictionMarkets: true, // Sports prediction markets
  predOddsScanner:   true, // Odds scanner CLI

  // ── UI extras
  tickerBar:       true,   // Scrolling price ticker
  themeCustomizer: true,   // Theme customiser panel
  blogPosts:       true,   // Blog / knowledge base
  landingPage:     true,   // Full landing page before chat
  directMode:      true,   // Direct mode (no confirm panels)
  swapRouteViewer: true,   // Swap route inspector
};

export default FEATURES;

// ── Helper: check if a feature is enabled ────────────────────────────────────
export const isEnabled = (feature) => FEATURES[feature] === true;
