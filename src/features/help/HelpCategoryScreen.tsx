import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppBar, BackButton, Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { HelpActionCard, HelpCard, HelpEmptyState, HelpErrorState, HelpGuideCard, HelpLoadingState, ScanCtaCard } from "@/features/help/components";
import { getHelpCategory } from "@/features/help/helpApi";
import { helpLanguageForLocale, type HelpCategoryDetailResponse, type HelpLanguage } from "@/features/help/types";
import { normalizeLocale, t } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";

const HELP_TEXT_SCALE = 1;

export function HelpCategoryScreen() {
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { locale } = useLocale();
  const language: HelpLanguage = helpLanguageForLocale(normalizeLocale(locale));
  const aliveRef = useRef(true);
  const [category, setCategory] = useState<HelpCategoryDetailResponse | null>(null);
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
      const response = await getHelpCategory(slug, language);
      if (!aliveRef.current) return;
      setCategory(response);
    } catch (error) {
      console.warn("Failed to load Help category", error);
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
      const response = await getHelpCategory(slug, language);
      if (!aliveRef.current) return;
      setCategory(response);
      setFailed(false);
      setNotFound(false);
    } catch (error) {
      console.warn("Failed to refresh Help category", error);
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, [language, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !category) {
    return (
      <Screen>
        <HelpLoadingState />
      </Screen>
    );
  }

  if (notFound) {
    return (
      <Screen>
        <AppBar compact title={t("help.category.notFoundTitle")} left={<BackButton onPress={() => router.back()} />} />
        <HelpEmptyState
          title={t("help.category.notFoundTitle")}
          subtitle={t("help.category.notFoundSubtitle")}
          primaryLabel={t("help.category.backToHelp")}
          onPrimary={() => router.push("/help")}
        />
      </Screen>
    );
  }

  if (failed || !category) {
    return (
      <Screen>
        <AppBar compact title={t("help.tabLabel")} left={<BackButton onPress={() => router.back()} />} />
        <HelpErrorState onRetry={load} onScan={() => router.push("/scan/new")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar compact title={category.title} subtitle={category.subtitle ?? undefined} left={<BackButton onPress={() => router.back()} />} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <HelpCard
          title={category.hero.title ?? category.title}
          subtitle={category.hero.text}
          badge={category.hero.badge}
          icon="folder-open-outline"
          iconTone="blue"
          style={styles.hero}
        />

        {category.guides.length > 0 ? (
          <View style={styles.section}>
            <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.sectionTitle}>{t("help.category.guidesTitle")}</Text>
            <View style={styles.cards}>
              {category.guides.map((guide) => (
                <HelpGuideCard
                  key={guide.slug}
                  title={guide.title}
                  subtitle={guide.subtitle}
                  label={guide.subtitle ? null : t("help.category.guideLabel")}
                  onPress={() => router.push(`/help/guide/${guide.slug}`)}
                />
              ))}
            </View>
          </View>
        ) : category.fallback ? (
          <View style={styles.section}>
            <HelpCard title={category.fallback.title} subtitle={category.fallback.text} icon="shield-outline" iconTone="neutral" />
            <ScanCtaCard
              cta={{
                title: t("help.category.fallbackCtaTitle"),
                subtitle: t("help.category.fallbackCtaSubtitle"),
                primary_button: t("help.guide.ctaScan"),
                primary_action: "scan_new",
                helper_text: null,
                pro_hint: null,
              }}
              onPress={() => router.push("/scan/new")}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.sectionTitle}>{t("help.category.usefulActionsTitle")}</Text>
          <View style={styles.cards}>
            {category.useful_actions.map((action) => (
              <HelpActionCard key={action.key} action={action} onPress={handlerForAction(action.action)} />
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function handlerForAction(action: string) {
  if (action === "status_check") return () => router.push("/help/status");
  if (action === "scan_new") return () => router.push("/scan/new");
  // Manual deadline creation is a local DeadlinesScreen modal, so Help routes to the tab.
  if (action === "deadline_new" || action === "deadlines_tab") return () => router.push("/deadlines");
  console.warn("Unknown Help useful action", action);
  return undefined;
}

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, paddingBottom: 110, gap: 22 },
    hero: { minHeight: 118, alignItems: "flex-start" },
    section: { gap: 12 },
    sectionTitle: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      letterSpacing: 2.4,
      textTransform: "uppercase"
    },
    cards: { gap: 12 }
  });
}
