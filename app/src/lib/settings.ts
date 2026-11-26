import type { SQLiteDatabase } from "expo-sqlite";
import { getSetting, setSetting } from "./db";
import type { WeekStart } from "./reports";

export interface Settings {
  currency: string;
  weekStartsOn: WeekStart;
}

export const DEFAULT_SETTINGS: Settings = {
  currency: "USD",
  weekStartsOn: 1,
};

export async function loadSettings(db: SQLiteDatabase): Promise<Settings> {
  const [currency, weekStartsOn] = await Promise.all([getSetting(db, "currency"), getSetting(db, "weekStartsOn")]);
  return {
    currency: currency ?? DEFAULT_SETTINGS.currency,
    weekStartsOn: weekStartsOn === "0" ? 0 : 1,
  };
}

export async function saveSettings(db: SQLiteDatabase, s: Settings): Promise<void> {
  await setSetting(db, "currency", s.currency.trim().toUpperCase());
  await setSetting(db, "weekStartsOn", String(s.weekStartsOn));
}
