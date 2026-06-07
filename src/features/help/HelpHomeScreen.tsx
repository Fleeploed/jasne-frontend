import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { HelpErrorState, HelpHomeCategoryRow, HelpLoadingState, HelpQuickActionCard, ScanCtaCard } from "@/features/help/components";
import { getHelpHome } from "@/features/help/helpApi";
import { helpLanguageForLocale, type HelpHomeResponse, type HelpLanguage } from "@/features/help/types";
import { t, normalizeLocale } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";

const HELP_TEXT_SCALE = 1;
const REFRESH_SPINNER_MAX_MS = 1200;

export function HelpHomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { locale } = useLocale();
  const language: HelpLanguage = helpLanguageForLocale(normalizeLocale(locale));
  const aliveRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const refreshInFlightRef = useRef(false);
  const refreshRequestIdRef = useRef(0);
  useScrollToTop(scrollRef);
  const [home, setHome] = useState<HelpHomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    setLoading(true);
    try {
      const response = await getHelpHome(language);
      if (!aliveRef.current) return;
      setHome(response);
    } catch (error) {
      console.warn("Failed to load Help home", error);
      if (aliveRef.current) setFailed(true);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [language]);

  // Pull-to-refresh: bypass the full-screen loader by toggling `refreshing`
  // instead of `loading`. Errors during a refresh keep the existing content
  // on screen — better UX than blanking the page on a transient failure.
  const onRefresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    const spinnerTimeout = setTimeout(() => {
      if (aliveRef.current && refreshRequestIdRef.current === requestId) {
        setRefreshing(false);
      }
    }, REFRESH_SPINNER_MAX_MS);

    setRefreshing(true);
    try {
      const response = await getHelpHome(language);
      if (!aliveRef.current || refreshRequestIdRef.current !== requestId) return;
      setHome(response);
      setFailed(false);
    } catch (error) {
      console.warn("Failed to refresh Help home", error);
    } finally {
      clearTimeout(spinnerTimeout);
      if (aliveRef.current && refreshRequestIdRef.current === requestId) {
        setRefreshing(false);
      }
      if (refreshRequestIdRef.current === requestId) {
        refreshInFlightRef.current = false;
      }
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !home) {
    return (
      <Screen>
        <HelpLoadingState />
      </Screen>
    );
  }

  if (failed || !home) {
    return (
      <Screen>
        <HelpErrorState onRetry={load} onScan={() => router.push("/scan/new")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.title}>{t("help.home.title")}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/help/search")}
          style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}
        >
          <Ionicons name="search-outline" size={20} color={colors.muted2} />
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} numberOfLines={1} style={styles.searchPlaceholder}>{t("help.home.searchPlaceholder")}</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.muted2}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.section}>
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.sectionTitle}>{t("help.home.quickActionsTitle")}</Text>
          <View style={styles.quickCards}>
            {home.quick_actions
              .filter((action) => action.key !== "understand_letter" && action.key !== "prepare_documents")
              .map((action) => {
                const target = routeTarget(action.route, action.key);
                return (
                  <HelpQuickActionCard
                    key={action.key}
                    title={action.title}
                    subtitle={action.subtitle}
                    actionKey={action.key}
                    disabled={!target}
                    onPress={target ? () => router.push(target) : undefined}
                  />
                );
              })}
          </View>
        </View>

        <View style={styles.section}>
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.sectionTitle}>{t("help.home.popularTopics")}</Text>
          <View style={styles.categoryList}>
            {home.popular_categories.map((category, index) => (
              <HelpHomeCategoryRow
                key={category.slug}
                category={category}
                position={positionForIndex(index, home.popular_categories.length)}
                onPress={() => router.push(`/help/category/${category.slug}`)}
              />
            ))}
          </View>
        </View>

        <View style={styles.scanCtaWrap}>
          <ScanCtaCard cta={home.scan_cta} onPress={() => router.push("/scan/new")} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function positionForIndex(index: number, total: number) {
  if (total <= 1) return "single" as const;
  if (index === 0) return "first" as const;
  if (index === total - 1) return "last" as const;
  return "middle" as const;
}

function routeTarget(route: string, key: string) {
  if (key === "check_status" || route === "/help/status") return "/help/status" as const;
  if (route === "/scan/new") return "/scan/new" as const;
  if (route.startsWith("/help/categories/")) return route.replace("/help/categories/", "/help/category/") as `/help/category/${string}`;
  if (route.startsWith("/help/category/")) return route as `/help/category/${string}`;
  if (route.startsWith("/help/guides/")) return route.replace("/help/guides/", "/help/guide/") as `/help/guide/${string}`;
  if (route.startsWith("/help/guide/")) return route as `/help/guide/${string}`;
  console.warn("Unknown Help route", route);
  return null;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.bg },
    content: {
      paddingHorizontal: 16,
      paddingTop: 26,
      paddingBottom: 110,
      gap: 26
    },
    hero: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 10,
      gap: 16,
      backgroundColor: colors.bg,
    },
    title: {
      color: colors.primaryDark,
      fontFamily: fonts.displayBold,
      ...typeStyles.largeScreenTitle,
      fontWeight: "800",
      letterSpacing: -1
    },
    searchBar: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12
    },
    searchPlaceholder: {
      flex: 1,
      color: colors.muted3,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary
    },
    pressed: { opacity: 0.72 },
    section: { gap: 12 },
    sectionTitle: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      letterSpacing: 1.4,
      textTransform: "uppercase"
    },
    quickCards: { gap: 10 },
    categoryList: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      overflow: "hidden"
    },
    scanCtaWrap: { marginTop: -4 }
  });
}
