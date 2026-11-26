import { File, Paths } from "expo-file-system";
import { useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../components/theme";
import { Button, Card, Field, SectionTitle, Segmented } from "../../components/ui";
import { listReceipts } from "../../lib/db";
import { receiptsToCsv } from "../../lib/reports";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "../../lib/settings";

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);

  useFocusEffect(
    useCallback(() => {
      loadSettings(db).then(setS);
    }, [db]),
  );

  const save = async () => {
    if (!/^[A-Za-z]{3}$/.test(s.currency.trim())) return Alert.alert("Currency must be a 3-letter code, e.g. USD.");
    await saveSettings(db, s);
    setS(await loadSettings(db));
    Alert.alert("Saved");
  };

  const exportCsv = async () => {
    const all = await listReceipts(db);
    if (all.length === 0) return Alert.alert("Nothing to export yet.");
    const file = new File(Paths.cache, `receipts-${new Date().toISOString().slice(0, 10)}.csv`);
    if (file.exists) file.delete();
    file.create();
    await file.write(receiptsToCsv(all));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "Export receipts" });
    } else {
      Alert.alert("Sharing is not available on this device.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card>
        <SectionTitle>Reports</SectionTitle>
        <Field
          label="Main currency"
          value={s.currency}
          onChangeText={(currency) => setS({ ...s, currency })}
          autoCapitalize="characters"
          maxLength={3}
        />
        <Text style={styles.label}>Week starts on</Text>
        <Segmented
          value={String(s.weekStartsOn) as "0" | "1"}
          onChange={(v) => setS({ ...s, weekStartsOn: v === "0" ? 0 : 1 })}
          options={[
            { value: "1", label: "Monday" },
            { value: "0", label: "Sunday" },
          ]}
        />
      </Card>

      <View style={styles.gap}>
        <Button title="Save settings" onPress={save} />
      </View>

      <Card style={styles.gap}>
        <SectionTitle>Data</SectionTitle>
        <Text style={styles.label}>Receipts are read and stored only on this device.</Text>
        <Button title="Export all receipts (CSV)" variant="secondary" onPress={exportCsv} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  gap: { marginTop: 12 },
  label: { fontSize: 13, color: colors.muted, marginBottom: 8 },
});
