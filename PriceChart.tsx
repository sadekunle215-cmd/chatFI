import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Svg, { Polyline, Polygon, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Colors, Spacing, Fonts } from "../constants/theme";
import { fetchPriceHistory } from "../api/jupiter";

type Range = "1H" | "4H" | "1D" | "7D" | "30D";
const RANGES: Range[] = ["1H", "4H", "1D", "7D", "30D"];

interface Props {
  mint: string;
  symbol?: string;
}

export default function PriceChart({ mint, symbol }: Props) {
  const [range, setRange]   = useState<Range>("1D");
  const [data, setData]     = useState<{ t: number; p: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchPriceHistory(mint, range)
      .then(setData)
      .finally(() => setLoading(false));
  }, [mint, range]);

  const W = 300, H = 72, PAD = 3;
  const prices = data.map(d => d.p);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const px = (i: number) => (i / Math.max(prices.length - 1, 1)) * W;
  const py = (p: number) => H - PAD - ((p - min) / ((max - min) || min * 0.001 || 1)) * (H - PAD * 2);

  const isUp = prices.length > 1 ? prices[prices.length - 1] >= prices[0] : true;
  const color = isUp ? Colors.green : Colors.red;
  const pct = prices.length > 1 && prices[0] > 0
    ? ((prices[prices.length - 1] - prices[0]) / prices[0] * 100)
    : 0;
  const gradId = `grad_${mint.slice(0, 6)}`;

  const linePts = prices.map((p, i) => `${px(i).toFixed(1)},${py(p).toFixed(1)}`).join(" ");
  const areaPts = prices.length > 0
    ? `0,${H} ${linePts} ${W},${H}`
    : "";

  const fmtT = (ts: number) => {
    const d = new Date(ts);
    return range === "30D" || range === "7D"
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.label}>Price Chart</Text>
          {prices.length > 0 && (
            <View style={[styles.badge, { backgroundColor: color + "22" }]}>
              <Text style={[styles.badgeText, { color }]}>
                {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
              </Text>
            </View>
          )}
        </View>
        <View style={styles.rangeRow}>
          {RANGES.map(r => (
            <TouchableOpacity
              key={r}
              onPress={() => setRange(r)}
              style={[styles.rangeBtn, range === r && { borderColor: color, backgroundColor: color + "22" }]}
            >
              <Text style={[styles.rangeTxt, range === r && { color }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Chart */}
      {loading ? (
        <View style={styles.skeleton}>
          <ActivityIndicator size="small" color={Colors.text3} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.skeleton}>
          <Text style={styles.noData}>No chart data</Text>
        </View>
      ) : (
        <>
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "flex" }}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <Stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>
            {areaPts ? <Polygon points={areaPts} fill={`url(#${gradId})`} /> : null}
            <Polyline points={linePts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {prices.length > 0 && (
              <Circle
                cx={px(prices.length - 1)}
                cy={py(prices[prices.length - 1])}
                r="3.5"
                fill={color}
                stroke={Colors.bg}
                strokeWidth="1.5"
              />
            )}
          </Svg>
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>{fmtT(data[0].t)}</Text>
            <Text style={styles.timeLabel}>{fmtT(data[data.length - 1].t)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.bg,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
  },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 8,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 10, color: Colors.text3, letterSpacing: 0.8, textTransform: "uppercase" },
  badge: {
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  rangeRow: { flexDirection: "row", gap: 4 },
  rangeBtn: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1, borderColor: Colors.border,
  },
  rangeTxt: { fontSize: 10, fontWeight: "600", color: Colors.text3 },
  skeleton: {
    height: 72, borderRadius: 8, backgroundColor: Colors.surface2,
    justifyContent: "center", alignItems: "center",
  },
  noData: { fontSize: 11, color: Colors.text3 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  timeLabel: { fontSize: 10, color: Colors.text3 },
});
