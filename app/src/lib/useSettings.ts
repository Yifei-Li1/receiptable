import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "./settings";

/** Loads settings and refreshes them whenever the screen regains focus. */
export function useSettings(): Settings {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useFocusEffect(
    useCallback(() => {
      loadSettings(db).then(setSettings);
    }, [db]),
  );
  return settings;
}
