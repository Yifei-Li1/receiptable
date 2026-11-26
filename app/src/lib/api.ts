import { isValidISODate, toISODate } from "./dates";
import { toCents } from "./money";
import type { Settings } from "./settings";
import { CATEGORIES, type Category, type NewReceipt } from "./types";

interface ExtractedReceipt {
  is_receipt: boolean;
  merchant: string;
  date: string;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number;
  category: string;
  items: { name: string; quantity: number; price: number }[];
}

export class ExtractError extends Error {}

/** Sends a base64 JPEG to the Receiptable server and maps the result to a draft receipt. */
export async function extractReceipt(
  settings: Settings,
  imageBase64: string,
): Promise<Omit<NewReceipt, "imageUri" | "note">> {
  if (!settings.serverUrl) {
    throw new ExtractError("Set the server URL in Settings first (or enter the receipt manually).");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(`${settings.serverUrl}/api/extract`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(settings.serverToken ? { authorization: `Bearer ${settings.serverToken}` } : {}),
      },
      body: JSON.stringify({ image: imageBase64, mediaType: "image/jpeg" }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new ExtractError(
      controller.signal.aborted ? "The server took too long to respond." : "Could not reach the server.",
    );
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ExtractError(body.error ?? `Server error (${res.status}).`);

  const r = body.receipt as ExtractedReceipt;
  if (!r.is_receipt) throw new ExtractError("That doesn't look like a receipt. Try another photo.");

  const category: Category = (CATEGORIES as readonly string[]).includes(r.category)
    ? (r.category as Category)
    : "Other";
  return {
    merchant: r.merchant,
    date: isValidISODate(r.date) ? r.date : toISODate(new Date()),
    currency: (r.currency || settings.currency).toUpperCase(),
    totalCents: toCents(r.total),
    taxCents: r.tax == null ? null : toCents(r.tax),
    tipCents: r.tip == null ? null : toCents(r.tip),
    category,
    items: r.items.map((i) => ({ name: i.name, quantity: i.quantity, priceCents: toCents(i.price) })),
  };
}
