/**
 * Turns on-device OCR output (text pieces + positions) into receipt fields.
 *
 * Pipeline: blocks → lines → rows (text at the same height, left to right) → field detection.
 * Pure TypeScript so it can be unit tested without a device.
 */
import { isValidISODate } from "./dates";
import { parseAmountToCents } from "./money";
import type { Category, LineItem } from "./types";

export interface OcrBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrBlockInput {
  text: string;
  boundingBox: OcrBox;
}

interface Line {
  text: string;
  x: number;
  y: number;
  h: number;
}

export interface Row {
  text: string;
  /** Vertical center, image pixels. */
  y: number;
  /** Average text height in the row — a proxy for font size. */
  h: number;
  parts: Line[];
}

export interface ParseOptions {
  /** Currency to use when the receipt doesn't show one. */
  defaultCurrency: string;
  /** How to read ambiguous dates like 03/04/2026: true = 3 April, false = March 4. */
  dayFirst: boolean;
  /** For rejecting implausible dates. Defaults to now. */
  today?: Date;
}

export interface ParsedReceipt {
  merchant: string;
  /** YYYY-MM-DD, or null if no date was found. */
  date: string | null;
  currency: string;
  /** null if no total could be found. */
  totalCents: number | null;
  taxCents: number | null;
  tipCents: number | null;
  category: Category;
  items: LineItem[];
  /** True when the total came from a "TOTAL"-style label rather than a best guess. */
  totalFromLabel: boolean;
}

// ---------------------------------------------------------------- layout

/** Splits multi-line blocks (Android/ML Kit returns paragraphs) into lines with estimated positions. */
export function blocksToLines(blocks: OcrBlockInput[]): Line[] {
  const lines: Line[] = [];
  for (const b of blocks) {
    const texts = b.text.split(/\r?\n/).map((t) => t.trim());
    const n = texts.length;
    const lh = b.boundingBox.height / n;
    texts.forEach((text, i) => {
      if (!text) return;
      lines.push({ text, x: b.boundingBox.x, y: b.boundingBox.y + lh * i + lh / 2, h: lh });
    });
  }
  return lines;
}

/** Groups lines printed at the same height into rows, ordered top to bottom, parts left to right. */
export function groupRows(lines: Line[]): Row[] {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const rows: Row[] = [];
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(line.y - row.y) < Math.min(row.h, line.h) * 0.6) {
      row.parts.push(line);
      const n = row.parts.length;
      row.y = (row.y * (n - 1) + line.y) / n;
      row.h = (row.h * (n - 1) + line.h) / n;
    } else {
      rows.push({ text: "", y: line.y, h: line.h, parts: [line] });
    }
  }
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x);
    row.text = row.parts.map((p) => p.text).join("  ");
  }
  return rows;
}

// ---------------------------------------------------------------- amounts

// 12.40  1,234.56  1.234,56  -3.00  3.00-  — requires exactly two decimals so integers,
// phone numbers and times aren't mistaken for prices; lookarounds reject dates like 26.11.2026.
const AMOUNT_RE = /(?<![\d.,])(-?)((?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2})(?!\d|[.,]\d)(-?)/g;

export function findAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const cents = parseAmountToCents(m[2]);
    if (cents == null) continue;
    out.push(m[1] || m[3] ? -cents : cents);
  }
  return out;
}

const lastAmount = (row: Row | undefined) => {
  if (!row) return null;
  const a = findAmounts(row.text);
  return a.length ? a[a.length - 1] : null;
};

// Labels, strongest first. Matched case-insensitively against the whole row.
const TOTAL_LABELS: RegExp[] = [
  /grand\s*total|total\s*(?:due|to\s*pay|payable|amount)|amount\s*(?:due|payable|paid)|balance\s*due|total\s*a\s*pagar|montant\s*total|gesamtbetrag|实付|应付|合计|總計|总计|合計/i,
  /\btotal\b|\btotale\b|\bsumme\b|\bgesamt\b|\bimporte\b|\btot\b/i,
];
const NOT_TOTAL = /sub\s*-?\s*total|subtot|total\s*(?:items?|qty|quantity|savings?|discount|tax|vat)|items?\s*total|you\s*saved|savings|before\s*tax|excl/i;
const NOT_PRICE = /change|cash\s*tend|tendered|cash\b|\bpaid\s*cash|points|balance\s*(?:remaining|left)|rounding/i;
const TAX_LABEL = /\b(?:sales\s*)?tax\b|\bvat\b|\bgst\b|\bhst\b|\bpst\b|\bqst\b|\btva\b|\bmwst\b|\biva\b|税/i;
const TIP_LABEL = /\btip\b|gratuity|service\s*charge|小费/i;
const SUBTOTAL_LABEL = /sub\s*-?\s*total|subtot|小计|小計/i;

