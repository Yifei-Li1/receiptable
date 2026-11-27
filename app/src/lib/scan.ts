import { recognizeText, type OcrResult } from "expo-ocr-kit";
import { toISODate } from "./dates";
import { blocksToLines, groupRows, parseReceipt } from "./receiptParser";
import type { Settings } from "./settings";
import type { NewReceipt } from "./types";

export interface ScanResult {
  draft: NewReceipt;
  /** Fields the user should double-check, in plain words. */
  missing: string[];
  /** True when OCR found no text at all. */
  noText: boolean;
  /** Raw OCR output and the rows the parser rebuilt from it, for the debug view. */
  debug: { ocr: OcrResult; rows: { y: number; text: string }[] };
}

/** Whether this device's locale writes the day before the month (e.g. 26/11 vs 11/26). */
export function localeIsDayFirst(): boolean {
  const parts = new Intl.DateTimeFormat(undefined).formatToParts(new Date(2026, 10, 26));
  const day = parts.findIndex((p) => p.type === "day");
  const month = parts.findIndex((p) => p.type === "month");
  return day !== -1 && month !== -1 && day < month;
}

/** Reads a receipt photo entirely on the device (ML Kit on Android, Apple Vision on iOS). */
export async function scanReceipt(imageUri: string, settings: Settings): Promise<ScanResult> {
  const ocr = await recognizeText(imageUri);
  const parsed = parseReceipt(ocr.blocks, { defaultCurrency: settings.currency, dayFirst: localeIsDayFirst() });

  const rows = groupRows(blocksToLines(ocr.blocks)).map((r) => ({ y: Math.round(r.y), text: r.text }));
  if (__DEV__) console.log("[OCR]", JSON.stringify(ocr, null, 2), "\n[ROWS]", JSON.stringify(rows, null, 2));

  const missing: string[] = [];
  if (parsed.totalCents == null) missing.push("total");
  else if (!parsed.totalFromLabel) missing.push("total (best guess)");
  if (!parsed.date) missing.push("date");
  if (!parsed.merchant) missing.push("store name");

  return {
    noText: ocr.blocks.length === 0,
    debug: { ocr, rows },
    missing,
    draft: {
      merchant: parsed.merchant,
      date: parsed.date ?? toISODate(new Date()),
      currency: parsed.currency,
      totalCents: parsed.totalCents ?? 0,
      taxCents: parsed.taxCents,
      tipCents: parsed.tipCents,
      category: parsed.category,
      items: parsed.items,
      imageUri,
      note: "",
    },
  };
}
