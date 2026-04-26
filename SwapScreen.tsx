import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Modal, FlatList, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius } from "../constants/theme";
import { TOKEN_MINTS, TOKEN_DECIMALS, TOKEN_LOGOS, POPULAR_TOKENS } from "../constants/tokens";
import {
  fetchSwapQuote, buildSwapTransaction, fetchPrices,
  formatPrice, formatUsd, jupFetch, JUP_BASE,
  resolveToken, setTokenCache, getTokenCache, getDecimalCache,
} from "../api/jupiter";
import { useWallet } from "../context/WalletContext";

interface TokenOption { symbol: string; mint: string; decimals: number; logoURI?: string }

const DEFAULTS: TokenOption[] = POPULAR_TOKENS.map(sym => ({
  symbol: sym,
  mint: TOKEN_MINTS[sym] || "",
  decimals: TOKEN_DECIMALS[sym] ?? 6,
  logoURI: TOKEN_LOGOS[sym],
}));

export default function SwapScreen() {
  const { address, isConnected, connect, signAndSendTransaction } = useWallet();

  const [fromToken, setFromToken] = useState<TokenOption>(DEFAULTS[0]); // SOL
  const [toToken,   setToToken]   = useState<TokenOption>(DEFAULTS[1]); // JUP
  const [amount, setAmount]       = useState("");
  const [slippage, setSlippage]   = useState(50); // bps

  const [quote, setQuote]         = useState<any>(null);
  const [quoting, setQuoting]     = useState(false);
  const [swapping, setSwapping]   = useState(false);
  const [txSig, setTxSig]         = useState<string | null>(null);

  const [prices, setPrices]       = useState<Record<string, number>>({});
  const [fromBal, setFromBal]     = useState<number | null>(null);

  // Token picker modal
  const [pickerOpen, setPickerOpen]   = useState<"from" | "to" | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<TokenOption[]>(DEFAULTS);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Slippage modal
  const [slippageOpen, setSlippageOpen] = useState(false);

  useEffect(() => {
    fetchPrices().then(setPrices);
  }, []);

  // Auto-quote on changes
  useEffect(() => {
    if (!fromToken.mint || !toToken.mint || !amount || parseFloat(amount) <= 0) {
      setQuote(null); return;
    }
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const amtRaw = Math.floor(parseFloat(amount) * Math.pow(10, fromToken.decimals)).toString();
        const q = await fetchSwapQuote(fromToken.mint, toToken.mint, amtRaw, slippage);
        setQuote(q);
      } catch { setQuote(null); }
      finally { setQuoting(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [fromToken, toToken, amount, slippage]);

  // Token picker search
  useEffect(() => {
    if (!pickerSearch.trim()) { setPickerResults(DEFAULTS); return; }
    const t = setTimeout(async () => {
      setPickerLoading(true);
      try {
        const data = await jupFetch(`${JUP_BASE}/tokens/v2/search?query=${encodeURIComponent(pickerSearch)}&limit=30`);
        const list = Array.isArray(data) ? data : data?.tokens || data?.data || [];
        const results: TokenOption[] = list.map((t: any) => ({
          symbol:   t.symbol || "?",
          mint:     t.id || t.address || "",
          decimals: t.decimals ?? 6,
          logoURI:  t.logoURI || t.icon || TOKEN_LOGOS[t.symbol?.toUpperCase()],
        })).filter((t: TokenOption) => t.mint);
        // Cache them
        results.forEach(r => setTokenCache(r.symbol, r.mint, r.decimals));
        setPickerResults(results);
      } catch { setPickerResults(DEFAULTS); }
      finally { setPickerLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [pickerSearch]);

  const flip = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount("");
    setQuote(null);
  };

  const selectToken = (tok: TokenOption) => {
    if (pickerOpen === "from") {
      if (tok.mint === toToken.mint) setToToken(fromToken);
      setFromToken(tok);
    } else {
      if (tok.mint === fromToken.mint) setFromToken(toToken);
      setToToken(tok);
    }
    setPickerOpen(null);
    setPickerSearch("");
    setAmount("");
    setQuote(null);
  };

  const doSwap = async () => {
    if (!isConnected) { connect(); return; }
    if (!quote || !address) return;
    setSwapping(true);
    try {
      const txB64 = await buildSwapTransaction(quote, address);
      const sig   = await signAndSendTransaction(txB64);
      setTxSig(sig);
      setAmount("");
      setQuote(null);
    } catch (err: any) {
      Alert.alert("Swap failed", err?.message || "Unknown error");
    } finally { setSwapping(false); }
  };

  const outAmount = quote
    ? (parseInt(quote.outAmount) / Math.pow(10, toToken.decimals)).toFixed(5)
    : null;

  const fromUsd = amount && prices[fromToken.symbol]
    ? (parseFloat(amount) * prices[fromToken.symbol])
    : null;

  const slippagePct = (slippage / 100).toFixed(1);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 48 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Swap</Text>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => setSlippageOpen(true)}>
            <Text style={styles.settingsTxt}>⚙ {slippagePct}%</Text>
          </TouchableOpacity>
        </View>

        {/* Success state */}
        {txSig ? (
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Swap Submitted!</Text>
            <Text style={styles.successSig} numberOfLines={1}>
              {txSig.slice(0, 24)}…{txSig.slice(-8)}
            </Text>
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={() => {
                const { Linking } = require("react-native");
                Linking.openURL(`https://solscan.io/tx/${txSig}`);
              }}
            >
              <Text style={styles.viewBtnTxt}>View on Solscan ↗</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.newSwapBtn} onPress={() => setTxSig(null)}>
              <Text style={styles.newSwapTxt}>New Swap</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* From */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>You Pay</Text>
                {fromUsd && <Text style={styles.usdVal}>${fromUsd.toFixed(2)}</Text>}
              </View>
              <View style={styles.tokenRow}>
                <TouchableOpacity
                  style={styles.tokenBtn}
                  onPress={() => { setPickerOpen("from"); setPickerSearch(""); setPickerResults(DEFAULTS); }}
                >
                  {fromToken.logoURI
                    ? <Image source={{ uri: fromToken.logoURI }} style={styles.tokenLogo} />
                    : <View style={[styles.tokenLogo, styles.tokenLogoPlaceholder]}>
                        <Text style={{ color: Colors.text3, fontSize: 11 }}>{fromToken.symbol[0]}</Text>
                      </View>
                  }
                  <Text style={styles.tokenSym}>{fromToken.symbol}</Text>
                  <Text style={styles.chevron}>▾</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.amtInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.text3}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Flip */}
            <TouchableOpacity style={styles.flipBtn} onPress={flip}>
              <Text style={styles.flipIcon}>⇅</Text>
            </TouchableOpacity>

            {/* To */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>You Receive</Text>
              </View>
              <View style={styles.tokenRow}>
                <TouchableOpacity
                  style={styles.tokenBtn}
                  onPress={() => { setPickerOpen("to"); setPickerSearch(""); setPickerResults(DEFAULTS); }}
                >
                  {toToken.logoURI
                    ? <Image source={{ uri: toToken.logoURI }} style={styles.tokenLogo} />
                    : <View style={[styles.tokenLogo, styles.tokenLogoPlaceholder]}>
                        <Text style={{ color: Colors.text3, fontSize: 11 }}>{toToken.symbol[0]}</Text>
                      </View>
                  }
                  <Text style={styles.tokenSym}>{toToken.symbol}</Text>
                  <Text style={styles.chevron}>▾</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, justifyContent: "center" }}>
                  {quoting
                    ? <ActivityIndicator size="small" color={Colors.accent} />
                    : <Text style={[styles.amtInput, { color: outAmount ? Colors.accent : Colors.text3 }]}>
                        {outAmount ?? "—"}
                      </Text>
                  }
                </View>
              </View>
            </View>

            {/* Quote details */}
            {quote && !quoting && (
              <View style={styles.quoteCard}>
                <QuoteRow
                  label="Rate"
                  value={`1 ${fromToken.symbol} ≈ ${(parseInt(quote.outAmount) / Math.pow(10, toToken.decimals) / parseFloat(amount || "1")).toFixed(4)} ${toToken.symbol}`}
                />
                {quote.priceImpactPct && (
                  <QuoteRow
                    label="Price impact"
                    value={`${(parseFloat(quote.priceImpactPct) * 100).toFixed(3)}%`}
                    valueColor={parseFloat(quote.priceImpactPct) > 0.01 ? Colors.red : Colors.green}
                  />
                )}
                <QuoteRow
                  label="Route"
                  value={quote.routePlan?.map((r: any) => r.swapInfo?.label || "DEX").join(" → ") || "Jupiter"}
                />
                <QuoteRow label="Slippage" value={`${slippagePct}%`} />
              </View>
            )}

            {/* Swap button */}
            <TouchableOpacity
              style={[styles.swapBtn, (!quote || swapping) && styles.swapBtnDim]}
              onPress={doSwap}
              disabled={!quote || swapping}
            >
              {swapping
                ? <ActivityIndicator color={Colors.bg} />
                : <Text style={styles.swapTxt}>
                    {!isConnected
                      ? "Connect Wallet"
                      : !amount || parseFloat(amount) <= 0
                        ? "Enter an amount"
                        : quoting
                          ? "Getting best price…"
                          : !quote
                            ? "No route found"
                            : `Swap ${fromToken.symbol} → ${toToken.symbol}`
                    }
                  </Text>
              }
            </TouchableOpacity>

            <Text style={styles.jupNote}>Best route aggregated by Jupiter ⚡</Text>
          </>
        )}
      </ScrollView>

      {/* ── Token Picker Modal ─────────────────────────────────── */}
      <Modal visible={!!pickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Select {pickerOpen === "from" ? "Input" : "Output"} Token
              </Text>
              <TouchableOpacity onPress={() => setPickerOpen(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.pickerSearch}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder="Search symbol or name…"
              placeholderTextColor={Colors.text3}
              autoFocus
            />
            {pickerLoading
              ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />
              : <FlatList
                  data={pickerResults}
                  keyExtractor={(_, i) => String(i)}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.pickerItem} onPress={() => selectToken(item)}>
                      {item.logoURI
                        ? <Image source={{ uri: item.logoURI }} style={styles.pickerLogo} />
                        : <View style={[styles.pickerLogo, styles.tokenLogoPlaceholder]}>
                            <Text style={{ color: Colors.text3 }}>{item.symbol[0]}</Text>
                          </View>
                      }
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerSym}>{item.symbol}</Text>
                        <Text style={styles.pickerMint} numberOfLines={1}>
                          {item.mint.slice(0, 16)}…
                        </Text>
                      </View>
                      {prices[item.symbol] > 0 && (
                        <Text style={styles.pickerPrice}>{formatPrice(prices[item.symbol])}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={{ paddingBottom: 40 }}
                />
            }
          </View>
        </View>
      </Modal>

      {/* ── Slippage Modal ─────────────────────────────────────── */}
      <Modal visible={slippageOpen} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: 280 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Slippage Tolerance</Text>
              <TouchableOpacity onPress={() => setSlippageOpen(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.slippageRow}>
              {[10, 50, 100, 300].map(bps => (
                <TouchableOpacity
                  key={bps}
                  style={[styles.slipBtn, slippage === bps && styles.slipBtnActive]}
                  onPress={() => { setSlippage(bps); setSlippageOpen(false); }}
                >
                  <Text style={[styles.slipTxt, slippage === bps && styles.slipTxtActive]}>
                    {(bps / 100).toFixed(1)}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.slipNote}>
              Higher slippage increases the chance of execution but may result in worse fills.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function QuoteRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 3 }}>
      <Text style={{ color: Colors.text3, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: valueColor || Colors.text2, fontSize: 12, fontWeight: "600", flexShrink: 1, textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: Spacing.lg,
  },
  title: { color: Colors.text1, fontSize: 22, fontWeight: "800" },
  settingsBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  settingsTxt: { color: Colors.text2, fontSize: 12 },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: 4,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardLabel:  { color: Colors.text3, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 },
  usdVal:     { color: Colors.text3, fontSize: 12 },

  tokenRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  tokenBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  tokenLogo: { width: 26, height: 26, borderRadius: 13 },
  tokenLogoPlaceholder: { backgroundColor: Colors.surface2, justifyContent: "center", alignItems: "center" },
  tokenSym:  { color: Colors.text1, fontWeight: "700", fontSize: 14 },
  chevron:   { color: Colors.text3, fontSize: 11 },
  amtInput:  { flex: 1, color: Colors.text1, fontSize: 20, fontWeight: "600", paddingLeft: 8 },

  flipBtn: { alignSelf: "center", padding: 10, marginVertical: 2 },
  flipIcon:{ color: Colors.accent, fontSize: 24, fontWeight: "700" },

  quoteCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginVertical: 8,
  },

  swapBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingVertical: 15, alignItems: "center", marginTop: 8,
  },
  swapBtnDim: { opacity: 0.45 },
  swapTxt:    { color: Colors.bg, fontWeight: "800", fontSize: 15 },
  jupNote:    { color: Colors.text3, textAlign: "center", fontSize: 11, marginTop: 12 },

  // Success
  successCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.green,
    padding: Spacing.xl, alignItems: "center",
  },
  successIcon:  { fontSize: 48, color: Colors.green, marginBottom: 12 },
  successTitle: { color: Colors.text1, fontSize: 20, fontWeight: "800" },
  successSig:   { color: Colors.text3, fontSize: 12, marginTop: 8, maxWidth: "90%" },
  viewBtn: {
    marginTop: 16, borderWidth: 1, borderColor: Colors.blue,
    borderRadius: Radius.full, paddingHorizontal: 20, paddingVertical: 10,
  },
  viewBtnTxt: { color: Colors.blue, fontWeight: "600" },
  newSwapBtn: {
    marginTop: 10, backgroundColor: Colors.accent,
    borderRadius: Radius.full, paddingHorizontal: 24, paddingVertical: 10,
  },
  newSwapTxt: { color: Colors.bg, fontWeight: "700" },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: Colors.border,
    maxHeight: "80%", paddingTop: 8,
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderColor: Colors.border,
  },
  modalTitle: { color: Colors.text1, fontWeight: "700", fontSize: 16 },
  modalClose: { color: Colors.text3, fontSize: 18, padding: 4 },
  pickerSearch: {
    margin: Spacing.md, backgroundColor: Colors.bg,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.sm, padding: 10,
    color: Colors.text1, fontSize: 14,
  },
  pickerItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: Colors.border + "33",
  },
  pickerLogo:  { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface2 },
  pickerSym:   { color: Colors.text1, fontWeight: "700", fontSize: 14 },
  pickerMint:  { color: Colors.text3, fontSize: 10, marginTop: 2 },
  pickerPrice: { color: Colors.text2, fontSize: 13 },

  // Slippage
  slippageRow: { flexDirection: "row", gap: 10, padding: Spacing.lg },
  slipBtn: {
    flex: 1, paddingVertical: 12, alignItems: "center",
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  slipBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "22" },
  slipTxt:       { color: Colors.text2, fontWeight: "600" },
  slipTxtActive: { color: Colors.accent },
  slipNote:      { color: Colors.text3, fontSize: 12, textAlign: "center", paddingHorizontal: 20, paddingBottom: 20 },
});
