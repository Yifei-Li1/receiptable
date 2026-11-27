# Receiptable

A mobile app that photographs receipts, reads them **on the phone**, stores what you spent
locally, and builds weekly and monthly spending reports.

No server, no API key and no cost per scan: text recognition uses the phone's built-in engine
(Google ML Kit on Android, Apple Vision on iOS) through [`expo-ocr-kit`](https://www.npmjs.com/package/expo-ocr-kit).
Photos and data never leave the device.

```
camera / photo library
  → resize (≤2048px)
  → on-device OCR: text pieces + their positions on the photo
  → receipt parser (src/lib/receiptParser.ts)
      rebuild printed rows from positions → find total, date, store, currency, tax, tip, items, category
  → review & edit screen → SQLite
  → weekly / monthly reports, CSV export
```

## Features

- **Scan**: take a photo or pick one. The app fills in store, date, currency, total, tax, tip,
  category and line items, and points out anything it couldn't read so you can check it.
- **Manual entry** when there's no photo or the scan misses something.
- **Storage**: SQLite and the app's document folder, on the device only. Amounts are stored as integer cents.
- **Reports**: weekly or monthly, stepping back through earlier periods. Each shows the total,
  average per day, % change from the previous period, a per-day chart, a category breakdown,
  top stores and the receipts in that period. Other currencies are listed separately, not added in.
- **Settings**: main currency, week start (Monday/Sunday), CSV export.

## How the receipt parser works

OCR returns pieces of text with boxes (x, y, width, height). On Android, ML Kit often returns a
whole column as one multi-line block, so the parser first splits blocks into lines and estimates
each line's position. It then groups text printed at the same height into rows, which pairs labels
with their amounts (e.g. `TOTAL` … `12.40`) even when the columns were read separately.

- **Total**: the amount on a row labelled grand total / total / amount due (also Summe, importe,
  合计, 总计…). Subtotal, cash tendered and change are skipped. If there's no label, it uses
  subtotal + tax, and if that's missing too, the largest price (marked as a best guess).
- **Date**: ISO, `MM/DD/YYYY` or `DD/MM/YYYY` (ambiguous ones follow the phone's locale),
  `Nov 5, 2026`, `26 Nov 2026`, `2026年11月26日`. Future dates are rejected.
- **Store**: the biggest text among the first few rows that isn't an address, phone number or greeting.
- **Category**: keyword rules on the store name first, then on the whole receipt.
- **Items**: rows with a name and a price above the subtotal/total line, with `2 x` quantities.

The tests in `src/lib/receiptParser.test.ts` use simulated OCR output for iOS and Android.
When a real receipt is read wrongly, the fix is usually a new keyword or regex there, plus a test.

Known limits: currencies without cents (JPY, KRW) aren't handled; handwritten or faded receipts
read poorly; line items are best-effort.

## Running it

The OCR module is native code, so **Expo Go won't work**. You need a development build of the app,
made once (and again whenever native packages change):

```bash
cd app
npm install
```

Then either build in the cloud with EAS (no Android Studio or Xcode needed):

```bash
npx eas-cli@latest build --profile development --platform android   # or ios
```

Or build locally (needs Android Studio, or Xcode on a Mac):

```bash
npx expo run:android   # or: npx expo run:ios
```

Install that build on your phone, then start the dev server and open the app:

```bash
npx expo start
```

## Development

```bash
cd app
npm run typecheck
npm test        # receipt parser + report tests
npm run lint
```

## Project layout

```
app/src/app/            screens (Expo Router): tabs (Spending, Reports, Settings), scan modal, receipt/[id]
app/src/lib/            receiptParser.ts (OCR → receipt fields), scan.ts (OCR + parser),
                        db.ts (SQLite + migrations), reports.ts, images.ts, money.ts, dates.ts, settings.ts
app/src/components/     form, bar chart, list row, UI primitives
```
