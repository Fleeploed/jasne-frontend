import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { ErrorText, Screen, fonts, useColors, useThemePreference, type ColorPalette, type ThemePreference } from "@/components/ui";
import { PaywallSheet } from "@/components/PaywallSheet";
import { useAuth } from "@/features/auth/AuthProvider";
import { getLimits } from "@/features/scans/scansApi";
import { formatLocalizedDate, formatLocalizedMonth, t } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";
import type { LimitsResponse } from "@/lib/types";

const LOCALE_OPTIONS = [
  { code: "cs", label: "Čeština", sub: "Czech" },
  { code: "ru", label: "Русский", sub: "Russian" },
  { code: "uk", label: "Українська", sub: "Ukrainian" },
  { code: "en", label: "English", sub: "" },
];

// Sheet starts off-screen (translateY = SHEET_HIDDEN), animates to 0 on open
const SHEET_HIDDEN = 700;

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { preference, setPreference } = useThemePreference();
  const { locale, changeLocale } = useLocale();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const sheetY = useRef(new Animated.Value(SHEET_HIDDEN)).current;

  const closeLangSheet = useCallback(() => {
    Animated.timing(sheetY, { toValue: SHEET_HIDDEN, duration: 220, useNativeDriver: true }).start(() => {
      setShowLangPicker(false);
    });
  }, [sheetY]);

  function openLangSheet() {
    setShowLangPicker(true);
    sheetY.setValue(SHEET_HIDDEN);
    Animated.spring(sheetY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 200,
      mass: 0.9,
    }).start();
  }

  const panResponder = useRef(
    PanResponder.create({
      // Capture vertical drags anywhere on the sheet, but let small touches
      // (taps on language items) pass through to children.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dy, dx }) => dy > 6 && Math.abs(dy) > Math.abs(dx) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, { dy, dx }) => dy > 12 && Math.abs(dy) > Math.abs(dx) * 1.5,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) sheetY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 100 || vy > 0.6) {
          closeLangSheet();
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const [limits, setLimits] = useState<LimitsResponse | null>(null);
  const [loadingLimits, setLoadingLimits] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = user?.email ?? t("profile.noEmail");
  const displayName = useMemo(() => getDisplayName(user?.user_metadata, email), [email, user?.user_metadata]);
  const initial = displayName.trim().charAt(0).toUpperCase() || "J";

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const loadLimits = useCallback(async () => {
    setError(null);
    try {
      const next = await getLimits();
      if (!aliveRef.current) return;
      setLimits(next);
    } catch (limitsError) {
      if (!aliveRef.current) return;
      setError(limitsError instanceof Error ? limitsError.message : t("profile.loadLimitsError"));
    } finally {
      if (aliveRef.current) {
        setLoadingLimits(false);
        setRefreshing(false);
      }
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
  const currentLocale = LOCALE_OPTIONS.find((o) => o.code === locale);
  const themeLabel = getThemeLabel(preference);
  const cycleTheme = useCallback(() => {
    setPreference(preference === "system" ? "light" : preference === "light" ? "dark" : "system");
  }, [preference, setPreference]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t("profile.title")}</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            tintColor={colors.primary}
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void loadLimits(); }}
          />
        }
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <AvatarGradient />
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.email} numberOfLines={1}>{email}</Text>
          {limits?.plan === "pro" ? (
            <View style={styles.proStaticBadge}>
              <Text style={styles.proBadge}>PRO</Text>
              <Text style={styles.proRenewal}>{formatRenewal(limits.month)}</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowPaywall(true)}
              style={({ pressed }) => [styles.proCta, pressed && styles.pressed]}
            >
              <Text style={styles.freeBadge}>FREE</Text>
              <Text style={styles.proCtaText} numberOfLines={1}>{t("profile.proCta")}</Text>
              <Text style={styles.proArrow}>→</Text>
            </Pressable>
          )}
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
          <ProfileRow icon="languages" label={t("profile.language")} value={currentLocale?.label ?? locale} tone="blue" onPress={openLangSheet} colors={colors} styles={styles} />
          <ProfileRow icon="sliders" label={t("profile.theme")} value={themeLabel} tone="neutral" onPress={cycleTheme} colors={colors} styles={styles} />
          <ProfileRow icon="bell" label={t("profile.notifications")} value={t("profile.notificationsOn")} tone="green" colors={colors} styles={styles} />
          <ProfileRow icon="shield" label={t("profile.privacy")} tone="neutral" colors={colors} styles={styles} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.subscription")}</Text>
          <ProfileRow icon="star" label="Jasně Pro" value="99 Kč/měs" detail={t("profile.proDetail")} tone="pro" valueTone="pro" onPress={limits?.plan === "pro" ? undefined : () => setShowPaywall(true)} colors={colors} styles={styles} />
          <ProfileRow icon="restore" label={t("profile.restore")} tone="neutral" colors={colors} styles={styles} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.accountSection")}</Text>
          <ProfileRow icon="log-out" label={t("profile.signOut")} tone="danger" labelTone="danger" onPress={() => void signOut()} colors={colors} styles={styles} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t("profile.footer")}<Text style={styles.footerLink}>{t("profile.terms")}</Text> · <Text style={styles.footerLink}>{t("profile.privacyLink")}</Text>
          </Text>
        </View>
      </ScrollView>

      <Modal visible={showLangPicker} transparent animationType="none" onRequestClose={closeLangSheet}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeLangSheet} />
          <Animated.View
            {...panResponder.panHandlers}
            style={[styles.langSheet, { transform: [{ translateY: sheetY }] }]}
          >
            <View style={styles.sheetDragArea}>
              <View style={styles.sheetHandle} />
            </View>
            <View style={styles.langHeader}>
              <Text style={styles.langSheetTitle}>{t("profile.language")}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                onPress={closeLangSheet}
                style={({ pressed }) => [styles.langClose, pressed && styles.pressed]}
              >
                <AppIcon name="x" size={22} color={colors.muted2} />
              </Pressable>
            </View>
            {LOCALE_OPTIONS.map((opt, idx) => (
              <Pressable
                key={opt.code}
                style={({ pressed }) => [
                  styles.langOption,
                  idx < LOCALE_OPTIONS.length - 1 && styles.langOptionBorder,
                  pressed && styles.pressed
                ]}
                onPress={() => { void changeLocale(opt.code); closeLangSheet(); }}
              >
                <View style={[styles.langCode, opt.code === locale && styles.langCodeActive]}>
                  <Text style={[styles.langCodeText, opt.code === locale && styles.langCodeTextActive]}>{opt.code.toUpperCase()}</Text>
                </View>
                <View style={styles.langNameBlock}>
                  <Text style={[styles.langOptionText, opt.code === locale && styles.langOptionActive]}>{opt.label}</Text>
                  {opt.sub ? <Text style={styles.langSub}>{opt.sub}</Text> : null}
                </View>
                  {opt.code === locale ? <AppIcon name="check" size={20} color={colors.primary} strokeWidth={2.4} /> : null}
              </Pressable>
            ))}
          </Animated.View>
        </View>
      </Modal>

      <PaywallSheet visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </Screen>
  );
}

