import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { getLimits } from "@/features/scans/scansApi";
import { t } from "@/lib/i18n";
import {
  getProPackages,
  hasActiveRevenueCatPro,
  isRevenueCatPurchaseCancelled,
  isRevenueCatTestStoreFailure,
  isRevenueCatTestStoreConfigured,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  type ProPackages,
  type RevenueCatPlan,
} from "@/lib/purchases";

const SHEET_HIDDEN = 900;
const BACKEND_PLAN_SYNC_ATTEMPTS = 5;
const BACKEND_PLAN_SYNC_DELAY_MS = 900;

export function PaywallSheet({
  visible,
  onClose,
  onPurchase,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchase?: (plan: RevenueCatPlan) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const sheetY = useRef(new Animated.Value(SHEET_HIDDEN)).current;
  const [selected, setSelected] = useState<RevenueCatPlan>("yearly");
  const [packages, setPackages] = useState<ProPackages | null>(null);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [purchasePending, setPurchasePending] = useState(false);
  const [restorePending, setRestorePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    Animated.timing(sheetY, { toValue: SHEET_HIDDEN, duration: 220, useNativeDriver: true }).start(() => {
      onClose();
    });
  }, [onClose, sheetY]);

  // Animate in when modal becomes visible
  useEffect(() => {
    if (visible) {
      setSelected("yearly");
      setError(null);
      setPurchasePending(false);
      setRestorePending(false);
      sheetY.setValue(SHEET_HIDDEN);
      Animated.spring(sheetY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 200,
        mass: 0.9,
      }).start();
    }
  }, [visible, sheetY]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setLoadingPackages(true);
    void getProPackages()
      .then((nextPackages) => {
        if (cancelled) return;
        setPackages(nextPackages);
        if (nextPackages?.yearly) {
          setSelected("yearly");
        } else if (nextPackages?.monthly) {
          setSelected("monthly");
        }
      })
      .catch(() => {
        if (!cancelled) setPackages(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPackages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dy, dx }) => dy > 6 && Math.abs(dy) > Math.abs(dx) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, { dy, dx }) => dy > 12 && Math.abs(dy) > Math.abs(dx) * 1.5,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) sheetY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 100 || vy > 0.6) {
          close();
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
        }
      },
    })
  ).current;

  const monthlyPackage = packages?.monthly ?? null;
  const yearlyPackage = packages?.yearly ?? null;
  const selectedPackage = packages?.[selected] ?? null;
  const selectedPrice = selectedPackage?.price ?? t("paywall.priceUnavailable");
  const monthlyPrice = loadingPackages ? t("paywall.priceLoading") : monthlyPackage?.price ?? t("paywall.priceUnavailable");
  const yearlyPrice = loadingPackages ? t("paywall.priceLoading") : yearlyPackage?.price ?? t("paywall.priceUnavailable");
  const yearlyMeta = yearlyPackage?.pricePerMonth
    ? t("paywall.perMonthEquiv", { price: yearlyPackage.pricePerMonth })
    : t("paywall.perYear");
  const discount = getAnnualDiscount(monthlyPackage?.rcPackage.product.price ?? null, yearlyPackage?.rcPackage.product.price ?? null);
  const ctaDisabled = !selectedPackage || loadingPackages || purchasePending || restorePending;

  async function handlePurchase() {
    if (!selectedPackage || purchasePending) {
      setError(t("paywall.offerUnavailable"));
      return;
    }

    setError(null);
    setPurchasePending(true);
    try {
      const result = await purchaseRevenueCatPackage(selectedPackage.rcPackage);
      if (!hasActiveRevenueCatPro(result.customerInfo)) {
        setError(t("paywall.purchaseNoEntitlement"));
        return;
      }
      const backendSynced = await waitForBackendProPlan();
      if (!backendSynced) {
        if (__DEV__ && isRevenueCatTestStoreConfigured()) {
          logger.warn("[purchases] RevenueCat Test Store purchase succeeded, but backend /limits still returned free.");
        }
        setError(t("paywall.purchaseSyncPending"));
        return;
      }
      onPurchase?.(selected);
      close();
    } catch (purchaseError) {
      if (!isRevenueCatPurchaseCancelled(purchaseError)) {
        setError(isRevenueCatTestStoreFailure(purchaseError) ? t("paywall.testStoreFailedPurchase") : t("paywall.purchaseError"));
      }
    } finally {
      setPurchasePending(false);
    }
  }

  async function handleRestore() {
    if (restorePending || purchasePending) return;
    setError(null);
    setRestorePending(true);
    try {
      const customerInfo = await restoreRevenueCatPurchases();
      if (!hasActiveRevenueCatPro(customerInfo)) {
        setError(t("paywall.restoreNoEntitlement"));
        return;
      }
      const backendSynced = await waitForBackendProPlan();
      if (!backendSynced) {
        setError(t("paywall.purchaseSyncPending"));
        return;
      }
      onPurchase?.(selected);
      close();
    } catch {
      setError(t("paywall.restoreError"));
    } finally {
      setRestorePending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}
        >
          <View style={styles.dragArea}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <View style={styles.proPill}>
              <AppIcon name="star" size={16} color={colors.pro} strokeWidth={2} />
              <Text style={styles.proPillText}>JASNĚ PRO</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              onPress={close}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            >
              <AppIcon name="x" size={24} color={colors.muted2} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.title}>{t("paywall.title")}</Text>
            <Text style={styles.subtitle}>{t("paywall.subtitle")}</Text>

            <View style={styles.plansRow}>
              <PlanCard
                label={t("paywall.month")}
                price={monthlyPrice}
                meta={t("paywall.perMonth")}
                selected={selected === "monthly"}
                onPress={() => setSelected("monthly")}
                disabled={!monthlyPackage || loadingPackages}
                colors={colors}
                styles={styles}
              />
              <PlanCard
                label={t("paywall.year")}
                price={yearlyPrice}
                meta={yearlyMeta}
                discount={discount}
                selected={selected === "yearly"}
                onPress={() => setSelected("yearly")}
                disabled={!yearlyPackage || loadingPackages}
                colors={colors}
                styles={styles}
              />
            </View>

            <View style={styles.features}>
              <FeatureRow
                icon="sparkles"
                title={t("paywall.feature1Title")}
                detail={t("paywall.feature1Sub")}
                colors={colors}
                styles={styles}
              />
              <View style={styles.featureDivider} />
              <FeatureRow
                icon="bell"
                title={t("paywall.feature2Title")}
                detail={t("paywall.feature2Sub")}
                colors={colors}
                styles={styles}
              />
              <View style={styles.featureDivider} />
              <FeatureRow
                icon="pages"
                title={t("paywall.feature3Title")}
                detail={t("paywall.feature3Sub")}
                colors={colors}
                styles={styles}
              />
              <View style={styles.featureDivider} />
              <FeatureRow
                icon="shield"
                title={t("paywall.feature4Title")}
                detail={t("paywall.feature4Sub")}
                colors={colors}
                styles={styles}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("paywall.cta", { price: selectedPrice })}
              disabled={ctaDisabled}
              onPress={() => void handlePurchase()}
              style={({ pressed }) => [styles.cta, ctaDisabled && styles.ctaDisabled, pressed && !ctaDisabled && styles.ctaPressed]}
            >
              {purchasePending ? (
                <ActivityIndicator size="small" color={colors.textOnAccent} />
              ) : (
                <AppIcon name="star" size={18} color={colors.textOnAccent} strokeWidth={2.2} />
              )}
              <Text style={styles.ctaText}>{t("paywall.cta", { price: selectedPrice })}</Text>
            </Pressable>

            <Text style={styles.footer}>{t("paywall.footer")}</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("paywall.restore")}
              disabled={restorePending || purchasePending}
              onPress={() => void handleRestore()}
              style={({ pressed }) => [styles.restoreBtn, pressed && styles.pressed]}
            >
              <Text style={styles.restoreText}>{restorePending ? t("paywall.restoring") : t("paywall.restore")}</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

