import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, TextInput, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius } from "../constants/theme";
import { MULTIPLY_VAULTS } from "../constants/tokens";
import { useWallet } from "../context/WalletContext";
import {
  fetchEarnVaults, formatUsd, jupFetch,
  JUP_EARN_API, b64ToBytes, bytesToB64,
} from "../api/jupiter";
import { VersionedTransaction } from "@solana/web3.js";

type Tab = "earn" | "multiply" | "borrow";

export default function EarnScreen() {
  const { address, isConnected, connect, signAndSendTransaction } = useWallet();
  const [tab, setTab]           = useState<Tab>("earn");
  const [vaults, setVaults]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Earn deposit state
  const [depositVault, setDepositVault]   = useState<any | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing]       = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await fetchEarnVaults();
      setVaults(data);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const doDeposit = async () => {
    if (!isConnected || !address) { Alert.alert("Connect your wallet first"); return; }
    if (!depositVault || !depositAmount || parseFloat(depositAmount) <= 0) return;
    setDepositing(true);
    try {
      const amtRaw = Math.floor(parseFloat(depositAmount) * Math.pow(10, depositVault.decimals)).toString();
      const res = await jupFetch(`${JUP_EARN_API}/deposit`, {
        method: "POST",
        body: { asset: depositVault.assetMint, amount: amtRaw, signer: address },
      });
      if (res.error) throw new Error(typeof res.error === "object" ? JSON.stringify(res.error) : res.error);
      if (!res.transaction) throw new Error("No transaction returned.");

      const sig = await signAndSendTransaction(res.transaction);
      Alert.alert("Deposit submitted ✓", `${depositAmount} ${depositVault.token} deposited.\n\nTx: ${sig.slice(0, 20)}…`);
      setDepositVault(null);
      setDepositAmount("");
    } catch (err: any) {
      Alert.alert("Deposit failed", err?.message || "Unknown error");
    } finally { setDepositing(false); }
  };

  const riskColor = (r: string) =>
    r === "Low" ? Colors.green : r === "Medium" ? Colors.orange : Colors.red;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Earn</Text>
        <Text style={styles.sub}>Powered by Jupiter Lend</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["earn", "multiply", "borrow"] as Tab[]).map(t => (
          <TouchableOpacity
            key={t} style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
              {t === "earn" ? "💰 Earn" : t === "multiply" ? "⚡ Multiply" : "🏦 Borrow"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={Colors.accent} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.accent} />}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
        >
          {/* ── Earn tab ─────────────────────────────────────────── */}
          {tab === "earn" && (
            <>
              <Text style={styles.sectionLabel}>Available Vaults</Text>
              {vaults.length === 0 && (
                <Text style={styles.empty}>No vaults available right now.</Text>
              )}
              {vaults.map((v, i) => (
                <View key={i} style={styles.vaultCard}>
                  <View style={styles.vaultHeader}>
                    <View>
                      <Text style={styles.vaultToken}>{v.token}</Text>
                      <Text style={styles.vaultName}>{v.name}</Text>
                    </View>
                    <View style={styles.apyBadge}>
                      <Text style={styles.apyTxt}>{v.apy}</Text>
                      <Text style={styles.apyLabel}>APY</Text>
                    </View>
                  </View>
                  <View style={styles.vaultStats}>
                    <Stat label="TVL"         value={formatUsd(v.tvl)} />
                    <Stat label="Utilization" value={`${v.utilization?.toFixed(1) ?? "—"}%`} />
                  </View>

                  {/* Deposit form */}
                  {depositVault?.assetMint === v.assetMint ? (
                    <View style={styles.depositForm}>
                      <TextInput
                        style={styles.amtInput}
                        value={depositAmount}
                        onChangeText={setDepositAmount}
                        placeholder={`Amount (${v.token})`}
                        placeholderTextColor={Colors.text3}
                        keyboardType="decimal-pad"
                      />
                      <View style={styles.depositBtns}>
                        <TouchableOpacity
                          style={[styles.depositBtn, depositing && { opacity: 0.5 }]}
                          onPress={doDeposit} disabled={depositing}
                        >
                          {depositing
                            ? <ActivityIndicator size="small" color={Colors.bg} />
                            : <Text style={styles.depositBtnTxt}>Deposit</Text>
                          }
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setDepositVault(null)}>
                          <Text style={styles.cancelTxt}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.earnBtn}
                      onPress={() => {
                        if (!isConnected) { connect(); return; }
                        setDepositVault(v);
                        setDepositAmount("");
                      }}
                    >
                      <Text style={styles.earnBtnTxt}>Earn {v.apy}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </>
          )}

          {/* ── Multiply tab ──────────────────────────────────────── */}
          {tab === "multiply" && (
            <>
              <Text style={styles.sectionLabel}>Leveraged Looping Vaults</Text>
              <Text style={styles.sectionDesc}>
                Multiply amplifies yields by looping your collateral. Higher leverage = higher risk.
              </Text>
              {MULTIPLY_VAULTS.map((v) => (
                <View key={v.id} style={styles.multiplyCard}>
                  <View style={styles.multiplyHeader}>
                    <View>
                      <Text style={styles.vaultToken}>{v.collateral} / {v.debt}</Text>
                      <Text style={styles.vaultName}>{v.desc}</Text>
                    </View>
                    <View style={[styles.riskBadge, { backgroundColor: riskColor(v.risk) + "22" }]}>
                      <Text style={[styles.riskTxt, { color: riskColor(v.risk) }]}>{v.risk}</Text>
                    </View>
                  </View>
                  <View style={styles.vaultStats}>
                    <Stat label="Max Leverage" value={v.maxLev} />
                    <Stat label="Max LTV"      value={v.ltv} />
                  </View>
                  <TouchableOpacity
                    style={styles.earnBtn}
                    onPress={() => Linking.openURL(`https://jup.ag/lend/multiply/${v.id}`)}
                  >
                    <Text style={styles.earnBtnTxt}>Open on Jupiter ↗</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* ── Borrow tab ────────────────────────────────────────── */}
          {tab === "borrow" && (
            <View style={styles.borrowInfo}>
              <Text style={styles.borrowIcon}>🏦</Text>
              <Text style={styles.borrowTitle}>Borrow via Jupiter Lend</Text>
              <Text style={styles.borrowDesc}>
                Use your crypto as collateral to borrow stablecoins or other tokens.
                Managed through Jupiter's SDK — open the full experience on Jupiter.
              </Text>
              <TouchableOpacity
                style={[styles.earnBtn, { marginTop: 20 }]}
                onPress={() => Linking.openURL("https://jup.ag/lend/borrow")}
              >
                <Text style={styles.earnBtnTxt}>Open Jupiter Borrow ↗</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: Colors.text3, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: Colors.text1, fontWeight: "700", fontSize: 13, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderColor: Colors.border + "44",
  },
  title: { color: Colors.text1, fontSize: 20, fontWeight: "800" },
  sub:   { color: Colors.text3, fontSize: 12, marginTop: 2 },

  tabs: {
    flexDirection: "row", margin: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  tab:         { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive:   { backgroundColor: Colors.accent + "22" },
  tabTxt:      { color: Colors.text3, fontSize: 12, fontWeight: "600" },
  tabTxtActive:{ color: Colors.accent },

  sectionLabel: { color: Colors.text3, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 },
  sectionDesc:  { color: Colors.text2, fontSize: 13, lineHeight: 20, marginBottom: 16 },
  empty: { color: Colors.text3, textAlign: "center", marginTop: 40 },

  vaultCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
  vaultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  vaultToken:  { color: Colors.text1, fontWeight: "800", fontSize: 16 },
  vaultName:   { color: Colors.text3, fontSize: 12, marginTop: 3 },
  apyBadge:    { alignItems: "center" },
  apyTxt:      { color: Colors.accent, fontSize: 22, fontWeight: "800" },
  apyLabel:    { color: Colors.text3, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },

  vaultStats: {
    flexDirection: "row", justifyContent: "space-around",
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    paddingVertical: 10, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },

  earnBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingVertical: 10, alignItems: "center",
  },
  earnBtnTxt: { color: Colors.bg, fontWeight: "700", fontSize: 13 },

  depositForm: { gap: 8 },
  amtInput: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.sm, padding: 10, color: Colors.text1, fontSize: 14,
  },
  depositBtns: { flexDirection: "row", gap: 8 },
  depositBtn: {
    flex: 2, backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingVertical: 10, alignItems: "center",
  },
  depositBtnTxt: { color: Colors.bg, fontWeight: "700" },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.full, paddingVertical: 10, alignItems: "center",
  },
  cancelTxt: { color: Colors.text2 },

  multiplyCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
  multiplyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  riskBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  riskTxt:   { fontSize: 11, fontWeight: "700" },

  borrowInfo: { alignItems: "center", paddingTop: 40 },
  borrowIcon:  { fontSize: 48, marginBottom: 16 },
  borrowTitle: { color: Colors.text1, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  borrowDesc:  { color: Colors.text2, fontSize: 14, lineHeight: 22, textAlign: "center" },
});
