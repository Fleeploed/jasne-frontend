import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";
import type { DeadlineResponse } from "@/lib/types";
import type { DeadlinesStyles } from "@/features/deadlines/components/deadlinesStyles";
import { daysUntil, parseDayMonthAbbr, tileColors, urgencyTone } from "@/features/deadlines/components/deadlinesData";

export function DeleteDeadlineModal({
  item,
  colors,
  styles,
  onCancel,
  onConfirm,
}: {
  item: DeadlineResponse | null;
  colors: ColorPalette;
  styles: DeadlinesStyles;
  onCancel: () => void;
  onConfirm: (item: DeadlineResponse) => void;
}) {
  if (!item) return null;
  const tone = urgencyTone(daysUntil(item.due_date));
  const tile = tileColors(tone, colors);
  const { day, month } = parseDayMonthAbbr(item.due_date);
  const description = item.description?.replace(/\n+/g, " ").trim();

  return (
    // animationType="none": Android on RN 0.76 + New Arch is unreliable with
    // animated Modals (see ManualDeadlineModal) — a fresh-mounted plain dialog
    // is the safe pattern.
    <Modal visible transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.deleteBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.deleteCard}>
          <View style={styles.deletePreview}>
            <View style={[styles.dateTile, { backgroundColor: tile.bg }]}>
              <Text style={[styles.dateTileDay, { color: tile.fg }]}>{day}</Text>
              <Text style={[styles.dateTileMonth, { color: tile.fg }]}>{month}</Text>
            </View>
            <View style={styles.deletePreviewText}>
              <Text style={styles.deletePreviewTitle} numberOfLines={2}>{item.title}</Text>
              {description ? (
                <Text style={styles.deletePreviewMeta} numberOfLines={1}>{description}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.deleteDivider} />
          <Text style={styles.deleteQuestion}>{t("deadlines.deleteQuestion")}</Text>
          <Text style={styles.deleteHint}>{t("deadlines.deleteHint")}</Text>
          <Pressable
            onPress={() => onConfirm(item)}
            style={({ pressed }) => [styles.deleteConfirmButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.deleteConfirmText}>{t("common.delete")}</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.deleteCancelButton, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.deleteCancelText}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

