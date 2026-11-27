import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { ReceiptForm } from "../components/ReceiptForm";
import { colors } from "../components/theme";
import { Button } from "../components/ui";
import { toISODate } from "../lib/dates";
import { insertReceipt } from "../lib/db";
import { persistImage, prepareImage } from "../lib/images";
import { scanReceipt, type ScanResult } from "../lib/scan";
import { OcrDebug } from "../components/OcrDebug";
import { loadSettings } from "../lib/settings";
import type { NewReceipt } from "../lib/types";

type Stage = { kind: "pick" } | { kind: "analyzing"; uri: string } | { kind: "review"; draft: NewReceipt; error?: string; warning?: string; debug?: ScanResult["debug"] };

export default function ScanScreen() {
  const db = useSQLiteContext();
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [saving, setSaving] = useState(false);

  const blank = async (imageUri: string | null): Promise<NewReceipt> => {
    const s = await loadSettings(db);
    return {
      merchant: "",
      date: toISODate(new Date()),
      currency: s.currency,
      totalCents: 0,
      taxCents: null,
      tipCents: null,
      category: "Other",
      items: [],
      imageUri,
      note: "",
    };
  };

  const pick = async (source: "camera" | "library") => {
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert("Camera access needed", "Allow camera access in system settings to scan receipts.");
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
    const result =
      source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    setStage({ kind: "analyzing", uri: asset.uri });
    let imageUri: string;
    try {
      imageUri = await prepareImage(asset.uri, asset.width, asset.height);
    } catch {
      setStage({ kind: "review", draft: await blank(asset.uri), error: "Couldn't process that image." });
      return;
    }
    try {
      const { draft, missing, noText, debug } = await scanReceipt(imageUri, await loadSettings(db));
      if (noText) {
        setStage({
          kind: "review",
          draft,
          debug,
          error: "No text found. Try a sharper, well-lit photo, or fill it in manually.",
        });
      } else {
        setStage({
          kind: "review",
          draft,
          debug,
          warning: missing.length ? `Couldn't read: ${missing.join(", ")}. Please check or fill these in.` : undefined,
        });
      }
    } catch {
      setStage({
        kind: "review",
        draft: await blank(imageUri),
        error: "Text recognition isn't available on this device. You can fill it in manually.",
      });
    }
  };

  const save = async (r: NewReceipt) => {
    setSaving(true);
    try {
      const imageUri = r.imageUri ? await persistImage(r.imageUri) : null;
      await insertReceipt(db, { ...r, imageUri });
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", String(e));
    } finally {
      setSaving(false);
    }
  };

  if (stage.kind === "pick") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Add a receipt</Text>
        <Text style={styles.hint}>Take a clear, flat photo with the total visible. It’s read on your phone — nothing is uploaded.</Text>
        <View style={styles.actions}>
          <Button title="Take photo" onPress={() => pick("camera")} />
          <Button title="Choose from library" variant="secondary" onPress={() => pick("library")} />
          <Button title="Enter manually" variant="secondary" onPress={async () => setStage({ kind: "review", draft: await blank(null) })} />
        </View>
      </View>
    );
  }

  if (stage.kind === "analyzing") {
    return (
      <View style={styles.center}>
        <Image source={{ uri: stage.uri }} style={styles.preview} resizeMode="contain" />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
        <Text style={styles.hint}>Reading receipt…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {stage.error ? (
          <Text style={styles.error}>{stage.error}</Text>
        ) : stage.warning ? (
          <Text style={styles.warn}>{stage.warning}</Text>
        ) : (
          <Text style={styles.ok}>Check the details below, then save.</Text>
        )}
        {stage.debug ? <OcrDebug debug={stage.debug} /> : null}
        <ReceiptForm initial={stage.draft} submitLabel="Save receipt" onSubmit={save} saving={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 24, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  hint: { fontSize: 15, color: colors.muted, textAlign: "center", marginTop: 8 },
  actions: { alignSelf: "stretch", gap: 12, marginTop: 32 },
  preview: { width: "100%", height: 320, borderRadius: 12 },
  error: { color: colors.danger, backgroundColor: "#FEE2E2", padding: 12, borderRadius: 10, marginBottom: 16 },
  warn: { color: "#92400E", backgroundColor: "#FEF3C7", padding: 12, borderRadius: 10, marginBottom: 16 },
  ok: { color: colors.primary, backgroundColor: colors.primarySoft, padding: 12, borderRadius: 10, marginBottom: 16 },
});
