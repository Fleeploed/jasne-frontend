import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import type { ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";
import type { DeadlineResponse, UserPlan } from "@/lib/types";
import type { DeadlinesStyles } from "@/features/deadlines/components/deadlinesStyles";
import { SHEET_DISMISS_DISTANCE, SHEET_DISMISS_VELOCITY, completedDateLabel, daysUntil, filterUpcomingReminderDays, formatReminderDays, parseDateOnly, parseDayMonthAbbr, relativeTime, reminderDisplayPlan, tileColors, urgencyTone } from "@/features/deadlines/components/deadlinesData";

export function ManualDeadlineDetailModal({
  item: itemProp,
  plan,
  colors,
  styles,
  onClose,
  onDismissed,
  onDone,
  onEdit,
  onDelete,
}: {
  item: DeadlineResponse | null;
  plan: UserPlan;
  colors: ColorPalette;
  styles: DeadlinesStyles;
  onClose: () => void;
  onDismissed?: () => void;
  onDone: (item: DeadlineResponse) => void;
  onEdit: (item: DeadlineResponse) => void;
  onDelete: (item: DeadlineResponse) => void;
}) {
  // Keep the last item rendered during the Modal's fade-out so the sheet
  // doesn't blank before iOS finishes dismissing its presented view
  // controller. Unmounting the subtree mid-animation breaks the handoff and
  // can leave the next Modal stuck (so its "Редактировать" button looks dead).
  const [renderedItem, setRenderedItem] = useState<DeadlineResponse | null>(itemProp);
  const detailScrollYRef = useRef(0);
  const detailTranslateY = useRef(new Animated.Value(0)).current;
  const visible = itemProp !== null;

  useEffect(() => {
    if (itemProp) setRenderedItem(itemProp);
  }, [itemProp]);

  useEffect(() => {
    if (visible) {
      detailScrollYRef.current = 0;
      detailTranslateY.setValue(0);
    }
  }, [detailTranslateY, visible]);

  // On Android, RN Modal has no onDismiss callback, so fire after a delay
  // that matches our fade animation (~250ms).
  useEffect(() => {
    if (itemProp !== null || !onDismissed) return;
    if (Platform.OS === "ios") return;
    const timer = setTimeout(() => onDismissed(), 260);
    return () => clearTimeout(timer);
  }, [itemProp, onDismissed]);

  const closeWithDetailDrag = useCallback(() => {
    Animated.timing(detailTranslateY, {
      toValue: 520,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      detailTranslateY.setValue(0);
      onClose();
    });
  }, [detailTranslateY, onClose]);

  const detailPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          if (detailScrollYRef.current > 0) return false;
          return gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx) * 1.2;
        },
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) detailTranslateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > SHEET_DISMISS_DISTANCE || gesture.vy > SHEET_DISMISS_VELOCITY) {
            closeWithDetailDrag();
            return;
          }
          Animated.spring(detailTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 22,
            stiffness: 260,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(detailTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 22,
            stiffness: 260,
          }).start();
        },
      }),
    [closeWithDetailDrag, detailTranslateY]
  );

  const item = itemProp ?? renderedItem;
  if (!item) return null;

  const done = item.status === "completed";
  const days = daysUntil(item.due_date);
  const tone = done ? "done" : urgencyTone(days);
  const tile = tileColors(tone, colors);
  const { day, month } = parseDayMonthAbbr(item.due_date);
  const description = item.description?.trim();
  const reminderPlan = reminderDisplayPlan(item.reminder_days, plan);
  const itemDueDate = parseDateOnly(item.due_date);
  const displayedReminderDays = item.reminder_days.length
    ? filterUpcomingReminderDays(itemDueDate, item.reminder_days)
    : [];
  const reminderLabel = formatReminderDays(displayedReminderDays);
  const reminderText = displayedReminderDays.length
    ? `${t("deadlines.detailRemindBefore")} ${reminderLabel}`
    : t("deadlines.reminderOffSubtitle");
  const reminderMeta = displayedReminderDays.length ? t("deadlines.detailPushPlan", { plan: reminderPlan }) : null;
  const relativePillStyle = {
    backgroundColor: tile.bg,
    borderColor: tile.fg,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      onDismiss={onDismissed}
    >
      <View style={styles.manualDetailBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          {...detailPanResponder.panHandlers}
          style={[styles.manualDetailCard, { transform: [{ translateY: detailTranslateY }] }]}
        >
          <View style={styles.manualDetailHandle} />
          <View style={styles.manualDetailTop}>
            <View style={[styles.manualDetailDateTile, { backgroundColor: tile.bg, borderColor: tile.fg }]}>
              <Text style={[styles.manualDetailDateDay, { color: tile.fg }]}>{day}</Text>
              <Text style={[styles.manualDetailDateMonth, { color: tile.fg }]}>{month}</Text>
            </View>
            <View style={styles.manualDetailTitleBlock}>
              <View style={[styles.manualDetailRelativePill, relativePillStyle]}>
                <Text style={[styles.manualDetailRelative, { color: tile.fg }]}>
                  {done ? completedDateLabel(item.due_date) : relativeTime(item.due_date)}
                </Text>
              </View>
              <Text style={styles.manualDetailTitle}>{item.title}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.manualDetailClose, pressed && styles.pressed]}
              accessibilityLabel={t("common.close")}
              accessibilityRole="button"
            >
              <AppIcon name="x" size={16} color={colors.muted2} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.manualDetailDivider} />

          <ScrollView
            style={styles.manualDetailScroll}
            contentContainerStyle={styles.manualDetailScrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              detailScrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
            }}
            scrollEventThrottle={16}
          >
            {/* Type is hidden in the manual detail sheet for now. */}
            {description ? (
              <ManualDetailField
                label={t("deadlines.detailDescription")}
                value={description}
                styles={styles}
              />
            ) : null}
            <View style={styles.manualDetailSection}>
              <Text style={styles.manualDetailLabel}>{t("deadlines.detailReminders")}</Text>
              <View style={styles.manualReminderRow}>
                <View style={styles.manualReminderIcon}>
                  <AppIcon name="bell" size={16} color={colors.primary} strokeWidth={1.8} />
                </View>
                <View style={styles.manualReminderTextBlock}>
                  <Text style={styles.manualDetailValue}>{reminderText}</Text>
                  {reminderMeta ? <Text style={styles.manualDetailMuted}>{reminderMeta}</Text> : null}
                </View>
              </View>
            </View>

            <View style={styles.manualAddedRow}>
              <AppIcon name="sliders" size={14} color={colors.muted3} strokeWidth={1.8} />
              <Text style={styles.manualDetailMuted}>{t("deadlines.detailAddedManually")}</Text>
            </View>
          </ScrollView>

          <View style={styles.manualDetailActionDivider} />
          <View style={styles.manualDetailActions}>
            {!done ? (
              <Pressable
                onPress={() => onDone(item)}
                style={({ pressed }) => [styles.manualDoneButton, pressed && { opacity: 0.85 }]}
              >
                <AppIcon name="check" size={18} color={colors.textOnAccent} strokeWidth={2.3} />
                <Text style={styles.manualDoneText}>{t("deadlines.completed")}</Text>
              </Pressable>
            ) : null}
            <View style={styles.manualSecondaryActions}>
              <Pressable
                onPress={() => onEdit(item)}
                style={({ pressed }) => [styles.manualSecondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.manualEditText}>{t("common.edit")}</Text>
              </Pressable>
              <Pressable
                onPress={() => onDelete(item)}
                style={({ pressed }) => [styles.manualSecondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.manualDeleteText}>{t("common.delete")}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function ManualDetailField({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: DeadlinesStyles;
}) {
  return (
    <View style={styles.manualDetailSection}>
      <Text style={styles.manualDetailLabel}>{label}</Text>
      <Text style={styles.manualDetailValue}>{value}</Text>
    </View>
  );
}

