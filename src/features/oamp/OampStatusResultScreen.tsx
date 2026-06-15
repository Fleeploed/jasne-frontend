import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ActionSheet } from "@/components/ActionSheet";
import { ActionableBlock } from "@/components/oamp/ActionableBlock";
import { StatusCard } from "@/components/oamp/StatusCard";
import { fonts, Screen, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import type { OampStatus } from "@/constants/oamp";
import { useSubscription } from "@/hooks/useSubscription";
import { useCreateTracking, useStopTracking, useTrackings } from "@/hooks/useTrackings";
import { trackEvent } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import type { Tracking } from "@/lib/types";
import { useLocale } from "@/lib/LocaleContext";

export function OampStatusResultScreen() {
  const params = useLocalSearchParams<{ status?: string; cisloJednaci?: string; identifier?: string }>();
  const status = normalizeOampStatus(params.status);
  const cisloJednaci = String(params.cisloJednaci ?? params.identifier ?? "");
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  useLocale();

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
        <Text style={styles.topTitle}>{t("help.status.title")}</Text>
        <View style={styles.topSpacer} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OampStatusResultBody
          cisloJednaci={cisloJednaci}
          onEdit={() => router.back()}
          onRescan={() => router.push("/scan/new")}
          status={status}
        />
      </ScrollView>
    </Screen>
  );
}

export function OampStatusResultBody({
  cisloJednaci,
  status,
  onEdit,
  onRescan,
}: {
  cisloJednaci: string;
  status: OampStatus;
  onEdit: () => void;
  onRescan: () => void;
}) {
  const { isPro, loading: subscriptionLoading } = useSubscription();
  const trackings = useTrackings("oamp_status");
  const refetchTrackings = trackings.refetch;
  const createTracking = useCreateTracking();
  const stopTracking = useStopTracking();
  const [confirmStopVisible, setConfirmStopVisible] = useState(false);
  const [optimisticTracking, setOptimisticTracking] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const normalizedIdentifier = normalizeTrackingIdentifier(cisloJednaci);
  const activeTracking = useMemo<Tracking | null>(
    () =>
      (trackings.data ?? []).find(
        (item: Tracking) =>
          item.tracking_type === "oamp_status" &&
          normalizeTrackingIdentifier(item.identifier) === normalizedIdentifier
      ) ??
      (createTracking.data &&
      normalizeTrackingIdentifier(createTracking.data.identifier) === normalizedIdentifier
        ? createTracking.data
        : null),
    [createTracking.data, normalizedIdentifier, trackings.data]
  );
  const isTracking = Boolean(activeTracking) || optimisticTracking;
  const trackingLookupBusy = trackings.isLoading && !trackings.data;
  const trackingBusy = subscriptionLoading || trackingLookupBusy || stopTracking.isPending;

  useEffect(() => {
    trackEvent("oamp_result_viewed", { status });
  }, [status]);

  useEffect(() => {
    if (activeTracking) setOptimisticTracking(false);
  }, [activeTracking]);

  const handleTrackPress = useCallback(() => {
    if (trackingBusy || createTracking.isPending) return;

    trackEvent("oamp_track_plate_tapped", { isPro });

    if (!isPro) {
      trackEvent("oamp_paywall_from_tracking");
      router.push({ pathname: "/paywall", params: { source: "oamp_tracking" } });
      return;
    }

    if (isTracking) {
      setConfirmStopVisible(true);
      return;
    }

    setOptimisticTracking(true);
    void createTracking
      .mutateAsync({
        tracking_type: "oamp_status",
        identifier: cisloJednaci,
        metadata: { current_status: status },
      })
      .then(() => {
        trackEvent("oamp_track_enabled");
        trackEvent("tracking_created_from_result_screen", { tracking_type: "oamp_status" });
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 3200);
      })
      .catch((err) => {
        if (isAlreadyActiveTrackingError(err)) {
          void refetchTrackings();
          setToastVisible(true);
          setTimeout(() => setToastVisible(false), 3200);
          return;
        }
        setOptimisticTracking(false);
        Alert.alert(t("oamp.tracking.errorTitle"), trackingErrorMessage(err));
      });
  }, [cisloJednaci, createTracking, isPro, isTracking, refetchTrackings, status, trackingBusy]);

  const disableTracking = useCallback(() => {
    if (!activeTracking) return;
    void stopTracking
      .mutateAsync(activeTracking)
      .then(() => {
        setOptimisticTracking(false);
        createTracking.reset();
        trackEvent("oamp_track_disabled");
      })
      .catch((err) => {
        Alert.alert(t("oamp.tracking.errorTitle"), trackingErrorMessage(err));
      });
  }, [activeTracking, createTracking, stopTracking]);

  const intervalHint = activeTracking ? trackingIntervalHint(activeTracking.created_at) : undefined;

  return (
    <>
      <StatusCard status={status} cisloJednaci={cisloJednaci} />
      <ActionableBlock
        cisloJednaci={cisloJednaci}
        intervalHint={intervalHint}
        isPro={isPro}
        isTracking={isTracking}
        onEditPress={onEdit}
        onRescanPress={onRescan}
        onTrackPress={handleTrackPress}
        status={status}
        trackingBusy={trackingBusy}
      />
      {toastVisible ? <TrackingCreatedToast /> : null}
      <ActionSheet
        visible={confirmStopVisible}
        title={t("oamp.tracking.stopTitle")}
        subtitle={t("oamp.tracking.stopSubtitle")}
        onClose={() => setConfirmStopVisible(false)}
        actions={[
          {
            key: "stop",
            label: t("oamp.tracking.stopConfirm"),
            icon: "bell",
            destructive: true,
            onPress: disableTracking,
          },
        ]}
      />
    </>
  );
}

function TrackingCreatedToast() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("tracking.createdToast")}
      onPress={() => router.push("/deadlines")}
      style={({ pressed }) => [styles.toast, pressed && styles.pressed]}
    >
      <Text style={styles.toastTitle}>{t("tracking.createdToast")}</Text>
      <Text style={styles.toastHint}>{t("tracking.openDeadlinesHint")}</Text>
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

function trackingIntervalHint(createdAt: string | null | undefined): string {
  const ageDays = createdAt
    ? (Date.now() - new Date(createdAt).getTime()) / 86_400_000
    : 0;
  if (ageDays < 30) return t("oamp.tracking.intervalWeekly");
  if (ageDays <= 90) return t("oamp.tracking.interval3Days");
  return t("oamp.tracking.intervalDaily");
}

function isAlreadyActiveTrackingError(err: unknown) {
  const maybeStatus = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : null;
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return maybeStatus === 409 || message.includes("already active");
}

function normalizeTrackingIdentifier(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/^0AM/, "OAM");
}

export function normalizeOampStatus(value?: string): OampStatus {
  if (value === "schvaleno" || value === "approved") return "schvaleno";
  if (value === "zamitnuto" || value === "rejected") return "zamitnuto";
  if (value === "not_found") return "not_found";
  return "probiha";
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
      marginHorizontal: 6,
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
      paddingTop: 10,
      paddingBottom: 44,
      gap: 18,
    },
    pressed: {
      opacity: 0.72,
    },
    errorText: {
      color: colors.danger,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.footnote,
    },
    toast: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.green,
      backgroundColor: colors.greenLight,
      paddingHorizontal: 15,
      paddingVertical: 12,
      gap: 3,
    },
    toastTitle: {
      color: colors.greenDark,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
    },
    toastHint: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.footnote,
    },
  });
}
