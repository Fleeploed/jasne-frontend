import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { fonts, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import { normalizeOampIdentifier } from "@/features/chat/oampIdentifier";
import { useCreateTracking, useTrackings } from "@/hooks/useTrackings";
import { trackEvent } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import type { Tracking, UserPlan } from "@/lib/types";

/**
 * Offer card shown inside a scan's result_card when an OAMP číslo jednací is
 * detected in the document. Pro users can enable automatic status tracking with
 * one tap; free users are routed to the paywall. The card is the chat-thread
 * counterpart of the TrackingPlate on the status-result screen, and it honours
 * the single-active-tracking limit (see backend MAX_ACTIVE_TRACKINGS_PER_TYPE).
 */
export function OampTrackingOffer({ identifier, plan }: { identifier: string; plan: UserPlan }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isPro = plan === "pro";
  const trackings = useTrackings("oamp_status");
  const createTracking = useCreateTracking();
  const [optimisticActive, setOptimisticActive] = useState(false);
  const normalizedIdentifier = normalizeOampIdentifier(identifier);

  const activeTrackings = useMemo<Tracking[]>(
    () => (trackings.data ?? []).filter((item: Tracking) => item.tracking_type === "oamp_status"),
    [trackings.data],
  );
  const thisTracking = useMemo<Tracking | null>(
    () =>
      activeTrackings.find(
        (item) => normalizeOampIdentifier(item.identifier) === normalizedIdentifier,
      ) ?? null,
    [activeTrackings, normalizedIdentifier],
  );
  const isTracking = Boolean(thisTracking) || optimisticActive;
  const otherActive = !thisTracking && activeTrackings.length > 0;
  // Backend creates the tracking row instantly and runs the first OAMP probe
  // asynchronously. While we're waiting on that first check we want the card
  // to read "Проверяем…" instead of the success copy that implies the status
  // is already known.
  const firstCheckPending =
    optimisticActive || (Boolean(thisTracking) && thisTracking?.last_checked_at == null);

  useEffect(() => {
    trackEvent("oamp_offer_card_shown", { isPro, isTracking });
  }, [isPro, isTracking]);

  useEffect(() => {
    if (thisTracking) setOptimisticActive(false);
  }, [thisTracking]);

  const enableTracking = useCallback(() => {
    if (createTracking.isPending) return;
    trackEvent("oamp_offer_track_tapped", { isPro });

    if (!isPro) {
      trackEvent("oamp_paywall_from_offer");
      router.push({ pathname: "/paywall", params: { source: "oamp_offer" } });
      return;
    }

    if (otherActive) {
      trackEvent("oamp_offer_limit_blocked");
      router.push("/deadlines");
      return;
    }

    setOptimisticActive(true);
    void createTracking
      .mutateAsync({ tracking_type: "oamp_status", identifier, metadata: {} })
      .then(() => {
        trackEvent("oamp_offer_track_enabled");
        trackEvent("tracking_created_from_chat", { tracking_type: "oamp_status" });
      })
      .catch((err) => {
        if (isAlreadyActiveTrackingError(err)) {
          void trackings.refetch();
          return;
        }
        setOptimisticActive(false);
        Alert.alert(t("oamp.tracking.errorTitle"), trackingErrorMessage(err));
      });
  }, [createTracking, identifier, isPro, otherActive, trackings]);

  // Already tracking this exact case → success state, links to Сроки.
  if (isTracking) {
    const showChecking = firstCheckPending;
    const titleColor = showChecking ? colors.text : colors.greenDark;
    const titleText = showChecking ? t("tracking.actions.checking") : t("oamp.tracking.offer.active");
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={titleText}
        onPress={() => router.push("/deadlines")}
        style={({ pressed }) => [
          styles.card,
          showChecking ? null : styles.cardActive,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.iconSlot, showChecking ? null : styles.iconSlotActive]}>
          {showChecking ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <AppIcon name="bell" size={20} color={colors.greenDark} strokeWidth={1.9} />
          )}
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: titleColor }]}>{titleText}</Text>
          <Text style={styles.hint}>{t("oamp.tracking.offer.activeHint")}</Text>
        </View>
        <AppIcon name="chevron-right" size={18} color={colors.muted3} strokeWidth={2} />
      </Pressable>
    );
  }

  // Pro user with another active tracking → limit-reached explainer.
  if (otherActive) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("oamp.tracking.offer.limitTitle")}
        onPress={() => router.push("/deadlines")}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.iconSlot}>
          <AppIcon name="bell" size={20} color={colors.muted2} strokeWidth={1.9} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{t("oamp.tracking.offer.limitTitle")}</Text>
          <Text style={styles.hint}>{t("oamp.tracking.offer.limitHint")}</Text>
        </View>
        <AppIcon name="chevron-right" size={18} color={colors.muted3} strokeWidth={2} />
      </Pressable>
    );
  }

  // Offer state — Pro can enable, free is routed to paywall.
  const busy = createTracking.isPending;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPro ? t("oamp.tracking.offer.cta") : t("oamp.tracking.offer.ctaFree")}
      disabled={busy}
      onPress={enableTracking}
      style={({ pressed }) => [styles.card, !isPro && styles.cardLocked, pressed && styles.pressed]}
    >
      <View style={[styles.iconSlot, !isPro && styles.iconSlotLocked]}>
        <AppIcon
          name={isPro ? "bell" : "lock"}
          size={20}
          color={isPro ? colors.primary : colors.pro}
          strokeWidth={1.9}
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{t("oamp.tracking.offer.title")}</Text>
        <Text style={styles.hint}>{t("oamp.tracking.offer.subtitle", { identifier })}</Text>
        <View style={[styles.actionRow, !isPro && styles.actionRowLocked]}>
          {busy ? (
            <ActivityIndicator size="small" color={isPro ? colors.primary : colors.pro} />
          ) : (
            <Text style={[styles.actionText, { color: isPro ? colors.primary : colors.pro }]}>
              {isPro ? t("oamp.tracking.offer.cta") : t("oamp.tracking.offer.ctaFree")}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function trackingErrorMessage(err: unknown) {
  const maybeStatus = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : null;
  if (maybeStatus === 429) return t("oamp.tracking.limitReached");
  const message = err instanceof Error ? err.message : "";
  if (!message || message.toLowerCase() === "not found") {
    return t("oamp.tracking.unavailable");
  }
  return message;
}

function isAlreadyActiveTrackingError(err: unknown) {
  const maybeStatus = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : null;
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return maybeStatus === 409 || message.includes("already active");
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginTop: 4,
    },
    cardActive: {
      borderColor: colors.green,
      backgroundColor: colors.greenLight,
    },
    cardLocked: {
      borderColor: colors.pro,
      backgroundColor: colors.proLight,
    },
    iconSlot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface2,
    },
    iconSlotActive: {
      backgroundColor: colors.surface,
    },
    iconSlotLocked: {
      backgroundColor: colors.surface,
    },
    copy: {
      flex: 1,
      gap: 3,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
    },
    hint: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.footnote,
    },
    actionRow: {
      marginTop: 4,
    },
    actionRowLocked: {
      flexDirection: "row",
      alignItems: "center",
    },
    actionText: {
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
