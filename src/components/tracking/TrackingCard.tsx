import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { ActionSheet } from "@/components/ActionSheet";
import { AppIcon } from "@/components/AppIcon";
import { TrackingTypeRenderer } from "@/components/tracking/TrackingTypeRenderer";
import { fonts, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import { trackingConfigFor, type TrackingTone } from "@/constants/trackings";
import { useStopTracking } from "@/hooks/useTrackings";
import { formatLocalizedDate, getLocale, t } from "@/lib/i18n";
import type { Tracking } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";

export function TrackingCard({ tracking }: { tracking: Tracking }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const config = trackingConfigFor(tracking.tracking_type);
  const stopTracking = useStopTracking();
  const [sheetVisible, setSheetVisible] = useState(false);
  const status = tracking.current_status ?? "unknown";
  const tone = config?.statusColors[status] ?? "gray";

  useEffect(() => {
    trackEvent("tracking_card_viewed", {
      tracking_type: tracking.tracking_type,
      current_status: status,
    });
  }, [status, tracking.tracking_type]);

  const open = useCallback(() => {
    trackEvent("tracking_card_tapped", {
      tracking_type: tracking.tracking_type,
      current_status: status,
    });
    if (!config) return;
    router.push({
      pathname: config.detailRoute,
      params: {
        identifier: tracking.identifier,
        status,
      },
    });
  }, [config, status, tracking.identifier, tracking.tracking_type]);

  const confirmStop = useCallback(() => {
    Alert.alert(
      t("tracking.stopConfirm.title"),
      t("tracking.stopConfirm.message"),
      [
        { text: t("tracking.stopConfirm.cancel"), style: "cancel" },
        {
          text: t("tracking.stopConfirm.confirm"),
          style: "destructive",
          onPress: () => {
            stopTracking.mutate(tracking, {
              onSuccess: () => {
                trackEvent("tracking_stopped_from_deadlines", {
                  tracking_type: tracking.tracking_type,
                });
              },
            });
          },
        },
      ],
    );
  }, [stopTracking, tracking]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("tracking.section.title")}: ${tracking.identifier}`}
        onPress={open}
        onLongPress={() => setSheetVisible(true)}
        delayLongPress={350}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.iconSlot}>
          <AppIcon name={config?.icon ?? "bell"} size={22} color={colors.primary} strokeWidth={1.9} />
        </View>
        <View style={styles.copy}>
          <View style={styles.topRow}>
            <View style={[styles.statusDot, { backgroundColor: dotColor(tone, colors) }]} />
            <Text style={styles.lastChecked} numberOfLines={1}>
              {t("tracking.lastCheckedAt", { time: relativeTimestamp(tracking.last_checked_at) })}
            </Text>
          </View>
          <View style={styles.bodyRow}>
            <TrackingTypeRenderer tracking={tracking} />
            <AppIcon name="chevron-right" size={18} color={colors.muted3} strokeWidth={2} />
          </View>
        </View>
      </Pressable>
      <ActionSheet
        visible={sheetVisible}
        title={tracking.identifier}
        subtitle={tracking.current_status ?? undefined}
        onClose={() => setSheetVisible(false)}
        actions={[
          {
            key: "open",
            label: t("tracking.actions.open"),
            icon: "doc",
            onPress: open,
          },
          {
            key: "stop",
            label: t("tracking.actions.stop"),
            icon: "x",
            destructive: true,
            onPress: confirmStop,
          },
        ]}
      />
    </>
  );
}

function dotColor(tone: TrackingTone, colors: ColorPalette) {
  if (tone === "green") return colors.green;
  if (tone === "red") return colors.danger;
  if (tone === "amber") return colors.amber;
  return colors.muted3;
}

function relativeTimestamp(value: string | null) {
  if (!value) return t("tracking.notCheckedYet");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("tracking.notCheckedYet");
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  if (absMs < 60_000) return t("tracking.justNow");
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const [unit, size] = units.find(([, unitMs]) => absMs >= unitMs) ?? ["minute", 60_000];
  try {
    return new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }).format(
      Math.round(diffMs / size),
      unit,
    );
  } catch {
    return formatLocalizedDate(date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      minHeight: 88,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    iconSlot: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface2,
    },
    copy: {
      flex: 1,
      gap: 7,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    lastChecked: {
      flex: 1,
      color: colors.muted3,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.caption1,
    },
    bodyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
