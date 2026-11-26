import assert from "node:assert/strict";
import { test } from "node:test";
import { findAmounts, findCurrency, findDate, guessCategory, parseReceipt, type OcrBlockInput } from "./receiptParser";

const opts = { defaultCurrency: "USD", dayFirst: false, today: new Date(2026, 10, 26) };
const LINE_H = 30;

/** iOS-style output: one block per printed line, left column at x=20, right column at x=400. */
function iosBlocks(rows: [string, string?][], opts: { firstLineHeight?: number } = {}): OcrBlockInput[] {
  const blocks: OcrBlockInput[] = [];
  rows.forEach(([left, right], i) => {
    const h = i === 0 && opts.firstLineHeight ? opts.firstLineHeight : LINE_H;
    const y = i * 40 + (i === 0 ? 0 : 20);
    if (left) blocks.push({ text: left, boundingBox: { x: 20, y, width: 300, height: h } });
    if (right) blocks.push({ text: right, boundingBox: { x: 400, y: y + 2, width: 80, height: h } });
  });
  // OCR engines don't guarantee order; shuffle deterministically.
  return blocks.reverse();
}

/** Android-style output: ML Kit returns each column as one multi-line paragraph block. */
function androidColumns(left: string[], right: string[], top: number): OcrBlockInput[] {
  return [
    { text: right.join("\n"), boundingBox: { x: 400, y: top + 3, width: 80, height: right.length * 40 } },
    { text: left.join("\n"), boundingBox: { x: 20, y: top, width: 300, height: left.length * 40 } },
  ];
}

test("grocery receipt (iOS line blocks)", () => {
  const r = parseReceipt(
    iosBlocks(
      [
        ["TRADER JOE'S"],
        ["123 Main St, Springfield IL 62701"],
        ["Tel (217) 555-0134"],
        ["BANANAS", "1.29"],
        ["2 x OAT MILK", "7.98"],
        ["SOURDOUGH BREAD", "4.49"],
        ["SUBTOTAL", "13.76"],
        ["SALES TAX", "0.55"],
        ["TOTAL", "$14.31"],
        ["VISA ****4821", "14.31"],
        ["11/24/2026 18:42"],
        ["THANK YOU FOR SHOPPING"],
      ],
      { firstLineHeight: 48 },
    ),
    opts,
  );
  assert.equal(r.merchant, "Trader Joe's");
  assert.equal(r.totalCents, 1431);
  assert.equal(r.totalFromLabel, true);
  assert.equal(r.taxCents, 55);
  assert.equal(r.date, "2026-11-24");
  assert.equal(r.currency, "USD");
  assert.equal(r.category, "Groceries");
  assert.deepEqual(r.items, [
    { name: "BANANAS", quantity: 1, priceCents: 129 },
    { name: "OAT MILK", quantity: 2, priceCents: 798 },
    { name: "SOURDOUGH BREAD", quantity: 1, priceCents: 449 },
  ]);
});

test("restaurant receipt where Android returns label and amount columns as separate blocks", () => {
  const blocks: OcrBlockInput[] = [
    { text: "BLUE DOOR BISTRO", boundingBox: { x: 60, y: 0, width: 320, height: 50 } },
    { text: "Server: Ana  Table 12\n26 Nov 2026", boundingBox: { x: 20, y: 70, width: 300, height: 80 } },
    ...androidColumns(
      ["Pasta Carbonara", "Caesar Salad", "Subtotal", "Tax", "Tip", "Total"],
      ["18.50", "11.00", "29.50", "2.36", "5.90", "37.76"],
      180,
    ),
    { text: "Change 0.00", boundingBox: { x: 20, y: 450, width: 200, height: 40 } },
  ];
  const r = parseReceipt(blocks, opts);
  assert.equal(r.merchant, "Blue Door Bistro");
  assert.equal(r.totalCents, 3776);
  assert.equal(r.taxCents, 236);
  assert.equal(r.tipCents, 590);
  assert.equal(r.date, "2026-11-26");
  assert.equal(r.category, "Dining");
  assert.equal(r.items.length, 2);
});

