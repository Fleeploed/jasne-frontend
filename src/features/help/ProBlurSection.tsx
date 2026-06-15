import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

import { PaywallSheet } from "@/components/PaywallSheet";
import { fonts, typeStyles, useColors, useThemePreference, type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";
import { getProPackages } from "@/lib/purchases";

import { HELP_TEXT_SCALE } from "@/features/help/constants";

// Widths for the fake skeleton bars behind the blur. Purely decorative — they
// carry no real content, just give the BlurView something to blur so the gate
// reads as "there is locked content here".
const SKELETON_BAR_WIDTHS = ["92%", "78%", "85%", "60%"] as const;

/**
 * Pro-only Help section, rendered for FREE users only. Pro users skip this
 * component entirely and render the real section.
 *
 * SECURITY: this component renders NO real Pro content. The backend strips
 * body/items from pro_only sections for free users (routers/help.py
 * `_gate_sections_for_plan`), so the real text never reaches the device. Here
 * we only draw a content-free skeleton + blur + upgrade gate. The blur is a
 * visual shell, never the protection mechanism.
 *
 * Layout:
 *   ┌─ contentCard ─────────────────────┐
 *   │ Title (full opacity — readable)   │
 *   │ ┌─ inner (position: relative) ──┐ │
 *   │ │ <fake skeleton bars — no text>│ │
 *   │ │ <BlurView absoluteFill>       │ │  ← native gaussian blur
 *   │ │ <Pro gate centered overlay>   │ │
 *   │ └────────────────────────────────┘ │
 *   └────────────────────────────────────┘
 *
 * Android note: on Android, expo-blur uses a software fallback by default.
 * We opt into the Dimezis blur method which is closer to the iOS look
 * (`experimentalBlurMethod="dimezisBlurView"`). Old/low-end devices may
 * still degrade — that's acceptable; worst case is a darker translucent
 * panel, which still hides the content.
 */
export function ProBlurSection({ title }: { title?: string | null }) {
  const colors = useColors();
  const { scheme } = useThemePreference();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [monthlyPrice, setMonthlyPrice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getProPackages().then((packages) => {
      if (!cancelled) setMonthlyPrice(packages?.monthly?.price ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const gateButtonLabel = monthlyPrice
    ? t("help.pro.gateButton", { price: monthlyPrice })
    : t("help.pro.gateButtonNoPrice");

  return (
    <View style={styles.card}>
      {title ? (
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.title}>
          {title}
        </Text>
      ) : null}

      <View style={styles.inner}>
        {/* Content-free skeleton — gives the card a natural height and
            something for the BlurView to blur. No real text lives here. */}
        <View style={styles.skeleton} pointerEvents="none">
          {SKELETON_BAR_WIDTHS.map((width, i) => (
            <View key={i} style={[styles.skeletonBar, { width }]} />
          ))}
        </View>

        <BlurView
          intensity={20}
          tint={scheme === "dark" ? "dark" : "light"}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.gate}>
            <View style={styles.headRow}>
              <Ionicons name="lock-closed" size={18} color={colors.pro} />
              <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.gateTitle}>
                {t("help.pro.gateTitle")}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.gateSubtitle}>
              {t("help.pro.gateSubtitle")}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowPaywall(true)}
              style={({ pressed }) => [styles.gateButton, pressed && styles.pressed]}
            >
              <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.gateButtonText}>
                {gateButtonLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <PaywallSheet visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 14,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowTitle,
      fontWeight: "700",
    },
    inner: {
      position: "relative",
      // BlurView needs to clip cleanly within the card — round the inner
      // wrap so the blur doesn't bleed past the corners.
      borderRadius: 14,
      overflow: "hidden",
      // Floor the height so the Pro gate always has breathing room.
      minHeight: 200,
      justifyContent: "center",
    },
    skeleton: {
      ...StyleSheet.absoluteFillObject,
      padding: 16,
      gap: 12,
      justifyContent: "center",
    },
    skeletonBar: {
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.borderSoft,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      padding: 8,
    },
    gate: {
      width: "100%",
      maxWidth: 340,
      borderRadius: 16,
      backgroundColor: colors.proLight,
      borderWidth: 1,
      borderColor: colors.pro,
      paddingHorizontal: 18,
      paddingVertical: 18,
      alignItems: "center",
      gap: 6,
    },
    headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    gateTitle: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.headline,
      fontWeight: "700",
    },
    gateSubtitle: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.caption1,
      textAlign: "center",
      marginBottom: 6,
    },
    gateButton: {
      width: "100%",
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: colors.pro,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    gateButtonText: {
      color: "#FFFFFF",
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowSecondary,
      fontWeight: "600",
    },
    pressed: { opacity: 0.85 },
  });
}
