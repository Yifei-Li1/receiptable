import { Tabs } from "expo-router/js-tabs";
import { Text, type ColorValue } from "react-native";
import { colors } from "../../components/theme";

function icon(glyph: string) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
  }
  return TabIcon;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Spending", tabBarIcon: icon("◎") }} />
      <Tabs.Screen name="reports" options={{ title: "Reports", tabBarIcon: icon("▤") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: icon("⚙") }} />
    </Tabs>
  );
}
