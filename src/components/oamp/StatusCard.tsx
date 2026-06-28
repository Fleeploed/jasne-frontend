import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fonts, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import type { OampStatus } from "@/constants/oamp";
import { t } from "@/lib/i18n";

type StatusTone = {
  bg: string;
  border: string;
  iconBg: string;
  iconColor: string;
};

export function StatusCard({
  status,
  cisloJednaci,
}: {
  status: OampStatus;
  cisloJednaci: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tone = toneForStatus(status, colors);

  return (
    <View style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <View style={[styles.iconCircle, { backgroundColor: tone.iconBg }]}>
        <Ionicons name={iconForStatus(status)} size={30} color={tone.iconColor} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{t("oamp.status.label")}</Text>
        <Text style={styles.title}>{t(`oamp.status.${status}.title` as const)}</Text>
        <Text style={styles.summary}>
          {t(`oamp.status.${status}.summary` as const, { cisloJednaci })}
        </Text>
      </View>
    </View>
  );
}

function iconForStatus(status: OampStatus) {
  if (status === "schvaleno") return "checkmark-circle-outline" as const;
  if (status === "zamitnuto") return "close-circle-outline" as const;
  if (status === "not_found") return "help-circle-outline" as const;
  if (status === "error") return "alert-circle-outline" as const;
  return "time-outline" as const;
}

function toneForStatus(status: OampStatus, colors: ColorPalette): StatusTone {
  if (status === "schvaleno") {
    return { bg: colors.greenLight, border: colors.green, iconBg: colors.green, iconColor: colors.textOnAccent };
  }
  if (status === "zamitnuto") {
    return { bg: colors.dangerLight, border: colors.danger, iconBg: colors.danger, iconColor: colors.textOnAccent };
  }
  if (status === "not_found" || status === "error") {
    return { bg: colors.surface, border: colors.border, iconBg: colors.surface2, iconColor: colors.muted2 };
  }
  return { bg: colors.warningBg, border: colors.amberDark, iconBg: colors.amber, iconColor: colors.textOnAccent };
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      minHeight: 190,
      borderRadius: 22,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      paddingHorizontal: 22,
      paddingVertical: 24,
    },
    iconCircle: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: "center",
      justifyContent: "center",
    },
    copy: {
      gap: 8,
      alignItems: "center",
    },
    eyebrow: {
      color: colors.muted3,
      fontFamily: fonts.bodyBold,
      ...typeStyles.caption1,
      textAlign: "center",
      textTransform: "uppercase",
      letterSpacing: 0,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.title1,
      textAlign: "center",
    },
    summary: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.callout,
      textAlign: "center",
    },
  });
}
