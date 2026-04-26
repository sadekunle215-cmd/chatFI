import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, Fonts } from "../constants/theme";
import { TOKEN_LOGOS } from "../constants/tokens";
import { useWallet } from "../context/WalletContext";
import {
  fetchSolanaBalances, fetchPrices, fetchPortfolio,
  fetchEarnVaults, fetchRecurringOrders, fetchTriggerOrders,
  formatPrice, formatUsd,
} from "../api/jupiter";

interface TokenBalance { sym: string; bal: number; price: number; usd: number }

export default function PortfolioScreen() {
  const { address, isConnected, connect } = useWallet();

  const [balances, setBalances]     = useState<TokenBalance[]>([]);
  const [totalUsd, setTotalUsd]     = useState(0);
  const [dcaOrders, setDcaOrders]   = useState<any[]>([]);
  const [trigOrders, setTrigOrders] = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]               = useState<"tokens" | "dca" | "trigger">("tokens");

  const load = useCallback(async (refresh = false) => {
    if (!address) return;
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const [rawBals, priceMap, dcas, trigs] = await Promise.all([
        fetchSolanaBalances(address),
        fetchPrices(),
        fetchRecurringOrders(address),
        fetchTriggerOrders(address),
      ]);

      let total = 0;
      const items: TokenBalance[] = [];
      for (const [sym, bal] of Object.entries(rawBals)) {
        const price = priceMap[sym] || 0;
        const usd = bal * price;
        total += usd;
        if (usd > 0.01 || sym === "SOL") items.push({ sym, bal, price, usd });
      }
      items.sort((a, b) => b.usd - a.usd);
      setBalances(items);
      setTotalUsd(total);
      setDcaOrders(dcas);
      setTrigOrders(trigs);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);

  if (!isConnected) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>👛</Text>
          <Text style={styles.notConnTitle}>Wallet not connected</Text>
          <Text style={styles.notConnSub}>Connect to view your portfolio</Text>
          <TouchableOpacity style={styles.connectBtn} onPress={connect}>
            <Text style={styles.connectTxt}>Connect Wallet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Portfolio</Text>
        <Text style={styles.addr}>{address?.slice(0, 6)}…{address?.slice(-4)}</Text>
      </View>

      {/* Total value */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Value</Text>
        {loading
          ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 8 }} />
          : <Text style={styles.totalValue}>{formatUsd(totalUsd)}</Text>
        }
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["tokens", "dca", "trigger"] as const).map(t => (
          <TouchableOpacity
            key={t} style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
              {t === "tokens" ? "Tokens" : t === "dca" ? `DCA (${dcaOrders.length})` : `Limits (${trigOrders.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.accent} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {tab === "tokens" && (
          <View style={styles.section}>
            {balances.map(item => (
              <View key={item.sym} style={styles.tokenRow}>
                <Image
                  source={{ uri: TOKEN_LOGOS[item.sym] }}
                  style={styles.tokenLogo}
                  defaultSource={require("../../assets/icon.png")}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tokenSym}>{item.sym}</Text>
                  <Text style={styles.tokenBal}>{item.bal.toFixed(4)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.tokenUsd}>{formatUsd(item.usd)}</Text>
                  <Text style={styles.tokenPrice}>{formatPrice(item.price)}</Text>
                </View>
              </View>
            ))}
            {balances.length === 0 && !loading && (
              <Text style={styles.empty}>No token balances found</Text>
            )}
          </View>
        )}

        {tab === "dca" && (
          <View style={styles.section}>
            {dcaOrders.length === 0
              ? <Text style={styles.empty}>No active DCA orders</Text>
              : dcaOrders.map((o, i) => (
                <View key={i} style={styles.orderCard}>
                  <Text style={styles.orderTitle}>
                    {o.inputMint?.slice(0, 6)}… → {o.outputMint?.slice(0, 6)}…
                  </Text>
                  <Text style={styles.orderSub}>
                    {o.amountPerCycle ? `${o.amountPerCycle} / cycle` : "DCA Order"}
                  </Text>
                </View>
              ))
            }
          </View>
        )}

        {tab === "trigger" && (
          <View style={styles.section}>
            {trigOrders.length === 0
              ? <Text style={styles.empty}>No active limit orders</Text>
              : trigOrders.map((o, i) => (
                <View key={i} style={styles.orderCard}>
                  <Text style={styles.orderTitle}>Limit Order</Text>
                  <Text style={styles.orderSub}>
                    {o.inputMint?.slice(0, 6)}… → {o.outputMint?.slice(0, 6)}…
                  </Text>
                </View>
              ))
            }
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderColor: Colors.border + "44",
  },
  title: { color: Colors.text1, fontSize: 20, fontWeight: "800" },
  addr:  { color: Colors.text3, fontSize: 12 },

  totalCard: {
    margin: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.xl, alignItems: "center",
  },
  totalLabel: { color: Colors.text3, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" },
  totalValue: { color: Colors.accent, fontSize: 36, fontWeight: "800", marginTop: 6 },

  tabs: {
    flexDirection: "row", marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { backgroundColor: Colors.accent + "22" },
  tabTxt: { color: Colors.text3, fontSize: 12, fontWeight: "600" },
  tabTxtActive: { color: Colors.accent },

  section: { paddingHorizontal: Spacing.lg },

  tokenRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border + "44",
  },
  tokenLogo: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surface2 },
  tokenSym:  { color: Colors.text1, fontWeight: "700", fontSize: 14 },
  tokenBal:  { color: Colors.text3, fontSize: 12, marginTop: 2 },
  tokenUsd:  { color: Colors.text1, fontWeight: "700", fontSize: 14 },
  tokenPrice:{ color: Colors.text3, fontSize: 12, marginTop: 2 },

  orderCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  orderTitle: { color: Colors.text1, fontWeight: "700", fontSize: 14 },
  orderSub:   { color: Colors.text2, fontSize: 12, marginTop: 3 },

  empty: { color: Colors.text3, textAlign: "center", marginTop: 40, fontSize: 14 },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.xl },
  bigIcon:      { fontSize: 48, marginBottom: 16 },
  notConnTitle: { color: Colors.text1, fontSize: 20, fontWeight: "700" },
  notConnSub:   { color: Colors.text3, fontSize: 14, marginTop: 6, marginBottom: 24 },
  connectBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingHorizontal: 28, paddingVertical: 13,
  },
  connectTxt: { color: Colors.bg, fontWeight: "700", fontSize: 14 },
});
