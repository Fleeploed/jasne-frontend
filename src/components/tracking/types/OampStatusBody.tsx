import { StyleSheet, Text, View } from "react-native";

import { fonts, typeStyles, useColors } from "@/components/ui";
import type { Tracking } from "@/lib/types";
import { t } from "@/lib/i18n";

// Backend statuses include terminal/error variants the OampStatus enum on the
// frontend doesn't carry: `error`, `not_found_stopped`, `error_stopped`.
// Collapse them onto the four titles we actually translate so the card never
// shows a raw i18n key like "oamp.status.error.title".
const STATUS_LABEL_KEY: Record<string, "probiha" | "schvaleno" | "zamitnuto" | "not_found" | "error"> = {
  probiha: "probiha",
  schvaleno: "schvaleno",
  zamitnuto: "zamitnuto",
  not_found: "not_found",
  not_found_stopped: "not_found",
  error: "error",
  error_stopped: "error",
};

export function OampStatusBody({ tracking }: { tracking: Tracking }) {
  const colors = useColors();
  const rawStatus = tracking.current_status ?? "probiha";
  const labelKey = STATUS_LABEL_KEY[rawStatus] ?? "probiha";
  const statusLabel = t(`oamp.status.${labelKey}.title` as Parameters<typeof t>[0]);
  return (
    <View style={styles.body}>
      <Text style={[styles.title, { color: colors.text }]}>
        {t("tracking.types.oamp_status.title")}
        {" — "}
        {statusLabel}
      </Text>
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
