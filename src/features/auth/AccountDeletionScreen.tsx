import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ErrorText, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { captureAppError, trackEvent } from "@/lib/analytics";
import { formatLocalizedDate, t } from "@/lib/i18n";
import type { ProfileResponse } from "@/lib/types";

type AccountDeletionScreenProps = {
  profile?: ProfileResponse | null;
  loadError?: string | null;
  onRetry?: () => void;
  onRestored: (profile: ProfileResponse) => void;
};

export function AccountDeletionScreen({
  profile,
  loadError,
  onRetry,
  onRestored,
}: AccountDeletionScreenProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { signOut } = useAuth();
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const deletionDate = profile?.deletion_scheduled_at
    ? formatLocalizedDate(profile.deletion_scheduled_at, { day: "numeric", month: "long", year: "numeric" })
    : null;

  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      trackEvent("account_restore_requested");
      const restored = await apiFetch<ProfileResponse>("/profile/restore", { method: "POST" });
      trackEvent("account_restored");
      onRestored(restored);
    } catch (error) {
      captureAppError(error, { action: "restore_account", screen: "account_pending_deletion" });
      setRestoreError(t("accountDeletion.restoreError"));
      setRestoring(false);
    }
  }

  const hasLoadError = Boolean(loadError && !profile);

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={hasLoadError ? "cloud-offline-outline" : "time-outline"}
            size={34}
            color={hasLoadError ? colors.amber : colors.brandBlue}
          />
        </View>
        <Text style={styles.title}>
          {hasLoadError ? t("accountDeletion.loadErrorTitle") : t("accountDeletion.title")}
        </Text>
        <Text style={styles.body}>
          {hasLoadError
            ? t("accountDeletion.loadErrorBody")
            : t("accountDeletion.body", { date: deletionDate ?? t("accountDeletion.soon") })}
        </Text>

        <View style={styles.actions}>
          {hasLoadError ? (
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>{t("accountDeletion.retry")}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleRestore}
              disabled={restoring}
              style={({ pressed }) => [
                styles.primaryButton,
                restoring && styles.disabled,
                pressed && !restoring && styles.pressed,
              ]}
            >
              {restoring ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <Text style={styles.primaryButtonText}>{t("accountDeletion.restore")}</Text>
              )}
            </Pressable>
          )}

          <Pressable
            onPress={() => void signOut()}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>{t("accountDeletion.signOut")}</Text>
          </Pressable>
        </View>

        <ErrorText message={restoreError ?? loadError ?? null} />
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    content: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      gap: 16,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.title1,
      fontWeight: "700",
    },
    body: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.body,
    },
    actions: {
      gap: 10,
      marginTop: 8,
    },
    primaryButton: {
      minHeight: 54,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brandBlue,
      paddingHorizontal: 18,
    },
    primaryButtonText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.button,
      fontWeight: "600",
    },
    secondaryButton: {
      minHeight: 50,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 18,
    },
    secondaryButtonText: {
      color: colors.muted,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.button,
      fontWeight: "600",
    },
    disabled: {
      opacity: 0.55,
    },
    pressed: {
      opacity: 0.82,
    },
  });
}
