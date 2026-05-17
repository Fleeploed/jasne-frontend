import { useMemo } from "react";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { AppIcon } from "@/components/AppIcon";
import { useColors, type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";

export default function AppLayout() {
  const colors = useColors();
  // Subscribe to locale so the layout re-renders when the user switches language.
  // Without this, Tabs' `title`/`tabBarLabel` props are evaluated once and stay
  // in the original language until the app is reloaded.
  useLocale();

  return (
    <Tabs
      tabBar={(props) => <MockupTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontWeight: "800" },
        headerShadowVisible: false
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.documents"),
          tabBarLabel: t("tabs.documents"),
          tabBarIcon: ({ color }) => <TabGlyph name="docs" color={color} />
        }}
      />
      <Tabs.Screen
        name="deadlines"
        options={{
          title: t("tabs.deadlines"),
          tabBarLabel: t("tabs.deadlines"),
          tabBarIcon: ({ color }) => <TabGlyph name="deadlines" color={color} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          tabBarLabel: t("tabs.profile"),
          tabBarIcon: ({ color }) => <TabGlyph name="profile" color={color} />
        }}
      />
      <Tabs.Screen name="scan/new" options={{ href: null, title: t("routes.newScan") }} />
      <Tabs.Screen name="scan/[id]" options={{ href: null, title: t("routes.thread") }} />
    </Tabs>
  );
}

type TabIcon = "docs" | "deadlines" | "profile";
const tabIconByRoute: Record<string, TabIcon> = {
  index: "docs",
  deadlines: "deadlines",
  profile: "profile",
};
function getTabLabel(route: string): string {
  if (route === "index") return t("tabs.documents");
  if (route === "deadlines") return t("tabs.deadlines");
  if (route === "profile") return t("tabs.profile");
  return route;
}

function TabGlyph({ name, color }: { name: "docs" | "deadlines" | "profile"; color: string }) {
  const iconName = name === "docs" ? "doc-text" : name === "deadlines" ? "calendar" : "user";
  return <AppIcon name={iconName} size={23} color={color} strokeWidth={1.8} />;
}

function MockupTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  // Subscribe so labels rebuild when locale changes
  useLocale();
  const styles = useMemo(() => createTabStyles(colors), [colors]);

  const currentRoute = state.routes[state.index];
  if (!currentRoute || !tabIconByRoute[currentRoute.name]) {
    return null;
  }

  const visibleRoutes = state.routes.filter((route) => tabIconByRoute[route.name]);

  return (
    <View style={styles.tabbar}>
      {visibleRoutes.map((route) => {
        const routeIndex = state.routes.findIndex((item) => item.key === route.key);
        const focused = state.index === routeIndex;
        const icon = tabIconByRoute[route.name];
        const label = getTabLabel(route.name);

        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true
              });

              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <TabGlyph name={icon} color={focused ? colors.primary : colors.muted2} />
            <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createTabStyles(colors: ColorPalette) {
  return StyleSheet.create({
    tabbar: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: 7,
      paddingBottom: 30
    },
    tab: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 5 },
    tabLabel: { color: colors.muted2, fontSize: 10, fontWeight: "500" },
    tabLabelActive: { color: colors.primary, fontWeight: "700" },
    pressed: { opacity: 0.7 }
  });
}
