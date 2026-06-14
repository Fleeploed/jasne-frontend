import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { AppBar, BackButton, Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { HelpContentRenderer, HelpEmptyState, HelpErrorState, HelpLoadingState } from "@/features/help/components";
import { getHelpGuide } from "@/features/help/helpApi";
import { helpLanguageForLocale, type CtaAction, type HelpGuideDetailResponse, type HelpLanguage } from "@/features/help/types";
import { getLimits } from "@/features/scans/scansApi";
import { normalizeLocale, t } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";
import type { UserPlan } from "@/lib/types";

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
  // Default to "free" so pro_only sections stay gated until we confirm Pro.
  const [userPlan, setUserPlan] = useState<UserPlan>("free");

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    getLimits()
      .then((res) => {
        if (aliveRef.current) setUserPlan(res.plan);
      })
      .catch(() => {
        // Keep the safe "free" default on failure.
      });
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
      logger.warn("Failed to load Help guide", error);
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
      logger.warn("Failed to refresh Help guide", error);
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
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(32, insets.bottom + 24) }]}
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
          <HelpContentRenderer
            sections={guide.sections}
            onAction={handleCtaAction}
            plan={userPlan}
          />
          {guide.updated_at ? (
            <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.updatedAt}>
              {formatGuideUpdatedAt(guide.updated_at, language)}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Screen>
  );
}

function handleCtaAction(action: CtaAction) {
  if (action === "check_status_visa") {
    router.push("/help/status");
    return;
  }
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
  logger.warn("Unknown Help CTA action", action);
}

function fallbackLanguageNote(language: HelpLanguage) {
  if (language === "ru") return t("help.guide.fallbackLanguageNoteRu");
  if (language === "cs") return t("help.guide.fallbackLanguageNoteCs");
  if (language === "uk") return t("help.guide.fallbackLanguageNoteUk");
  return t("help.guide.fallbackLanguageNoteEn");
}

function formatGuideUpdatedAt(value: string, language: HelpLanguage) {
  const updated = new Date(value);
  if (Number.isNaN(updated.getTime())) return null;

  const now = new Date();
  const updatedDay = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((today - updatedDay) / 86400000);

  if (dayDiff === 0) return t("help.guide.updatedToday", undefined, language);
  if (dayDiff === 1) return t("help.guide.updatedYesterday", undefined, language);

  const date = `${updated.getDate()}.${updated.getMonth() + 1}.${updated.getFullYear()}`;
  return t("help.guide.updatedOn", { date }, language);
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
    updatedAt: {
      color: colors.muted2,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.caption1,
      textAlign: "center",
      marginTop: 6
    }
  });
}
