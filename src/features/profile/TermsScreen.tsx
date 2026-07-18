import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { router } from "expo-router";
import { parse } from "yaml";

import { AppIcon } from "@/components/AppIcon";
import { Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { getLocale, normalizeLocale, t } from "@/lib/i18n";

import termsContentAsset from "./terms.yaml";

type TermsSection = {
  number: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type TermsDocument = {
  title: string;
  meta: {
    effective: string;
    version: string;
  };
  footer: string;
  sections: TermsSection[];
};

type TermsFile = Partial<Record<ReturnType<typeof normalizeLocale>, TermsDocument>>;

let cachedTermsFile: TermsFile | null = null;

async function loadTermsFile() {
  if (cachedTermsFile) return cachedTermsFile;

  const asset = Asset.fromModule(termsContentAsset);
  await asset.downloadAsync();

  const uri = asset.localUri ?? asset.uri;
  const source = uri.startsWith("http")
    ? await fetch(uri).then((response) => response.text())
    : await FileSystem.readAsStringAsync(uri);

  cachedTermsFile = parse(source) as TermsFile;
  return cachedTermsFile;
}

function selectTermsContent(file: TermsFile, locale: string): TermsDocument {
  const normalizedLocale = normalizeLocale(locale);
  const content = file[normalizedLocale] ?? file.cs;
  if (!content) throw new Error("Terms YAML does not contain a cs fallback.");
  return content;
}

export function TermsScreen({
  onBack,
  backLabel,
  localeOverride,
}: {
  onBack?: () => void;
  backLabel?: string;
  localeOverride?: string;
} = {}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const locale = localeOverride ?? getLocale();
  const [termsContent, setTermsContent] = useState<TermsDocument | null>(null);

  useEffect(() => {
    let isActive = true;

    loadTermsFile()
      .then((file) => {
        if (isActive) setTermsContent(selectTermsContent(file, locale));
      })
      .catch((error) => {
        logger.warn("Failed to load terms YAML", error);
      });

    return () => {
      isActive = false;
    };
  }, [locale]);

  const title = termsContent?.title ?? t("profile.terms");
  const displayTitle = title === "Условия использования" ? "Условия\nиспользования" : title;

  return (
    <Screen>
      <View style={styles.backBar}>
        <Pressable
          onPress={onBack ?? (() => router.back())}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <AppIcon name="chevron-left" size={22} color={colors.brandBlue} />
          <Text style={styles.backText}>{backLabel ?? t("profile.title")}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={2}
            style={styles.title}
          >
            {displayTitle}
          </Text>
          {termsContent ? (
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{termsContent.meta.effective}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta}>{termsContent.meta.version}</Text>
            </View>
          ) : null}
        </View>

        {termsContent ? (
          <View style={styles.sections}>
            {termsContent.sections.map((section, index) => (
              <View key={section.number} style={styles.section}>
                <Text style={styles.sectionNumber}>{section.number}</Text>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionBody}>
                  {section.paragraphs.map((paragraph, paragraphIndex) => (
                    <Text key={`${section.number}-${paragraphIndex}`} selectable style={styles.paragraph}>
                      {paragraph.trim()}
                    </Text>
                  ))}
                  {section.bullets ? (
                    <View style={styles.bulletList}>
                      {section.bullets.map((bullet, bulletIndex) => (
                        <View key={`${section.number}-bullet-${bulletIndex}`} style={styles.bulletRow}>
                          <Text style={styles.bulletMark}>•</Text>
                          <Text selectable style={styles.bulletText}>{bullet.trim()}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
                {index < termsContent.sections.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brandBlue} />
          </View>
        )}

        {termsContent ? <Text style={styles.footer}>{termsContent.footer}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backBar: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 6,
      minHeight: 54,
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      alignSelf: "flex-start",
      minHeight: 44,
      paddingRight: 12,
    },
    backText: {
      color: colors.brandBlue,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowTitle,
      fontWeight: "600",
    },
    pressed: { opacity: 0.72 },
    scroll: { flex: 1, backgroundColor: colors.bg },
    content: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 120,
    },
    hero: {
      gap: 8,
      marginBottom: 32,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.screenTitle,
      fontWeight: "800",
      letterSpacing: 0,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      columnGap: 14,
      rowGap: 4,
    },
    meta: {
      color: colors.muted3,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    metaDot: {
      color: colors.muted3,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    sections: { gap: 30 },
    loading: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 48,
    },
    section: { gap: 12 },
    sectionNumber: {
      color: colors.muted3,
      fontFamily: fonts.displayBold,
      ...typeStyles.largeScreenTitle,
      fontWeight: "800",
    },
    sectionTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.title3,
      fontWeight: "800",
      letterSpacing: 0,
    },
    sectionBody: { gap: 14 },
    paragraph: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.body,
      lineHeight: 26,
      fontWeight: "400",
    },
    bulletList: {
      gap: 8,
      paddingTop: 2,
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    bulletMark: {
      color: colors.muted3,
      fontFamily: fonts.bodyBold,
      ...typeStyles.body,
      lineHeight: 26,
      fontWeight: "700",
    },
    bulletText: {
      flex: 1,
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.body,
      lineHeight: 26,
      fontWeight: "400",
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: 16,
    },
    footer: {
      color: colors.muted3,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.caption1,
      fontWeight: "500",
      textAlign: "center",
      marginTop: 44,
    },
  });
}
