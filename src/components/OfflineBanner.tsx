import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, typeStyles, useColors } from "@/components/ui";
import { useIsOffline } from "@/lib/useNetworkStatus";
import { t } from "@/lib/i18n";

/**
 * Thin top overlay shown while the device is offline. Absolutely positioned so
 * it never reflows the navigator underneath — it simply sits over the status
 * bar area and disappears the moment connectivity returns.
 */
export function OfflineBanner() {
  const offline = useIsOffline();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!offline) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.banner,
        { paddingTop: insets.top + 6, backgroundColor: colors.danger },
      ]}
    >
      <Text style={[styles.text, { color: colors.textOnAccent }]} numberOfLines={1}>
        {t("common.offlineBanner")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
    paddingBottom: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  text: {
    fontFamily: fonts.bodySemiBold,
    ...typeStyles.footnote,
  },
});