test("European receipt with comma decimals and euro sign", () => {
  const r = parseReceipt(
    iosBlocks([
      ["Café Central"],
      ["Espresso", "2,80"],
      ["Croissant", "3,20"],
      ["SUMME", "6,00 €"],
      ["MwSt 19%", "0,96"],
      ["26.11.2026"],
    ]),
    { ...opts, defaultCurrency: "USD", dayFirst: true },
  );
  assert.equal(r.totalCents, 600);
  assert.equal(r.currency, "EUR");
  assert.equal(r.date, "2026-11-26");
  assert.equal(r.taxCents, 96);
  assert.equal(r.category, "Dining");
});

test("Chinese receipt", () => {
  const r = parseReceipt(
    iosBlocks([["永辉超市"], ["苹果", "12.50"], ["牛奶", "8.00"], ["合计", "¥20.50"], ["2026年11月20日"]]),
    { ...opts, defaultCurrency: "CNY" },
  );
  assert.equal(r.merchant, "永辉超市");
  assert.equal(r.totalCents, 2050);
  assert.equal(r.currency, "CNY");
  assert.equal(r.date, "2026-11-20");
  assert.equal(r.category, "Groceries");
});

test("ignores cash tendered and change when choosing the total", () => {
  const r = parseReceipt(
    iosBlocks([["CORNER SHOP"], ["Item", "3.50"], ["TOTAL", "8.75"], ["CASH", "20.00"], ["CHANGE", "11.25"]]),
    opts,
  );
  assert.equal(r.totalCents, 875);
});

test("falls back to the largest price when no total label is readable", () => {
  const r = parseReceipt(iosBlocks([["SHELL"], ["UNLEADED 12.1 GAL", "45.20"], ["CASH", "50.00"]]), opts);
  assert.equal(r.totalCents, 4520);
  assert.equal(r.totalFromLabel, false);
  assert.equal(r.category, "Transport");
});

test("computes total from subtotal + tax when the total line is missing", () => {
  const r = parseReceipt(iosBlocks([["SHOP"], ["Subtotal", "10.00"], ["Tax", "0.80"]]), opts);
  assert.equal(r.totalCents, 1080);
});

test("empty OCR result", () => {
  const r = parseReceipt([], opts);
  assert.equal(r.totalCents, null);
  assert.equal(r.merchant, "");
  assert.equal(r.date, null);
  assert.equal(r.category, "Other");
});

test("findAmounts reads prices but not dates, times or phone numbers", () => {
  assert.deepEqual(findAmounts("TOTAL $1,234.56"), [123456]);
  assert.deepEqual(findAmounts("Summe 1.234,56"), [123456]);
  assert.deepEqual(findAmounts("Discount -3.00"), [-300]);
  assert.deepEqual(findAmounts("26.11.2026 12:30 tel 555-0134"), []);
  assert.deepEqual(findAmounts("2 @ 1.99  3.98"), [199, 398]);
});

test("findDate formats and ambiguity", () => {
  assert.equal(findDate("2026-11-03", false), "2026-11-03");
  assert.equal(findDate("03/04/2026", false), "2026-03-04");
  assert.equal(findDate("03/04/2026", true), "2026-04-03");
  assert.equal(findDate("13/04/26", false), "2026-04-13");
  assert.equal(findDate("Nov 5, 2026", false), "2026-11-05");
  assert.equal(findDate("Date: 01/01/2031", false, new Date(2026, 10, 26)), null); // future
});

test("findCurrency", () => {
  assert.equal(findCurrency("Total $5.00", "CAD"), "CAD");
  assert.equal(findCurrency("Total $5.00", "EUR"), "USD");
  assert.equal(findCurrency("£5.00", "USD"), "GBP");
  assert.equal(findCurrency("RMB 5.00", "USD"), "CNY");
  assert.equal(findCurrency("5.00", "EUR"), "EUR");
});

test("guessCategory prefers the merchant name", () => {
  assert.equal(guessCategory("CVS Pharmacy", "milk bread"), "Health");
  assert.equal(guessCategory("Joe's", "coffee latte"), "Dining");
});
