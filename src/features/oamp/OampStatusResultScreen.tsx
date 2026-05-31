import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ActionSheet } from "@/components/ActionSheet";
import { ActionableBlock } from "@/components/oamp/ActionableBlock";
import { StatusCard } from "@/components/oamp/StatusCard";
import { fonts, Screen, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import type { OampStatus } from "@/constants/oamp";
import { useOampTracking } from "@/hooks/useOampTracking";
import { useSubscription } from "@/hooks/useSubscription";
import { trackEvent } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";

export function OampStatusResultScreen() {
  const params = useLocalSearchParams<{ status?: string; cisloJednaci?: string }>();
  const status = normalizeOampStatus(params.status);
  const cisloJednaci = String(params.cisloJednaci ?? "");
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isPro, loading: subscriptionLoading } = useSubscription();
  const tracking = useOampTracking(cisloJednaci);
  const [confirmStopVisible, setConfirmStopVisible] = useState(false);
  const trackingBusy = subscriptionLoading || tracking.loading || tracking.mutating;

  useEffect(() => {
    trackEvent("oamp_result_viewed", { status });
  }, [status]);

  const handleTrackPress = useCallback(() => {
    if (trackingBusy) return;

    trackEvent("oamp_track_plate_tapped", { isPro });

    if (!isPro) {
      trackEvent("oamp_paywall_from_tracking");
      router.push({ pathname: "/paywall", params: { source: "oamp_tracking" } });
      return;
    }

    if (tracking.isTracking) {
      setConfirmStopVisible(true);
      return;
    }

    void tracking
      .enableTracking()
      .then(() => {
        trackEvent("oamp_track_enabled");
      })
      .catch((err) => {
        Alert.alert(t("oamp.tracking.errorTitle"), trackingErrorMessage(err));
      });
  }, [isPro, tracking, trackingBusy]);

  const disableTracking = useCallback(() => {
    void tracking
      .disableTracking()
      .then(() => {
        trackEvent("oamp_track_disabled");
      })
      .catch((err) => {
        Alert.alert(t("oamp.tracking.errorTitle"), trackingErrorMessage(err));
      });
  }, [tracking]);

  return (
    <>
      <StatusCard status={status} cisloJednaci={cisloJednaci} />
      <ActionableBlock
        cisloJednaci={cisloJednaci}
        isPro={isPro}
        isTracking={tracking.isTracking}
        onEditPress={onEdit}
        onRescanPress={onRescan}
        onTrackPress={handleTrackPress}
        status={status}
        trackingBusy={trackingBusy}
      />
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

function trackingErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (!message || message.toLowerCase() === "not found") {
    return t("oamp.tracking.unavailable");
  }
  return message;
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
  });
}
