import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ErrorText, Screen, colors } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { getLimits } from "@/features/scans/scansApi";
import { formatLocalizedDate, formatLocalizedMonth, t } from "@/lib/i18n";
import type { LimitsResponse } from "@/lib/types";

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [limits, setLimits] = useState<LimitsResponse | null>(null);
  const [loadingLimits, setLoadingLimits] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const email = user?.email ?? t("profile.noEmail");
  const displayName = useMemo(() => getDisplayName(user?.user_metadata, email), [email, user?.user_metadata]);
  const initial = displayName.trim().charAt(0).toUpperCase() || "J";

  const loadLimits = useCallback(async () => {
    setError(null);
    try {
      setLimits(await getLimits());
    } catch (limitsError) {
      setError(limitsError instanceof Error ? limitsError.message : t("profile.loadLimitsError"));
    } finally {
      setLoadingLimits(false);
    }
  }, []);

  useEffect(() => {
    void loadLimits();
  }, [loadLimits]);

  const used = limits?.scans_used ?? 0;
  const max = limits?.scans_max ?? 5;
  const remaining = limits?.scans_remaining ?? Math.max(max - used, 0);
  const progress = max > 0 ? Math.min(used / max, 1) : 0;
  const planLabel = limits?.plan === "pro" ? t("documents.proPlan") : t("documents.freePlan");

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t("profile.title")}</Text>
        </View>

        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.email} numberOfLines={1}>{email}</Text>
          <View style={styles.planPill}>
            <Text style={styles.planText}>
              {planLabel} · <Text style={styles.planLink}>{t("profile.goPro")}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.usage")}</Text>
          <View style={styles.usageCard}>
            <View style={styles.usageTop}>
              <Text style={styles.usageTitle}>{formatMonthTitle(limits?.month)}</Text>
              {loadingLimits ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.usageCount}>{used} / {max}</Text>
              )}
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.usageMeta}>
              {t("profile.scansRemaining", { count: remaining, renewal: formatRenewal(limits?.month) })}
            </Text>
          </View>
          <ErrorText message={error} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.settings")}</Text>
          <ProfileRow icon="文" label={t("profile.language")} value={t("profile.languageValue")} tone="blue" />
          <ProfileRow icon="!" label={t("profile.notifications")} value={t("profile.notificationsOn")} tone="green" />
          <ProfileRow icon="○" label={t("profile.privacy")} tone="neutral" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.subscription")}</Text>
          <ProfileRow icon="☆" label="Jasně Pro" value="99 Kč/měs" tone="pro" valueTone="pro" />
          <ProfileRow icon="▢" label={t("profile.restore")} tone="neutral" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.accountSection")}</Text>
          <ProfileRow icon="↗" label={t("profile.signOut")} tone="danger" labelTone="danger" onPress={() => void signOut()} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t("profile.footer")}<Text style={styles.footerLink}>{t("profile.terms")}</Text> · <Text style={styles.footerLink}>{t("profile.privacyLink")}</Text>
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  tone,
  labelTone,
  valueTone,
  onPress
}: {
  icon: string;
  label: string;
  value?: string;
  tone: "blue" | "green" | "neutral" | "pro" | "danger";
  labelTone?: "danger";
  valueTone?: "pro";
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, toneStyles[tone].iconBg]}>
        <Text style={[styles.rowIconText, toneStyles[tone].iconText]}>{icon}</Text>
      </View>
      <Text style={[styles.rowLabel, labelTone === "danger" && styles.dangerLabel]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={[styles.rowValue, valueTone === "pro" && styles.proValue]} numberOfLines={1}>{value}</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function getDisplayName(metadata: Record<string, unknown> | undefined, email: string) {
  const rawName = metadata?.full_name ?? metadata?.name;
  if (typeof rawName === "string" && rawName.trim()) {
    return rawName.trim();
  }
  const localPart = email.split("@")[0];
  if (!localPart || localPart === t("profile.noEmail")) return t("profile.account");
  return localPart.replace(/[._-]+/g, " ");
}

function formatMonthTitle(month?: string) {
  const date = parseLimitMonth(month);
  if (!date) return t("profile.scansThisMonth");
  return t("profile.scansInMonth", { month: formatLocalizedMonth(date) });
}

function formatRenewal(month?: string) {
  const date = parseLimitMonth(month);
  if (!date) return t("profile.renewsNextMonth");
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1, 12);
  return t("profile.renewsOn", { date: formatLocalizedDate(nextMonth, { day: "numeric", month: "long", year: "numeric" }) });
}

function parseLimitMonth(month?: string) {
  if (!month) return null;
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return null;
  return new Date(year, monthIndex - 1, 1, 12);
}

const toneStyles = {
  blue: StyleSheet.create({
    iconBg: { backgroundColor: colors.blueSoft },
    iconText: { color: colors.primary }
  }),
  green: StyleSheet.create({
    iconBg: { backgroundColor: colors.greenLight },
    iconText: { color: colors.greenDark }
  }),
  neutral: StyleSheet.create({
    iconBg: { backgroundColor: colors.surface2 },
    iconText: { color: colors.muted }
  }),
  pro: StyleSheet.create({
    iconBg: { backgroundColor: colors.proLight },
    iconText: { color: colors.pro }
  }),
  danger: StyleSheet.create({
    iconBg: { backgroundColor: colors.dangerLight },
    iconText: { color: colors.dangerDark }
  })
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    paddingBottom: 126
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  title: {
    color: colors.primary,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900"
  },
  identity: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
    gap: 8
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12
  },
  avatarText: {
    color: colors.text,
    fontSize: 42,
    fontWeight: "900"
  },
  name: {
    maxWidth: "90%",
    color: colors.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
    textAlign: "center"
  },
  email: {
    maxWidth: "90%",
    color: colors.muted2,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center"
  },
  planPill: {
    marginTop: 10,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  planText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800"
  },
  planLink: {
    color: colors.pro
  },
  section: {
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 28
  },
  sectionTitle: {
    color: colors.muted2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0
  },
  usageCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12
  },
  usageTop: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  usageTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 19,
    fontWeight: "700"
  },
  usageCount: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
    fontVariant: ["tabular-nums"]
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.primary
  },
  usageMeta: {
    color: colors.muted2,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600"
  },
  row: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  rowIconText: {
    fontSize: 17,
    fontWeight: "900"
  },
  rowLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "500"
  },
  rowValue: {
    maxWidth: 140,
    color: colors.muted2,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "right"
  },
  proValue: {
    color: colors.pro,
    fontWeight: "900"
  },
  dangerLabel: {
    color: colors.dangerDark
  },
  chevron: {
    color: colors.muted3,
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "300"
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 6
  },
  footerText: {
    color: colors.muted2,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  footerLink: {
    color: colors.primary
  },
  pressed: {
    opacity: 0.72
  }
});
