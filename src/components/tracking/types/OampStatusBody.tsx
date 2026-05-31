import { StyleSheet, Text, View } from "react-native";

import { fonts, typeStyles, useColors } from "@/components/ui";
import type { Tracking } from "@/lib/types";
import { t } from "@/lib/i18n";

export function OampStatusBody({ tracking }: { tracking: Tracking }) {
  const colors = useColors();
  return (
    <View style={styles.body}>
      <Text style={[styles.title, { color: colors.text }]}>{t("tracking.types.oamp_status.title")}</Text>
      <Text selectable style={[styles.subtitle, { color: colors.muted2 }]} numberOfLines={1}>
        {tracking.identifier}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: fonts.bodyBold,
    ...typeStyles.callout,
  },
  subtitle: {
    fontFamily: fonts.bodyMedium,
    ...typeStyles.footnote,
  },
});
