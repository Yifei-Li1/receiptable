import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAmountToCents } from "./money";
import { buildReport, periodContaining, receiptsToCsv, shiftPeriod } from "./reports";
import type { Receipt } from "./types";

const r = (id: number, date: string, totalCents: number, extra: Partial<Receipt> = {}): Receipt => ({
  id, date, totalCents, merchant: "Shop", currency: "USD", taxCents: null, tipCents: null,
  category: "Groceries", items: [], imageUri: null, note: "", createdAt: "", ...extra,
});

test("week period starts on Monday by default", () => {
  const p = periodContaining("week", new Date(2026, 10, 26)); // Thu Nov 26 2026
  assert.equal(p.start, "2026-11-23");
  assert.equal(p.end, "2026-11-30");
});

test("week period can start on Sunday", () => {
  const p = periodContaining("week", new Date(2026, 10, 26), 0);
  assert.equal(p.start, "2026-11-22");
});

test("month period and shifting across year boundary", () => {
  const p = periodContaining("month", new Date(2026, 0, 15));
  assert.deepEqual([p.start, p.end, p.label], ["2026-01-01", "2026-02-01", "Jan 2026"]);
  const prev = shiftPeriod(p, -1);
  assert.deepEqual([prev.start, prev.end], ["2025-12-01", "2026-01-01"]);
});

test("buildReport aggregates totals, days, categories, merchants, currencies", () => {
  const p = periodContaining("week", new Date(2026, 10, 26));
  const receipts = [
    r(1, "2026-11-23", 1000),
    r(2, "2026-11-23", 500, { category: "Dining", merchant: "Cafe" }),
    r(3, "2026-11-29", 2500, { merchant: "shop " }),
    r(4, "2026-11-30", 9999), // next week, excluded
    r(5, "2026-11-24", 700, { currency: "EUR" }),
  ];
  const rep = buildReport(receipts, p, "USD", { receipts: [r(9, "2026-11-17", 2000)] });
  assert.equal(rep.totalCents, 4000);
  assert.equal(rep.receiptCount, 3);
  assert.equal(rep.byDay.length, 7);
  assert.equal(rep.byDay[0].cents, 1500);
  assert.equal(rep.byDay[0].label, "Mon");
  assert.equal(rep.byDay[6].cents, 2500);
  assert.equal(rep.byCategory[0].category, "Groceries");
  assert.equal(rep.byCategory[0].cents, 3500);
  assert.equal(rep.topMerchants[0].count, 2); // "Shop" and "shop " merged
  assert.deepEqual(rep.otherCurrencies, [{ currency: "EUR", cents: 700, count: 1 }]);
  assert.equal(rep.previousTotalCents, 2000);
  assert.equal(rep.averagePerDayCents, Math.round(4000 / 7));
});

test("month report has one bucket per day", () => {
  const rep = buildReport([], periodContaining("month", new Date(2026, 1, 3)), "USD");
  assert.equal(rep.byDay.length, 28);
  assert.equal(rep.totalCents, 0);
});

test("parseAmountToCents handles common formats", () => {
  assert.equal(parseAmountToCents("12.5"), 1250);
  assert.equal(parseAmountToCents("$1,234.56"), 123456);
  assert.equal(parseAmountToCents("12,50"), 1250);
  assert.equal(parseAmountToCents("1.234,56"), 123456);
  assert.equal(parseAmountToCents("0.1"), 10);
  assert.equal(parseAmountToCents(""), null);
});

test("CSV escapes commas and quotes", () => {
  const csv = receiptsToCsv([r(1, "2026-11-23", 1234, { merchant: 'Joe\'s, "Best"' })]);
  assert.equal(csv.split("\n")[1], '2026-11-23,"Joe\'s, ""Best""",Groceries,USD,12.34,,,');
});
