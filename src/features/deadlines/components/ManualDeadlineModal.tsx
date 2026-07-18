import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
// Modal uses animationType="none" + a reanimated-driven sheet: on RN 0.76 with
// the New Architecture, Android fails to show a mounted Modal whose `visible`
// flips with animationType="fade" (the add-deadline window simply never
// appeared). All working sheets in the app (PaywallSheet, ReminderSheet,
// ImportSheet) follow this exact pattern.
import Reanimated, {
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { ErrorText, useColors } from "@/components/ui";
import type { ColorPalette } from "@/components/ui";
import { createManualDeadline, updateManualDeadline } from "@/features/deadlines/deadlinesApi";
import { formatLocalizedDate, t } from "@/lib/i18n";
import type { DeadlineResponse, UserPlan } from "@/lib/types";
import { createStyles } from "@/features/deadlines/components/deadlinesStyles";
import type { DeadlinesStyles } from "@/features/deadlines/components/deadlinesStyles";
import { CALENDAR_ANIMATION_MAX_HEIGHT, SHEET_DISMISS_DISTANCE, SHEET_DISMISS_VELOCITY, addDays, filterUpcomingReminderDays, formatManualReminderSubtitle, formatReminderTriggerDate, parseDateOnly, reminderDaysForPlan, reminderOptionLabel } from "@/features/deadlines/components/deadlinesData";

// Off-screen offset the sheet enters from / exits to.
const SHEET_ENTER_OFFSET = 620;

export function ManualDeadlineModal({
  open,
  editing,
  plan,
  onClose,
  onCreated,
}: {
  open: boolean;
  editing?: DeadlineResponse;
  plan: UserPlan;
  onClose: () => void;
  onCreated: (deadline: DeadlineResponse) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Numeric height cap instead of the stylesheet's percentage maxHeight: when
  // the Android keyboard resizes the window, the window height shrinks and the
  // sheet must shrink with it — a bottom-pinned sheet taller than the visible
  // area clips its header off the top of the screen.
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.round(windowHeight * 0.95);
  const scrollRef = useRef<ScrollView>(null);
  const sheetScrollYRef = useRef(0);
  const sheetTranslateY = useSharedValue(SHEET_ENTER_OFFSET);
  const backdropOpacity = useSharedValue(0);
  const calendarProgress = useSharedValue(editing ? 1 : 0);

  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [date, setDate] = useState(() => {
    if (editing) return parseDateOnly(editing.due_date);
    const d = new Date(); d.setDate(d.getDate() + 1); return d;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false);
  const [calendarMounted, setCalendarMounted] = useState(() => Boolean(editing));

  useEffect(() => {
    if (open) {
      sheetScrollYRef.current = 0;
      // The sheet stays mounted between opens — make sure the form is scrolled
      // back to the top so the header is always the first thing visible.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      // Slide the sheet in and fade the dim ourselves (Modal animation is "none").
      cancelAnimation(sheetTranslateY);
      cancelAnimation(backdropOpacity);
      sheetTranslateY.value = SHEET_ENTER_OFFSET;
      sheetTranslateY.value = withSpring(0, { damping: 24, stiffness: 240, mass: 0.9 });
      backdropOpacity.value = 0;
      backdropOpacity.value = withTiming(1, { duration: 160 });
      calendarProgress.value = editing ? 1 : 0;
      setCalendarMounted(Boolean(editing));
    }
  }, [backdropOpacity, calendarProgress, editing, open, sheetTranslateY]);

  // Sync form state when the modal opens or switches to a different deadline.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setDate(parseDateOnly(editing.due_date));
    } else {
      const t2 = new Date();
      t2.setDate(t2.getDate() + 1);
      setTitle("");
      setDescription("");
      setDate(t2);
    }
    setError(null);
  }, [editing, open]);

  const dueDateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  async function save() {
    setSaving(true);
    setError(null);
    const reminderDays = reminderDaysToSave;
    try {
      let deadline: DeadlineResponse;
      if (editing) {
        deadline = await updateManualDeadline(editing.id, {
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDateString,
          reminder_days: reminderDays,
        });
      } else {
        deadline = await createManualDeadline({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDateString,
          deadline_type: "action",
          reminder_days: reminderDays,
        });
      }
      onCreated(deadline);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : editing ? t("deadlines.updateError") : t("deadlines.createError"));
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = title.trim().length > 0 && !saving;

  // Reminder switch — Free saves [1], Pro saves early reminders [30,14,7,1].
  // When off, saves with [] (no notification).
  const [remindEnabled, setRemindEnabled] = useState(() => (editing ? editing.reminder_days.length > 0 : true));
  const [selectedReminderDays, setSelectedReminderDays] = useState<number[]>(() =>
    editing ? editing.reminder_days : reminderDaysForPlan(plan, date)
  );
  // Preset / custom mode for the date picker. Calendar only renders in custom.
  const [dateMode, setDateMode] = useState<"tomorrow" | "week" | "month" | "custom">(() =>
    editing ? "custom" : "tomorrow"
  );
  const availableReminderDays = useMemo(() => reminderDaysForPlan(plan, date), [date, plan]);

  // Reset form state when the modal opens or switches between create/edit.
  // Intentionally NOT depending on `date` — the user can change date freely
  // via presets/calendar without their preset choice being reverted.
  // Date-driven reminder updates are handled by the next effect.
  useEffect(() => {
    if (!open) return;
    const seedDate = editing ? parseDateOnly(editing.due_date) : date;
    const initialReminderDays = editing
      ? filterUpcomingReminderDays(seedDate, editing.reminder_days)
      : reminderDaysForPlan(plan, seedDate);
    setRemindEnabled(editing ? initialReminderDays.length > 0 : true);
    setSelectedReminderDays(initialReminderDays);
    setDateMode(editing ? "custom" : "tomorrow");
    setReminderPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, open, plan]);

  useEffect(() => {
    if (!open) return;
    setSelectedReminderDays((current) => {
      const availableSet = new Set(availableReminderDays);
      const next = current.filter((day) => availableSet.has(day));
      if (next.length || !remindEnabled) return next;
      return availableReminderDays;
    });
  }, [availableReminderDays, open, remindEnabled]);

  const reminderDaysToSave = remindEnabled
    ? filterUpcomingReminderDays(date, selectedReminderDays).sort((a, b) => b - a)
    : [];

  const reminderSubtitle = remindEnabled
    ? formatManualReminderSubtitle(reminderDaysToSave, date)
    : t("deadlines.reminderOffSubtitle");

  const calendarAnimatedStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(calendarProgress.value, [0, 1], [0, CALENDAR_ANIMATION_MAX_HEIGHT]),
    opacity: calendarProgress.value,
    transform: [{ translateY: interpolate(calendarProgress.value, [0, 1], [-8, 0]) }],
  }));

  useEffect(() => {
    if (!open) return;
    const shouldShowCalendar = dateMode === "custom";
    cancelAnimation(calendarProgress);
    if (shouldShowCalendar) setCalendarMounted(true);
    calendarProgress.value = withTiming(
      shouldShowCalendar ? 1 : 0,
      { duration: shouldShowCalendar ? 220 : 170 },
      (finished) => {
        if (finished && !shouldShowCalendar) runOnJS(setCalendarMounted)(false);
      }
    );
  }, [calendarProgress, dateMode, open]);

  function setReminderEnabled(next: boolean) {
    setRemindEnabled(next);
    if (next) {
      setSelectedReminderDays((current) => {
        const availableSet = new Set(availableReminderDays);
        const kept = current.filter((day) => availableSet.has(day));
        return kept.length ? kept : availableReminderDays;
      });
    } else {
      setReminderPickerOpen(false);
    }
  }

  function toggleReminderDay(day: number) {
    setSelectedReminderDays((current) => {
      if (current.includes(day)) return current.filter((item) => item !== day);
      return [...current, day].sort((a, b) => b - a);
    });
  }

  // Animated close for EVERY dismiss path (drag, X, backdrop tap, back
  // button) — with animationType="none" the Modal itself no longer animates.
  const animatedClose = useCallback(() => {
    setReminderPickerOpen(false);
    backdropOpacity.value = withTiming(0, { duration: 160 });
    sheetTranslateY.value = withTiming(SHEET_ENTER_OFFSET, { duration: 180 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }, [backdropOpacity, onClose, sheetTranslateY]);

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          if (reminderPickerOpen) return false;
          if (sheetScrollYRef.current > 0) return false;
          return gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx) * 1.2;
        },
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) sheetTranslateY.value = gesture.dy;
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > SHEET_DISMISS_DISTANCE || gesture.vy > SHEET_DISMISS_VELOCITY) {
            animatedClose();
            return;
          }
          sheetTranslateY.value = withSpring(0, { damping: 22, stiffness: 260 });
        },
        onPanResponderTerminate: () => {
          sheetTranslateY.value = withSpring(0, { damping: 22, stiffness: 260 });
        },
      }),
    [animatedClose, reminderPickerOpen, sheetTranslateY]
  );

  const backdropAnimatedStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={animatedClose} statusBarTranslucent>
      <Reanimated.View style={[styles.sheetBackdrop, backdropAnimatedStyle]}>
        {/* Tap outside the sheet to dismiss. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={animatedClose} />

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetKAV}>
          <Reanimated.View
            {...sheetPanResponder.panHandlers}
            style={[styles.sheetContainer, { maxHeight: sheetMaxHeight }, sheetAnimatedStyle]}
          >
            {/* Drag handle */}
            <View style={styles.sheetHandle} />

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={(event) => {
                sheetScrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
              }}
              scrollEventThrottle={16}
            >
              {/* Header — title + X close */}
              <View style={styles.sheetHeaderRow}>
                <Text style={styles.sheetTitle}>
                  {editing ? t("deadlines.editTitle") : t("deadlines.newTitle")}
                </Text>
                <Pressable
                  onPress={animatedClose}
                  hitSlop={8}
                  style={({ pressed }) => [styles.modalCloseButton, pressed && styles.pressed]}
                  accessibilityLabel={t("common.close")}
                  accessibilityRole="button"
                >
                  <AppIcon name="x" size={16} color={colors.muted} strokeWidth={2.2} />
                </Pressable>
              </View>

              {/* Title input */}
              <View style={styles.sheetTitleInputWrap}>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder={t("deadlines.namePlaceholder")}
                  placeholderTextColor={colors.muted3}
                  style={styles.sheetTitleInput}
                  // iOS only: on Android the immediate keyboard shrinks the
                  // window while the sheet is still entering, and the sheet
                  // top (header + title) ends up clipped off-screen. Let the
                  // sheet open fully first; the user taps the field to type.
                  autoFocus={!editing && Platform.OS === "ios"}
                />
              </View>

              {/* Когда? */}
              <Text style={styles.sheetSectionLabel}>{t("deadlines.whenLabel")}</Text>
              <DatePresetRow
                date={date}
                mode={dateMode}
                onPick={(nextMode, nextDate) => {
                  setDateMode(nextMode);
                  if (nextDate) setDate(nextDate);
                }}
                colors={colors}
                styles={styles}
              />

              {/* Calendar — only shown when "Дата" preset is chosen */}
              {calendarMounted ? (
                <Reanimated.View
                  pointerEvents={dateMode === "custom" ? "auto" : "none"}
                  style={[styles.sheetCalendarAnimated, calendarAnimatedStyle]}
                >
                  <View style={styles.sheetCalendarWrap}>
                    <CalendarPicker value={date} onChange={setDate} colors={colors} styles={styles} />
                  </View>
                </Reanimated.View>
              ) : null}

              {/* Reminder toggle */}
              <View style={styles.reminderRow}>
                <Pressable
                  disabled={!remindEnabled}
                  onPress={() => setReminderPickerOpen(true)}
                  style={({ pressed }) => [styles.reminderPickerTrigger, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t("deadlines.reminderTitle")}
                >
                  <View style={styles.reminderIconTile}>
                    <AppIcon name="bell" size={18} color={remindEnabled ? colors.brandBlue : colors.muted2} strokeWidth={1.8} />
                  </View>
                  <View style={styles.reminderTextBlock}>
                    <Text style={styles.reminderTitle} numberOfLines={1}>
                      {t("deadlines.reminderTitle")}
                    </Text>
                    <Text style={styles.reminderSubtitle} numberOfLines={2}>
                      {reminderSubtitle}
                    </Text>
                  </View>
                  {remindEnabled ? <AppIcon name="chevron-right" size={20} color={colors.muted3} strokeWidth={2} /> : null}
                </Pressable>
                <View style={styles.reminderSwitchWrap}>
                  <Switch
                    value={remindEnabled}
                    onValueChange={setReminderEnabled}
                    trackColor={{ false: colors.surface3, true: colors.brandBlue }}
                    thumbColor={colors.textOnAccent}
                    ios_backgroundColor={colors.surface3}
                    style={styles.reminderSwitch}
                  />
                </View>
              </View>

              {/* Optional note field at the bottom */}
              <View style={styles.sheetNoteWrap}>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t("deadlines.notePlaceholder")}
                  placeholderTextColor={colors.muted3}
                  style={styles.sheetNoteInput}
                  multiline
                  // The note sits at the bottom of the scrollable form. The
                  // keyboard would otherwise cover it — scroll the field into
                  // view on focus and again as the user types more lines.
                  onFocus={() => {
                    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
                  }}
                  onContentSizeChange={() => {
                    scrollRef.current?.scrollToEnd({ animated: true });
                  }}
                />
              </View>

              <ErrorText message={error} />
            </ScrollView>

            {/* Sticky CTA footer — pinned outside ScrollView so it never gets
                clipped by the bottom sheet's maxHeight. Inset bumps it clear
                of the home indicator on notch iPhones. */}
            <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <Pressable
                onPress={() => save()}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.modalPrimaryButton,
                  !canSubmit && styles.modalPrimaryButtonDisabled,
                  pressed && canSubmit && { opacity: 0.85 },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.textOnAccent} />
                ) : (
                  <Text style={styles.modalPrimaryText}>
                    {editing ? t("common.save") : t("deadlines.addDeadlineCta")}
                  </Text>
                )}
              </Pressable>
            </View>
          </Reanimated.View>
        </KeyboardAvoidingView>
        <Modal
          visible={reminderPickerOpen && open}
          transparent
          animationType="none"
          onRequestClose={() => setReminderPickerOpen(false)}
          statusBarTranslucent
        >
          <View style={styles.reminderPickerBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setReminderPickerOpen(false)} />
            <View style={styles.reminderPickerCard}>
              <View style={styles.reminderPickerHeader}>
                <Text style={styles.reminderPickerTitle}>{t("deadlines.reminderTitle")}</Text>
                <Pressable
                  onPress={() => setReminderPickerOpen(false)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.reminderPickerClose, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                >
                  <AppIcon name="x" size={16} color={colors.muted2} strokeWidth={2.2} />
                </Pressable>
              </View>

              <View style={styles.reminderPickerOptions}>
                {availableReminderDays.length ? availableReminderDays.map((day, index) => {
                  const selected = selectedReminderDays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() => toggleReminderDay(day)}
                      style={({ pressed }) => [
                        styles.reminderPickerOption,
                        index < availableReminderDays.length - 1 && styles.reminderPickerOptionDivider,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                    >
                      <View style={[styles.reminderPickerCheck, selected && styles.reminderPickerCheckSelected]}>
                        {selected ? <AppIcon name="check" size={14} color={colors.textOnAccent} strokeWidth={2.4} /> : null}
                      </View>
                      <View style={styles.reminderPickerOptionText}>
                        <Text style={styles.reminderPickerOptionTitle}>{reminderOptionLabel(day)}</Text>
                        <Text style={styles.reminderPickerOptionDate}>{formatReminderTriggerDate(date, day)}</Text>
                      </View>
                    </Pressable>
                  );
                }) : (
                  <Text style={styles.reminderPickerEmpty}>{t("deadlines.reminderNoOptions")}</Text>
                )}
              </View>

              <Pressable
                onPress={() => setReminderPickerOpen(false)}
                style={({ pressed }) => [styles.reminderPickerDone, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t("common.ok")}
              >
                <Text style={styles.reminderPickerDoneText}>{t("common.ok")}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </Reanimated.View>
    </Modal>
  );
}


