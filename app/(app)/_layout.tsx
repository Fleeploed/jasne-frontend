import { useMemo } from "react";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { AppIcon } from "@/components/AppIcon";
import { fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
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
        sceneStyle: { backgroundColor: colors.bg },
        headerShown: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontFamily: fonts.bodyExtraBold, ...typeStyles.headline, fontWeight: "800" },
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
        name="help"
        options={{
          title: t("help.tabLabel"),
          tabBarLabel: t("help.tabLabel"),
          tabBarIcon: ({ color }) => <TabGlyph name="help" color={color} />
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
    </Tabs>
  );
}

type TabIcon = "docs" | "deadlines" | "help" | "profile";
const tabIconByRoute: Record<string, TabIcon> = {
  index: "docs",
  deadlines: "deadlines",
  help: "help",
  profile: "profile",
};
function getTabLabel(route: string): string {
  if (route === "index") return t("tabs.documents");
  if (route === "deadlines") return t("tabs.deadlines");
  if (route === "help") return t("help.tabLabel");
  if (route === "profile") return t("tabs.profile");
  return route;
}

function TabGlyph({ name, color }: { name: TabIcon; color: string }) {
  // Fixed-height slot so icons with different intrinsic glyph metrics
  // (Ionicons help vs AppIcon calendar/doc-text/user) align on the same baseline.
  return (
    <View style={{ height: 26, alignItems: "center", justifyContent: "center" }}>
      {name === "help" ? (
        <Ionicons name="help-circle-outline" size={25} color={color} />
      ) : (
        <AppIcon
          name={name === "docs" ? "doc-text" : name === "deadlines" ? "calendar" : "user"}
          size={23}
          color={color}
          strokeWidth={1.8}
        />
      )}
    </View>
  );
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
            <Text maxFontSizeMultiplier={1} style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
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
    tabLabel: { color: colors.muted2, fontFamily: fonts.bodySemiBold, ...typeStyles.caption2, fontWeight: "600" },
    tabLabelActive: { color: colors.primary },
    pressed: { opacity: 0.7 }
  });
}
