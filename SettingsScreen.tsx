import React from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Linking, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Colors, Spacing, Radius } from "../constants/theme";
import { useWallet } from "../context/WalletContext";

export default function SettingsScreen() {
  const { address, walletName, isConnected, connect, disconnect } = useWallet();

  const copyAddress = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert("Copied!", "Wallet address copied to clipboard.");
  };

  const confirmDisconnect = () => {
    Alert.alert(
      "Disconnect Wallet",
      "Are you sure you want to disconnect your wallet?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", onPress: disconnect },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}>
        <Text style={styles.title}>Settings</Text>

        {/* Wallet Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Wallet</Text>
          {isConnected ? (
            <>
              <View style={styles.walletInfo}>
                <View style={styles.walletDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletName}>{walletName || "Connected"}</Text>
                  <Text style={styles.walletAddr} numberOfLines={1}>
                    {address?.slice(0, 8)}…{address?.slice(-8)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.rowBtn} onPress={copyAddress}>
                <Text style={styles.rowBtnIcon}>📋</Text>
                <Text style={styles.rowBtnTxt}>Copy Address</Text>
                <Text style={styles.rowBtnArrow}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rowBtn}
                onPress={() => Linking.openURL(`https://solscan.io/account/${address}`)}
              >
                <Text style={styles.rowBtnIcon}>🔍</Text>
                <Text style={styles.rowBtnTxt}>View on Solscan</Text>
                <Text style={styles.rowBtnArrow}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.rowBtn, styles.dangerBtn]} onPress={confirmDisconnect}>
                <Text style={styles.rowBtnIcon}>🔌</Text>
                <Text style={[styles.rowBtnTxt, { color: Colors.red }]}>Disconnect Wallet</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.connectBtn} onPress={connect}>
              <Text style={styles.connectTxt}>⚡ Connect Wallet</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Resources */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Resources</Text>
          {[
            { icon: "🌐", label: "ChatFi Website",        url: "https://chatfi.pro" },
            { icon: "📊", label: "Jupiter Exchange",       url: "https://jup.ag" },
            { icon: "🐦", label: "Twitter / X",           url: "https://x.com/chatfipro" },
            { icon: "💬", label: "Telegram Community",    url: "https://t.me/chatfipro" },
          ].map(item => (
            <TouchableOpacity
              key={item.label}
              style={styles.rowBtn}
              onPress={() => Linking.openURL(item.url)}
            >
              <Text style={styles.rowBtnIcon}>{item.icon}</Text>
              <Text style={styles.rowBtnTxt}>{item.label}</Text>
              <Text style={styles.rowBtnArrow}>↗</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Share */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Share</Text>
          <TouchableOpacity
            style={styles.rowBtn}
            onPress={() => Share.share({
              message: "Trade smarter on Solana with ChatFi — AI-powered swaps, limits, DCA, and earn. https://chatfi.pro",
              url: "https://chatfi.pro",
            })}
          >
            <Text style={styles.rowBtnIcon}>📤</Text>
            <Text style={styles.rowBtnTxt}>Share ChatFi</Text>
            <Text style={styles.rowBtnArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Legal */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Legal</Text>
          {[
            { label: "Terms of Service",  url: "https://chatfi.pro/terms" },
            { label: "Privacy Policy",    url: "https://chatfi.pro/privacy" },
          ].map(item => (
            <TouchableOpacity
              key={item.label}
              style={styles.rowBtn}
              onPress={() => Linking.openURL(item.url)}
            >
              <Text style={styles.rowBtnIcon}>📄</Text>
              <Text style={styles.rowBtnTxt}>{item.label}</Text>
              <Text style={styles.rowBtnArrow}>↗</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* App info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>ChatFi v1.0.0</Text>
          <Text style={styles.appInfoSub}>
            Not financial advice. DeFi carries risk.{"\n"}
            Powered by Jupiter Protocol ⚡
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.bg },
  title: { color: Colors.text1, fontSize: 22, fontWeight: "800", marginBottom: Spacing.lg },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    color: Colors.text3, fontSize: 11,
    textTransform: "uppercase", letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },

  walletInfo: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  walletDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.green,
  },
  walletName: { color: Colors.text1, fontWeight: "700", fontSize: 15 },
  walletAddr: { color: Colors.text3, fontSize: 12, marginTop: 2 },

  rowBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1, borderColor: Colors.border + "44",
  },
  dangerBtn: { borderBottomWidth: 0 },
  rowBtnIcon: { fontSize: 18, width: 24, textAlign: "center" },
  rowBtnTxt:  { flex: 1, color: Colors.text1, fontSize: 14 },
  rowBtnArrow:{ color: Colors.text3, fontSize: 16 },

  connectBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingVertical: 13, alignItems: "center",
  },
  connectTxt: { color: Colors.bg, fontWeight: "700", fontSize: 14 },

  appInfo: { alignItems: "center", marginTop: Spacing.xl, paddingBottom: Spacing.xl },
  appInfoText: { color: Colors.text3, fontSize: 13, fontWeight: "600" },
  appInfoSub:  { color: Colors.text3, fontSize: 11, textAlign: "center", marginTop: 6, lineHeight: 18 },
});
