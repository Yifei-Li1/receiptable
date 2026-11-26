import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { parseISODate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { Receipt } from "../lib/types";
import { categoryColors, colors } from "./theme";

export function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const d = parseISODate(receipt.date);
  return (
    <Pressable
      onPress={() => router.push(`/receipt/${receipt.id}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.dot, { backgroundColor: categoryColors[receipt.category] }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.merchant} numberOfLines={1}>
          {receipt.merchant || "Untitled"}
        </Text>
        <Text style={styles.meta}>
          {d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {receipt.category}
        </Text>
      </View>
      <Text style={styles.amount}>{formatMoney(receipt.totalCents, receipt.currency)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  merchant: { fontSize: 16, fontWeight: "500", color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: "600", color: colors.text, marginLeft: 8, fontVariant: ["tabular-nums"] },
});
