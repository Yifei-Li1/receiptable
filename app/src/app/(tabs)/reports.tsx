import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BarChart } from "../../components/BarChart";
import { ReceiptRow } from "../../components/ReceiptRow";
import { categoryColors, colors } from "../../components/theme";
import { Card, SectionTitle, Segmented } from "../../components/ui";
import { listReceipts } from "../../lib/db";
import { formatMoney } from "../../lib/money";
import { buildReport, periodContaining, shiftPeriod, type Period, type PeriodKind, type Report } from "../../lib/reports";
import { loadSettings } from "../../lib/settings";
import type { Receipt } from "../../lib/types";

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const [kind, setKind] = useState<PeriodKind>("month");
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const load = useCallback(async () => {
    const settings = await loadSettings(db);
    let period: Period = periodContaining(kind, new Date(), settings.weekStartsOn);
    period = shiftPeriod(period, offset, settings.weekStartsOn);
    const prev = shiftPeriod(period, -1, settings.weekStartsOn);
    const [current, previous] = await Promise.all([
      listReceipts(db, { start: period.start, end: period.end }),
      listReceipts(db, { start: prev.start, end: prev.end }),
    ]);
    setReceipts(current);
    setReport(buildReport(current, period, settings.currency, { receipts: previous }));
  }, [db, kind, offset]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const changeKind = (k: PeriodKind) => {
    setKind(k);
    setOffset(0);
  };

  if (!report) return null;
  const delta = report.previousTotalCents ? (report.totalCents - report.previousTotalCents) / report.previousTotalCents : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Segmented
        value={kind}
        onChange={changeKind}
        options={[
          { value: "week", label: "Weekly" },
          { value: "month", label: "Monthly" },
        ]}
      />

      <View style={styles.nav}>
        <Pressable hitSlop={12} onPress={() => setOffset((o) => o - 1)}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.period}>{report.period.label}</Text>
        <Pressable hitSlop={12} disabled={offset >= 0} onPress={() => setOffset((o) => o + 1)}>
          <Text style={[styles.arrow, offset >= 0 && { opacity: 0.25 }]}>›</Text>
        </Pressable>
      </View>

      <Card>
        <Text style={styles.muted}>Total spent</Text>
        <Text style={styles.total}>{formatMoney(report.totalCents, report.currency)}</Text>
        <Text style={styles.muted}>
          {report.receiptCount} receipt{report.receiptCount === 1 ? "" : "s"} · {formatMoney(report.averagePerDayCents, report.currency)}/day
        </Text>
        {delta !== null && (
          <Text style={[styles.delta, { color: delta > 0 ? colors.up : colors.down }]}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(0)}% vs previous {kind}
          </Text>
        )}
        {report.otherCurrencies.length > 0 && (
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Also: {report.otherCurrencies.map((o) => formatMoney(o.cents, o.currency)).join(", ")} (not included above)
          </Text>
        )}
      </Card>

      <Card style={styles.gap}>
        <SectionTitle>By day</SectionTitle>
        <BarChart data={report.byDay} />
      </Card>

      <Card style={styles.gap}>
        <SectionTitle>By category</SectionTitle>
        {report.byCategory.length === 0 && <Text style={styles.muted}>No spending in this period.</Text>}
        {report.byCategory.map((c) => (
          <View key={c.category} style={{ marginBottom: 10 }}>
            <View style={styles.catRow}>
              <Text style={styles.catName}>{c.category}</Text>
              <Text style={styles.catAmount}>
                {formatMoney(c.cents, report.currency)} · {(c.share * 100).toFixed(0)}%
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${c.share * 100}%`, backgroundColor: categoryColors[c.category] }]} />
            </View>
          </View>
        ))}
      </Card>

      {report.topMerchants.length > 0 && (
        <Card style={styles.gap}>
          <SectionTitle>Top merchants</SectionTitle>
          {report.topMerchants.map((m) => (
            <View key={m.merchant} style={styles.catRow}>
              <Text style={styles.catName} numberOfLines={1}>
                {m.merchant} <Text style={styles.muted}>×{m.count}</Text>
              </Text>
              <Text style={styles.catAmount}>{formatMoney(m.cents, report.currency)}</Text>
            </View>
          ))}
        </Card>
      )}

      {receipts.length > 0 && (
        <Card style={styles.gap}>
          <SectionTitle>Receipts</SectionTitle>
          {receipts.map((r) => (
            <ReceiptRow key={r.id} receipt={r} />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 16 },
  arrow: { fontSize: 32, color: colors.primary, paddingHorizontal: 8 },
  period: { fontSize: 18, fontWeight: "600", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  total: { fontSize: 34, fontWeight: "700", color: colors.text, marginVertical: 4, fontVariant: ["tabular-nums"] },
  delta: { fontSize: 14, fontWeight: "600", marginTop: 6 },
  gap: { marginTop: 12 },
  catRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  catName: { fontSize: 15, color: colors.text, flex: 1, marginRight: 8 },
  catAmount: { fontSize: 15, color: colors.text, fontVariant: ["tabular-nums"] },
  track: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});
