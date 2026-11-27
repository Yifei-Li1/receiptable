import type { SQLiteDatabase } from "expo-sqlite";
import { CATEGORIES, type Category, type LineItem, type NewReceipt, type Receipt } from "./types";

export const DB_NAME = "receiptable.db";
const SCHEMA_VERSION = 1;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA journal_mode = WAL;");
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        merchant TEXT NOT NULL,
        date TEXT NOT NULL,
        currency TEXT NOT NULL,
        total_cents INTEGER NOT NULL,
        tax_cents INTEGER,
        tip_cents INTEGER,
        category TEXT NOT NULL,
        items_json TEXT NOT NULL DEFAULT '[]',
        image_uri TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

interface Row {
  id: number;
  merchant: string;
  date: string;
  currency: string;
  total_cents: number;
  tax_cents: number | null;
  tip_cents: number | null;
  category: string;
  items_json: string;
  image_uri: string | null;
  note: string;
  created_at: string;
}

function fromRow(r: Row): Receipt {
  let items: LineItem[] = [];
  try {
    items = JSON.parse(r.items_json);
  } catch {}
  return {
    id: r.id,
    merchant: r.merchant,
    date: r.date,
    currency: r.currency,
    totalCents: r.total_cents,
    taxCents: r.tax_cents,
    tipCents: r.tip_cents,
    category: (CATEGORIES as readonly string[]).includes(r.category) ? (r.category as Category) : "Other",
    items,
    imageUri: r.image_uri,
    note: r.note,
    createdAt: r.created_at,
  };
}

export async function listReceipts(
  db: SQLiteDatabase,
  opts: { start?: string; end?: string; limit?: number } = {},
): Promise<Receipt[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.start) {
    where.push("date >= ?");
    params.push(opts.start);
  }
  if (opts.end) {
    where.push("date < ?");
    params.push(opts.end);
  }
  let sql = "SELECT * FROM receipts";
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += " ORDER BY date DESC, id DESC";
  if (opts.limit) {
    sql += " LIMIT ?";
    params.push(opts.limit);
  }
  const rows = await db.getAllAsync<Row>(sql, params);
  return rows.map(fromRow);
}

export async function getReceipt(db: SQLiteDatabase, id: number): Promise<Receipt | null> {
  const row = await db.getFirstAsync<Row>("SELECT * FROM receipts WHERE id = ?", id);
  return row ? fromRow(row) : null;
}

export async function insertReceipt(db: SQLiteDatabase, r: NewReceipt): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO receipts (merchant, date, currency, total_cents, tax_cents, tip_cents, category, items_json, image_uri, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.merchant,
    r.date,
    r.currency,
    r.totalCents,
    r.taxCents,
    r.tipCents,
    r.category,
    JSON.stringify(r.items),
    r.imageUri,
    r.note,
  );
  return res.lastInsertRowId;
}

export async function updateReceipt(db: SQLiteDatabase, id: number, r: NewReceipt): Promise<void> {
  await db.runAsync(
    `UPDATE receipts SET merchant = ?, date = ?, currency = ?, total_cents = ?, tax_cents = ?, tip_cents = ?,
       category = ?, items_json = ?, image_uri = ?, note = ? WHERE id = ?`,
    r.merchant,
    r.date,
    r.currency,
    r.totalCents,
    r.taxCents,
    r.tipCents,
    r.category,
    JSON.stringify(r.items),
    r.imageUri,
    r.note,
    id,
  );
}

export async function deleteReceipt(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync("DELETE FROM receipts WHERE id = ?", id);
}

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}
