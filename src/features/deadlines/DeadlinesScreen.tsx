import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, Vibration, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { Button, EmptyState, ErrorText, Field, Screen, useColors, type ColorPalette } from "@/components/ui";
import { completeDeadline, createManualDeadline, deleteDeadline, listDeadlines, updateManualDeadline } from "@/features/deadlines/deadlinesApi";
import { formatLocalizedDate, t } from "@/lib/i18n";
import type { DeadlineResponse } from "@/lib/types";

const HORIZONTAL_PADDING = 24;
const SWIPE_ACTION_WIDTH = 92;
const SWIPE_LEFT_ACTION_WIDTH = 72;
const SWIPE_LEFT_WIDTH = SWIPE_LEFT_ACTION_WIDTH * 2;
const SWIPE_RIGHT_WIDTH = SWIPE_ACTION_WIDTH;
const SWIPE_LEFT_THRESHOLD = SWIPE_LEFT_WIDTH * 0.45;
const SWIPE_RIGHT_COMMIT_THRESHOLD = SWIPE_RIGHT_WIDTH * 0.75;
const DEADLINE_ROW_RADIUS = 18;

export function DeadlinesScreen() {
  const colors = useColors();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.max(0, screenWidth - HORIZONTAL_PADDING * 2);

  const [deadlines, setDeadlines] = useState<DeadlineResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<DeadlineResponse | null>(null);
  const [openDeadlineId, setOpenDeadlineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sections = useMemo(() => groupDeadlines(deadlines), [deadlines]);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      // load all (active + completed) so user can see what's done
      const all = await listDeadlines(false);
      if (!aliveRef.current) return;
      setDeadlines([...all].sort(compareDeadlines));
    } catch (loadError) {
      if (!aliveRef.current) return;
      setError(loadError instanceof Error ? loadError.message : t("deadlines.loadError"));
    } finally {
      if (aliveRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function markDone(deadlineId: string) {
    try {
      const updated = await completeDeadline(deadlineId);
      // replace in list instead of removing — user sees it as completed
      setDeadlines((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)).sort(compareDeadlines)
      );
    } catch (doneError) {
      setError(doneError instanceof Error ? doneError.message : t("deadlines.completeError"));
    }
  }

  async function removeDeadline(deadlineId: string) {
    try {
      await deleteDeadline(deadlineId);
      setDeadlines((current) => current.filter((item) => item.id !== deadlineId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("deadlines.deleteError"));
    }
  }

  function confirmDelete(item: DeadlineResponse) {
    Alert.alert(
      t("deadlines.deleteTitle"),
      item.title,
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: () => void removeDeadline(item.id) },
      ]
    );
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>{t("deadlines.title")}</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setModalOpen(true)}
            style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
            hitSlop={8}
          >
            <Text style={styles.headerIconText}>+</Text>
          </Pressable>
        </View>
      </View>
      <ErrorText message={error} />
      <ScrollView
        contentContainerStyle={deadlines.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        {deadlines.length ? (
          sections.map((section, sectionIndex) => (
            <View key={`${section.title}-${sectionIndex}`} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionCards}>
                {section.data.map((item) => (
                  <DeadlineCard
                    key={item.id}
                    item={item}
                    colors={colors}
                    styles={styles}
                    cardWidth={cardWidth}
                    openDeadlineId={openDeadlineId}
                    setOpenDeadlineId={setOpenDeadlineId}
                    onDone={markDone}
                    onEdit={setEditingDeadline}
                    onDelete={confirmDelete}
                    onOpenScan={(scanId) => router.push(`/scan/${scanId}`)}
                  />
                ))}
              </View>
            </View>
          ))
        ) : (
          <EmptyState title={t("deadlines.emptyTitle")} detail={t("deadlines.emptyDetail")} />
        )}
      </ScrollView>
      <ManualDeadlineModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(deadline) => {
          setDeadlines((current) => [...current, deadline].sort(compareDeadlines));
          setModalOpen(false);
        }}
      />
      <ManualDeadlineModal
        open={editingDeadline !== null}
        editing={editingDeadline ?? undefined}
        onClose={() => setEditingDeadline(null)}
        onCreated={(updated) => {
          setDeadlines((current) =>
            current.map((d) => (d.id === updated.id ? updated : d)).sort(compareDeadlines)
          );
          setEditingDeadline(null);
        }}
      />
    </Screen>
  );
}

