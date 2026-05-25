import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { AppBar, BackButton, Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { HelpChip, HelpEmptyState, HelpErrorState, HelpSearchInput, HelpSearchResultCard } from "@/features/help/components";
import { searchHelp } from "@/features/help/helpApi";
import { helpLanguageForLocale, type HelpLanguage, type HelpSearchResponse } from "@/features/help/types";
import { normalizeLocale, t } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";

const HELP_TEXT_SCALE = 1;

export function HelpSearchScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { locale } = useLocale();
  const language: HelpLanguage = helpLanguageForLocale(normalizeLocale(locale));
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<HelpSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const trimmedQuery = query.trim();

  const runSearch = useCallback(async (nextQuery: string) => {
    const clean = nextQuery.trim();
    if (!clean) {
      setResponse(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setFailed(false);
    try {
      const result = await searchHelp(clean, language);
      if (requestIdRef.current === requestId) setResponse(result);
    } catch (error) {
      console.warn("Failed to search Help", error);
      if (requestIdRef.current === requestId) setFailed(true);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  function selectChip(chip: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(chip);
    void runSearch(chip);
  }

  return (
    <Screen>
      <AppBar compact title={t("help.search.title")} left={<BackButton onPress={() => router.back()} />} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <HelpSearchInput
          value={query}
          placeholder={t("help.search.placeholder")}
          onChangeText={setQuery}
          onClear={() => setQuery("")}
        />

        {!trimmedQuery ? (
          <View style={styles.chips}>
            {suggestedChips().map((chip) => (
              <HelpChip key={chip} label={chip} onPress={() => selectChip(chip)} />
            ))}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : failed ? (
          <HelpErrorState onRetry={() => void runSearch(query)} onScan={() => router.push("/scan/new")} />
        ) : trimmedQuery && response?.results_count === 0 ? (
          <HelpEmptyState
            title={t("help.search.emptyTitle")}
            subtitle={t("help.search.emptySubtitle")}
            primaryLabel={t("help.guide.ctaScan")}
            onPrimary={() => router.push("/scan/new")}
          />
        ) : response && response.results.length > 0 ? (
          <View style={styles.results}>
            <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.sectionTitle}>{t("help.search.resultsTitle")}</Text>
            <View style={styles.cards}>
              {response.results.map((result) => (
                <HelpSearchResultCard
                  key={`${result.type}-${result.slug}`}
                  result={result}
                  onPress={() => {
                    if (result.type === "guide") router.push(`/help/guide/${result.slug}`);
                    else router.push(`/help/category/${result.slug}`);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function suggestedChips() {
  return t("help.search.suggestedChips").split("|").filter(Boolean);
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, paddingBottom: 110, gap: 16 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    loading: { paddingVertical: 26 },
    results: { gap: 12 },
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
