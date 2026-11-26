import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { ReceiptForm } from "../../components/ReceiptForm";
import { colors } from "../../components/theme";
import { Button } from "../../components/ui";
import { deleteReceipt, getReceipt, updateReceipt } from "../../lib/db";
import { deleteImage } from "../../lib/images";
import type { NewReceipt, Receipt } from "../../lib/types";

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [receipt, setReceipt] = useState<Receipt | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getReceipt(db, Number(id)).then(setReceipt);
  }, [db, id]);

  if (receipt === undefined) return null;
  if (receipt === null) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: colors.muted }}>This receipt no longer exists.</Text>
      </View>
    );
  }

  const save = async (r: NewReceipt) => {
    setSaving(true);
    await updateReceipt(db, receipt.id, r);
    setSaving(false);
    router.back();
  };

  const remove = () =>
    Alert.alert("Delete receipt?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteReceipt(db, receipt.id);
          deleteImage(receipt.imageUri);
          router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: receipt.merchant || "Receipt" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <ReceiptForm initial={receipt} submitLabel="Save changes" onSubmit={save} saving={saving} />
        <View style={{ height: 12 }} />
        <Button title="Delete receipt" variant="danger" onPress={remove} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
