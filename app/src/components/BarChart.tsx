import { StyleSheet, Text, View } from "react-native";
import type { DayBucket } from "../lib/reports";
import { colors } from "./theme";

/** Simple per-day bar chart built from Views (no native chart dependency). */
export function BarChart({ data, height = 140 }: { data: DayBucket[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.cents));
  const dense = data.length > 10;
  return (
    <View>
      <View style={[styles.bars, { height }]}>
        {data.map((d) => (
          <View key={d.date} style={styles.col}>
            <View
              style={[
                styles.bar,
                { height: d.cents ? Math.max(2, (d.cents / max) * height) : 0, marginHorizontal: dense ? 1 : 6 },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text key={d.date} style={styles.label} numberOfLines={1}>
            {!dense || i === 0 || (i + 1) % 5 === 0 ? d.label : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: "row", alignItems: "flex-end", borderBottomWidth: 1, borderColor: colors.border },
  col: { flex: 1, justifyContent: "flex-end" },
  bar: { backgroundColor: colors.primary, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  labels: { flexDirection: "row", marginTop: 4 },
  label: { flex: 1, textAlign: "center", fontSize: 10, color: colors.muted },
});