/**
 * 4 preset chips — Завтра / Неделя / Месяц / Дата.
 * Each non-custom chip shows the resolved date below the label so the user
 * sees the actual date before tapping. "Дата" chip switches to custom mode
 * and reveals the calendar grid below.
 */
export function DatePresetRow({
  date,
  mode,
  onPick,
  colors,
  styles,
}: {
  date: Date;
  mode: "tomorrow" | "week" | "month" | "custom";
  onPick: (mode: "tomorrow" | "week" | "month" | "custom", date: Date | null) => void;
  colors: ColorPalette;
  styles: DeadlinesStyles;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }, []);

  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);
  const month = addDays(today, 30);

  const presets: { key: "tomorrow" | "week" | "month"; label: string; date: Date }[] = [
    { key: "tomorrow", label: t("deadlines.presetTomorrow"), date: tomorrow },
    { key: "week", label: t("deadlines.presetWeek"), date: week },
    { key: "month", label: t("deadlines.presetMonth"), date: month },
  ];

  return (
    <View style={styles.chipRow}>
      {presets.map((preset) => {
        const active = mode === preset.key;
        return (
          <Pressable
            key={preset.key}
            onPress={() => onPick(preset.key, preset.date)}
            style={({ pressed }) => [
              styles.chipBlock,
              active && styles.chipBlockActive,
              pressed && styles.pressed,
            ]}
          >
            {/* numberOfLines + adjustsFontSizeToFit: keep label on one line
                and shrink font (down to 70% of original) instead of wrapping
                "Tomorrow" to two lines on narrow chips. */}
            <Text
              style={[styles.chipLabel, active && styles.chipLabelActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {preset.label}
            </Text>
            <Text
              style={[styles.chipSubLabel, active && styles.chipSubLabelActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {/* Short month form ("Jun 17" / "17 черв") fits chip better than "June 17". */}
              {formatLocalizedDate(preset.date, { day: "numeric", month: "short" })}
            </Text>
          </Pressable>
        );
      })}
      {/* Дата chip — toggles calendar visibility */}
      <Pressable
        onPress={() => onPick("custom", null)}
        style={({ pressed }) => [
          styles.chipBlock,
          mode === "custom" && styles.chipBlockActive,
          pressed && styles.pressed,
        ]}
      >
        <Text
          style={[styles.chipLabel, mode === "custom" && styles.chipLabelActive]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {t("deadlines.presetCustom")}
        </Text>
        <Text
          style={[styles.chipSubLabel, mode === "custom" && styles.chipSubLabelActive]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {mode === "custom"
            ? formatLocalizedDate(date, { day: "numeric", month: "short" })
            : t("deadlines.presetCustomHint")}
        </Text>
      </Pressable>
    </View>
  );
}


export function CalendarPicker({ value, onChange, colors, styles }: {
  value: Date;
  onChange: (d: Date) => void;
  colors: ColorPalette;
  styles: DeadlinesStyles;
}) {
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  useEffect(() => {
    setView((current) => {
      if (current.getFullYear() === value.getFullYear() && current.getMonth() === value.getMonth()) {
        return current;
      }
      return new Date(value.getFullYear(), value.getMonth(), 1);
    });
  }, [value]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Mon = 0
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const monthLabel = formatLocalizedDate(view, { month: "long", year: "numeric" });
  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 1); // Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return formatLocalizedDate(d, { weekday: "short" });
    });
  }, []);

  function shiftMonth(delta: number) {
    setView(new Date(year, month + delta, 1));
  }

  function pick(day: number) {
    const next = new Date(year, month, day);
    if (next < today) return;
    onChange(next);
  }

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <View style={styles.calWrap}>
      <View style={styles.calHeader}>
        <Pressable onPress={() => shiftMonth(-1)} accessibilityRole="button" accessibilityLabel={t("deadlines.calPrevMonth")} style={({ pressed }) => [styles.calNav, pressed && styles.pressed]}>
          <AppIcon name="chevron-left" size={23} color={colors.text} />
        </Pressable>
        <Text style={styles.calMonth}>{monthLabel}</Text>
        <Pressable onPress={() => shiftMonth(1)} accessibilityRole="button" accessibilityLabel={t("deadlines.calNextMonth")} style={({ pressed }) => [styles.calNav, pressed && styles.pressed]}>
          <AppIcon name="chevron-right" size={23} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.calWeekRow}>
        {weekdays.map((w, i) => (
          <Text key={i} style={styles.calWeekday}>{w}</Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.calGridRow}>
            {week.map((day, dayIndex) => {
              const key = `${weekIndex}-${dayIndex}`;
              if (day === null) return <View key={key} style={styles.calCell} />;
              const cellDate = new Date(year, month, day);
              const past = cellDate < today;
              const selected = sameDay(cellDate, value);
              const isToday = sameDay(cellDate, today);
              return (
                <Pressable
                  key={key}
                  disabled={past}
                  onPress={() => pick(day)}
                  style={({ pressed }) => [styles.calCell, pressed && !past && styles.pressed]}
                >
                  <View style={[
                    styles.calDay,
                    selected && styles.calDaySelected,
                    isToday && !selected && styles.calDayToday
                  ]}>
                    <Text style={[
                      styles.calDayText,
                      past && styles.calDayPast,
                      selected && styles.calDayTextSelected
                    ]}>{day}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
