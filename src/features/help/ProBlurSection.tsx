import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

import { PaywallSheet } from "@/components/PaywallSheet";
import { fonts, typeStyles, useColors, useThemePreference, type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";

const HELP_TEXT_SCALE = 1;

/**
 * Pro-only Help section, rendered for FREE users only. Pro users should
 * skip this component entirely and render the real section.
 *
 * Layout:
 *   ┌─ contentCard ─────────────────────┐
 *   │ Title (full opacity — readable)   │
 *   │ ┌─ inner (position: relative) ──┐ │
 *   │ │ <real children — full text>   │ │
 *   │ │ <BlurView absoluteFill>       │ │  ← native gaussian blur
 *   │ │ <Pro gate centered overlay>   │ │
 *   │ └────────────────────────────────┘ │
 *   └────────────────────────────────────┘
 *
 * `children` are the real section body (steps / checklist / text without
 * the card wrapper or title — those come from this component). The
 * BlurView sits on top and makes them unreadable; the Pro gate is
 * centered over the blur.
 *
 * Android note: on Android, expo-blur uses a software fallback by default.
 * We opt into the Dimezis blur method which is closer to the iOS look
 * (`experimentalBlurMethod="dimezisBlurView"`). Old/low-end devices may
 * still degrade — that's acceptable; worst case is a darker translucent
 * panel, which still hides the content.
 */
export function ProBlurSection({
  title,
  children,
}: {
  title?: string | null;
  children: ReactNode;
}) {
  const colors = useColors();
  const { scheme } = useThemePreference();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showPaywall, setShowPaywall] = useState(false);

  return (
    <View style={styles.card}>
      {title ? (
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.title}>
          {title}
        </Text>
      ) : null}

      <View style={styles.inner}>
        {/* Real content — kept in the tree so layout/height is natural,
            but the BlurView above makes it unreadable. */}
        <View pointerEvents="none">{children}</View>

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
                {t("help.pro.gateButton")}
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
      // Floor the height in case the real content is very short (e.g. a
      // 2-item checklist) so the Pro gate still has breathing room.
      minHeight: 200,
      justifyContent: "center",
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
