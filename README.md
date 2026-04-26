# ChatFi Native App

AI-powered Solana trading assistant — React Native (Expo) for iOS & Android.

## Features

| Tab | What it does |
|-----|-------------|
| **Chat** | AI chat interface — ask for prices, execute swaps, manage positions via natural language |
| **Swap** | Token-to-token swaps via Jupiter aggregator with live quotes and slippage control |
| **Markets** | Trending, top-traded and new tokens with live search |
| **Portfolio** | SOL + SPL balances, DCA orders, limit orders |
| **Earn** | Jupiter Lend vaults (deposit/withdraw), Multiply leverage vaults, Borrow |
| **Settings** | Wallet management, app links, share |

---

## Prerequisites

- Node.js ≥ 18
- Expo CLI: `npm i -g expo-cli eas-cli`
- Xcode (for iOS) or Android Studio (for Android)
- [WalletConnect Cloud](https://cloud.walletconnect.com) project ID
- [EAS account](https://expo.dev) for cloud builds

---

## Setup

```bash
# 1. Install dependencies
cd chatfi-native
npm install

# 2. Add fonts
mkdir -p assets/fonts
# Download SpaceMono-Regular.ttf from Google Fonts and place it in assets/fonts/

# 3. Add placeholder assets
# Add assets/icon.png (1024x1024), assets/splash.png, assets/adaptive-icon.png

# 4. Set your WalletConnect Project ID
# Open src/context/WalletContext.tsx
# Replace: const WALLETCONNECT_PROJECT_ID = "YOUR_WALLETCONNECT_PROJECT_ID"
# with your actual ID from cloud.walletconnect.com

# 5. Set your EAS project ID
# Open app.json → extra.eas.projectId
# Run: eas init   (auto-fills the project ID)
```

---

## Development

```bash
# Start Expo dev server
npx expo start

# Run on Android emulator / device
npx expo run:android

# Run on iOS simulator (Mac only)
npx expo run:ios
```

---

## Building for Production

### Android APK / AAB
```bash
# Internal testing APK
eas build --platform android --profile preview

# Production AAB for Play Store
eas build --platform android --profile production
```

### iOS IPA
```bash
# TestFlight / internal
eas build --platform ios --profile preview

# App Store
eas build --platform ios --profile production
```

---

## Architecture

```
chatfi-native/
├── App.tsx                        # Root — fonts, providers, splash
├── src/
│   ├── constants/
│   │   ├── theme.ts               # Colors, fonts, spacing
│   │   └── tokens.ts              # Token mints, logos, suggestions
│   ├── api/
│   │   └── jupiter.ts             # All Jupiter API calls (proxied via chatfi.pro)
│   ├── context/
│   │   └── WalletContext.tsx      # WalletConnect v2 session management
│   ├── components/
│   │   ├── MessageBubble.tsx      # Chat message with Markdown
│   │   ├── SwapPanel.tsx          # Inline swap widget
│   │   └── PriceChart.tsx         # SVG candlestick/line chart
│   ├── screens/
│   │   ├── ChatScreen.tsx         # AI chat (main screen)
│   │   ├── SwapScreen.tsx         # Swap tab
│   │   ├── MarketsScreen.tsx      # Token discovery
│   │   ├── PortfolioScreen.tsx    # Wallet balances + orders
│   │   ├── EarnScreen.tsx         # Earn / Multiply / Borrow
│   │   └── SettingsScreen.tsx     # Settings + disconnect
│   └── navigation/
│       └── AppNavigator.tsx       # Bottom tab navigator (custom tab bar)
```

---

## Wallet Connection

The app uses **WalletConnect v2** for wallet connections on both platforms:

- Opens Phantom/Solflare/Trust via deep links if installed
- Falls back to Phantom web connect flow
- Supports any WalletConnect-compatible Solana wallet

---

## API Proxy

All Jupiter API calls are routed through **chatfi.pro/api/jupiter** (same as the web app). This:
- Handles CORS
- Manages API keys for Jupiter Lend endpoints
- Allows server-side caching and rate limiting

---

## Environment Checklist

- [ ] `WALLETCONNECT_PROJECT_ID` set in `WalletContext.tsx`
- [ ] EAS project ID set in `app.json`
- [ ] `assets/icon.png` (1024×1024 px)
- [ ] `assets/splash.png`
- [ ] `assets/adaptive-icon.png` (Android)
- [ ] `assets/fonts/SpaceMono-Regular.ttf`
- [ ] Apple Developer account (iOS builds)
- [ ] Google Play Console account (Android builds)

---

## Notes

- All DeFi interactions are non-custodial — private keys never leave the user's wallet app
- Price data refreshes every 30 seconds
- Not financial advice — users are responsible for their own trading decisions
