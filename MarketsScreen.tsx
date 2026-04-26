import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, Fonts } from "../constants/theme";
import { TOKEN_LOGOS, POPULAR_TOKENS } from "../constants/tokens";
import { fetchPrices, fetchTokenInfo, formatPrice, jupFetch, JUP_BASE, JUP_TOKEN_CAT } from "../api/jupiter";
import { useNavigation } from "@react-navigation/native";

interface TokenItem {
  id: string; symbol: string; name: string;
  usdPrice: number; priceChange24h: number;
  mcap: number; volume24h: number; logoURI?: string;
}

type Category = "trending" | "toptraded" | "new";

export default function MarketsScreen() {
  const [category, setCategory] = useState<Category>("trending");
  const [tokens, setTokens]     = useState<TokenItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]     = useState("");
  const [searchResults, setSearchResults] = useState<TokenItem[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async (cat: Category = category, refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await jupFetch(`${JUP_TOKEN_CAT}/${cat}/1D?limit=50`);
      const list = Array.isArray(data) ? data : data?.tokens || data?.data || [];
      setTokens(list.map((t: any) => ({
        id:           t.id || t.address || "",
        symbol:       t.symbol || "?",
        name:         t.name   || t.symbol || "?",
        usdPrice:     parseFloat(t.usdPrice || t.price || 0),
        priceChange24h: parseFloat(t.stats24h?.priceChange || t.priceChange24h || 0),
        mcap:         parseFloat(t.mcap || t.fdv || 0),
        volume24h:    parseFloat(t.stats24h?.buyVolume + t.stats24h?.sellVolume || t.volume24h || 0),
        logoURI:      t.logoURI || t.icon || TOKEN_LOGOS[t.symbol?.toUpperCase()],
      })));
    } catch {
      // Fallback to price API for popular tokens
      const prices = await fetchPrices(POPULAR_TOKENS);
      setTokens(POPULAR_TOKENS.map(sym => ({
        id: "", symbol: sym, name: sym,
        usdPrice: prices[sym] || 0,
        priceChange24h: 0, mcap: 0, volume24h: 0,
        logoURI: TOKEN_LOGOS[sym],
      })));
    } finally { setLoading(false); setRefreshing(false); }
  }, [category]);

  useEffect(() => { load(); }, [category]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await jupFetch(`${JUP_BASE}/tokens/v2/search?query=${encodeURIComponent(search)}`);
        const list = Array.isArray(data) ? data : data?.tokens || data?.data || [];
        setSearchResults(list.slice(0, 20).map((t: any) => ({
          id: t.id || t.address || "",
          symbol: t.symbol || "?", name: t.name || t.symbol || "?",
          usdPrice: parseFloat(t.usdPrice || 0),
          priceChange24h: parseFloat(t.stats24h?.priceChange || 0),
          mcap: parseFloat(t.mcap || 0), volume24h: 0,
          logoURI: t.logoURI || t.icon || TOKEN_LOGOS[t.symbol?.toUpperCase()],
        })));
      } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const displayList = search.trim() ? searchResults : tokens;

  const renderToken = ({ item }: { item: TokenItem }) => {
    const up = item.priceChange24h >= 0;
    const changeColor = up ? Colors.green : Colors.red;
    return (
      <View style={styles.tokenRow}>
        {item.logoURI
          ? <Image source={{ uri: item.logoURI }} style={styles.logo} />
          : <View style={[styles.logo, styles.logoPlaceholder]}>
              <Text style={{ color: Colors.text3, fontSize: 12 }}>{item.symbol[0]}</Text>
            </View>
        }
        <View style={{ flex: 1 }}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.price}>{formatPrice(item.usdPrice)}</Text>
          <View style={[styles.changeBadge, { backgroundColor: changeColor + "22" }]}>
            <Text style={[styles.changeText, { color: changeColor }]}>
              {up ? "+" : ""}{item.priceChange24h.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Markets</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search tokens…"
          placeholderTextColor={Colors.text3}
        />
        {searching && <ActivityIndicator size="small" color={Colors.accent} style={{ marginRight: 8 }} />}
      </View>

      {/* Category tabs */}
      {!search.trim() && (
        <View style={styles.catRow}>
          {(["trending", "toptraded", "new"] as Category[]).map(c => (
            <TouchableOpacity
              key={c} style={[styles.catBtn, category === c && styles.catBtnActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.catTxt, category === c && styles.catTxtActive]}>
                {c === "trending" ? "🔥 Trending" : c === "toptraded" ? "📊 Top Traded" : "✨ New"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Column headers */}
      <View style={styles.colHeader}>
        <Text style={styles.colLabel}>Token</Text>
        <Text style={[styles.colLabel, { textAlign: "right" }]}>Price / 24h</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.accent} />
      ) : (
        <FlatList
          data={displayList}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderToken}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(category, true)} tintColor={Colors.accent} />}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderColor: Colors.border + "44",
  },
  title: { color: Colors.text1, fontSize: 20, fontWeight: "800" },

  searchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: Spacing.lg, marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.text1, paddingVertical: 10, fontSize: 14 },

  catRow: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm,
  },
  catBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  catBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "22" },
  catTxt:       { color: Colors.text2, fontSize: 12, fontWeight: "600" },
  catTxtActive: { color: Colors.accent },

  colHeader: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: Spacing.lg, paddingVertical: 6,
    borderBottomWidth: 1, borderColor: Colors.border + "33",
  },
  colLabel: { color: Colors.text3, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 },

  tokenRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: Colors.border + "33",
  },
  logo: { width: 36, height: 36, borderRadius: 18 },
  logoPlaceholder: {
    backgroundColor: Colors.surface2, justifyContent: "center", alignItems: "center",
  },
  symbol: { color: Colors.text1, fontWeight: "700", fontSize: 14 },
  name:   { color: Colors.text3, fontSize: 12, marginTop: 2 },
  price:  { color: Colors.text1, fontWeight: "700", fontSize: 14 },
  changeBadge: { marginTop: 3, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  changeText:  { fontSize: 11, fontWeight: "700" },
});
