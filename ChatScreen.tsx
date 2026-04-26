/**
 * ChatScreen — main screen of ChatFi native app
 *
 * Mirrors the web app's AI chat logic:
 *  - AI commands parsed from user input via Claude API (chatfi.pro/api/chat)
 *  - Inline panels: Swap, Portfolio, Earn, Trigger, etc.
 *  - Suggestion chips grouped by category
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, ScrollView, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts, Spacing, Radius } from "../constants/theme";
import { SUGGESTION_GROUPS, TOKEN_MINTS, TOKEN_DECIMALS } from "../constants/tokens";
import MessageBubble, { Message } from "../components/MessageBubble";
import SwapPanel from "../components/SwapPanel";
import PriceChart from "../components/PriceChart";
import { useWallet } from "../context/WalletContext";
import {
  fetchPrices, fetchTokenInfo, fetchPortfolio, fetchSolanaBalances,
  fetchEarnVaults, fetchRecurringOrders, fetchTriggerOrders,
  formatPrice, formatUsd, resolveToken, jupFetch,
  JUP_BASE, JUP_EARN_API,
} from "../api/jupiter";

const CHAT_API = "https://chatfi.pro/api/chat"; // same backend as web

let msgId = 1;
const mkMsg = (role: "ai" | "user", text: string, extra?: Partial<Message>): Message =>
  ({ id: msgId++, role, text, ...extra });

// ── Inline panel state types ──────────────────────────────────────────────────
type PanelType = "swap" | "portfolio" | "earn" | "trigger" | "recurring" | "perps" | "predictions" | null;

interface InlinePanel {
  type: PanelType;
  data?: any;
}

export default function ChatScreen() {
  const { address, isConnected, connect } = useWallet();
  const [msgs, setMsgs] = useState<Message[]>([
    mkMsg("ai",
      "Hey! I'm **ChatFi** — your AI trading assistant on Solana. 👋\n\n" +
      "I can swap tokens, check prices, set limit orders, track your portfolio, and earn yield.\n\n" +
      "Connect your wallet to get started, or just ask me anything!",
      { showConnectBtn: true }
    ),
  ]);
  const [input, setInput]   = useState("");
  const [typing, setTyping] = useState(false);
  const [panel, setPanel]   = useState<InlinePanel>({ type: null });
  const [prices, setPrices] = useState<Record<string, number>>({});

  const listRef = useRef<FlatList>(null);

  // Fetch prices on mount
  useEffect(() => {
    fetchPrices().then(setPrices);
    const interval = setInterval(() => fetchPrices().then(setPrices), 30_000);
    return () => clearInterval(interval);
  }, []);

  const push = useCallback((role: "ai" | "user", text: string, extra?: any) => {
    const msg = mkMsg(role, text, extra);
    setMsgs(prev => [...prev, msg]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    return msg;
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────
  const send = useCallback(async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || typing) return;
    setInput("");
    push("user", q);
    setTyping(true);

    // Temporarily show typing indicator
    const typingMsg = mkMsg("ai", "", { typing: true });
    setMsgs(prev => [...prev, typingMsg]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // Call ChatFi's AI backend
      const res = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          walletAddress: address || null,
          prices,
        }),
      });
      const data = await res.json();

      // Remove typing indicator
      setMsgs(prev => prev.filter(m => m.id !== typingMsg.id));

      // Handle action from AI
      const action = data?.action;
      const reply  = data?.reply || data?.text || "Sorry, I couldn't process that.";

      push("ai", reply);

      if (action) await handleAction(action, data);
    } catch (err: any) {
      setMsgs(prev => prev.filter(m => m.id !== typingMsg.id));
      push("ai", "Connection error. Please check your internet and try again.");
    } finally {
      setTyping(false);
    }
  }, [input, typing, address, prices, push]);

  // ── Action handler — mirrors web app's action dispatch ───────────────────
  const handleAction = async (action: string, data: any) => {
    switch (action) {
      case "SHOW_PRICE": {
        const sym = data.symbol?.toUpperCase();
        const info = await fetchTokenInfo(sym);
        if (info) {
          const mint = info.id || info.address || TOKEN_MINTS[sym];
          const price = info.usdPrice ?? prices[sym];
          const change = info.stats24h?.priceChange ?? 0;
          push("ai",
            `**${sym}** — ${formatPrice(price)}\n` +
            `24h: ${change >= 0 ? "+" : ""}${parseFloat(change).toFixed(2)}%\n` +
            `MCap: ${formatUsd(info.mcap ?? info.fdv)}`
          );
          // Show chart inline
          if (mint) {
            setMsgs(prev => [...prev, mkMsg("ai", `__CHART__${mint}__${sym}`)]);
          }
        }
        break;
      }

      case "SHOW_SWAP": {
        setPanel({
          type: "swap",
          data: {
            from: data.from || "SOL",
            to: data.to || "JUP",
            amount: data.amount || "",
          },
        });
        break;
      }

      case "SHOW_PORTFOLIO": {
        if (!isConnected || !address) {
          push("ai", "Please connect your wallet to view your portfolio."); break;
        }
        push("ai", "Fetching your portfolio…");
        try {
          const [balances, portfolio] = await Promise.all([
            fetchSolanaBalances(address),
            fetchPortfolio(address),
          ]);
          const priceMap = await fetchPrices();
          let totalUsd = 0;
          let lines = ["**Your Portfolio**\n"];
          for (const [sym, bal] of Object.entries(balances)) {
            const p = priceMap[sym] || 0;
            const usd = bal * p;
            if (usd > 0.01 || sym === "SOL") {
              totalUsd += usd;
              lines.push(`• **${sym}** — ${Number(bal).toFixed(4)} ($${usd.toFixed(2)})`);
            }
          }
          lines.push(`\n**Total: ${formatUsd(totalUsd)}**`);
          push("ai", lines.join("\n"));
        } catch {
          push("ai", "Could not fetch portfolio. Try again.");
        }
        break;
      }

      case "SHOW_EARN": {
        push("ai", "Fetching earn vaults…");
        const vaults = await fetchEarnVaults();
        if (!vaults.length) { push("ai", "No earn vaults available right now."); break; }
        const lines = ["**Jupiter Earn Vaults**\n",
          ...vaults.slice(0, 8).map(v =>
            `• **${v.token}** — APY: **${v.apy}** | TVL: ${formatUsd(v.tvl)}`
          )
        ];
        push("ai", lines.join("\n"));
        setPanel({ type: "earn", data: vaults });
        break;
      }

      case "SHOW_DCA": {
        if (!address) { push("ai", "Connect wallet to check DCA orders."); break; }
        const orders = await fetchRecurringOrders(address);
        if (!orders.length) { push("ai", "No active DCA orders found."); break; }
        push("ai", `You have **${orders.length}** active DCA order(s).`);
        break;
      }

      case "SHOW_TRIGGER": {
        setPanel({ type: "trigger", data });
        break;
      }

      default:
        break;
    }
  };

  // ── Render items ─────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: Message }) => {
    // Chart placeholder
    if (item.text.startsWith("__CHART__")) {
      const [, mint, sym] = item.text.split("__");
      return <PriceChart mint={mint} symbol={sym} />;
    }

    return (
      <MessageBubble
        msg={item}
        onConnect={isConnected ? undefined : connect}
      />
    );
  }, [isConnected, connect]);

  // ── Bottom panel ─────────────────────────────────────────────────────────
  const renderPanel = () => {
    if (panel.type === "swap") {
      return (
        <SwapPanel
          initialFrom={panel.data?.from}
          initialTo={panel.data?.to}
          initialAmount={panel.data?.amount}
          onClose={() => setPanel({ type: null })}
          onSuccess={sig => push("ai", `Swap submitted ✓\n\n[View on Solscan](https://solscan.io/tx/${sig})`)}
        />
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logo}>
              <Text style={styles.logoTxt}>⚡</Text>
            </View>
            <View>
              <Text style={styles.appName}>ChatFi</Text>
              <Text style={styles.appSub}>Solana AI Trading</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.walletBtn, isConnected && styles.walletConnected]}
            onPress={isConnected ? undefined : connect}
          >
            <Text style={styles.walletTxt}>
              {isConnected
                ? `${address?.slice(0, 4)}…${address?.slice(-4)}`
                : "Connect"
              }
            </Text>
          </TouchableOpacity>
        </View>

        {/* Price ticker */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.ticker} contentContainerStyle={styles.tickerContent}
        >
          {Object.entries(prices).slice(0, 8).map(([sym, price]) => (
            <TouchableOpacity key={sym} style={styles.tickerChip} onPress={() => send(`${sym} price`)}>
              <Text style={styles.tickerSym}>{sym}</Text>
              <Text style={styles.tickerPrice}>{formatPrice(price)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={m => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={
            panel.type ? (
              <View style={{ paddingHorizontal: 12 }}>{renderPanel()}</View>
            ) : (
              /* Suggestion chips — shown when chat is at initial state */
              msgs.length <= 2 ? (
                <View style={styles.suggestions}>
                  {SUGGESTION_GROUPS.map(group => (
                    <View key={group.label} style={styles.suggGroup}>
                      <View style={styles.suggLabel}>
                        <View style={[styles.suggDot, { backgroundColor: group.color }]} />
                        <Text style={[styles.suggLabelTxt, { color: group.color }]}>{group.label}</Text>
                      </View>
                      <View style={styles.suggChips}>
                        {group.items.map(s => (
                          <TouchableOpacity
                            key={s} style={styles.chip}
                            onPress={() => send(s)}
                          >
                            <Text style={styles.chipTxt}>{s}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null
            )
          }
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about prices, swaps, tokens…"
            placeholderTextColor={Colors.text3}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => send()}
            blurOnSubmit
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || typing) && styles.sendBtnDim]}
            onPress={() => send()}
            disabled={!input.trim() || typing}
          >
            {typing
              ? <ActivityIndicator size="small" color={Colors.bg} />
              : <Text style={styles.sendIcon}>↑</Text>
            }
          </TouchableOpacity>
        </View>
        <Text style={styles.disclaimer}>Not financial advice · Powered by Jupiter</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderColor: Colors.border + "44",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.accent + "22",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: Colors.accent + "44",
  },
  logoTxt:  { fontSize: 18 },
  appName:  { color: Colors.text1, fontWeight: "800", fontSize: 16 },
  appSub:   { color: Colors.text3, fontSize: 11 },
  walletBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  walletConnected: { borderColor: Colors.accent + "66", backgroundColor: Colors.accent + "11" },
  walletTxt: { color: Colors.text1, fontSize: 12, fontWeight: "600" },

  // Ticker
  ticker: { maxHeight: 40, borderBottomWidth: 1, borderColor: Colors.border + "33" },
  tickerContent: { paddingHorizontal: Spacing.md, gap: 8, alignItems: "center" },
  tickerChip: {
    flexDirection: "row", gap: 5, alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.border,
  },
  tickerSym:   { color: Colors.text2, fontSize: 11, fontWeight: "700" },
  tickerPrice: { color: Colors.accent, fontSize: 11 },

  // Messages
  msgList: { paddingVertical: Spacing.md, paddingBottom: 16 },

  // Suggestions
  suggestions:  { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },
  suggGroup:    { marginBottom: 14 },
  suggLabel:    { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  suggDot:      { width: 6, height: 6, borderRadius: 3 },
  suggLabelTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  suggChips:    { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 7,
    backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipTxt: { color: Colors.text2, fontSize: 12 },

  // Input
  inputBar: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 12, marginTop: 8, marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingLeft: 18, paddingRight: 6, paddingVertical: 6,
  },
  input: {
    flex: 1, color: Colors.text1, fontSize: 14, maxHeight: 100,
    paddingTop: 6, paddingBottom: 6,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent,
    justifyContent: "center", alignItems: "center",
  },
  sendBtnDim: { backgroundColor: Colors.border },
  sendIcon: { color: Colors.bg, fontWeight: "700", fontSize: 18 },
  disclaimer: { textAlign: "center", color: Colors.text3, fontSize: 10, marginBottom: 8 },
});