function findLabeled(rows: Row[], label: RegExp, exclude?: RegExp): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const t = rows[i].text;
    if (!label.test(t) || (exclude && exclude.test(t))) continue;
    const a = lastAmount(rows[i]) ?? lastAmount(rows[i + 1]);
    if (a != null) return a;
  }
  return null;
}

function findTotal(rows: Row[]): { cents: number | null; fromLabel: boolean } {
  for (const label of TOTAL_LABELS) {
    // The bottom-most labeled total wins (e.g. after discounts), but only if it's positive.
    for (let i = rows.length - 1; i >= 0; i--) {
      const t = rows[i].text;
      if (!label.test(t) || NOT_TOTAL.test(t) || NOT_PRICE.test(t)) continue;
      // Amount on the same row, or right below the label when the amount wraps.
      const a = lastAmount(rows[i]) ?? (findAmounts(rows[i + 1]?.text ?? "").length ? lastAmount(rows[i + 1]) : null);
      if (a != null && a > 0) return { cents: a, fromLabel: true };
    }
  }
  const sub = findLabeled(rows, SUBTOTAL_LABEL);
  const tax = findLabeled(rows, TAX_LABEL, NOT_TOTAL);
  if (sub != null) return { cents: sub + (tax ?? 0), fromLabel: true };

  // Fallback: the largest price on the receipt, ignoring cash tendered / change lines.
  let best: number | null = null;
  for (const r of rows) {
    if (NOT_PRICE.test(r.text)) continue;
    for (const a of findAmounts(r.text)) if (a > 0 && (best == null || a > best)) best = a;
  }
  return { cents: best, fromLabel: false };
}

// ---------------------------------------------------------------- dates

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidISODate(s) ? s : null;
}

export function findDate(text: string, dayFirst: boolean, today = new Date()): string | null {
  const candidates: string[] = [];
  const push = (s: string | null) => s && candidates.push(s);

  for (const m of text.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) push(iso(+m[1], +m[2], +m[3]));
  for (const m of text.matchAll(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) push(iso(+m[1], +m[2], +m[3]));
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12) push(iso(y, b, a));
    else if (b > 12) push(iso(y, a, b));
    else push(dayFirst ? iso(y, b, a) : iso(y, a, b));
  }
  const mon = "(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?";
  for (const m of text.matchAll(new RegExp(`\\b${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi")))
    push(iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]));
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${mon}[\\s-,]+(\\d{4}|\\d{2})\\b`, "gi")))
    push(iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));

  const max = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const maxIso = `${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, "0")}-${String(max.getDate()).padStart(2, "0")}`;
  return candidates.find((c) => c >= "2000-01-01" && c <= maxIso) ?? null;
}

// ---------------------------------------------------------------- currency

const DOLLAR_CURRENCIES = new Set(["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN", "TWD"]);
const CODE_RE = /\b(USD|EUR|GBP|CNY|RMB|JPY|CAD|AUD|NZD|CHF|SGD|HKD|INR|KRW|MXN|TWD|SEK|NOK|DKK|PLN|BRL)\b/;

export function findCurrency(text: string, fallback: string): string {
  const code = text.match(CODE_RE)?.[1];
  if (code) return code === "RMB" ? "CNY" : code;
  if (/€/.test(text)) return "EUR";
  if (/£/.test(text)) return "GBP";
  if (/₹/.test(text)) return "INR";
  if (/₩/.test(text)) return "KRW";
  if (/[¥￥]|元/.test(text)) return fallback === "JPY" ? "JPY" : "CNY";
  if (/\$/.test(text)) return DOLLAR_CURRENCIES.has(fallback) ? fallback : "USD";
  return fallback;
}

// ---------------------------------------------------------------- merchant

const NOT_MERCHANT =
  /receipt|invoice|welcome|thank|\btel\b|phone|www\.|\.com|https?:|@|store\s*#|\bstore\s*\d|cashier|register|order\s*#|table|guest/i;
const ADDRESS = /\b\d+\s+\w+.*\b(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|hwy|suite|ste)\b|\b[A-Z]{2}\s+\d{5}\b/i;

function findMerchant(rows: Row[]): string {
  const candidates: Row[] = [];
  for (const r of rows.slice(0, 8)) {
    const t = r.text.trim();
    const letters = (t.match(/\p{L}/gu) ?? []).length;
    if (letters < 2 || letters < t.replace(/\s/g, "").length * 0.5) continue;
    if (NOT_MERCHANT.test(t) || ADDRESS.test(t) || findAmounts(t).length) continue;
    candidates.push(r);
    if (candidates.length === 3) break;
  }
  if (!candidates.length) return "";
  // The store name is usually the biggest text near the top.
  const best = candidates.reduce((a, b) => (b.h > a.h * 1.25 ? b : a));
  return tidyName(best.text);
}

