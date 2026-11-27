import { addDays, parseISODate, toISODate } from "./dates";
import type { Category, Receipt } from "./types";

export type PeriodKind = "week" | "month";

export interface Period {
  kind: PeriodKind;
  /** Inclusive start, YYYY-MM-DD. */
  start: string;
  /** Exclusive end, YYYY-MM-DD. */
  end: string;
  label: string;
}

/** 0 = Sunday, 1 = Monday. */
export type WeekStart = 0 | 1;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function periodContaining(kind: PeriodKind, anchor: Date, weekStartsOn: WeekStart = 1): Period {
  if (kind === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    return {
      kind,
      start: toISODate(start),
      end: toISODate(end),
      label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
    };
  }
  const offset = (anchor.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(anchor, -offset);
  const end = addDays(start, 7);
  const last = addDays(end, -1);
  const year = last.getFullYear() !== new Date().getFullYear() ? `, ${last.getFullYear()}` : "";
  return { kind, start: toISODate(start), end: toISODate(end), label: `${shortDate(start)} – ${shortDate(last)}${year}` };
}

export function shiftPeriod(p: Period, delta: number, weekStartsOn: WeekStart = 1): Period {
  const start = parseISODate(p.start);
  const anchor =
    p.kind === "month"
      ? new Date(start.getFullYear(), start.getMonth() + delta, 1)
      : addDays(start, 7 * delta);
  return periodContaining(p.kind, anchor, weekStartsOn);
}

export function inPeriod(date: string, p: Period): boolean {
  return date >= p.start && date < p.end;
}

export interface DayBucket {
  date: string;
  label: string;
  cents: number;
}

export interface CategoryTotal {
  category: Category;
  cents: number;
  share: number;
}

export interface MerchantTotal {
  merchant: string;
  cents: number;
  count: number;
}

export interface Report {
  period: Period;
  currency: string;
  totalCents: number;
  receiptCount: number;
  averagePerDayCents: number;
  byDay: DayBucket[];
  byCategory: CategoryTotal[];
  topMerchants: MerchantTotal[];
  /** Receipts in other currencies are not mixed into totals; their sums are listed here. */
  otherCurrencies: { currency: string; cents: number; count: number }[];
  previousTotalCents: number | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function buildReport(
  receipts: Receipt[],
  period: Period,
  currency: string,
  previous?: { receipts: Receipt[] },
): Report {
  const inRange = receipts.filter((r) => inPeriod(r.date, period));
  const main = inRange.filter((r) => r.currency === currency);

  const days: DayBucket[] = [];
  const startDate = parseISODate(period.start);
  for (let d = startDate; toISODate(d) < period.end; d = addDays(d, 1)) {
    days.push({
      date: toISODate(d),
      label: period.kind === "week" ? WEEKDAYS[d.getDay()] : String(d.getDate()),
      cents: 0,
    });
  }
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));

  const cats = new Map<Category, number>();
  const merchants = new Map<string, MerchantTotal>();
  let total = 0;
  for (const r of main) {
    total += r.totalCents;
    const i = dayIndex.get(r.date);
    if (i !== undefined) days[i].cents += r.totalCents;
    cats.set(r.category, (cats.get(r.category) ?? 0) + r.totalCents);
    const key = r.merchant.trim().toLowerCase() || "(unknown)";
    const m = merchants.get(key) ?? { merchant: r.merchant.trim() || "(unknown)", cents: 0, count: 0 };
    m.cents += r.totalCents;
    m.count += 1;
    merchants.set(key, m);
  }

  const others = new Map<string, { currency: string; cents: number; count: number }>();
  for (const r of inRange) {
    if (r.currency === currency) continue;
    const o = others.get(r.currency) ?? { currency: r.currency, cents: 0, count: 0 };
    o.cents += r.totalCents;
    o.count += 1;
    others.set(r.currency, o);
  }

  const previousTotalCents = previous
    ? previous.receipts.filter((r) => r.currency === currency).reduce((s, r) => s + r.totalCents, 0)
    : null;

  return {
    period,
    currency,
    totalCents: total,
    receiptCount: main.length,
    averagePerDayCents: days.length ? Math.round(total / days.length) : 0,
    byDay: days,
    byCategory: [...cats.entries()]
      .map(([category, cents]) => ({ category, cents, share: total ? cents / total : 0 }))
      .sort((a, b) => b.cents - a.cents),
    topMerchants: [...merchants.values()].sort((a, b) => b.cents - a.cents).slice(0, 5),
    otherCurrencies: [...others.values()],
    previousTotalCents,
  };
}

export function receiptsToCsv(receipts: Receipt[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ["date", "merchant", "category", "currency", "total", "tax", "tip", "note"];
  const rows = receipts.map((r) =>
    [
      r.date,
      esc(r.merchant),
      r.category,
      r.currency,
      (r.totalCents / 100).toFixed(2),
      r.taxCents == null ? "" : (r.taxCents / 100).toFixed(2),
      r.tipCents == null ? "" : (r.tipCents / 100).toFixed(2),
      esc(r.note),
    ].join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}
