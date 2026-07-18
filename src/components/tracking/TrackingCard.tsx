import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { ActionSheet } from "@/components/ActionSheet";
import { AppIcon } from "@/components/AppIcon";
import { PaywallSheet } from "@/components/PaywallSheet";
import { TrackingTypeRenderer } from "@/components/tracking/TrackingTypeRenderer";
import { fonts, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import { trackingConfigFor, type TrackingTone } from "@/constants/trackings";
import { useSubscription } from "@/hooks/useSubscription";
import { useCheckTracking, useStopTracking } from "@/hooks/useTrackings";
import { triggerLongPressHaptic } from "@/lib/haptics";
import { formatLocalizedDate, getLocale, t } from "@/lib/i18n";
import type { Tracking } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";

export function TrackingCard({ tracking }: { tracking: Tracking }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const config = trackingConfigFor(tracking.tracking_type);
  const stopTracking = useStopTracking();
  const checkTracking = useCheckTracking();
  const { isPro, loading: subscriptionLoading, refresh: refreshSubscription } = useSubscription();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const status = tracking.current_status ?? "unknown";
  const tone = config?.statusColors[status] ?? "gray";
  const statusLabel = localizedStatusLabel(tracking.tracking_type, status);
  // Background first-check is in flight when the row exists but the probe
  // hasn't landed yet — show that in the top row only. The action button
  // keeps its normal "Проверить снова" label so we don't have two
  // "Проверяем…" labels stacked on the same card.
  const firstCheckPending = tracking.last_checked_at == null;
  const checking = checkTracking.isPending;

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

  const checkAgain = useCallback(() => {
    trackEvent("tracking_check_again_tapped", {
      tracking_type: tracking.tracking_type,
      current_status: status,
    });
    checkTracking.mutate(tracking, {
      onError: (error) => {
        Alert.alert(
          t("tracking.checkAgainError.title"),
          error instanceof Error ? error.message : t("tracking.checkAgainError.message"),
        );
      },
    });
  }, [checkTracking, status, tracking]);

  const openSheet = useCallback(() => {
    triggerLongPressHaptic();
    setSheetVisible(true);
  }, []);

  return (
    <>
      <View style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("tracking.section.title")}: ${tracking.identifier}`}
          onPress={open}
          onLongPress={openSheet}
          delayLongPress={350}
          style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}
        >
          <View style={styles.iconSlot}>
            <AppIcon name={config?.icon ?? "bell"} size={22} color={colors.brandBlue} strokeWidth={1.9} />
          </View>
          <View style={styles.copy}>
            <View style={styles.topRow}>
              {firstCheckPending ? (
                <ActivityIndicator size="small" color={colors.brandBlue} style={styles.topRowSpinner} />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: dotColor(tone, colors) }]} />
              )}
              <Text style={styles.lastChecked} numberOfLines={1}>
                {firstCheckPending
                  ? t("tracking.actions.checking")
                  : t("tracking.lastCheckedAt", { time: relativeTimestamp(tracking.last_checked_at) })}
              </Text>
            </View>
            <View style={styles.bodyRow}>
              <TrackingTypeRenderer tracking={tracking} />
              <AppIcon name="chevron-right" size={18} color={colors.muted3} strokeWidth={2} />
            </View>
          </View>
        </Pressable>
        {firstCheckPending ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tracking.actions.checkAgain")}
            disabled={checking}
            onPress={checkAgain}
            style={({ pressed }) => [
              styles.checkButton,
              pressed && !checking && styles.pressed,
              checking && styles.disabled,
            ]}
          >
            {checking ? (
              <ActivityIndicator size="small" color={colors.brandBlue} />
            ) : (
              <AppIcon name="restore" size={17} color={colors.brandBlue} strokeWidth={2} />
            )}
            <Text style={styles.checkButtonText}>
              {checking ? t("tracking.actions.checking") : t("tracking.actions.checkAgain")}
            </Text>
          </Pressable>
        )}
        {!isPro && !subscriptionLoading ? (
          <View style={styles.proExpiredNote}>
            <AppIcon name="bell" size={16} color={colors.pro} strokeWidth={1.9} />
            <View style={styles.proExpiredTextBlock}>
              <Text style={styles.proExpiredText}>{t("tracking.proExpiredNote")}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("tracking.proExpiredCta")}
                onPress={() => setPaywallVisible(true)}
                style={({ pressed }) => [styles.proExpiredCta, pressed && styles.pressed]}
              >
                <Text style={styles.proExpiredCtaText}>{t("tracking.proExpiredCta")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
      <ActionSheet
        visible={sheetVisible}
        title={tracking.identifier}
        subtitle={statusLabel}
        onClose={() => setSheetVisible(false)}
        actions={[
          {
            key: "open",
            label: t("tracking.actions.open"),
            icon: "doc",
            onPress: open,
          },
          // Hide manual recheck while the background first check is still in
          // flight — kicking off a second probe in parallel would just race
          // with the one Azure DI is already running.
          ...(firstCheckPending
            ? []
            : [
                {
                  key: "check",
                  label: checking ? t("tracking.actions.checking") : t("tracking.actions.checkAgain"),
                  icon: "restore" as const,
                  disabled: checking,
                  onPress: checkAgain,
                },
              ]),
          {
            key: "stop",
            label: t("tracking.actions.stop"),
            icon: "x",
            destructive: true,
            onPress: confirmStop,
          },
        ]}
      />
      <PaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPurchase={() => {
          void refreshSubscription();
        }}
      />
    </>
  );
}

/**
 * Translate a raw tracker status code (e.g. "probiha") into a human-readable
 * localized label using the existing oamp.status.*.title i18n keys.
 * Falls back to the raw code so we never crash on a status the backend
 * introduces before the frontend translation is added.
 */
function localizedStatusLabel(trackingType: string, status: string): string | undefined {
  if (status === "unknown") return undefined;
  if (trackingType === "oamp_status") {
    // Treat the *_stopped variants as their base status — the label is the
    // same, only the polling cadence differs.
    const base = status === "not_found_stopped" ? "not_found" : status === "error_stopped" ? "error" : status;
    const key = `oamp.status.${base}.title`;
    // Status codes come from the backend dynamically — cast to the
    // translation key type and rely on the runtime fallback when a code
    // isn't translated yet.
    const translated = t(key as Parameters<typeof t>[0]);
    return translated === key ? status : translated;
  }
  return status;
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
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
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
    return formatLocalizedDate(date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
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
      padding: 12,
      gap: 10,
    },
    cardMain: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
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
    topRowSpinner: {
      // Match the visual footprint of the 8x8 dot so the row doesn't reflow
      // when the first check lands and the dot replaces the spinner.
      width: 14,
      height: 14,
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
    disabled: {
      opacity: 0.64,
    },
    checkButton: {
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 12,
    },
    checkButtonText: {
      color: colors.brandBlue,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.footnote,
    },
    proExpiredNote: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.pro,
      backgroundColor: colors.proLight,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    proExpiredTextBlock: {
      flex: 1,
      gap: 8,
    },
    proExpiredText: {
      color: colors.text,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.footnote,
    },
    proExpiredCta: {
      alignSelf: "flex-start",
    },
    proExpiredCtaText: {
      color: colors.pro,
      fontFamily: fonts.bodyBold,
      ...typeStyles.footnote,
    },
  });
}
