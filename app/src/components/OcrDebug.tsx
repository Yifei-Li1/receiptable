import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { ScanResult } from "../lib/scan";
import { colors } from "./theme";

/** Collapsible view of what the OCR returned, to diagnose receipts that parse badly. */
export function OcrDebug({ debug }: { debug: ScanResult["debug"] }) {
  const [open, setOpen] = useState(false);
  const { ocr, rows } = debug;
  const report = [
    `BLOCKS (${ocr.blocks.length}) — text @ x,y w×h`,
    ...ocr.blocks.map((b, i) => {
      const { x, y, width, height } = b.boundingBox;
      return `#${i} @ ${Math.round(x)},${Math.round(y)} ${Math.round(width)}×${Math.round(height)}\n${b.text}`;
    }),
    "",
    `ROWS AS PARSED (${rows.length}) — y: text`,
    ...rows.map((r) => `${r.y}: ${r.text}`),
  ].join("\n");

  return (
    <View style={styles.box}>
      <Pressable onPress={() => setOpen(!open)} style={styles.header}>
        <Text style={styles.title}>
          {open ? "▾" : "▸"} OCR output ({ocr.blocks.length} blocks, {rows.length} rows)
        </Text>
        {open && (
          <Pressable onPress={() => Share.share({ message: report })} hitSlop={8}>
            <Text style={styles.share}>Share</Text>
          </Pressable>
        )}
      </Pressable>
      {open && (
        <Text selectable style={styles.mono}>
          {report}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 16, backgroundColor: colors.card },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 14, fontWeight: "600", color: colors.muted },
  share: { fontSize: 14, fontWeight: "600", color: colors.primary },
  mono: { fontFamily: "monospace", fontSize: 11, color: colors.text, marginTop: 8 },
});
