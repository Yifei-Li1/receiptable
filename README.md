# Receiptable

A mobile app that photographs receipts, reads them with Claude's vision model, stores
what you spent on the device, and builds weekly and monthly spending reports.

```
┌──────────────── phone (Expo / React Native) ────────────────┐        ┌──────── server/ (Node) ────────┐
│ camera / photo library → resize to ≤1568px JPEG ──────────────── POST /api/extract ──→ Claude (vision,  │
│                                                              │        │   structured JSON output)      │
│ review & edit ← merchant, date, total, tax, tip, category, items ←────┘                                │
│ SQLite (receipts, settings) → weekly / monthly reports, CSV export                                     │
└──────────────────────────────────────────────────────────────┘
```

The API key lives on the server, not in the app, so it never ships inside the app bundle.

## Features

- **Scan**: take a photo or pick one from the library. The server returns merchant, date,
  currency, total, tax, tip, a category and line items. You review and fix anything before saving.
- **Manual entry** if you have no photo, or if reading the receipt fails.
- **Storage**: receipts and their images stay on the device (SQLite and the app's document folder).
  Amounts are stored as integer cents.
- **Reports**: pick weekly or monthly, then step back through earlier periods. Each report shows:
  - the total and the average per day
  - the % change from the previous period
  - a per-day bar chart
  - a breakdown by category
  - the top merchants
  - the receipts in that period
  
  Receipts in other currencies are listed separately and never added into the main total.
- **Settings**: server URL and an optional access token, your main currency, and whether weeks
  start on Monday or Sunday. You can also export all receipts as CSV.

## Running it

### 1. Server

```bash
cd server
npm install
export ANTHROPIC_API_KEY=sk-ant-...       # your Anthropic API key
export RECEIPTABLE_TOKEN=some-long-secret # optional: the app must send this token
npm run dev                              # listens on :8787
```

### 2. App

```bash
cd app
npm install
npx expo start
```

The app uses native modules (camera, SQLite, image manipulation). Expo Go already includes all of
these, so you can scan the QR code with Expo Go to try it. For a standalone app, make a development
build with `npx expo run:android` / `npx expo run:ios`, or with `npx eas-cli@latest build`.

In the app, open **Settings** and set the server URL. With the server on your computer and the
phone on the same Wi-Fi, that's `http://<your-computer-LAN-IP>:8787`. Tap **Test connection** to check it.
You can also preset the URL with `EXPO_PUBLIC_SERVER_URL=http://... npx expo start`.

## Development

```bash
cd app && npm run typecheck && npm test   # report and amount-parsing unit tests
cd server && npm run typecheck
```

## Project layout

```
app/src/app/            screens (Expo Router): tabs (Spending, Reports, Settings), scan modal, receipt/[id]
app/src/lib/            db.ts (SQLite + migrations), reports.ts (period math + aggregation),
                        api.ts (server client), images.ts, money.ts, dates.ts, settings.ts
app/src/components/     form, bar chart, list row, UI primitives
server/src/extract.ts   Claude call: image → zod-validated receipt JSON
server/src/index.ts     Express API (/health, /api/extract)
```

## Notes / next steps

- Each scan makes one Claude call (Opus 5.5 at low effort). If a request is refused, the server
  falls back to another model automatically.
- Before a public release, deploy the server somewhere with HTTPS and require `RECEIPTABLE_TOKEN`
  or real user auth.
- Ideas: budgets with alerts, recurring-expense detection, cloud backup/sync, charts across several months.
