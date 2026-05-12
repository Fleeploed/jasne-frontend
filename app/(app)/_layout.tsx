import { useMemo } from "react";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

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
  if (name === "docs") {
    return (
      <View style={glyphStyles.iconWrap}>
        <View style={[glyphStyles.chatGlyph, { borderColor: color }]} />
        <View style={[glyphStyles.chatTail, { borderTopColor: color }]} />
      </View>
    );
  }
  if (name === "deadlines") {
    return (
      <View style={glyphStyles.iconWrap}>
        <View style={[glyphStyles.calendarGlyph, { borderColor: color }]}>
          <View style={[glyphStyles.calendarLine, { backgroundColor: color }]} />
          <View style={[glyphStyles.calendarPin, { backgroundColor: color, left: 4 }]} />
          <View style={[glyphStyles.calendarPin, { backgroundColor: color, right: 4 }]} />
        </View>
      </View>
    );
  }
  return (
    <View style={glyphStyles.iconWrap}>
      <View style={[glyphStyles.profileHead, { borderColor: color }]} />
      <View style={[glyphStyles.profileBody, { borderColor: color }]} />
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
            <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Tab glyphs are pure geometry — color comes from props, no theme needed
const glyphStyles = StyleSheet.create({
  // All three icons live inside the same 22x22 wrap so layout heights match
  // and tab labels align horizontally on the same baseline.
  iconWrap: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },

  // Chat bubble (15h) + tail (4h) ≈ 19h total → vertically centred via wrap
  chatGlyph: { width: 18, height: 14, borderWidth: 1.5, borderRadius: 3, marginBottom: 4 },
  chatTail: { position: "absolute", bottom: 1, alignSelf: "center", marginLeft: -2, width: 0, height: 0, borderTopWidth: 4, borderRightWidth: 4, borderRightColor: "transparent" },

  // Calendar body (16h) + pins extend up 3 → 19h total → wrap centres it
  calendarGlyph: { width: 18, height: 16, borderWidth: 1.5, borderRadius: 3 },
  calendarLine: { position: "absolute", left: 0, right: 0, top: 4, height: 1.5 },
  calendarPin: { position: "absolute", top: -3, width: 1.5, height: 5, borderRadius: 1 },

  // Profile head (8h) + 1px gap + body (9h) = 18h → wrap centres it
  profileHead: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  profileBody: { width: 16, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 1.5, borderBottomWidth: 0, marginTop: 1 }
});

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