// Pure-JS gradient avatar: 24 opaque strips interpolated from light blue (top)
// to dark blue (bottom). overflow:"hidden" on parent clips to the circle.
function AvatarGradient() {
  const SIZE = 84;
  const STRIPS = 24;
  const stripH = SIZE / STRIPS;
  const top = { r: 111, g: 160, b: 230 }; // light blue
  const bot = { r: 27,  g: 58,  b: 107 }; // deep navy
  return (
    <View style={StyleSheet.absoluteFill}>
      {Array.from({ length: STRIPS }).map((_, i) => {
        const t = i / (STRIPS - 1);
        const r = Math.round(top.r + (bot.r - top.r) * t);
        const g = Math.round(top.g + (bot.g - top.g) * t);
        const b = Math.round(top.b + (bot.b - top.b) * t);
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 0, right: 0,
              top: i * stripH,
              height: stripH + 1,
              backgroundColor: `rgb(${r},${g},${b})`,
            }}
          />
        );
      })}
    </View>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  detail,
  tone,
  labelTone,
  valueTone,
  onPress,
  colors,
  styles
}: {
  icon: AppIconName;
  label: string;
  value?: string;
  detail?: string;
  tone: "blue" | "green" | "neutral" | "pro" | "danger";
  labelTone?: "danger";
  valueTone?: "pro";
  onPress?: () => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const toneColors = {
    blue:    { iconBg: colors.blueSoft,    iconText: colors.primary },
    green:   { iconBg: colors.greenLight,  iconText: colors.greenDark },
    neutral: { iconBg: colors.surface2,    iconText: colors.muted },
    pro:     { iconBg: colors.proLight,    iconText: colors.pro },
    danger:  { iconBg: colors.dangerLight, iconText: colors.dangerDark }
  }[tone];

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: toneColors.iconBg }]}>
        <AppIcon name={icon} size={22} color={toneColors.iconText} />
      </View>
      <View style={styles.rowTextBlock}>
        <Text style={[styles.rowLabel, labelTone === "danger" && styles.dangerLabel]} numberOfLines={1}>{label}</Text>
        {detail ? <Text style={styles.rowDetail} numberOfLines={1}>{detail}</Text> : null}
      </View>
      {value ? <Text style={[styles.rowValue, valueTone === "pro" && styles.proValue]} numberOfLines={1}>{value}</Text> : null}
      <AppIcon name="chevron-right" size={22} color={colors.muted3} />
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
  return t("profile.renewsOn", { date: formatLocalizedDate(nextMonth, { day: "numeric", month: "long" }) });
}

function parseLimitMonth(month?: string) {
  if (!month) return null;
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return null;
  return new Date(year, monthIndex - 1, 1, 12);
}

