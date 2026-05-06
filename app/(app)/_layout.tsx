import { useMemo } from "react";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { useColors, type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";

export default function AppLayout() {
  const colors = useColors();

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

const tabMeta: Record<string, { label: string; icon: "docs" | "deadlines" | "profile" }> = {
  index: { label: t("tabs.documents"), icon: "docs" },
  deadlines: { label: t("tabs.deadlines"), icon: "deadlines" },
  profile: { label: t("tabs.profile"), icon: "profile" }
};

function TabGlyph({ name, color }: { name: "docs" | "deadlines" | "profile"; color: string }) {
  if (name === "docs") {
    return (
      <View style={[glyphStyles.chatGlyph, { borderColor: color }]}>
        <View style={[glyphStyles.chatTail, { borderTopColor: color }]} />
      </View>
    );
  }
  if (name === "deadlines") {
    return (
      <View style={[glyphStyles.calendarGlyph, { borderColor: color }]}>
        <View style={[glyphStyles.calendarLine, { backgroundColor: color }]} />
        <View style={[glyphStyles.calendarPin, { backgroundColor: color, left: 4 }]} />
        <View style={[glyphStyles.calendarPin, { backgroundColor: color, right: 4 }]} />
      </View>
    );
  }
  return (
    <View style={glyphStyles.profileGlyph}>
      <View style={[glyphStyles.profileHead, { borderColor: color }]} />
      <View style={[glyphStyles.profileBody, { borderColor: color }]} />
    </View>
  );
}

function MockupTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const styles = useMemo(() => createTabStyles(colors), [colors]);

  const currentRoute = state.routes[state.index];
  if (!currentRoute || !tabMeta[currentRoute.name]) {
    return null;
  }

  const visibleRoutes = state.routes.filter((route) => tabMeta[route.name]);

  return (
    <View style={styles.tabbar}>
      {visibleRoutes.map((route) => {
        const routeIndex = state.routes.findIndex((item) => item.key === route.key);
        const focused = state.index === routeIndex;
        const meta = tabMeta[route.name];

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
            <TabGlyph name={meta.icon} color={focused ? colors.primary : colors.muted2} />
            <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Tab glyphs are pure geometry — color comes from props, no theme needed
const glyphStyles = StyleSheet.create({
  chatGlyph: { width: 19, height: 15, borderWidth: 1.5, borderRadius: 3 },
  chatTail: { position: "absolute", bottom: -5, left: 4, width: 0, height: 0, borderTopWidth: 5, borderRightWidth: 5, borderRightColor: "transparent" },
  calendarGlyph: { width: 19, height: 18, borderWidth: 1.5, borderRadius: 3 },
  calendarLine: { position: "absolute", left: 0, right: 0, top: 5, height: 1.5 },
  calendarPin: { position: "absolute", top: -3, width: 1.5, height: 5, borderRadius: 1 },
  profileGlyph: { width: 22, height: 22, alignItems: "center" },
  profileHead: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  profileBody: { position: "absolute", bottom: 1, width: 16, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 1.5, borderBottomWidth: 0 }
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