function tidyName(s: string): string {
  const t = s.replace(/\s{2,}/g, " ").trim();
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) {
    return t.toLowerCase().replace(/(^|[\s&-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
  }
  return t;
}

// ---------------------------------------------------------------- items

const NOT_ITEM = new RegExp(
  [TOTAL_LABELS[0].source, TOTAL_LABELS[1].source, SUBTOTAL_LABEL.source, TAX_LABEL.source, TIP_LABEL.source, NOT_PRICE.source,
    "visa|mastercard|amex|debit|credit|card|auth|approval|ref\\s*#"].join("|"),
  "i",
);

function findItems(rows: Row[]): LineItem[] {
  const end = rows.findIndex((r) => SUBTOTAL_LABEL.test(r.text) || TOTAL_LABELS.some((l) => l.test(r.text)));
  const body = end === -1 ? rows : rows.slice(0, end);
  const items: LineItem[] = [];
  for (const r of body) {
    if (NOT_ITEM.test(r.text)) continue;
    const price = lastAmount(r);
    if (price == null) continue;
    let name = r.text.replace(AMOUNT_RE, " ").replace(/[$€£¥￥]/g, " ");
    let quantity = 1;
    const q = name.match(/^\s*(\d{1,3})\s*(?:x|@|×)\s*/i) ?? name.match(/\s(\d{1,3})\s*(?:x|@|×)\s*$/i);
    if (q) {
      quantity = +q[1];
      name = name.replace(q[0], " ");
    }
    name = name.replace(/\s+[A-Z]$/, "").replace(/\s{2,}/g, " ").trim();
    if ((name.match(/\p{L}/gu) ?? []).length < 2) continue;
    items.push({ name, quantity, priceCents: price });
  }
  return items;
}

// ---------------------------------------------------------------- category

const CATEGORY_KEYWORDS: [Category, RegExp][] = [
  ["Dining", /restaurant|cafe|café|coffee|starbucks|mcdonald|burger|pizza|sushi|ramen|grill|bistro|diner|kitchen|bakery|tea\b|bar\b|pub\b|kfc|subway|chipotle|taco|noodle|server:|table\s*\d|gratuity|餐|饭|咖啡|茶/i],
  ["Groceries", /grocery|supermarket|market|foods?\b|mart\b|costco|aldi|lidl|kroger|safeway|trader\s*joe|whole\s*foods|tesco|sainsbury|carrefour|publix|albertsons|wegmans|h-?e-?b|produce|超市|生鲜/i],
  ["Transport", /fuel|petrol|gasoline|gas\s*station|diesel|shell|chevron|exxon|mobil|\bbp\b|texaco|parking|uber|lyft|taxi|metro|transit|toll|加油|停车/i],
  ["Health", /pharmacy|drug|cvs|walgreens|rite\s*aid|boots|clinic|dental|medical|hospital|optical|rx\b|药/i],
  ["Utilities", /electric|utility|water\s*bill|internet|broadband|telecom|mobile\s*plan|verizon|at&t|t-mobile|comcast|电费|水费/i],
  ["Entertainment", /cinema|movie|theat(?:er|re)|ticket|concert|museum|bowling|arcade|steam|netflix|spotify|电影/i],
  ["Travel", /hotel|motel|\binn\b|resort|airline|airport|airways|hostel|booking|expedia|airbnb|酒店/i],
  ["Shopping", /store|shop|boutique|outlet|mall|target|walmart|ikea|amazon|best\s*buy|apparel|clothing|electronics|home\s*depot|商店|商场/i],
];

export function guessCategory(merchant: string, fullText: string): Category {
  for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(merchant)) return cat;
  let best: Category = "Other";
  let bestScore = 0;
  for (const [cat, re] of CATEGORY_KEYWORDS) {
    const score = (fullText.match(new RegExp(re.source, "gi")) ?? []).length;
    if (score > bestScore) {
      best = cat;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------- entry point

export function parseReceipt(blocks: OcrBlockInput[], opts: ParseOptions): ParsedReceipt {
  const rows = groupRows(blocksToLines(blocks));
  const fullText = rows.map((r) => r.text).join("\n");
  const merchant = findMerchant(rows);
  const total = findTotal(rows);
  return {
    merchant,
    date: findDate(fullText, opts.dayFirst, opts.today),
    currency: findCurrency(fullText, opts.defaultCurrency),
    totalCents: total.cents,
    taxCents: findLabeled(rows, TAX_LABEL, NOT_TOTAL),
    tipCents: findLabeled(rows, TIP_LABEL),
    category: guessCategory(merchant, fullText),
    items: findItems(rows),
    totalFromLabel: total.fromLabel,
  };
}
