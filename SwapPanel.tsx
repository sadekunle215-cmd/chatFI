import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from "react-native";
import { Colors, Fonts, Spacing, Radius } from "../constants/theme";
import { TOKEN_MINTS, TOKEN_DECIMALS, POPULAR_TOKENS } from "../constants/tokens";
import {
  fetchSwapQuote, buildSwapTransaction, formatPrice, jupFetch,
  resolveToken, getTokenCache, getDecimalCache,
} from "../api/jupiter";
import { useWallet } from "../context/WalletContext";
import { VersionedTransaction } from "@solana/web3.js";
import { b64ToBytes } from "../api/jupiter";

interface SwapConfig {
  from: string; fromMint: string; fromDecimals: number;
  to: string;   toMint: string;   toDecimals: number;
  amount: string;
}

interface Props {
  initialFrom?: string;
  initialTo?: string;
  initialAmount?: string;
  onClose?: () => void;
  onSuccess?: (txSig: string) => void;
}

export default function SwapPanel({
  initialFrom = "SOL", initialTo = "JUP", initialAmount = "",
  onClose, onSuccess,
}: Props) {
  const { address, signAndSendTransaction, isConnected } = useWallet();

  const [cfg, setCfg] = useState<SwapConfig>({
    from: initialFrom,
    fromMint: TOKEN_MINTS[initialFrom] || "",
    fromDecimals: TOKEN_DECIMALS[initialFrom] ?? 9,
    to: initialTo,
    toMint: TOKEN_MINTS[initialTo] || "",
    toDecimals: TOKEN_DECIMALS[initialTo] ?? 6,
    amount: initialAmount,
  });
  const [quote, setQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);

  // Fetch quote whenever config changes
  useEffect(() => {
    if (!cfg.fromMint || !cfg.toMint || !cfg.amount || parseFloat(cfg.amount) <= 0) {
      setQuote(null); return;
    }
    const t = setTimeout(() => {
      setQuoting(true);
      const amtRaw = Math.floor(parseFloat(cfg.amount) * Math.pow(10, cfg.fromDecimals)).toString();
      fetchSwapQuote(cfg.fromMint, cfg.toMint, amtRaw)
        .then(setQuote)
        .catch(() => setQuote(null))
        .finally(() => setQuoting(false));
    }, 600);
    return () => clearTimeout(t);
  }, [cfg.fromMint, cfg.toMint, cfg.amount]);

  const flipTokens = () => {
    setCfg(c => ({
      ...c,
      from: c.to, fromMint: c.toMint, fromDecimals: c.toDecimals,
      to: c.from, toMint: c.fromMint, toDecimals: c.fromDecimals,
      amount: "",
    }));
    setQuote(null);
  };

  const doSwap = async () => {
    if (!isConnected) { Alert.alert("Connect wallet first"); return; }
    if (!quote || !address) return;
    setSwapping(true);
    try {
      const txB64 = await buildSwapTransaction(quote, address);
      const sig   = await signAndSendTransaction(txB64);
      setTxSig(sig);
      onSuccess?.(sig);
    } catch (err: any) {
      Alert.alert("Swap failed", err?.message || "Unknown error");
    } finally {
      setSwapping(false);
    }
  };

  const outAmount = quote
    ? (parseInt(quote.outAmount) / Math.pow(10, cfg.toDecimals)).toFixed(4)
    : null;
  const priceImpact = quote?.priceImpactPct
    ? (parseFloat(quote.priceImpactPct) * 100).toFixed(3) + "%"
    : null;

  if (txSig) {
    return (
      <View style={styles.success}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successTitle}>Swap submitted!</Text>
        <Text style={styles.successSub} numberOfLines={1}>Tx: {txSig.slice(0, 20)}…</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeTxt}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Swap Tokens</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeX}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* From */}
      <Text style={styles.fieldLabel}>You pay</Text>
      <View style={styles.tokenRow}>
        <View style={styles.tokenBadge}>
          <Text style={styles.tokenSym}>{cfg.from}</Text>
        </View>
        <TextInput
          style={styles.amtInput}
          value={cfg.amount}
          onChangeText={v => setCfg(c => ({ ...c, amount: v }))}
          placeholder="0.00"
          placeholderTextColor={Colors.text3}
          keyboardType="decimal-pad"
        />
      </View>

      {/* Flip button */}
      <TouchableOpacity style={styles.flipBtn} onPress={flipTokens}>
        <Text style={styles.flipIcon}>⇅</Text>
      </TouchableOpacity>

      {/* To */}
      <Text style={styles.fieldLabel}>You receive</Text>
      <View style={styles.tokenRow}>
        <View style={styles.tokenBadge}>
          <Text style={styles.tokenSym}>{cfg.to}</Text>
        </View>
        <View style={styles.outField}>
          {quoting
            ? <ActivityIndicator size="small" color={Colors.accent} />
            : <Text style={styles.outAmt}>{outAmount ?? "—"}</Text>
          }
        </View>
      </View>

      {/* Quote details */}
      {quote && !quoting && (
        <View style={styles.quoteBox}>
          <Row label="Rate" value={`1 ${cfg.from} ≈ ${(parseFloat(quote.outAmount) / Math.pow(10, cfg.toDecimals) / parseFloat(cfg.amount || "1")).toFixed(4)} ${cfg.to}`} />
          {priceImpact && <Row label="Price impact" value={priceImpact} valueColor={parseFloat(priceImpact) > 1 ? Colors.red : Colors.green} />}
          <Row label="Route" value={`${quote.routePlan?.length ?? 1} hop(s)`} />
        </View>
      )}

      {/* Swap button */}
      <TouchableOpacity
        style={[styles.swapBtn, (!quote || swapping) && styles.swapBtnDim]}
        onPress={doSwap}
        disabled={!quote || swapping || !isConnected}
      >
        {swapping
          ? <ActivityIndicator color={Colors.bg} />
          : <Text style={styles.swapTxt}>
              {!isConnected ? "Connect Wallet" : !quote ? "Enter amount" : `Swap ${cfg.from} → ${cfg.to}`}
            </Text>
        }
      </TouchableOpacity>
    </View>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 2 }}>
      <Text style={{ color: Colors.text3, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: valueColor || Colors.text2, fontSize: 12, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
    marginVertical: 8,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md },
  title:  { color: Colors.text1, fontSize: 16, fontWeight: "700" },
  closeX: { color: Colors.text3, fontSize: 16, padding: 4 },

  fieldLabel: { color: Colors.text3, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 },
  tokenRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.surface2, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  tokenBadge: {
    backgroundColor: Colors.bg, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    minWidth: 58, alignItems: "center",
  },
  tokenSym: { color: Colors.text1, fontWeight: "700", fontSize: 13 },
  amtInput: { flex: 1, color: Colors.text1, fontSize: 16, fontWeight: "600" },
  outField: { flex: 1, justifyContent: "center" },
  outAmt:  { color: Colors.accent, fontSize: 16, fontWeight: "600" },

  flipBtn: { alignSelf: "center", marginVertical: 4, padding: 6 },
  flipIcon: { color: Colors.text2, fontSize: 22 },

  quoteBox: {
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, marginVertical: 8,
  },

  swapBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingVertical: 13, alignItems: "center", marginTop: 8,
  },
  swapBtnDim: { opacity: 0.45 },
  swapTxt: { color: Colors.bg, fontWeight: "700", fontSize: 14 },

  success: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.green,
    padding: Spacing.xl, alignItems: "center", marginVertical: 8,
  },
  successIcon:  { fontSize: 32, color: Colors.green, marginBottom: 8 },
  successTitle: { color: Colors.text1, fontSize: 16, fontWeight: "700" },
  successSub:   { color: Colors.text3, fontSize: 12, marginTop: 4 },
  closeBtn: {
    marginTop: 16, backgroundColor: Colors.accent,
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radius.full,
  },
  closeTxt: { color: Colors.bg, fontWeight: "700" },
});
