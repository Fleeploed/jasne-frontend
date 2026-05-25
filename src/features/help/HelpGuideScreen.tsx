import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { AppBar, BackButton, Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { HelpContentRenderer, HelpEmptyState, HelpErrorState, HelpLoadingState } from "@/features/help/components";
import { getHelpGuide } from "@/features/help/helpApi";
import { helpLanguageForLocale, type CtaAction, type HelpGuideDetailResponse, type HelpLanguage } from "@/features/help/types";
import { normalizeLocale, t } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";

const HELP_TEXT_SCALE = 1;

export function HelpGuideScreen() {
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { locale } = useLocale();
  const language: HelpLanguage = helpLanguageForLocale(normalizeLocale(locale));
  const aliveRef = useRef(true);
  const [guide, setGuide] = useState<HelpGuideDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    setNotFound(false);
    setLoading(true);
    try {
      const response = await getHelpGuide(slug, language);
      if (!aliveRef.current) return;
      setGuide(response);
    } catch (error) {
      console.warn("Failed to load Help guide", error);
      if (!aliveRef.current) return;
      if (isNotFound(error)) setNotFound(true);
      else setFailed(true);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [language, slug]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await getHelpGuide(slug, language);
      if (!aliveRef.current) return;
      setGuide(response);
      setFailed(false);
      setNotFound(false);
    } catch (error) {
      console.warn("Failed to refresh Help guide", error);
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, [language, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !guide) {
    return (
      <Screen>
        <HelpLoadingState />
      </Screen>
    );
  }

  if (notFound) {
    return (
      <Screen>
        <AppBar compact title={t("help.guide.notFoundTitle")} left={<BackButton onPress={() => router.back()} />} />
        <HelpEmptyState
          title={t("help.guide.notFoundTitle")}
          subtitle={t("help.guide.notFoundSubtitle")}
          primaryLabel={t("help.category.backToHelp")}
          onPrimary={() => router.push("/help")}
        />
      </Screen>
    );
  }

  if (failed || !guide) {
    return (
      <Screen>
        <AppBar compact title={t("help.tabLabel")} left={<BackButton onPress={() => router.back()} />} />
        <HelpErrorState onRetry={load} onScan={() => router.push("/scan/new")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar compact title={guide.title} subtitle={guide.subtitle ?? guide.category.title} left={<BackButton onPress={() => router.back()} />} />
      <View style={styles.wrap}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(132, insets.bottom + 120) }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.muted2}
              colors={[colors.primary]}
            />
          }
        >
          {guide.fallback_language ? (
            <View style={styles.fallbackNote}>
              <Ionicons name="information-circle-outline" size={17} color={colors.primary} />
              <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.fallbackText}>{fallbackLanguageNote(guide.fallback_language)}</Text>
            </View>
          ) : null}
          <HelpContentRenderer sections={guide.sections} onAction={handleCtaAction} />
        </ScrollView>
        <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable onPress={() => router.push("/scan/new")} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Ionicons name="camera-outline" size={19} color={colors.textOnAccent} />
            <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.primaryButtonText}>{t("help.guide.ctaScan")}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/deadlines")} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.textButtonText}>{t("help.guide.ctaManualDeadline")}</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function handleCtaAction(action: CtaAction) {
  if (action === "scan_document" || action === "scan_oamp_letter" || action === "scan_tax_letter" || action === "scan_bill" || action === "scan_contract") {
    router.push("/scan/new");
    return;
  }
  // Manual deadline creation is a local DeadlinesScreen modal, so Help routes to the tab.
  if (action === "add_deadline" || action === "add_deadline_manual" || action === "open_deadlines") {
    router.push("/deadlines");
    return;
  }
  if (action === "open_help_center") {
    router.push("/help");
    return;
  }
  console.warn("Unknown Help CTA action", action);
}

function fallbackLanguageNote(language: HelpLanguage) {
  if (language === "ru") return t("help.guide.fallbackLanguageNoteRu");
  if (language === "cs") return t("help.guide.fallbackLanguageNoteCs");
  if (language === "uk") return t("help.guide.fallbackLanguageNoteUk");
  return t("help.guide.fallbackLanguageNoteEn");
}

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, gap: 12 },
    fallbackNote: {
      borderRadius: 14,
      backgroundColor: colors.blueSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    fallbackText: { flex: 1, color: colors.primary, fontFamily: fonts.bodySemiBold, ...typeStyles.caption1 },
    sticky: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 6
    },
    primaryButton: {
      minHeight: 50,
      borderRadius: 16,
      backgroundColor: colors.primaryDark,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 10
    },
    primaryButtonText: { color: colors.textOnAccent, fontFamily: fonts.bodyBold, ...typeStyles.button },
    textButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
    textButtonText: { color: colors.primary, fontFamily: fonts.bodyBold, ...typeStyles.rowSecondary },
    pressed: { opacity: 0.72 }
  });
}
