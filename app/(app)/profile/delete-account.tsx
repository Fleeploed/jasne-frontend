import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

import { AppBar, BackButton, ErrorText, Field, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { getLimits } from "@/features/scans/scansApi";
import { getPendingScanList, removePendingScanById } from "@/features/scans/pendingScanStore";
import { apiFetch } from "@/lib/api";
import { t } from "@/lib/i18n";
import type { UserPlan } from "@/lib/types";

const SUBSCRIPTION_URL_IOS = "https://apps.apple.com/account/subscriptions";
const SUBSCRIPTION_URL_ANDROID = "https://play.google.com/store/account/subscriptions";
const PINNED_SCANS_KEY = "jasne.pinnedScans.v1";

type ReasonKey = "alternative" | "expensive" | "not_working" | "not_needed" | "other";
const REASON_KEYS: ReasonKey[] = ["alternative", "expensive", "not_working", "not_needed", "other"];

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [plan, setPlan] = useState<UserPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [showPhaseB, setShowPhaseB] = useState(false);
  const [selectedReason, setSelectedReason] = useState<ReasonKey | null>(null);
  const [confirmValue, setConfirmValue] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    getLimits()
      .then((res) => {
        if (!aliveRef.current) return;
        setPlan(res.plan);
      })
      .catch(() => {
        if (!aliveRef.current) return;
        setPlan("free");
      })
      .finally(() => {
        if (aliveRef.current) setLoadingPlan(false);
      });
  }, []);

  const isPro = plan === "pro";
  const inPhaseA = isPro && !showPhaseB;
  const confirmWord = t("deleteAccount.confirm.word");
  const canDelete = confirmValue.trim() === confirmWord && !deleting;

  const openSubscriptions = useCallback(() => {
    const url = Platform.OS === "ios" ? SUBSCRIPTION_URL_IOS : SUBSCRIPTION_URL_ANDROID;
    void Linking.openURL(url);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    const qs = selectedReason ? `?reason=${encodeURIComponent(selectedReason)}` : "";
    try {
      await apiFetch<void>(`/profile${qs}`, { method: "DELETE" });
      await AsyncStorage.removeItem(PINNED_SCANS_KEY).catch(() => {});
      getPendingScanList().forEach((s) => removePendingScanById(s.localId));
      await signOut();
    } catch {
      if (!aliveRef.current) return;
      setError(t("deleteAccount.error.generic"));
      setDeleting(false);
    }
  }, [canDelete, selectedReason, signOut]);

  const reasonLabels: Record<ReasonKey, string> = useMemo(() => ({
    alternative: t("deleteAccount.reason.alternative"),
    expensive: t("deleteAccount.reason.expensive"),
    not_working: t("deleteAccount.reason.not_working"),
    not_needed: t("deleteAccount.reason.not_needed"),
    other: t("deleteAccount.reason.other"),
  }), []);

  if (loadingPlan) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <AppBar
          title={t("deleteAccount.title")}
          left={<BackButton onPress={() => router.back()} />}
        />
        <View style={styles.center}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <AppBar
        title={t("deleteAccount.title")}
        left={<BackButton onPress={() => router.back()} />}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={inPhaseA ? styles.scrollCentered : styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {inPhaseA ? (
            <View style={styles.warningCard}>
              <View style={styles.warningIconWrap}>
                <Ionicons name="alert-circle" size={48} color={colors.amber} />
              </View>
              <Text style={styles.warningTitle}>
                {t("deleteAccount.subscriptionWarning.title")}
              </Text>
              <Text style={styles.warningBody}>
                {t("deleteAccount.subscriptionWarning.body")}
              </Text>
              <Pressable
                onPress={openSubscriptions}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>
                  {t("deleteAccount.subscriptionWarning.cancelFirst")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowPhaseB(true)}
                style={({ pressed }) => [styles.continueLink, pressed && { opacity: 0.5 }]}
              >
                <Text style={styles.continueLinkText}>
                  {t("deleteAccount.subscriptionWarning.continueAnyway")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Block 1 — What will be deleted */}
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>
                  {t("deleteAccount.whatWillBeDeleted.heading")}
                </Text>
                <View style={styles.card}>
                  <DeleteRow
                    icon="document-text-outline"
                    label={t("deleteAccount.whatWillBeDeleted.documents")}
                    colors={colors}
                  />
                  <DeleteRow
                    icon="calendar-outline"
                    label={t("deleteAccount.whatWillBeDeleted.deadlines")}
                    colors={colors}
                  />
                  <DeleteRow
                    icon="chatbubbles-outline"
                    label={t("deleteAccount.whatWillBeDeleted.chats")}
                    colors={colors}
                  />
                  <DeleteRow
                    icon="person-outline"
                    label={t("deleteAccount.whatWillBeDeleted.profile")}
                    colors={colors}
                    last={!isPro}
                  />
                  {isPro && (
                    <View style={styles.subWarningRow}>
                      <Ionicons name="card-outline" size={18} color={colors.danger} />
                      <Text style={styles.subWarningText}>
                        {t("deleteAccount.whatWillBeDeleted.subscriptionNotIncluded")}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Block 2 — Reason */}
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>
                  {t("deleteAccount.reason.heading")}
                </Text>
                <View style={styles.pillRow}>
                  {REASON_KEYS.map((key) => {
                    const selected = selectedReason === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setSelectedReason((prev) => (prev === key ? null : key))}
                        style={[
                          styles.pill,
                          selected && {
                            borderColor: colors.primary,
                            backgroundColor: colors.blueSoft,
                          },
                        ]}
                      >
                        <Text style={[styles.pillText, selected && { color: colors.primary }]}>
                          {reasonLabels[key]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Block 3 — Confirmation + delete */}
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>
                  {t("deleteAccount.confirm.label")}
                </Text>
                <Field
                  value={confirmValue}
                  onChangeText={setConfirmValue}
                  placeholder={confirmWord}
                  autoCapitalize="characters"
                  editable={!deleting}
                />
                <Pressable
                  onPress={handleDelete}
                  disabled={!canDelete}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    !canDelete && styles.deleteButtonDisabled,
                    pressed && canDelete && styles.pressed,
                  ]}
                >
                  {deleting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.deleteButtonText}>
                      {t("deleteAccount.confirm.button")}
                    </Text>
                  )}
                </Pressable>
                <ErrorText message={error} />
              </View>

              <View style={{ height: 32 }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DeleteRow({
  icon,
  label,
  colors,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  colors: ColorPalette;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Ionicons name={icon} size={20} color={colors.muted2} />
      <Text
        style={{
          flex: 1,
          color: colors.text,
          fontFamily: fonts.body,
          ...typeStyles.callout,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    scroll: { padding: 20, gap: 24 },
    scrollCentered: { flexGrow: 1, padding: 20, justifyContent: "center" },

    // Phase A
    warningCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.amberMid,
      gap: 16,
    },
    warningIconWrap: {
      alignItems: "center",
    },
    warningTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.title3,
      fontWeight: "700",
      textAlign: "center",
    },
    warningBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.callout,
      textAlign: "center",
      lineHeight: 22,
    },
    primaryButton: {
      minHeight: 54,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primaryDark,
      paddingHorizontal: 18,
    },
    primaryButtonText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.button,
      fontWeight: "600",
    },
    continueLink: {
      alignItems: "center",
      paddingVertical: 6,
    },
    continueLinkText: {
      color: colors.muted3,
      fontFamily: fonts.body,
      ...typeStyles.subhead,
    },

    // Phase B
    section: { gap: 10 },
    sectionHeading: {
      color: colors.muted2,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.sectionHeader,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    subWarningRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingTop: 10,
      paddingBottom: 10,
    },
    subWarningText: {
      flex: 1,
      color: colors.danger,
      fontFamily: fonts.body,
      ...typeStyles.subhead,
    },
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 100,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    pillText: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.subhead,
      fontWeight: "500",
    },
    deleteButton: {
      marginTop: 4,
      minHeight: 54,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.danger,
      paddingHorizontal: 18,
    },
    deleteButtonDisabled: {
      opacity: 0.4,
    },
    deleteButtonText: {
      color: "#fff",
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.button,
      fontWeight: "600",
    },
    pressed: { opacity: 0.82 },
  });
}