async function waitForBackendProPlan() {
  for (let attempt = 0; attempt < BACKEND_PLAN_SYNC_ATTEMPTS; attempt += 1) {
    try {
      const limits = await getLimits();
      if (limits.plan === "pro") return true;
    } catch {
      // Keep polling briefly. The user-facing error is set by the caller.
    }
    if (attempt < BACKEND_PLAN_SYNC_ATTEMPTS - 1) {
      await sleep(BACKEND_PLAN_SYNC_DELAY_MS);
    }
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function PlanCard({
  label,
  price,
  meta,
  discount,
  selected,
  onPress,
  disabled,
  colors,
  styles,
}: {
  label: string;
  price: string;
  meta: string;
  discount?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.planCard,
        selected && styles.planCardSelected,
        disabled && styles.planCardDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {discount ? (
        <View style={styles.discountBadge}>
          <Text style={styles.discountText}>{discount}</Text>
        </View>
      ) : null}
      <View style={styles.planHeader}>
        {selected ? (
          <View style={styles.checkBadge}>
            <AppIcon name="check" size={13} color={colors.textOnAccent} strokeWidth={2.8} />
          </View>
        ) : null}
        <Text style={[styles.planLabel, selected && styles.planLabelSelected]}>{label}</Text>
      </View>
      <Text style={styles.planPrice}>{price}</Text>
      <Text style={styles.planMeta}>{meta}</Text>
    </Pressable>
  );
}

function getAnnualDiscount(monthlyPrice: number | null, yearlyPrice: number | null) {
  if (!monthlyPrice || !yearlyPrice) return undefined;
  const monthlyForYear = monthlyPrice * 12;
  if (yearlyPrice >= monthlyForYear) return undefined;

  const discount = Math.round((1 - yearlyPrice / monthlyForYear) * 100);
  return discount > 0 ? `−${discount}%` : undefined;
}

function FeatureRow({
  icon,
  title,
  detail,
  colors,
  styles,
}: {
  icon: AppIconName;
  title: string;
  detail: string;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <AppIcon name={icon} size={22} color={colors.pro} strokeWidth={1.8} />
      </View>
      <View style={styles.featureTextBlock}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  const isDark = colors.bg === "#0F0D0B";

  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.82)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: isDark ? "#15120F" : colors.surface,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      minHeight: "88%",
      maxHeight: "92%",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(168,147,224,0.18)" : colors.border,
    },
    dragArea: { alignItems: "center", paddingTop: 22, paddingBottom: 22 },
    handle: { width: 46, height: 6, borderRadius: 999, backgroundColor: isDark ? "rgba(244,239,230,0.34)" : colors.muted3 },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingTop: 0,
      paddingBottom: 18,
    },
    proPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 15,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: colors.pro,
      backgroundColor: isDark ? "rgba(168,147,224,0.16)" : colors.proLight,
    },
    proPillStar: { color: colors.pro, fontSize: 15, lineHeight: 17, fontWeight: "900" },
    proPillText: {
      color: colors.pro,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
      fontWeight: "900",
      letterSpacing: 1.7,
    },
    closeBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: isDark ? "rgba(255,248,235,0.06)" : colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    closeBtnText: { color: colors.muted2, fontSize: 34, lineHeight: 36, fontWeight: "200" },

    scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 30, gap: 14 },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      ...typeStyles.compactTitle,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    subtitle: {
      color: colors.muted2,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowSecondary,
      fontWeight: "600",
      marginTop: -6,
    },

    plansRow: { flexDirection: "row", gap: 12 },
    planCard: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(244,239,230,0.08)" : colors.border,
      backgroundColor: isDark ? "rgba(255,248,235,0.035)" : colors.surface2,
      paddingVertical: 15,
      paddingHorizontal: 16,
      gap: 5,
      minHeight: 96,
      position: "relative",
    },
    planCardSelected: {
      borderWidth: 2,
      borderColor: colors.pro,
      backgroundColor: isDark ? "rgba(168,147,224,0.14)" : colors.proLight,
    },
    planCardDisabled: { opacity: 0.56 },
    discountBadge: {
      position: "absolute",
      top: -12,
      right: 14,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: colors.pro,
    },
    discountText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      fontWeight: "900",
    },
    planHeader: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 22 },
    checkBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.pro,
      alignItems: "center",
      justifyContent: "center",
    },
    checkBadgeText: { color: colors.textOnAccent, fontSize: 12, lineHeight: 14, fontWeight: "900" },
    planLabel: {
      color: colors.muted2,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowMeta,
      fontWeight: "700",
    },
    planLabelSelected: { color: colors.pro },
    planPrice: {
      color: colors.text,
      fontFamily: fonts.display,
      ...typeStyles.compactTitle,
      fontWeight: "700",
    },
    planMeta: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowMeta,
      fontWeight: "500",
    },

    features: { gap: 0, marginTop: 4 },
    featureRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 },
    featureIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(168,147,224,0.14)" : colors.proLight,
      alignItems: "center",
      justifyContent: "center",
    },
    featureIconText: { fontSize: 20, lineHeight: 24, color: colors.pro, fontWeight: "700" },
    featureTextBlock: { flex: 1, minWidth: 0 },
    featureTitle: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowTitle,
      fontWeight: "700",
    },
    featureDetail: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowSecondary,
      fontWeight: "500",
      marginTop: 2,
    },
    featureDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? "rgba(244,239,230,0.07)" : colors.border,
      marginLeft: 60,
    },

    cta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      minHeight: 58,
      borderRadius: 18,
      backgroundColor: colors.pro,
      marginTop: 10,
      paddingHorizontal: 16,
    },
    ctaPressed: { opacity: 0.85 },
    ctaDisabled: { opacity: 0.55 },
    ctaStar: { color: colors.textOnAccent, fontSize: 16, fontWeight: "900" },
    ctaText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.button,
      fontWeight: "700",
      flexShrink: 1,
      textAlign: "center",
    },
    errorText: {
      color: colors.danger,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.footnote,
      fontWeight: "600",
      textAlign: "center",
      marginTop: -2,
    },

    footer: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowMeta,
      fontWeight: "500",
      textAlign: "center",
      paddingHorizontal: 8,
      marginTop: 6,
    },
    restoreBtn: { alignItems: "center", paddingVertical: 5 },
    restoreText: {
      color: colors.primary,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
    },

    pressed: { opacity: 0.72 },
  });
}