function getThemeLabel(preference: ThemePreference) {
  if (preference === "light") return t("profile.themeLight");
  if (preference === "dark") return t("profile.themeDark");
  return t("profile.themeSystem");
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.bg },
    content: { paddingBottom: 110 },
    header: {
      minHeight: 72,
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
    },
    title: { color: colors.primary, fontSize: 28, lineHeight: 32, fontWeight: "800", letterSpacing: -0.7 },
    identity: {
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 26,
      gap: 7
    },
    avatar: {
      width: 84,
      height: 84,
      borderRadius: 42,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8
    },
    avatarText: { color: colors.textOnAccent, fontFamily: fonts.display, fontSize: 38, fontWeight: "600" },
    name: {
      maxWidth: "90%",
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 25,
      lineHeight: 30,
      fontWeight: "600",
      textAlign: "center"
    },
    email: {
      maxWidth: "90%",
      color: colors.muted2,
      fontFamily: fonts.bodySemiBold,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "600",
      textAlign: "center"
    },
    proStaticBadge: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.pro,
      backgroundColor: colors.proLight,
    },
    proRenewal: {
      color: colors.muted2,
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "600",
    },
    proCta: {
      marginTop: 10,
      maxWidth: "86%",
      minHeight: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.pro,
      backgroundColor: colors.surface2,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10
    },
    proBadge: {
      overflow: "hidden",
      borderRadius: 8,
      backgroundColor: colors.proLight,
      color: colors.pro,
      fontFamily: fonts.bodyExtraBold,
      paddingHorizontal: 9,
      paddingVertical: 4,
      fontSize: 11,
      lineHeight: 13,
      fontWeight: "900"
    },
    freeBadge: {
      overflow: "hidden",
      borderRadius: 8,
      backgroundColor: colors.proLight,
      color: colors.pro,
      fontFamily: fonts.bodyExtraBold,
      paddingHorizontal: 9,
      paddingVertical: 4,
      fontSize: 11,
      lineHeight: 13,
      fontWeight: "900"
    },
    proCtaText: {
      color: colors.muted,
      fontFamily: fonts.bodySemiBold,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: "600"
    },
    proArrow: {
      color: colors.pro,
      fontFamily: fonts.bodyMedium,
      fontSize: 22,
      lineHeight: 24,
      fontWeight: "500"
    },
    section: { paddingHorizontal: 24, gap: 10, marginBottom: 22 },
    sectionTitle: {
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: fonts.bodyExtraBold,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 3
    },
    usageCard: {
      borderRadius: 24,
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
    usageTitle: { flex: 1, color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 19, lineHeight: 24, fontWeight: "600" },
    usageCount: { color: colors.text, fontFamily: fonts.display, fontSize: 24, lineHeight: 30, fontWeight: "600", fontVariant: ["tabular-nums"] },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
    usageMeta: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 20, fontWeight: "600" },
    row: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border
    },
    rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    rowIconText: { fontSize: 16, fontFamily: fonts.bodyExtraBold, fontWeight: "800" },
    rowTextBlock: { flex: 1, minWidth: 0 },
    rowLabel: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 20, lineHeight: 25, fontWeight: "600" },
    rowDetail: { color: colors.muted2, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, fontWeight: "500", marginTop: 2 },
    rowValue: { maxWidth: 132, color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 22, fontWeight: "600", textAlign: "right" },
    proValue: { color: colors.pro, fontWeight: "900" },
    dangerLabel: { color: colors.dangerDark },
    chevron: { color: colors.muted3, fontSize: 26, lineHeight: 28, fontWeight: "300" },
    footer: { alignItems: "center", paddingHorizontal: 24, paddingTop: 6 },
    footerText: { color: colors.muted2, fontSize: 14, lineHeight: 20, textAlign: "center" },
    footerLink: { color: colors.primary },
    pressed: { opacity: 0.72 },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "flex-end" },
    langSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
      paddingBottom: 48,
      paddingHorizontal: 24,
      gap: 4
    },
    sheetDragArea: {
      alignItems: "center",
      paddingVertical: 10,
      marginHorizontal: -24,
    },
    sheetHandle: {
      width: 38,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.muted3,
    },
    langHeader: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8
    },
    langSheetTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 22, lineHeight: 28, fontWeight: "700" },
    langClose: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center"
    },
    langCloseText: { color: colors.muted2, fontSize: 30, lineHeight: 32, fontWeight: "300" },
    langOption: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    langOptionBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    langCode: {
      width: 32,
      height: 32,
      borderRadius: 9,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center"
    },
    langCodeActive: { backgroundColor: colors.blueSoft },
    langCodeText: { color: colors.muted, fontFamily: fonts.bodyExtraBold, fontSize: 13, lineHeight: 16, fontWeight: "800" },
    langCodeTextActive: { color: colors.primary },
    langNameBlock: { flex: 1, minWidth: 0 },
    langOptionText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 22, fontWeight: "600" },
    langOptionActive: { color: colors.primary },
    langSub: { color: colors.muted2, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 17, fontWeight: "500", marginTop: 1 },
    langCheck: { color: colors.primary, fontSize: 22, lineHeight: 24, fontWeight: "500" }
  });
}
