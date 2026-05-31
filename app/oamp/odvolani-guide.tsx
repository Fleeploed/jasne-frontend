import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { fonts, Screen, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import { t } from "@/lib/i18n";

const ODVOLANI_STEP_KEYS = ["oamp.odvolani.step1", "oamp.odvolani.step2", "oamp.odvolani.step3"] as const;

export default function OdvolaniGuideRoute() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cisloJednaci } = useLocalSearchParams<{ cisloJednaci?: string }>();

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>{t("oamp.odvolani.title")}</Text>
        <View style={styles.topSpacer} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.kicker}>OAMP</Text>
          <Text style={styles.title}>{t("oamp.odvolani.heading")}</Text>
          {cisloJednaci ? <Text style={styles.caseNumber}>{cisloJednaci}</Text> : null}
          <Text style={styles.body}>{t("oamp.odvolani.body")}</Text>
        </View>
        {ODVOLANI_STEP_KEYS.map((key, index) => (
          <View key={key} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>{t(key)}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    topBar: {
      minHeight: 50,
      paddingHorizontal: 12,
      paddingTop: 5,
      paddingBottom: 5,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg,
    },
    backButton: {
      width: 44,
      minHeight: 44,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    topTitle: {
      flex: 1,
      textAlign: "center",
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.headline,
    },
    topSpacer: {
      width: 44,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 40,
      gap: 14,
    },
    card: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      padding: 20,
      gap: 10,
    },
    kicker: {
      color: colors.primary,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    title: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.title2,
    },
    caseNumber: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.callout,
    },
    body: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.callout,
    },
    stepRow: {
      minHeight: 64,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 14,
    },
    stepNumber: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    stepNumberText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.footnote,
    },
    stepText: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.callout,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