function DeadlineCard({
  item,
  colors,
  styles,
  cardWidth,
  openDeadlineId,
  setOpenDeadlineId,
  onDone,
  onEdit,
  onDelete,
  onOpenScan,
}: {
  item: DeadlineResponse;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  cardWidth: number;
  openDeadlineId: string | null;
  setOpenDeadlineId: (deadlineId: string | null) => void;
  onDone: (deadlineId: string) => Promise<void>;
  onEdit: (deadline: DeadlineResponse) => void;
  onDelete: (deadline: DeadlineResponse) => void;
  onOpenScan: (scanId: string) => void;
}) {
  const done = item.status === "completed";
  const activeSwipe = openDeadlineId === item.id;
  const spineColor = done ? colors.muted3 : getUrgencyColor(item.due_date, colors);
  const days = daysUntil(item.due_date);
  const translateX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);
  const thresholdVibrated = useRef(false);

  const animateTo = useCallback(
    (toValue: number, after?: () => void) => {
      Animated.spring(translateX, {
        toValue,
        useNativeDriver: true,
        damping: 22,
        stiffness: 260,
        mass: 0.85,
      }).start(({ finished }) => {
        if (!finished) return;
        currentX.current = toValue;
        after?.();
      });
    },
    [translateX]
  );

  const closeRow = useCallback(() => {
    thresholdVibrated.current = false;
    currentX.current = 0;
    animateTo(0);
  }, [animateTo]);

  useEffect(() => {
    if (done || (openDeadlineId !== null && openDeadlineId !== item.id)) {
      closeRow();
    }
  }, [closeRow, done, item.id, openDeadlineId]);

  const openLeftActions = useCallback(() => {
    currentX.current = -SWIPE_LEFT_WIDTH;
    setOpenDeadlineId(item.id);
    animateTo(-SWIPE_LEFT_WIDTH);
  }, [animateTo, item.id, setOpenDeadlineId]);

  const openRightAction = useCallback(() => {
    currentX.current = SWIPE_RIGHT_WIDTH;
    setOpenDeadlineId(item.id);
    animateTo(SWIPE_RIGHT_WIDTH);
  }, [animateTo, item.id, setOpenDeadlineId]);

  const commitEdit = useCallback(() => {
    setOpenDeadlineId(null);
    closeRow();
    onEdit(item);
  }, [closeRow, item, onEdit, setOpenDeadlineId]);

  const commitDelete = useCallback(() => {
    setOpenDeadlineId(null);
    closeRow();
    onDelete(item);
  }, [closeRow, item, onDelete, setOpenDeadlineId]);

  const commitDone = useCallback(() => {
    setOpenDeadlineId(null);
    Animated.spring(translateX, {
      toValue: SWIPE_RIGHT_WIDTH,
      useNativeDriver: true,
      damping: 22,
      stiffness: 260,
      mass: 0.85,
    }).start(() => {
      currentX.current = SWIPE_RIGHT_WIDTH;
      void onDone(item.id);
    });
  }, [item.id, onDone, setOpenDeadlineId, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !done && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          if (openDeadlineId !== item.id) {
            setOpenDeadlineId(item.id);
          }
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.max(-SWIPE_LEFT_WIDTH, Math.min(SWIPE_RIGHT_WIDTH, currentX.current + gesture.dx));
          translateX.setValue(next);

          if ((next <= -SWIPE_LEFT_THRESHOLD || next >= SWIPE_RIGHT_COMMIT_THRESHOLD) && !thresholdVibrated.current) {
            thresholdVibrated.current = true;
            Vibration.vibrate(8);
          }
          if (next > -SWIPE_LEFT_THRESHOLD && next < SWIPE_RIGHT_COMMIT_THRESHOLD) {
            thresholdVibrated.current = false;
          }
        },
        onPanResponderRelease: (_, gesture) => {
          const next = Math.max(-SWIPE_LEFT_WIDTH, Math.min(SWIPE_RIGHT_WIDTH, currentX.current + gesture.dx));
          const fastLeft = gesture.vx < -0.35;
          const fastRight = gesture.vx > 0.35;

          if (next >= SWIPE_RIGHT_COMMIT_THRESHOLD) {
            commitDone();
            return;
          }
          if (next <= -SWIPE_LEFT_THRESHOLD || fastLeft) {
            openLeftActions();
            return;
          }
          if (next >= SWIPE_RIGHT_WIDTH * 0.45 || fastRight) {
            openRightAction();
            return;
          }
          setOpenDeadlineId(null);
          closeRow();
        },
        onPanResponderTerminate: () => {
          setOpenDeadlineId(null);
          closeRow();
        },
      }),
    [closeRow, commitDone, done, item.id, openDeadlineId, openLeftActions, openRightAction, setOpenDeadlineId, translateX]
  );

  const card = (
    <View style={[styles.deadline, activeSwipe && styles.deadlineSwiping, done && styles.deadlineDone, { width: cardWidth }]}>
      <View style={[styles.spine, { backgroundColor: spineColor }]} />
      <View style={styles.deadlineBody}>
        <View style={styles.deadlineTop}>
          <Text style={[styles.date, done && styles.dateDone]} numberOfLines={1} ellipsizeMode="tail">
            {formatDayMonth(item.due_date)}
          </Text>
          {!done ? (
            <View style={[styles.relativePill, { backgroundColor: getUrgencyPillBg(days, colors) }]}>
              <Text style={[styles.relativePillText, { color: getUrgencyPillText(days, colors) }]} numberOfLines={1}>
                {relativeTime(item.due_date)}
              </Text>
            </View>
          ) : (
            <Text style={styles.doneCheck}>✓</Text>
          )}
        </View>
        <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2} ellipsizeMode="tail">{item.title}</Text>
        <Text style={[styles.description, done && styles.descriptionDone]} numberOfLines={2} ellipsizeMode="tail">
          {deadlineMeta(item)}
        </Text>
      </View>
    </View>
  );

  if (done) {
    return (
      <Pressable
        onPress={() => {
          if (item.scan_id) onOpenScan(item.scan_id);
        }}
        style={({ pressed }) => [styles.rowShell, { width: cardWidth }, pressed && styles.pressed]}
      >
        {card}
      </Pressable>
    );
  }

  return (
    <View style={[styles.rowShell, { width: cardWidth }]}>
      <View style={styles.swipeActionLayer} pointerEvents="box-none">
        <Pressable onPress={commitDone} style={({ pressed }) => [styles.swipeDoneArea, pressed && styles.pressed]}>
          <Text style={styles.swipeDoneText}>✓</Text>
        </Pressable>
        <View style={styles.swipeLeftActions}>
          <Pressable onPress={commitEdit} style={({ pressed }) => [styles.swipeEditArea, pressed && styles.pressed]}>
            <Text style={styles.swipeEditText}>✎</Text>
          </Pressable>
          <Pressable onPress={commitDelete} style={({ pressed }) => [styles.swipeDeleteArea, pressed && styles.pressed]}>
            <Text style={styles.swipeDeleteText}>×</Text>
          </Pressable>
        </View>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.swipeCard,
          activeSwipe && styles.swipeCardActive,
          {
            width: cardWidth,
            transform: [{ translateX }],
          },
        ]}
      >
        <Pressable
          onPress={() => {
            if (currentX.current !== 0) {
              setOpenDeadlineId(null);
              closeRow();
              return;
            }
            if (item.scan_id) onOpenScan(item.scan_id);
          }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          {card}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ManualDeadlineModal({
  open,
  editing,
  onClose,
  onCreated
}: {
  open: boolean;
  editing?: DeadlineResponse;
  onClose: () => void;
  onCreated: (deadline: DeadlineResponse) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [date, setDate] = useState(() => {
    if (editing) return new Date(`${editing.due_date}T12:00:00Z`);
    const d = new Date(); d.setDate(d.getDate() + 1); return d;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form state when the modal opens or switches to a different deadline.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setDate(new Date(`${editing.due_date}T12:00:00Z`));
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
    try {
      let deadline: DeadlineResponse;
      if (editing) {
        deadline = await updateManualDeadline(editing.id, {
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDateString
        });
      } else {
        deadline = await createManualDeadline({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDateString,
          deadline_type: "action"
        });
      }
      onCreated(deadline);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : editing ? t("deadlines.updateError") : t("deadlines.createError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            contentContainerStyle={styles.modal}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.heading}>{editing ? t("deadlines.editTitle") : t("deadlines.manualTitle")}</Text>
            <Field value={title} onChangeText={setTitle} placeholder={t("deadlines.name")} />
            <CalendarPicker value={date} onChange={setDate} colors={colors} styles={styles} />
            <Field value={description} onChangeText={setDescription} placeholder={t("deadlines.note")} multiline />
            <ErrorText message={error} />
            <Button title={editing ? t("common.save") : t("common.create")} onPress={save} loading={saving} disabled={!title.trim()} />
            <Button title={t("common.close")} onPress={onClose} variant="secondary" disabled={saving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </Modal>
  );
}

function CalendarPicker({ value, onChange, colors, styles }: {
  value: Date;
  onChange: (d: Date) => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const year = view.getFullYear();
  const month = view.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Mon = 0
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  while (cells.length % 7) cells.push(null);

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
        <Pressable onPress={() => shiftMonth(-1)} style={({ pressed }) => [styles.calNav, pressed && styles.pressed]}>
          <Text style={styles.calNavText}>‹</Text>
        </Pressable>
        <Text style={styles.calMonth}>{monthLabel}</Text>
        <Pressable onPress={() => shiftMonth(1)} style={({ pressed }) => [styles.calNav, pressed && styles.pressed]}>
          <Text style={styles.calNavText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.calWeekRow}>
        {weekdays.map((w, i) => (
          <Text key={i} style={styles.calWeekday}>{w}</Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={i} style={styles.calCell} />;
          const cellDate = new Date(year, month, day);
          const past = cellDate < today;
          const selected = sameDay(cellDate, value);
          const isToday = sameDay(cellDate, today);
          return (
            <Pressable
              key={i}
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
    </View>
  );
}

function compareDeadlines(a: DeadlineResponse, b: DeadlineResponse) {
  if (a.status !== b.status) return a.status === "active" ? -1 : 1;
  return a.due_date.localeCompare(b.due_date);
}

type DeadlineGroup = {
  title: string;
  data: DeadlineResponse[];
};

function groupDeadlines(deadlines: DeadlineResponse[]): DeadlineGroup[] {
  const groups = new Map<string, DeadlineGroup>();
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

  deadlines.forEach((deadline) => {
    const due = new Date(`${deadline.due_date}T12:00:00Z`);
    const monthKey = deadline.status === "completed" ? "completed" : `${due.getFullYear()}-${due.getMonth()}`;
    const label = deadline.status === "completed"
      ? t("documents.done")
      : `${due.getFullYear()}-${due.getMonth()}` === currentMonthKey
        ? t("deadlines.thisMonth")
        : formatLocalizedDate(due, { month: "long" });

    if (!groups.has(monthKey)) {
      groups.set(monthKey, { title: label.toUpperCase(), data: [] });
    }
    groups.get(monthKey)?.data.push(deadline);
  });

  return Array.from(groups.values());
}

function deadlineMeta(item: DeadlineResponse) {
  const source = item.auto_created ? t("deadlines.auto") : t("deadlines.manual");
  const description = item.description?.replace(/\n+/g, " ").trim();
  return description ? `${source} · ${description}` : source;
}

function formatDayMonth(value: string) {
  return formatLocalizedDate(new Date(`${value}T12:00:00Z`), { day: "numeric", month: "long" });
}

function daysUntil(value: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${value}T12:00:00Z`);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function relativeTime(value: string): string {
  const diffDays = daysUntil(value);

  if (diffDays < 0) return t("deadlines.overdue");
  if (diffDays === 0) return t("deadlines.today");
  if (diffDays === 1) return t("deadlines.tomorrow");
  if (diffDays < 7) return t("deadlines.inDays", { count: diffDays });
  if (diffDays < 30) {
    const weeks = Math.round(diffDays / 7);
    return t("deadlines.inWeeks", { count: weeks });
  }
  const months = Math.round(diffDays / 30);
  return t("deadlines.inMonths", { count: months });
}


function getUrgencyColor(value: string, colors: ColorPalette) {
  const diffDays = daysUntil(value);
  if (diffDays < 7) return colors.danger;
  if (diffDays <= 30) return colors.amber;
  return colors.green;
}

function getUrgencyPillBg(days: number, colors: ColorPalette) {
  if (days < 7) return colors.dangerLight;
  if (days <= 30) return colors.amberLight;
  return colors.greenLight;
}

function getUrgencyPillText(days: number, colors: ColorPalette) {
  if (days < 7) return colors.dangerDark;
  if (days <= 30) return colors.amberDark;
  return colors.greenDark;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      minHeight: 92,
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 14,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg
    },
    screenTitle: {
      color: colors.primary,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: "800",
      letterSpacing: -0.7
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center"
    },
    headerIconText: {
      color: colors.muted,
      fontSize: 26,
      lineHeight: 28,
      fontWeight: "400"
    },
    heading: { color: colors.text, fontSize: 30, fontWeight: "800" },
    list: {
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 100,
      gap: 24
    },
    emptyList: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 },
    section: { gap: 12 },
    sectionCards: { gap: 12 },
    sectionTitle: {
      color: colors.muted3,
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 1.2
    },
    rowShell: {
      minHeight: 96,
      borderRadius: DEADLINE_ROW_RADIUS,
      overflow: "hidden",
      backgroundColor: colors.bg
    },
    swipeActionLayer: {
      ...StyleSheet.absoluteFillObject,
      minHeight: 96,
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "space-between",
      borderRadius: DEADLINE_ROW_RADIUS,
      overflow: "hidden",
      backgroundColor: colors.bg
    },
    swipeDoneArea: {
      width: SWIPE_RIGHT_WIDTH,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.greenLight
    },
    swipeLeftActions: {
      width: SWIPE_LEFT_WIDTH,
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "flex-end"
    },
    swipeEditArea: {
      width: SWIPE_LEFT_ACTION_WIDTH,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.blueMid
    },
    swipeDeleteArea: {
      width: SWIPE_LEFT_ACTION_WIDTH,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerLight
    },
    swipeDoneText: {
      color: colors.greenDark,
      fontSize: 30,
      lineHeight: 32,
      fontWeight: "900"
    },
    swipeEditText: {
      color: colors.primary,
      fontSize: 27,
      lineHeight: 29,
      fontWeight: "900"
    },
    swipeDeleteText: {
      color: colors.dangerDark,
      fontSize: 34,
      lineHeight: 34,
      fontWeight: "900"
    },
    swipeCard: {
      borderRadius: DEADLINE_ROW_RADIUS,
      backgroundColor: colors.bg
    },
    swipeCardActive: {
      borderRadius: 0
    },
    deadline: {
      flexDirection: "row",
      minHeight: 96,
      borderRadius: DEADLINE_ROW_RADIUS,
      backgroundColor: colors.surface,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border
    },
    deadlineSwiping: {
      borderRadius: 0
    },
    deadlineDone: { opacity: 0.52 },
    spine: { width: 5 },
    deadlineBody: {
      flex: 1,
      minWidth: 0,
      paddingLeft: 14,
      paddingRight: 8,
      paddingVertical: 13,
      gap: 4
    },
    deadlineTop: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
    date: { color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: "800", letterSpacing: -0.45, flexShrink: 1, minWidth: 0 },
    dateDone: { color: colors.muted2 },
    relativePill: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 3,
      alignSelf: "center",
      flexShrink: 0,
      maxWidth: 132
    },
    relativePillText: { fontSize: 12, lineHeight: 15, fontWeight: "800" },
    title: { color: colors.text, fontSize: 17, fontWeight: "600", lineHeight: 22, letterSpacing: -0.25, minWidth: 0 },
    titleDone: { textDecorationLine: "line-through" as const, color: colors.muted2 },
    description: { color: colors.muted, fontSize: 13, lineHeight: 18, minWidth: 0 },
    descriptionDone: { color: colors.muted3 },
    doneCheck: { color: colors.green, fontSize: 18, fontWeight: "800" },
    modal: { padding: 20, gap: 12, backgroundColor: colors.bg, paddingBottom: 48 },
    calWrap: { backgroundColor: colors.surface2, borderRadius: 14, padding: 12, gap: 8 },
    calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 4 },
    calNav: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    calNavText: { color: colors.text, fontSize: 22, fontWeight: "700", lineHeight: 24 },
    calMonth: { color: colors.text, fontSize: 16, fontWeight: "700", textTransform: "capitalize" },
    calWeekRow: { flexDirection: "row" },
    calWeekday: { flex: 1, textAlign: "center", color: colors.muted2, fontSize: 12, fontWeight: "600", textTransform: "uppercase", paddingVertical: 6 },
    calGrid: { flexDirection: "row", flexWrap: "wrap" },
    calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
    calDay: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    calDaySelected: { backgroundColor: colors.primary },
    calDayToday: { borderWidth: 1.5, borderColor: colors.primary },
    calDayText: { color: colors.text, fontSize: 15, fontWeight: "500" },
    calDayTextSelected: { color: colors.textOnAccent, fontWeight: "800" },
    calDayPast: { color: colors.muted3 },
    pressed: { opacity: 0.72 }
  });
}
