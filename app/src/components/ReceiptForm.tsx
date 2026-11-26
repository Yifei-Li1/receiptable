import { useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { isValidISODate } from "../lib/dates";
import { formatMoney, parseAmountToCents } from "../lib/money";
import { CATEGORIES, type Category, type NewReceipt } from "../lib/types";
import { Button, Chip, Field, SectionTitle } from "./ui";
import { categoryColors, colors } from "./theme";

const centsToInput = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));

export function ReceiptForm({
  initial,
  submitLabel,
  onSubmit,
  saving,
}: {
  initial: NewReceipt;
  submitLabel: string;
  onSubmit: (r: NewReceipt) => void;
  saving?: boolean;
}) {
  const [merchant, setMerchant] = useState(initial.merchant);
  const [date, setDate] = useState(initial.date);
  const [currency, setCurrency] = useState(initial.currency);
  const [total, setTotal] = useState(centsToInput(initial.totalCents));
  const [tax, setTax] = useState(centsToInput(initial.taxCents));
  const [tip, setTip] = useState(centsToInput(initial.tipCents));
  const [category, setCategory] = useState<Category>(initial.category);
  const [note, setNote] = useState(initial.note);

  const submit = () => {
    const totalCents = parseAmountToCents(total);
    if (totalCents == null || totalCents < 0) return Alert.alert("Check the total", "Enter the amount you paid.");
    if (!isValidISODate(date)) return Alert.alert("Check the date", "Use the format YYYY-MM-DD.");
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) return Alert.alert("Check the currency", "Use a 3-letter code like USD.");
    onSubmit({
      ...initial,
      merchant: merchant.trim(),
      date,
      currency: currency.trim().toUpperCase(),
      totalCents,
      taxCents: tax.trim() ? parseAmountToCents(tax) : null,
      tipCents: tip.trim() ? parseAmountToCents(tip) : null,
      category,
      note: note.trim(),
    });
  };

  return (
    <View>
      {initial.imageUri ? <Image source={{ uri: initial.imageUri }} style={styles.image} resizeMode="contain" /> : null}
      <Field label="Merchant" value={merchant} onChangeText={setMerchant} placeholder="Store name" />
      <View style={styles.row}>
        <View style={{ flex: 2, marginRight: 8 }}>
          <Field label="Total" value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder="0.00" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} />
        </View>
      </View>
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-01-31" />
      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Field label="Tax" value={tax} onChangeText={setTax} keyboardType="decimal-pad" placeholder="optional" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Tip" value={tip} onChangeText={setTip} keyboardType="decimal-pad" placeholder="optional" />
        </View>
      </View>
      <Text style={styles.label}>Category</Text>
      <View style={styles.chips}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={c === category} color={categoryColors[c]} onPress={() => setCategory(c)} />
        ))}
      </View>
      <Field label="Note" value={note} onChangeText={setNote} placeholder="optional" multiline />

      {initial.items.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <SectionTitle>Items</SectionTitle>
          {initial.items.map((it, i) => (
            <View key={i} style={styles.item}>
              <Text style={styles.itemName} numberOfLines={2}>
                {it.quantity > 1 ? `${it.quantity} × ` : ""}
                {it.name}
              </Text>
              <Text style={styles.itemPrice}>{formatMoney(it.priceCents, currency || initial.currency)}</Text>
            </View>
          ))}
        </View>
      )}

      <Button title={submitLabel} onPress={submit} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: 220, borderRadius: 12, backgroundColor: colors.border, marginBottom: 16 },
  row: { flexDirection: "row" },
  label: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  item: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  itemName: { flex: 1, color: colors.text, marginRight: 8 },
  itemPrice: { color: colors.text, fontVariant: ["tabular-nums"] },
});
