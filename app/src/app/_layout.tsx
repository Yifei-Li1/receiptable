import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { colors } from "../components/theme";
import { DB_NAME, migrate } from "../lib/db";

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg }, headerTintColor: colors.primary }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: "Add receipt", presentation: "modal" }} />
        <Stack.Screen name="receipt/[id]" options={{ title: "Receipt" }} />
      </Stack>
    </SQLiteProvider>
  );
}
