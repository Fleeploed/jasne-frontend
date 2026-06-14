import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { ColorPalette } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PaywallSheet } from "@/components/PaywallSheet";
import { createManualDeadline } from "@/features/deadlines/deadlinesApi";
import { t } from "@/lib/i18n";
import type { AnalysisDeadline, DeadlineResponse, UserPlan } from "@/lib/types";
import type { ChatStyles } from "@/features/chat/components/chatStyles";
import { REMINDER_DAYS, REMINDER_SHEET_HIDDEN, REMINDER_TEXT_SCALE, filterUpcomingReminderDays, formatDeadlineDate, formatReminderTriggerDate, parseTimeFromDate, parseTimeFromDescription, reminderOptionTitle, reminderSheetTitle } from "@/features/chat/components/chatData";
import type { ReminderDay } from "@/features/chat/components/chatData";
import { CopyButton } from "@/features/chat/components/CopyButton";

export function DeadlineReminderRow({
  deadline,
  scanId,
  whereToGo,
  plan,
  existingDeadlines,
  deadlinesReady,
  onReminderCreated,
  styles,
  colors,
}: {
  deadline: AnalysisDeadline;
  scanId: string;
  whereToGo: string | null;
  plan: UserPlan;
  existingDeadlines: DeadlineResponse[];
  deadlinesReady: boolean;
  onReminderCreated: (created: DeadlineResponse) => void;
  styles: ChatStyles;
  colors: ColorPalette;
}) {
  const alreadySaved = existingDeadlines.some(
    (d) => d.scan_id === scanId && d.due_date === deadline.date && d.status === "active",
  );
  const [saved, setSaved] = useState(alreadySaved);

  // existingDeadlines arrives asynchronously after mount. Once loaded, keep the
  // button state aligned with the server so deleted/completed reminders unlock it.
  useEffect(() => {
    if (deadlinesReady) setSaved(alreadySaved);
  }, [alreadySaved, deadlinesReady]);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [showReminderSheet, setShowReminderSheet] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const showAddress = (deadline.type === "action" || deadline.type === "response") && Boolean(whereToGo);
  const time = parseTimeFromDescription(deadline.description) ?? parseTimeFromDate(deadline.date);
  const dateLabel = time ? `${formatDeadlineDate(deadline.date)} · ${time}` : formatDeadlineDate(deadline.date);
  const deadlineCopyText = [dateLabel, showAddress && whereToGo ? whereToGo : null].filter(Boolean).join("\n");

  async function handleAdd() {
    if (saved || saving) return;
    setSheetError(null);
    setShowReminderSheet(true);
  }

  async function handleCreateReminder(reminderDays: number[]) {
    const upcomingReminderDays = filterUpcomingReminderDays(deadline.date, reminderDays);
    if (saved || saving || !upcomingReminderDays.length) return;
    setSaving(true);
    setSheetError(null);
    try {
      const created = await createManualDeadline({
        title: deadline.description,
        description: null,
        due_date: deadline.date,
        deadline_type: deadline.type,
        scan_id: scanId,
        reminder_days: upcomingReminderDays,
      });
      setSaved(true);
      onReminderCreated(created);
      setShowReminderSheet(false);
    } catch {
      setSheetError(t("deadlines.createError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <LinearGradient
        colors={["rgba(111,160,230,0.16)", "rgba(111,160,230,0.06)"]}
        style={styles.deadlineCard}
      >
        <View style={styles.sectionTitleRow}>
          <Text style={styles.deadlineCardLabel}>{t(`deadlineType.${deadline.type}` as Parameters<typeof t>[0]).toUpperCase()}</Text>
          <CopyButton text={deadlineCopyText} colors={colors} styles={styles} compact />
        </View>
        <Text style={styles.deadlineCardDate}>{dateLabel}</Text>
        {showAddress && whereToGo ? (
          <View style={styles.deadlineCardAddress}>
            <Text style={styles.deadlineCardPin}>⊙</Text>
            <Text style={styles.deadlineCardAddressText}>{whereToGo}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={handleAdd}
          style={[styles.deadlineCardBtn, saved && styles.deadlineCardBtnSaved]}
          accessibilityLabel={t(saved ? "chat.reminderSaved" : "chat.createReminder")}
          disabled={!deadlinesReady || saved || saving}
        >
          {!deadlinesReady || saving ? (
            <ActivityIndicator size="small" color={colors.textOnAccent} />
          ) : saved ? (
            <Text style={[styles.deadlineCardBtnText, styles.deadlineCardBtnTextSaved]}>
              {`✓  ${t("chat.reminderSaved")}`}
            </Text>
          ) : (
            <>
              <Icon name="calendar" size={16} color={colors.textOnAccent} />
              <Text style={styles.deadlineCardBtnText}>{t("chat.createReminder")}</Text>
            </>
          )}
        </Pressable>
      </LinearGradient>
      <ReminderSheet
        visible={showReminderSheet}
        plan={plan}
        deadline={deadline}
        saving={saving}
        error={sheetError}
        onClose={() => {
          if (!saving) setShowReminderSheet(false);
        }}
        onConfirm={handleCreateReminder}
        onUpgrade={() => {
          setShowReminderSheet(false);
          setShowPaywall(true);
        }}
        colors={colors}
        styles={styles}
      />
      <PaywallSheet visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </>
  );
}

export function ReminderSheet({
  visible,
  plan,
  deadline,
  saving,
  error,
  onClose,
  onConfirm,
  onUpgrade,
  colors,
  styles,
}: {
  visible: boolean;
  plan: UserPlan;
  deadline: AnalysisDeadline;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reminderDays: number[]) => void;
  onUpgrade: () => void;
  colors: ColorPalette;
  styles: ChatStyles;
}) {
  const insets = useSafeAreaInsets();
  const sheetY = useRef(new Animated.Value(REMINDER_SHEET_HIDDEN)).current;
  const isPro = plan === "pro";
  const availableDays = useMemo(() => filterUpcomingReminderDays(deadline.date, REMINDER_DAYS), [deadline.date]);
  const initialDays = useMemo(
    () => (isPro ? availableDays : availableDays.filter((day) => day === 1)),
    [availableDays, isPro],
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(initialDays);

  useEffect(() => {
    if (!visible) return;
    setSelectedDays(initialDays);
    sheetY.setValue(REMINDER_SHEET_HIDDEN);
    Animated.spring(sheetY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 210,
      mass: 0.9,
    }).start();
  }, [initialDays, sheetY, visible]);

  const enabledCount = selectedDays.length;
  const ctaText = enabledCount > 1
    ? t("chat.reminderSheetCtaMany", { count: enabledCount })
    : t("chat.reminderSheetCtaOne");

  function toggleDay(day: ReminderDay) {
    if (!availableDays.includes(day)) return;
    if (!isPro && day !== 1) {
      onUpgrade();
      return;
    }

    setSelectedDays((current) => {
      if (current.includes(day)) return current.filter((item) => item !== day);
      return [...current, day].sort((a, b) => b - a);
    });
  }

  function close() {
    if (!saving) onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={styles.reminderOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View
          style={[
            styles.reminderSheet,
            {
              paddingBottom: Math.max(insets.bottom + 18, 28),
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <View style={styles.reminderHandleWrap}>
            <View style={styles.reminderHandle} />
          </View>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.reminderSheetContent}
          >
            <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderSheetTitle}>
              {reminderSheetTitle(deadline.type)}
            </Text>
            <View style={styles.reminderDueRow}>
              <View style={styles.reminderTypePill}>
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderTypePillText}>
                  {t(`deadlineType.${deadline.type}` as Parameters<typeof t>[0]).toUpperCase()}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} selectable style={styles.reminderDueDate}>
                {formatDeadlineDate(deadline.date)}
              </Text>
            </View>

            <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderSectionTitle}>
              {t("chat.reminderSheetChoose")}
            </Text>

            <View style={styles.reminderOptions}>
              {availableDays.length ? availableDays.map((day, index) => {
                const locked = !isPro && day !== 1;
                return (
                  <ReminderOptionRow
                    key={day}
                    day={day}
                    dateLabel={formatReminderTriggerDate(deadline.date, day)}
                    selected={selectedDays.includes(day)}
                    locked={locked}
                    saving={saving}
                    last={index === availableDays.length - 1}
                    onPress={() => toggleDay(day)}
                    onUpgrade={onUpgrade}
                    colors={colors}
                    styles={styles}
                  />
                );
              }) : (
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderNoOptionsText}>
                  {t("chat.reminderSheetNoOptions")}
                </Text>
              )}
            </View>

            {!isPro ? (
              <View style={styles.reminderProHint}>
                <Icon name="star" size={18} color={colors.pro} />
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderProHintText}>
                  {t("chat.reminderSheetProHint")}
                </Text>
              </View>
            ) : null}

            {error ? <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderErrorText}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ctaText}
              disabled={saving || enabledCount === 0}
              onPress={() => onConfirm(filterUpcomingReminderDays(deadline.date, selectedDays).sort((a, b) => b - a))}
              style={({ pressed }) => [
                styles.reminderCta,
                (saving || enabledCount === 0) && styles.reminderCtaDisabled,
                pressed && !saving && enabledCount > 0 && styles.reminderPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderCtaText}>{ctaText}</Text>
              )}
            </Pressable>

            {!isPro ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("chat.reminderSheetTryPro")}
                disabled={saving}
                onPress={onUpgrade}
                style={({ pressed }) => [styles.reminderUpgradeButton, pressed && styles.reminderPressed]}
              >
                <Icon name="star" size={18} color={colors.pro} />
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderUpgradeText}>
                  {t("chat.reminderSheetTryPro")}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function ReminderOptionRow({
  day,
  dateLabel,
  selected,
  locked,
  saving,
  last,
  onPress,
  onUpgrade,
  colors,
  styles,
}: {
  day: ReminderDay;
  dateLabel: string;
  selected: boolean;
  locked: boolean;
  saving: boolean;
  last: boolean;
  onPress: () => void;
  onUpgrade: () => void;
  colors: ColorPalette;
  styles: ChatStyles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: saving }}
      disabled={saving}
      onPress={locked ? onUpgrade : onPress}
      style={({ pressed }) => [
        styles.reminderOptionRow,
        !last && styles.reminderOptionDivider,
        pressed && styles.reminderPressed,
      ]}
    >
      <View style={[styles.reminderIconTile, locked && styles.reminderIconTileLocked]}>
        <Icon name="bell" size={22} color={locked ? colors.muted3 : colors.primary} />
      </View>
      <View style={styles.reminderOptionTextBlock}>
        <Text
          style={[styles.reminderOptionTitle, locked && styles.reminderOptionTitleLocked]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          maxFontSizeMultiplier={REMINDER_TEXT_SCALE}
        >
          {reminderOptionTitle(day)}
        </Text>
        <Text
          maxFontSizeMultiplier={REMINDER_TEXT_SCALE}
          style={[styles.reminderOptionDate, locked && styles.reminderOptionDateLocked]}
          numberOfLines={1}
        >
          {dateLabel}
        </Text>
      </View>
      {locked ? (
        <View style={styles.reminderLockedBadge}>
          <Icon name="lock-small" size={14} color={colors.pro} />
          <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderLockedBadgeText}>Pro</Text>
        </View>
      ) : null}
      <ReminderToggle selected={selected} disabled={locked || saving} colors={colors} styles={styles} />
    </Pressable>
  );
}

export function ReminderToggle({
  selected,
  disabled,
  colors,
  styles,
}: {
  selected: boolean;
  disabled: boolean;
  colors: ColorPalette;
  styles: ChatStyles;
}) {
  return (
    <View
      style={[
        styles.reminderToggle,
        selected ? styles.reminderToggleOn : styles.reminderToggleOff,
        disabled && styles.reminderToggleDisabled,
        { justifyContent: selected ? "flex-end" : "flex-start" },
      ]}
    >
      <View style={[styles.reminderToggleKnob, disabled && !selected && { backgroundColor: colors.muted3 }]} />
    </View>
  );
}

