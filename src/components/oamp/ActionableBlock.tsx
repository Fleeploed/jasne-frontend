import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { fonts, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import { OAMP_DOCUMENTS_FOR_PREVZETI, OAMP_PHONE_TEL, type OampStatus } from "@/constants/oamp";
import { useOampHours } from "@/hooks/useOampHours";
import { trackEvent } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { TrackingPlate } from "@/components/oamp/TrackingPlate";

export function ActionableBlock({
  status,
  cisloJednaci,
  intervalHint,
  isPro,
  isTracking,
  onEditPress,
  onRescanPress,
  onTrackPress,
  trackingBusy,
}: {
  status: OampStatus;
  cisloJednaci: string;
  intervalHint?: string;
  isPro: boolean;
  isTracking: boolean;
  onEditPress: () => void;
  onRescanPress: () => void;
  onTrackPress: () => void;
  trackingBusy?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hours = useOampHours();
  const [documentsOpen, setDocumentsOpen] = useState(false);

  if (status === "probiha") {
    return (
      <View style={styles.block}>
        <View style={styles.hintRow}>
          <Ionicons name="hourglass-outline" size={19} color={colors.amberDark} />
          <Text style={styles.hintText}>{t("oamp.status.probiha.waitingTimeHint")}</Text>
        </View>
        <TrackingPlate intervalHint={intervalHint} isPro={isPro} isTracking={isTracking} loading={trackingBusy} onPress={onTrackPress} />
      </View>
    );
  }

  if (status === "schvaleno") {
    return (
      <View style={styles.block}>
        <PrimaryAction
          icon="call-outline"
          label={t("oamp.actionables.callCenter")}
          onPress={() => {
            trackEvent("oamp_call_tapped");
            void Linking.openURL(`tel:${OAMP_PHONE_TEL}`);
          }}
        />
        <View style={styles.hoursRow}>
          <View style={[styles.statusDot, hours.isOpen ? styles.openDot : styles.closedDot]} />
          <Text style={styles.hoursText}>
            {hours.isOpen ? t("oamp.actionables.openNow") : hours.nextOpenLabel}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("oamp.status.schvaleno.documentsTitle")}
          onPress={() => setDocumentsOpen((current) => !current)}
          style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}
        >
          <Text style={styles.disclosureTitle}>{t("oamp.status.schvaleno.documentsTitle")}</Text>
          <Ionicons name={documentsOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.muted2} />
        </Pressable>
        {documentsOpen ? (
          <View style={styles.documentList}>
            {OAMP_DOCUMENTS_FOR_PREVZETI.map((key) => (
              <View key={key} style={styles.documentRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.greenDark} />
                <Text style={styles.documentText}>{t(key)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (status === "zamitnuto") {
    return (
      <View style={styles.block}>
        <PrimaryAction
          icon="document-text-outline"
          label={t("oamp.status.zamitnuto.nextStepCta")}
          onPress={() => router.push({ pathname: "/oamp/odvolani-guide", params: { cisloJednaci } })}
        />
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <SecondaryAction icon="create-outline" label={t("oamp.status.not_found.editCta")} onPress={onEditPress} />
      <SecondaryAction icon="scan-outline" label={t("oamp.status.not_found.rescanCta")} onPress={onRescanPress} />
    </View>
  );
}

function PrimaryAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryPressed]}
    >
      <Ionicons name={icon} size={21} color={colors.textOnAccent} />
      <Text style={styles.primaryActionText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={colors.brandBlue} />
      <Text style={styles.secondaryActionText}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    block: {
      gap: 12,
    },
    hintRow: {
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.warningBg,
      borderWidth: 1,
      borderColor: colors.amberMid,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    hintText: {
      flex: 1,
      color: colors.amberDeep,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
    },
    primaryAction: {
      minHeight: 56,
      borderRadius: 17,
      backgroundColor: colors.brandBlue,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 18,
    },
    primaryPressed: {
      opacity: 0.86,
    },
    primaryActionText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.button,
    },
    secondaryAction: {
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 16,
    },
    secondaryActionText: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
    },
    hoursRow: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 10,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    openDot: {
      backgroundColor: colors.greenDark,
    },
    closedDot: {
      backgroundColor: colors.amberDark,
    },
    hoursText: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.footnote,
    },
    disclosure: {
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 15,
    },
    disclosureTitle: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
    },
    documentList: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 12,
    },
    documentRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    documentText: {
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
