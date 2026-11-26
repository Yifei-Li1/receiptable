import type { SQLiteDatabase } from "expo-sqlite";
import { getSetting, setSetting } from "./db";
import type { WeekStart } from "./reports";

export interface Settings {
  serverUrl: string;
  serverToken: string;
  currency: string;
  weekStartsOn: WeekStart;
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: process.env.EXPO_PUBLIC_SERVER_URL ?? "",
  serverToken: "",
  currency: "USD",
  weekStartsOn: 1,
};

export async function loadSettings(db: SQLiteDatabase): Promise<Settings> {
  const [serverUrl, serverToken, currency, weekStartsOn] = await Promise.all([
    getSetting(db, "serverUrl"),
    getSetting(db, "serverToken"),
    getSetting(db, "currency"),
    getSetting(db, "weekStartsOn"),
  ]);
  return {
    serverUrl: serverUrl ?? DEFAULT_SETTINGS.serverUrl,
    serverToken: serverToken ?? DEFAULT_SETTINGS.serverToken,
    currency: currency ?? DEFAULT_SETTINGS.currency,
    weekStartsOn: weekStartsOn === "0" ? 0 : 1,
  };
}

export async function saveSettings(db: SQLiteDatabase, s: Settings): Promise<void> {
  await setSetting(db, "serverUrl", s.serverUrl.trim().replace(/\/+$/, ""));
  await setSetting(db, "serverToken", s.serverToken.trim());
  await setSetting(db, "currency", s.currency.trim().toUpperCase());
  await setSetting(db, "weekStartsOn", String(s.weekStartsOn));
}
