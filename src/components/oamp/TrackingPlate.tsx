import { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fonts, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import { trackEvent } from "@/lib/analytics";
import { t } from "@/lib/i18n";

export function TrackingPlate({
  disabled,
  isPro,
  isTracking,
  loading,
  onPress,
}: {
  disabled?: boolean;
  isPro: boolean;
  isTracking: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const label = isPro
    ? isTracking
      ? t("oamp.tracking.proActive")
      : t("oamp.tracking.proCta")
    : t("oamp.tracking.freeCta");

  useEffect(() => {
    trackEvent("oamp_track_plate_shown", { isPro });
  }, [isPro]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.plate,
        !isPro && styles.lockedPlate,
        isTracking && styles.activePlate,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconSlot, isTracking && styles.activeIconSlot]}>
        <Ionicons
          name={isPro ? (isTracking ? "checkmark-circle-outline" : "notifications-outline") : "lock-closed-outline"}
          size={21}
          color={isTracking ? colors.greenDark : isPro ? colors.primary : colors.pro}
        />
      </View>
      <Text numberOfLines={2} style={[styles.label, isTracking && styles.activeLabel]}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={19} color={colors.muted3} />
      )}
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    plate: {
      minHeight: 58,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    lockedPlate: {
      borderColor: colors.pro,
      backgroundColor: colors.proLight,
    },
    activePlate: {
      borderColor: colors.green,
      backgroundColor: colors.greenLight,
    },
    iconSlot: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface2,
    },
    activeIconSlot: {
      backgroundColor: colors.surface,
    },
    label: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
    },
    activeLabel: {
      color: colors.greenDark,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
