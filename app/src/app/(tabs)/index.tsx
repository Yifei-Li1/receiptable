import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { ReceiptRow } from "../../components/ReceiptRow";
import { colors } from "../../components/theme";
import { Button, Card, SectionTitle } from "../../components/ui";
import { listReceipts } from "../../lib/db";
import { formatMoney } from "../../lib/money";
import { periodContaining } from "../../lib/reports";
import { loadSettings } from "../../lib/settings";
import type { Receipt } from "../../lib/types";

export default function HomeScreen() {
  const db = useSQLiteContext();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [summary, setSummary] = useState({ week: 0, month: 0, currency: "USD" });

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const settings = await loadSettings(db);
        const now = new Date();
        const week = periodContaining("week", now, settings.weekStartsOn);
        const month = periodContaining("month", now);
        const start = week.start < month.start ? week.start : month.start;
        const recent = await listReceipts(db, { start });
        const sum = (from: string, to: string) =>
          recent
            .filter((r) => r.currency === settings.currency && r.date >= from && r.date < to)
            .reduce((s, r) => s + r.totalCents, 0);
        setSummary({ week: sum(week.start, week.end), month: sum(month.start, month.end), currency: settings.currency });
        setReceipts(await listReceipts(db, { limit: 50 }));
      })();
    }, [db]),
  );

  return (
    <FlatList
      data={receipts}
      keyExtractor={(r) => String(r.id)}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View>
          <View style={styles.summary}>
            <Card style={styles.stat}>
              <Text style={styles.statLabel}>This week</Text>
              <Text style={styles.statValue}>{formatMoney(summary.week, summary.currency)}</Text>
            </Card>
            <Card style={styles.stat}>
              <Text style={styles.statLabel}>This month</Text>
              <Text style={styles.statValue}>{formatMoney(summary.month, summary.currency)}</Text>
            </Card>
          </View>
          <Button title="Scan a receipt" onPress={() => router.push("/scan")} />
          <View style={{ height: 24 }} />
          <SectionTitle>Recent receipts</SectionTitle>
        </View>
      }
      renderItem={({ item }) => <ReceiptRow receipt={item} />}
      ListEmptyComponent={
        <Text style={styles.empty}>No receipts yet. Tap “Scan a receipt” to add your first one.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  summary: { flexDirection: "row", gap: 12, marginBottom: 16 },
  stat: { flex: 1 },
  statLabel: { fontSize: 13, color: colors.muted },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: 4, fontVariant: ["tabular-nums"] },
  empty: { color: colors.muted, textAlign: "center", marginTop: 24 },
});
