import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, UIManager, useWindowDimensions, Vibration, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { Button, EmptyState, ErrorText, Field, Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { completeDeadline, createManualDeadline, deleteDeadline, listDeadlines, updateManualDeadline } from "@/features/deadlines/deadlinesApi";
import { getLimits } from "@/features/scans/scansApi";
import { formatLocalizedDate, getLocale, pluralize, t, type PluralForms } from "@/lib/i18n";
import type { DeadlineResponse, UserPlan } from "@/lib/types";

const HORIZONTAL_PADDING = 24;

// Enable LayoutAnimation on Android (iOS has it by default) — used when the
// calendar expands/collapses inside the manual-deadline sheet.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
// Slimmer than iOS Mail defaults — keeps the card title visible during
// swipe and reduces accidental reveal. Buttons are still 64pt wide so the
// 44pt iOS minimum tap target is comfortably exceeded.
const SWIPE_ACTION_WIDTH = 76;       // done (right swipe) — single button
const SWIPE_LEFT_ACTION_WIDTH = 64;  // edit + delete each (left swipe)
const SWIPE_LEFT_WIDTH = SWIPE_LEFT_ACTION_WIDTH * 2;
const SWIPE_RIGHT_WIDTH = SWIPE_ACTION_WIDTH;
const SWIPE_LEFT_THRESHOLD = SWIPE_LEFT_WIDTH * 0.45;
const SWIPE_RIGHT_COMMIT_THRESHOLD = SWIPE_RIGHT_WIDTH * 0.75;
const DEADLINE_ROW_RADIUS = 18;
const FREE_REMINDER_DAYS = [1] as const;
const PRO_REMINDER_DAYS = [30, 14, 7, 1] as const;

const RELATIVE_UNITS: Record<
  ReturnType<typeof getLocale>,
  {
    day: PluralForms;
    week: PluralForms;
    month: PluralForms;
    prefix: string;
  }
> = {
  cs: {
    day: { one: "den", few: "dny", many: "dní" },
    week: { one: "týden", few: "týdny", many: "týdnů" },
    month: { one: "měsíc", few: "měsíce", many: "měsíců" },
    prefix: "Za",
  },
  ru: {
    day: { one: "день", few: "дня", many: "дней" },
    week: { one: "неделю", few: "недели", many: "недель" },
    month: { one: "месяц", few: "месяца", many: "месяцев" },
    prefix: "Через",
  },
  uk: {
    day: { one: "день", few: "дні", many: "днів" },
    week: { one: "тиждень", few: "тижні", many: "тижнів" },
    month: { one: "місяць", few: "місяці", many: "місяців" },
    prefix: "Через",
  },
  en: {
    day: { one: "day", many: "days" },
    week: { one: "week", many: "weeks" },
    month: { one: "month", many: "months" },
    prefix: "In",
  },
};

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
  const [doneExpanded, setDoneExpanded] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<DeadlineResponse | null>(null);
  const [detailDeadline, setDetailDeadline] = useState<DeadlineResponse | null>(null);
  const [plan, setPlan] = useState<UserPlan>("free");
  // Long-press popover (iOS context-menu style) — full rect captured via
  // measureInWindow so we can render a lifted preview of the pressed card on
  // top of the dim, with the action menu anchored beneath it.
  const [contextMenu, setContextMenu] = useState<{
    item: DeadlineResponse;
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const sections = useMemo(() => groupDeadlines(deadlines), [deadlines]);
  const urgencyCounts = useMemo(() => tallyUrgency(deadlines), [deadlines]);
  const activeSections = useMemo(() => sections.filter((s) => !s.completed), [sections]);
  const completedSections = useMemo(() => sections.filter((s) => s.completed), [sections]);
  const completedCount = useMemo(
    () => completedSections.reduce((count, section) => count + section.data.length, 0),
    [completedSections]
  );

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
      const [all, limits] = await Promise.all([
        listDeadlines(false),
        getLimits().catch(() => null),
      ]);
      if (!aliveRef.current) return;
      setDeadlines([...all].sort(compareDeadlines));
      setPlan(limits?.plan ?? "free");
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
    if (item.status === "completed") {
      void removeDeadline(item.id);
      return;
    }
    requestAnimationFrame(() => setPendingDelete(item));
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

  const hasActive = activeSections.length > 0;
  const hasCompleted = completedCount > 0;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.screenTitle}>{t("deadlines.title")}</Text>
          <Pressable
            onPress={() => setModalOpen(true)}
            style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
            hitSlop={8}
          >
            <AppIcon name="plus" size={22} color={colors.muted2} strokeWidth={1.9} />
          </Pressable>
        </View>
        {hasActive ? (
          <View style={styles.urgencyRow}>
            <UrgencyDot count={urgencyCounts.urgent} label={t("deadlines.urgent")} dotColor={colors.danger} styles={styles} />
            <UrgencyDot count={urgencyCounts.soon} label={t("deadlines.soon")} dotColor={colors.amber} styles={styles} />
            <UrgencyDot count={urgencyCounts.later} label={t("deadlines.later")} dotColor={colors.green} styles={styles} />
          </View>
        ) : null}
      </View>
      <ErrorText message={error} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={deadlines.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        {!deadlines.length ? (
          <EmptyState title={t("deadlines.emptyTitle")} detail={t("deadlines.emptyDetail")} />
        ) : (
          <>
            {activeSections.map((section, sectionIndex) => (
              <View key={`${section.title}-${sectionIndex}`} style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <View style={styles.sectionCount}>
                    <Text style={styles.sectionCountText}>{section.data.length}</Text>
                  </View>
                </View>
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
                      onOpenManual={setDetailDeadline}
                      onLongPress={(d, rect) => {
                        Vibration.vibrate(12);
                        setContextMenu({ item: d, rect });
                      }}
                      onOpenScan={(scanId) => router.push(`/scan/${scanId}`)}
                    />
                  ))}
                </View>
              </View>
            ))}

            {hasCompleted ? (
              <View style={styles.completedSection}>
                <Pressable
                  onPress={() => setDoneExpanded((v) => !v)}
                  style={({ pressed }) => [styles.completedToggle, pressed && styles.pressed]}
                  hitSlop={6}
                >
                  <Text style={styles.sectionTitle}>{t("deadlines.completed").toUpperCase()}</Text>
                  <View style={styles.completedToggleRight}>
                    <View style={styles.sectionCount}>
                      <Text style={styles.sectionCountText}>{completedCount}</Text>
                    </View>
                    {/* chevron-right rotated: 90deg = ▾ (collapsed), -90deg = ▴ (expanded) */}
                    <View style={{ transform: [{ rotate: doneExpanded ? "-90deg" : "90deg" }] }}>
                      <AppIcon name="chevron-right" size={16} color={colors.muted3} strokeWidth={2} />
                    </View>
                  </View>
                </Pressable>
                {doneExpanded ? (
                  <View style={styles.completedGroups}>
                    {completedSections.map((section, sectionIndex) => (
                      <View key={`${section.title}-${sectionIndex}`} style={styles.completedGroup}>
                        <Text style={styles.completedMonthTitle}>{section.title}</Text>
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
                              onOpenManual={setDetailDeadline}
                              onLongPress={(d, rect) => {
                                Vibration.vibrate(12);
                                setContextMenu({ item: d, rect });
                              }}
                              onOpenScan={(scanId) => router.push(`/scan/${scanId}`)}
                            />
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <ManualDeadlineModal
        open={modalOpen}
        plan={plan}
        onClose={() => setModalOpen(false)}
        onCreated={(deadline) => {
          setDeadlines((current) => [...current, deadline].sort(compareDeadlines));
          setModalOpen(false);
        }}
      />
      <ManualDeadlineModal
        open={editingDeadline !== null}
        editing={editingDeadline ?? undefined}
        plan={plan}
        onClose={() => setEditingDeadline(null)}
        onCreated={(updated) => {
          setDeadlines((current) =>
            current.map((d) => (d.id === updated.id ? updated : d)).sort(compareDeadlines)
          );
          setEditingDeadline(null);
        }}
      />
      <DeadlineContextMenu
        anchor={contextMenu}
        colors={colors}
        styles={styles}
        onClose={() => setContextMenu(null)}
        onDone={(item) => {
          setContextMenu(null);
          void markDone(item.id);
        }}
        onEdit={(item) => {
          setContextMenu(null);
          setEditingDeadline(item);
        }}
        onDelete={(item) => {
          setContextMenu(null);
          confirmDelete(item);
        }}
      />
      <ManualDeadlineDetailModal
        item={detailDeadline}
        plan={plan}
        colors={colors}
        styles={styles}
        onClose={() => setDetailDeadline(null)}
        onDone={(item) => {
          setDetailDeadline(null);
          void markDone(item.id);
        }}
        onEdit={(item) => {
          setDetailDeadline(null);
          setEditingDeadline(item);
        }}
        onDelete={(item) => {
          setDetailDeadline(null);
          confirmDelete(item);
        }}
      />
      <DeleteDeadlineModal
        item={pendingDelete}
        colors={colors}
        styles={styles}
        onCancel={() => setPendingDelete(null)}
        onConfirm={(item) => {
          setPendingDelete(null);
          void removeDeadline(item.id);
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
  onOpenManual,
  onLongPress,
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
  onOpenManual: (deadline: DeadlineResponse) => void;
  onLongPress: (
    deadline: DeadlineResponse,
    rect: { x: number; y: number; width: number; height: number }
  ) => void;
  onOpenScan: (scanId: string) => void;
}) {
  const done = item.status === "completed";
  const activeSwipe = openDeadlineId === item.id;
  // Completed cards only allow left-swipe for delete (no edit, no "mark done" right swipe).
  const leftWidth = done ? SWIPE_LEFT_ACTION_WIDTH : SWIPE_LEFT_WIDTH;
  const rightWidth = done ? 0 : SWIPE_RIGHT_WIDTH;
  const leftThreshold = leftWidth * 0.45;
  // Deep swipe past 50% of card width = instant delete for all cards.
  const fullDeleteThreshold = cardWidth * 0.5;
  const maxLeftDrag = cardWidth;
  // Ref on the outer wrapper of the row — measureInWindow gives us absolute
  // screen coords for the long-press preview, independent of scroll offset.
  const wrapperRef = useRef<View>(null);
  const handleLongPress = useCallback(() => {
    wrapperRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress(item, { x, y, width, height });
    });
  }, [item, onLongPress]);
  const days = daysUntil(item.due_date);
  const tone = done ? "done" : urgencyTone(days);
  const tile = tileColors(tone, colors);
  const relativeLabelColor = tone === "urgent" ? colors.danger : colors.text;
  const { day, month } = parseDayMonthAbbr(item.due_date);
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
    if (openDeadlineId !== null && openDeadlineId !== item.id) {
      closeRow();
    }
  }, [closeRow, item.id, openDeadlineId]);

  const openLeftActions = useCallback(() => {
    currentX.current = -leftWidth;
    setOpenDeadlineId(item.id);
    animateTo(-leftWidth);
  }, [animateTo, item.id, leftWidth, setOpenDeadlineId]);

  const openRightAction = useCallback(() => {
    if (rightWidth === 0) return;
    currentX.current = rightWidth;
    setOpenDeadlineId(item.id);
    animateTo(rightWidth);
  }, [animateTo, item.id, rightWidth, setOpenDeadlineId]);

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

  // Full-swipe auto-delete for completed cards — card flies off-screen left,
  // then onDelete() is fired. confirmDelete() in parent skips the modal for
  // completed items, so this lands directly as a deletion.
  const commitDeleteSwipe = useCallback(() => {
    setOpenDeadlineId(null);
    Animated.timing(translateX, {
      toValue: -cardWidth,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      currentX.current = -cardWidth;
      onDelete(item);
    });
  }, [cardWidth, item, onDelete, setOpenDeadlineId, translateX]);

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
        // Only claim the responder on clearly horizontal movement (>= 10pt
        // and dx clearly bigger than dy). Smaller threshold ate tap/scroll
        // gestures intermittently.
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (Math.abs(gesture.dx) < 10) return false;
          // Completed cards only respond to left-swipe (rightWidth === 0).
          if (done && gesture.dx > 0) return false;
          return Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;
        },
        onPanResponderGrant: () => {
          if (openDeadlineId !== item.id) {
            setOpenDeadlineId(item.id);
          }
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.max(-maxLeftDrag, Math.min(rightWidth, currentX.current + gesture.dx));
          translateX.setValue(next);
          const rightCommit = rightWidth * 0.75;

          // Vibrate on first crossing of either threshold (reveal OR full-delete).
          const crossedLeft = next <= -leftThreshold || next <= -fullDeleteThreshold;
          const crossedRight = rightWidth > 0 && next >= rightCommit;
          if ((crossedLeft || crossedRight) && !thresholdVibrated.current) {
            thresholdVibrated.current = true;
            Vibration.vibrate(8);
          }
          if (next > -leftThreshold && next < rightCommit) {
            thresholdVibrated.current = false;
          }
        },
        onPanResponderRelease: (_, gesture) => {
          const next = Math.max(-maxLeftDrag, Math.min(rightWidth, currentX.current + gesture.dx));
          const fastLeft = gesture.vx < -0.35;
          const fastRight = gesture.vx > 0.35;
          const rightCommit = rightWidth * 0.75;

          if (rightWidth > 0 && next >= rightCommit) {
            commitDone();
            return;
          }
          if (next <= -fullDeleteThreshold) {
            commitDeleteSwipe();
            return;
          }
          if (next <= -leftThreshold || fastLeft) {
            openLeftActions();
            return;
          }
          if (rightWidth > 0 && (next >= rightWidth * 0.45 || fastRight)) {
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
    [closeRow, commitDeleteSwipe, commitDone, done, fullDeleteThreshold, item.id, leftThreshold, maxLeftDrag, openDeadlineId, openLeftActions, openRightAction, rightWidth, setOpenDeadlineId, translateX]
  );

  const sourceLabel = item.scan_id ? deadlineSourceLabel(item) : null;

  const card = (
    <View
      style={[
        styles.deadline,
        activeSwipe && styles.deadlineSwiping,
        done && styles.deadlineDone,
        done && styles.deadlineCompleted,
        { width: cardWidth },
      ]}
    >
      <View style={[styles.dateTile, done && styles.dateTileCompleted, { backgroundColor: tile.bg }]}>
        <Text style={[styles.dateTileDay, { color: tile.fg }]}>{day}</Text>
        <Text style={[styles.dateTileMonth, { color: tile.fg }]}>{month}</Text>
      </View>
      <View style={styles.deadlineBody}>
        {done ? (
          <View style={styles.completedMetaRow}>
            <Text style={styles.completedMetaText}>{completedDateLabel(item.due_date)}</Text>
            <AppIcon name="check" size={14} color={colors.green} strokeWidth={2.4} />
          </View>
        ) : (
          <Text style={[styles.relativeText, { color: relativeLabelColor }]} numberOfLines={1}>
            {relativeTime(item.due_date)}
          </Text>
        )}
        <Text
          style={[styles.title, done && styles.titleDone]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {item.title}
        </Text>
        {sourceLabel ? (
          <View style={styles.metaRow}>
            <AppIcon name="doc" size={12} color={colors.muted3} strokeWidth={1.7} />
            <Text style={[styles.metaText, done && styles.descriptionDone]} numberOfLines={1}>
              {sourceLabel}
            </Text>
          </View>
        ) : item.description ? (
          <View style={styles.metaRow}>
            <AppIcon name="zap" size={12} color={colors.muted3} strokeWidth={1.7} />
            <Text style={[styles.metaText, done && styles.descriptionDone]} numberOfLines={1}>
              {item.description.replace(/\n+/g, " ").trim()}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <View ref={wrapperRef} style={[styles.rowShell, done && styles.rowShellCompleted, { width: cardWidth }]}>
      <View style={styles.swipeActionLayer} pointerEvents="box-none">
        {done ? (
          // Placeholder keeps `space-between` layout balanced so the delete
          // group still sits flush against the right edge for completed rows.
          <View style={styles.swipeDonePlaceholder} pointerEvents="none" />
        ) : (
          <Pressable onPress={commitDone} style={({ pressed }) => [styles.swipeDoneArea, pressed && styles.pressed]}>
            <AppIcon name="check" size={24} color={colors.greenDark} strokeWidth={2.4} />
          </Pressable>
        )}
        <View style={[styles.swipeLeftActions, done && styles.swipeLeftActionsCompact]}>
          {!done ? (
            <Pressable onPress={commitEdit} style={({ pressed }) => [styles.swipeEditArea, pressed && styles.pressed]}>
              <AppIcon name="sliders" size={22} color={colors.primary} strokeWidth={1.9} />
            </Pressable>
          ) : null}
          <Pressable onPress={commitDelete} style={({ pressed }) => [styles.swipeDeleteArea, pressed && styles.pressed]}>
            <AppIcon name="x" size={22} color={colors.dangerDark} strokeWidth={2.2} />
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
            else onOpenManual(item);
          }}
          onLongPress={handleLongPress}
          delayLongPress={350}
          // Scale instead of opacity — see comment on the `done` branch above.
          style={({ pressed }) => pressed && styles.cardPressed}
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
    const reminderDays = remindEnabled ? reminderDaysForPlan(plan) : [];
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
  // Preset / custom mode for the date picker. Calendar only renders in custom.
  const [dateMode, setDateMode] = useState<"tomorrow" | "week" | "month" | "custom">(() =>
    editing ? "custom" : "tomorrow"
  );

  useEffect(() => {
    if (!open) return;
    setRemindEnabled(editing ? editing.reminder_days.length > 0 : true);
    setDateMode(editing ? "custom" : "tomorrow");
  }, [editing, open]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetBackdrop}>
        {/* Tap outside the sheet to dismiss. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetKAV}>
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            {/* Drag handle */}
            <View style={styles.sheetHandle} />

            <ScrollView
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Header — title + X close */}
              <View style={styles.sheetHeaderRow}>
                <Text style={styles.sheetTitle}>
                  {editing ? t("deadlines.editTitle") : t("deadlines.newTitle")}
                </Text>
                <Pressable
                  onPress={onClose}
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
                  autoFocus={!editing}
                />
              </View>

              {/* Когда? */}
              <Text style={styles.sheetSectionLabel}>{t("deadlines.whenLabel")}</Text>
              <DatePresetRow
                date={date}
                mode={dateMode}
                onPick={(nextMode, nextDate) => {
                  // Animate the calendar opening/closing when switching to/from
                  // the "custom" preset — the height change would otherwise jump.
                  if (nextMode !== dateMode && (nextMode === "custom" || dateMode === "custom")) {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.create(240, "easeInEaseOut", "opacity")
                    );
                  }
                  setDateMode(nextMode);
                  if (nextDate) setDate(nextDate);
                }}
                colors={colors}
                styles={styles}
              />

              {/* Calendar — only shown when "Дата" preset is chosen */}
              {dateMode === "custom" ? (
                <View style={styles.sheetCalendarWrap}>
                  <CalendarPicker value={date} onChange={setDate} colors={colors} styles={styles} />
                </View>
              ) : null}

              {/* Reminder toggle */}
              <View style={styles.reminderRow}>
                <View style={styles.reminderIconTile}>
                  <AppIcon name="bell" size={18} color={remindEnabled ? colors.primary : colors.muted2} strokeWidth={1.8} />
                </View>
                <View style={styles.reminderTextBlock}>
                  <Text style={styles.reminderTitle}>{t("deadlines.reminderTitle")}</Text>
                  <Text style={styles.reminderSubtitle}>
                    {remindEnabled
                      ? reminderSubtitleForPlan(plan, date)
                      : t("deadlines.reminderOffSubtitle")}
                  </Text>
                </View>
                <Switch
                  value={remindEnabled}
                  onValueChange={setRemindEnabled}
                  trackColor={{ false: colors.surface3, true: colors.primary }}
                  thumbColor={colors.textOnAccent}
                  ios_backgroundColor={colors.surface3}
                />
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
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function formatReminderDate(date: Date): string {
  // "Напомнить 20 мая" — one day before the deadline (matches reminder_days=[1])
  const reminderDay = new Date(date);
  reminderDay.setDate(reminderDay.getDate() - 1);
  return formatLocalizedDate(reminderDay, { day: "numeric", month: "long" });
}

function reminderDaysForPlan(plan: UserPlan): number[] {
  return [...(plan === "pro" ? PRO_REMINDER_DAYS : FREE_REMINDER_DAYS)];
}

function reminderSubtitleForPlan(plan: UserPlan, date: Date): string {
  if (plan === "pro") return t("deadlines.reminderActiveSubtitlePro");
  return t("deadlines.reminderActiveSubtitle", { date: formatReminderDate(date) });
}

/**
 * 4 preset chips — Завтра / Неделя / Месяц / Дата.
 * Each non-custom chip shows the resolved date below the label so the user
 * sees the actual date before tapping. "Дата" chip switches to custom mode
 * and reveals the calendar grid below.
 */
function DatePresetRow({
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
  styles: ReturnType<typeof createStyles>;
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
          <AppIcon name="chevron-left" size={23} color={colors.text} />
        </Pressable>
        <Text style={styles.calMonth}>{monthLabel}</Text>
        <Pressable onPress={() => shiftMonth(1)} style={({ pressed }) => [styles.calNav, pressed && styles.pressed]}>
          <AppIcon name="chevron-right" size={23} color={colors.text} />
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
  if (a.status === "completed") return b.due_date.localeCompare(a.due_date);
  return a.due_date.localeCompare(b.due_date);
}

type DeadlineGroup = {
  title: string;
  data: DeadlineResponse[];
  completed: boolean;
};

function groupDeadlines(deadlines: DeadlineResponse[]): DeadlineGroup[] {
  // Order: active months in chronological order, then completed months in
  // reverse chronological order under the single expandable "done" header.
  const groups = new Map<string, DeadlineGroup>();

  deadlines.forEach((deadline) => {
    const isDone = deadline.status === "completed";
    const due = new Date(`${deadline.due_date}T12:00:00Z`);
    const key = `${isDone ? "completed" : "active"}-${due.getFullYear()}-${due.getMonth()}`;
    const label = formatLocalizedDate(due, { month: "long" });

    if (!groups.has(key)) {
      groups.set(key, { title: label.toUpperCase(), data: [], completed: isDone });
    }
    groups.get(key)?.data.push(deadline);
  });

  // Sort active groups by month chronologically; keep completed last.
  return Array.from(groups.values()).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const dateA = new Date(`${a.data[0].due_date}T12:00:00Z`);
    const dateB = new Date(`${b.data[0].due_date}T12:00:00Z`);
    if (a.completed) return dateB.getTime() - dateA.getTime();
    return dateA.getTime() - dateB.getTime();
  });
}

function completedDateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  const label = formatLocalizedDate(date, { day: "numeric", month: "short" });
  return `${t("deadlines.completedTag")} ${label}`;
}

/**
 * Source line shown under the title. Prefers the deadline description (often
 * the source document name on auto-created deadlines) and falls back to a
 * generic "From document" / "Manual" tag.
 */
function deadlineSourceLabel(item: DeadlineResponse): string {
  const description = item.description?.replace(/\n+/g, " ").trim();
  if (description) return description;
  if (item.scan_id) return t("deadlines.fromDocument");
  return t(item.auto_created ? "deadlines.auto" : "deadlines.manual");
}

/** "10 МАЯ" → { day: "10", month: "МАЯ" }. Month is short 3-letter form. */
function parseDayMonthAbbr(value: string): { day: string; month: string } {
  const date = new Date(`${value}T12:00:00Z`);
  const day = String(date.getUTCDate());
  const monthFull = formatLocalizedDate(date, { month: "long" });
  // Take the first 3 characters as the abbreviation; works cleanly for cs/ru/uk/en.
  const month = monthFull.slice(0, 3).toUpperCase();
  return { day, month };
}

type UrgencyTone = "urgent" | "soon" | "later" | "done";

function urgencyTone(days: number): UrgencyTone {
  if (days < 7) return "urgent";
  if (days <= 30) return "soon";
  return "later";
}

/** Soft tinted background + foreground for the date tile, per urgency tone. */
function tileColors(tone: UrgencyTone, colors: ColorPalette): { bg: string; fg: string } {
  switch (tone) {
    case "urgent":
      return { bg: colors.dangerLight, fg: colors.dangerDark };
    case "soon":
      return { bg: colors.amberLight, fg: colors.amberDark };
    case "later":
      return { bg: colors.greenLight, fg: colors.greenDark };
    case "done":
      return { bg: colors.surface2, fg: colors.muted3 };
  }
}

/**
 * Count active (non-completed) deadlines by urgency tier for the header
 * subtitle "1 срочно · 2 скоро · 1 позже".
 */
function tallyUrgency(deadlines: DeadlineResponse[]): { urgent: number; soon: number; later: number } {
  const counts = { urgent: 0, soon: 0, later: 0 };
  deadlines.forEach((d) => {
    if (d.status === "completed") return;
    const tone = urgencyTone(daysUntil(d.due_date));
    if (tone === "urgent") counts.urgent++;
    else if (tone === "soon") counts.soon++;
    else counts.later++;
  });
  return counts;
}

function UrgencyDot({
  count,
  label,
  dotColor,
  styles,
}: {
  count: number;
  label: string;
  dotColor: string;
  styles: ReturnType<typeof createStyles>;
}) {
  if (count === 0) return null;
  return (
    <View style={styles.urgencyChip}>
      <View style={[styles.urgencyDot, { backgroundColor: dotColor }]} />
      <Text style={styles.urgencyChipText}>
        <Text style={styles.urgencyChipCount}>{count}</Text> {label}
      </Text>
    </View>
  );
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
  if (diffDays < 7) return formatRelativeUnit(diffDays, "day");
  if (diffDays < 30) {
    const weeks = Math.round(diffDays / 7);
    return formatRelativeUnit(weeks, "week");
  }
  const months = Math.round(diffDays / 30);
  return formatRelativeUnit(months, "month");
}

function formatRelativeUnit(count: number, unit: "day" | "week" | "month") {
  const locale = getLocale();
  const copy = RELATIVE_UNITS[locale];
  return `${copy.prefix} ${count} ${pluralize(count, copy[unit], locale)}`;
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

function ManualDeadlineDetailModal({
  item,
  plan,
  colors,
  styles,
  onClose,
  onDone,
  onEdit,
  onDelete,
}: {
  item: DeadlineResponse | null;
  plan: UserPlan;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  onClose: () => void;
  onDone: (item: DeadlineResponse) => void;
  onEdit: (item: DeadlineResponse) => void;
  onDelete: (item: DeadlineResponse) => void;
}) {
  if (!item) return null;

  const done = item.status === "completed";
  const days = daysUntil(item.due_date);
  const tone = done ? "done" : urgencyTone(days);
  const tile = tileColors(tone, colors);
  const { day, month } = parseDayMonthAbbr(item.due_date);
  const description = item.description?.trim();
  const reminderPlan = reminderDisplayPlan(item.reminder_days, plan);
  const displayedReminderDays = item.reminder_days.length
    ? reminderDaysForPlan(reminderPlan === "Pro" ? "pro" : "free")
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
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.manualDetailBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.manualDetailCard}>
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
        </View>
      </View>
    </Modal>
  );
}

function ManualDetailField({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.manualDetailSection}>
      <Text style={styles.manualDetailLabel}>{label}</Text>
      <Text style={styles.manualDetailValue}>{value}</Text>
    </View>
  );
}

function formatReminderDays(days: number[]) {
  if (!days.length) return t("deadlines.reminderOffSubtitle");
  const locale = getLocale();
  const sorted = [...days].sort((a, b) => b - a);
  const last = sorted[sorted.length - 1] ?? 1;
  return `${sorted.join(", ")} ${pluralize(last, REMINDER_DAY_FORMS[locale], locale)}`;
}

const REMINDER_DAY_FORMS: Record<ReturnType<typeof getLocale>, PluralForms> = {
  cs: { one: "den", few: "dny", many: "dní" },
  ru: { one: "день", few: "дня", many: "дней" },
  uk: { one: "день", few: "дні", many: "днів" },
  en: { one: "day", many: "days" },
};

function reminderPlanForDays(days: number[]) {
  return days.some((day) => day > 1) ? "Pro" : "Free";
}

function reminderDisplayPlan(days: number[], plan: UserPlan) {
  if (plan === "pro") return "Pro";
  return reminderPlanForDays(days);
}

// ---------------------------------------------------------------------------
// Long-press context menu (iOS-style popover, NOT a bottom sheet)
// ---------------------------------------------------------------------------

const CONTEXT_MENU_WIDTH = 240;

function DeadlineContextMenu({
  anchor,
  colors,
  styles,
  onClose,
  onDone,
  onEdit,
  onDelete,
}: {
  anchor: {
    item: DeadlineResponse;
    rect: { x: number; y: number; width: number; height: number };
  } | null;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  onClose: () => void;
  onDone: (item: DeadlineResponse) => void;
  onEdit: (item: DeadlineResponse) => void;
  onDelete: (item: DeadlineResponse) => void;
}) {
  const { height: screenH } = useWindowDimensions();
  // Fade + scale-in for the iOS-style appear. Same Animated.Value drives both
  // the dim opacity and the preview card scale so they move in sync.
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!anchor) return;
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 260,
      mass: 0.7,
    }).start();
  }, [anchor, progress]);

  if (!anchor) return null;
  const { item, rect } = anchor;
  const isDone = item.status === "completed";

  const menuHeight = isDone ? 120 : 170;
  // The preview fades in and lifts instead of appearing already shifted with
  // a full shadow. That avoids a one-frame dark seam on long press.
  const cardLift = 6;
  const cardTop = rect.y;
  const previewBottom = cardTop + rect.height - cardLift;
  const wouldOverflowBottom = previewBottom + 8 + menuHeight > screenH - 24;
  const menuTop = wouldOverflowBottom
    ? Math.max(40, cardTop - cardLift - 8 - menuHeight)
    : previewBottom + 8;

  const dimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const previewOpacity = progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] });
  const cardScale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const cardTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -cardLift] });
  const menuOpacity = progress;
  const menuScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.menuBackdrop, { opacity: dimOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      {/* Lifted preview of the pressed card — same visual, at the same screen
          coords, with a subtle scale + shadow so it floats above the dim. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: rect.x,
          top: cardTop,
          width: rect.width,
          height: rect.height,
          opacity: previewOpacity,
          transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.45,
          shadowRadius: 24,
          elevation: 16,
          borderRadius: DEADLINE_ROW_RADIUS,
        }}
      >
        <DeadlineRowVisual item={item} colors={colors} styles={styles} cardWidth={rect.width} />
      </Animated.View>
      <Animated.View
        style={[
          styles.menuContainer,
          {
            top: menuTop,
            right: 24,
            width: CONTEXT_MENU_WIDTH,
            opacity: menuOpacity,
            transform: [{ scale: menuScale }],
          },
        ]}
      >
        {!isDone ? (
          <MenuRow
            iconName="check"
            iconBg={colors.greenLight}
            iconColor={colors.green}
            label={t("deadlines.markDone")}
            labelColor={colors.text}
            onPress={() => onDone(item)}
            styles={styles}
          />
        ) : null}
        <MenuRow
          iconName="sliders"
          iconBg={colors.blueSoft}
          iconColor={colors.primary}
          label={t("common.edit")}
          labelColor={colors.text}
          onPress={() => onEdit(item)}
          styles={styles}
        />
        <MenuRow
          iconName="x"
          iconBg={colors.dangerLight}
          iconColor={colors.danger}
          label={t("common.delete")}
          labelColor={colors.danger}
          onPress={() => onDelete(item)}
          styles={styles}
          last
        />
      </Animated.View>
    </View>
  );
}

function DeadlineRowVisual({
  item,
  colors,
  styles,
  cardWidth,
}: {
  item: DeadlineResponse;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  cardWidth: number;
}) {
  const done = item.status === "completed";
  const days = daysUntil(item.due_date);
  const tone = done ? "done" : urgencyTone(days);
  const tile = tileColors(tone, colors);
  const relativeLabelColor = tone === "urgent" ? colors.danger : colors.text;
  const { day, month } = parseDayMonthAbbr(item.due_date);
  const sourceLabel = item.scan_id ? deadlineSourceLabel(item) : null;

  return (
    <View style={[styles.deadline, done && styles.deadlineDone, done && styles.deadlineCompleted, { width: cardWidth }]}>
      <View style={[styles.dateTile, done && styles.dateTileCompleted, { backgroundColor: tile.bg }]}>
        <Text style={[styles.dateTileDay, { color: tile.fg }]}>{day}</Text>
        <Text style={[styles.dateTileMonth, { color: tile.fg }]}>{month}</Text>
      </View>
      <View style={styles.deadlineBody}>
        {done ? (
          <View style={styles.completedMetaRow}>
            <Text style={styles.completedMetaText}>{completedDateLabel(item.due_date)}</Text>
            <AppIcon name="check" size={14} color={colors.green} strokeWidth={2.4} />
          </View>
        ) : (
          <Text style={[styles.relativeText, { color: relativeLabelColor }]} numberOfLines={1}>
            {relativeTime(item.due_date)}
          </Text>
        )}
        <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2} ellipsizeMode="tail">
          {item.title}
        </Text>
        {sourceLabel ? (
          <View style={styles.metaRow}>
            <AppIcon name="doc" size={12} color={colors.muted3} strokeWidth={1.7} />
            <Text style={[styles.metaText, done && styles.descriptionDone]} numberOfLines={1}>
              {sourceLabel}
            </Text>
          </View>
        ) : item.description ? (
          <View style={styles.metaRow}>
            <AppIcon name="zap" size={12} color={colors.muted3} strokeWidth={1.7} />
            <Text style={[styles.metaText, done && styles.descriptionDone]} numberOfLines={1}>
              {item.description.replace(/\n+/g, " ").trim()}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function MenuRow({
  iconName,
  iconBg,
  iconColor,
  label,
  labelColor,
  onPress,
  styles,
  last,
}: {
  iconName: "check" | "sliders" | "x";
  iconBg: string;
  iconColor: string;
  label: string;
  labelColor: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, !last && styles.menuRowDivider, pressed && styles.menuRowPressed]}
    >
      <View style={[styles.menuIconTile, { backgroundColor: iconBg }]}>
        <AppIcon name={iconName} size={18} color={iconColor} strokeWidth={2.2} />
      </View>
      <Text style={[styles.menuLabel, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}

function DeleteDeadlineModal({
  item,
  colors,
  styles,
  onCancel,
  onConfirm,
}: {
  item: DeadlineResponse | null;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  onCancel: () => void;
  onConfirm: (item: DeadlineResponse) => void;
}) {
  if (!item) return null;
  const tone = urgencyTone(daysUntil(item.due_date));
  const tile = tileColors(tone, colors);
  const { day, month } = parseDayMonthAbbr(item.due_date);
  const description = item.description?.replace(/\n+/g, " ").trim();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
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

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 18,
      backgroundColor: colors.bg,
      gap: 14
    },
    headerTitleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    screenTitle: {
      color: colors.primary,
      fontFamily: fonts.displayBold,
      ...typeStyles.largeScreenTitle,
      fontWeight: "800",
      letterSpacing: -1
    },
    headerIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center"
    },
    headerIconText: {
      color: colors.muted,
      fontSize: 26,
      lineHeight: 28,
      fontWeight: "400"
    },
    urgencyRow: {
      flexDirection: "row",
      gap: 18,
      flexWrap: "wrap",
    },
    urgencyChip: { flexDirection: "row", alignItems: "center", gap: 6 },
    urgencyDot: { width: 7, height: 7, borderRadius: 4 },
    urgencyChipText: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowMeta },
    urgencyChipCount: { color: colors.text, fontWeight: "700" },
    heading: { color: colors.text, fontFamily: fonts.displayBold, ...typeStyles.screenTitle, fontWeight: "800" },
    scroll: {
      flex: 1,
      backgroundColor: colors.bg
    },
    list: {
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 100,
      gap: 24
    },
    emptyList: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, backgroundColor: colors.bg },
    section: { gap: 12, backgroundColor: colors.bg },
    sectionCards: { gap: 12 },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionTitle: {
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase" as const,
    },
    sectionCount: {
      minWidth: 24,
      height: 22,
      paddingHorizontal: 8,
      borderRadius: 11,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionCountText: {
      color: colors.muted2,
      fontFamily: fonts.bodyBold,
      ...typeStyles.caption1,
      fontWeight: "700",
    },
    completedSection: { gap: 12 },
    completedToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    completedToggleRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    completedGroups: { gap: 22 },
    completedGroup: { gap: 10 },
    completedMonthTitle: {
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
      paddingHorizontal: 4,
    },
    // Outer wrapper clips the action layer + card to the same radius so
    // nothing peeks past the rounded corners. Background transparent —
    // any color underneath would bleed through translucent rgba action tints.
    rowShell: {
      minHeight: 96,
      borderRadius: DEADLINE_ROW_RADIUS,
      overflow: "hidden",
      backgroundColor: "transparent"
    },
    rowShellCompleted: { minHeight: 86 },
    // Underlay holding the action buttons. Buttons sit at flex-start (done)
    // and flex-end (edit/delete); the visible middle band is intentionally
    // covered by the card itself, so transparent here means no bg-color
    // hairline ever shows on rounded corners.
    swipeActionLayer: {
      ...StyleSheet.absoluteFillObject,
      minHeight: 96,
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "space-between",
      backgroundColor: "transparent"
    },
    // Soft tinted backgrounds matching the urgency date-tile aesthetic.
    // Auto-adapts per theme: in dark mode the *Light tokens are rgba ~12%
    // (subtle); in light mode they're solid pale colors. Card on top is
    // fully opaque (surface) so there's no actual bleed-through — the soft
    // tints only show in the revealed area after swipe.
    swipeDoneArea: {
      width: SWIPE_RIGHT_WIDTH,
      height: "100%",
      minHeight: 96,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.greenLight,
    },
    swipeLeftActions: {
      width: SWIPE_LEFT_WIDTH,
      height: "100%",
      minHeight: 96,
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "flex-end",
      backgroundColor: "transparent",
    },
    // Completed cards only reveal the delete action (single button, half width).
    swipeLeftActionsCompact: { width: SWIPE_LEFT_ACTION_WIDTH },
    swipeDonePlaceholder: { width: 0, height: "100%" },
    swipeEditArea: {
      width: SWIPE_LEFT_ACTION_WIDTH,
      height: "100%",
      minHeight: 96,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.blueSoft,
    },
    swipeDeleteArea: {
      width: SWIPE_LEFT_ACTION_WIDTH,
      height: "100%",
      minHeight: 96,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerLight,
    },
    // White-on-color contrast for solid action button backgrounds.
    swipeDoneText: {
      color: colors.textOnAccent,
      fontSize: 30,
      lineHeight: 32,
      fontWeight: "900"
    },
    swipeEditText: {
      color: colors.textOnAccent,
      fontSize: 27,
      lineHeight: 29,
      fontWeight: "900"
    },
    swipeDeleteText: {
      color: colors.textOnAccent,
      fontSize: 34,
      lineHeight: 34,
      fontWeight: "900"
    },
    // Animated wrapper that slides the card. Transparent — the inner
    // `deadline` View carries `colors.surface`. If we set bg here it would
    // form a 1-2px halo on the rounded corners when translateX moves it
    // over the action layer (the underlay tint would bleed at the curve).
    swipeCard: {
      borderRadius: DEADLINE_ROW_RADIUS,
      overflow: "hidden",
      // Solid surface so the action layer behind doesn't bleed through
      // when the inner card has `opacity: 0.62` (completed deadlines).
      backgroundColor: colors.surface,
    },
    // When swiping the card sits flush against the action buttons —
    // zero the corners so there's no visible rounded gap between them.
    // The outer rowShell still clips the row's outer perimeter to the
    // full radius, so the row's outline stays rounded.
    swipeCardActive: { borderRadius: 0 },
    // Card: solid surface, hairline border, generous corner radius.
    // flex-row so the date tile sits left of the body.
    deadline: {
      flexDirection: "row",
      alignItems: "stretch",
      minHeight: 96,
      borderRadius: DEADLINE_ROW_RADIUS,
      backgroundColor: colors.surface,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
      gap: 14,
    },
    // Same logic as swipeCardActive: inner card squares off when actively
    // swiping; the rowShell clips the outer silhouette to the row radius.
    deadlineSwiping: { borderRadius: 0 },
    deadlineDone: { opacity: 0.62 },
    deadlineCompleted: {
      minHeight: 86,
      paddingVertical: 10,
    },
    // Square date tile on the left — urgency-tinted background.
    dateTile: {
      width: 60,
      minHeight: 72,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      gap: 2,
    },
    dateTileCompleted: {
      width: 52,
      minHeight: 56,
      borderRadius: 12,
    },
    dateTileDay: {
      fontFamily: fonts.displayBold,
      fontSize: 26,
      lineHeight: 30,
      fontWeight: "800",
      letterSpacing: -0.6,
    },
    dateTileMonth: {
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
      opacity: 0.85,
    },
    deadlineBody: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      gap: 4,
    },
    relativeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    completedMetaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    completedMetaText: {
      color: colors.muted2,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowMeta,
      fontWeight: "700",
      letterSpacing: -0.1,
    },
    relativeText: {
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowMeta,
      fontWeight: "700",
      letterSpacing: -0.1,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
      fontWeight: "600",
      letterSpacing: -0.25,
      minWidth: 0,
    },
    titleDone: { textDecorationLine: "line-through" as const, color: colors.muted2 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    metaText: {
      flex: 1,
      color: colors.muted3,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
      minWidth: 0,
    },
    descriptionDone: { color: colors.muted3 },

    // ── Long-press context menu (Screenshot 3 style) ─────────────────
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    menuContainer: {
      position: "absolute",
      backgroundColor: colors.surface2,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 20,
      elevation: 12,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    menuRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    menuRowPressed: { backgroundColor: colors.surface3 },
    menuIconTile: {
      width: 32,
      height: 32,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    menuLabel: { fontFamily: fonts.bodyMedium, ...typeStyles.rowSecondary, fontWeight: "500", flex: 1 },

    manualDetailBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.62)",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingBottom: 28,
    },
    manualDetailCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 18,
      gap: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.42,
      shadowRadius: 28,
      elevation: 18,
    },
    manualDetailHandle: {
      width: 42,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.muted3,
      opacity: 0.45,
      alignSelf: "center",
      marginBottom: 4,
    },
    manualDetailTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
    },
    manualDetailDateTile: {
      width: 72,
      minHeight: 84,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      gap: 3,
    },
    manualDetailDateDay: {
      fontFamily: fonts.displayBold,
      fontSize: typeStyles.largeTitle.fontSize,
      lineHeight: 38,
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    manualDetailDateMonth: {
      fontFamily: fonts.bodyExtraBold,
      fontSize: 14,
      lineHeight: 17,
      fontWeight: "800",
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
    },
    manualDetailTitleBlock: {
      flex: 1,
      minWidth: 0,
      gap: 6,
      paddingTop: 2,
    },
    manualDetailRelativePill: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginBottom: 2,
    },
    manualDetailRelative: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
      fontWeight: "800",
    },
    manualDetailTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "800",
      letterSpacing: -0.35,
    },
    manualDetailClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    manualDetailDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    manualDetailSection: {
      gap: 10,
    },
    manualDetailLabel: {
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
    },
    manualDetailValue: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
      fontWeight: "600",
    },
    manualDetailMuted: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    manualReminderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
    },
    manualReminderIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: colors.blueSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    manualReminderTextBlock: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    manualTypeChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 10,
      minHeight: 42,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
    },
    manualTypeIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    manualTypeIconText: {
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      fontWeight: "800",
    },
    manualTypeChipText: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowSecondary,
      fontWeight: "700",
    },
    manualAddedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingTop: 2,
    },
    manualDetailActions: {
      gap: 10,
    },
    manualDetailActionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginHorizontal: -18,
    },
    manualDoneButton: {
      minHeight: 50,
      borderRadius: 15,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    manualDoneText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowSecondary,
      fontWeight: "700",
    },
    manualSecondaryActions: {
      flexDirection: "row",
      gap: 10,
    },
    manualSecondaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    manualEditText: {
      color: colors.primary,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowSecondary,
      fontWeight: "700",
    },
    manualDeleteText: {
      color: colors.danger,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowSecondary,
      fontWeight: "700",
    },

    deleteBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
      paddingBottom: 32,
      paddingHorizontal: 16,
    },
    deleteCard: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 18,
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
    },
    deletePreview: { flexDirection: "row", gap: 12, alignItems: "center" },
    deletePreviewText: { flex: 1, gap: 2 },
    deletePreviewTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, ...typeStyles.callout, fontWeight: "600" },
    deletePreviewMeta: { color: colors.muted3, fontFamily: fonts.body, ...typeStyles.rowMeta },
    deleteDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 2 },
    deleteQuestion: { color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.rowTitle, fontWeight: "700", letterSpacing: -0.25, marginTop: 6 },
    deleteHint: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowMeta, marginBottom: 8 },
    deleteConfirmButton: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.danger, alignItems: "center", justifyContent: "center" },
    deleteConfirmText: { color: colors.danger, fontFamily: fonts.bodySemiBold, ...typeStyles.callout, fontWeight: "600" },
    deleteCancelButton: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 2 },
    deleteCancelText: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.callout, fontWeight: "400" },
    modal: { padding: 20, gap: 12, backgroundColor: colors.bg, paddingBottom: 48 },

    // ── ManualDeadlineModal — bottom sheet ───────────────────────────
    sheetBackdrop: {
      flex: 1,
      // Deeper dim so the tab bar underneath doesn't show through the area
      // between the rounded top of the sheet and the status bar.
      backgroundColor: "rgba(0,0,0,0.72)",
      justifyContent: "flex-end",
    },
    sheetKAV: {
      // Flex-end so the sheet hugs the bottom even when KAV is active.
      width: "100%",
      justifyContent: "flex-end",
    },
    sheetContainer: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      // Cap to leave space for the status bar but give as much room as
      // possible — the calendar + note both need to fit.
      maxHeight: "95%",
      // Footer carries the safe-area inset, container pins to screen bottom.
    },
    sheetHandle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.muted3,
      opacity: 0.5,
      marginTop: 10,
      marginBottom: 8,
    },
    sheetScrollContent: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 8,
      gap: 18,
    },
    sheetHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.compactTitle,
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    sheetTitleInputWrap: {
      borderRadius: 14,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      minHeight: 52,
      justifyContent: "center",
    },
    sheetTitleInput: {
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.input,
      paddingVertical: 12,
    },
    sheetSectionLabel: {
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase" as const,
      marginTop: 4,
      marginBottom: -4,
    },
    chipRow: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
    },
    // Two-line chip block: label on top, resolved date below. Equal width so
    // the row fits 4 chips comfortably on iPhone widths.
    chipBlock: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,           // let chips shrink fully so 4 fit on iPhone width
      paddingVertical: 12,
      paddingHorizontal: 6,  // tighter padding gives text more breathing room
      borderRadius: 14,
      backgroundColor: colors.surface2,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      gap: 2,
    },
    chipBlockActive: {
      borderColor: colors.primary,
      backgroundColor: colors.blueSoft,
    },
    chipLabel: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    chipLabelActive: { color: colors.primary },
    chipSubLabel: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.caption2,
      fontWeight: "500",
    },
    chipSubLabelActive: { color: colors.primary, opacity: 0.85 },
    sheetCalendarWrap: { marginTop: -4 },

    // Reminder toggle row
    reminderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.surface2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    reminderIconTile: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: colors.surface3,
      alignItems: "center",
      justifyContent: "center",
    },
    reminderTextBlock: { flex: 1, minWidth: 0, gap: 2 },
    reminderTitle: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowSecondary,
      fontWeight: "600",
    },
    reminderSubtitle: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },

    // Note field at bottom
    sheetNoteWrap: {
      borderRadius: 14,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 56,
    },
    sheetNoteInput: {
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
      paddingVertical: 4,
      textAlignVertical: "top" as const,
    },

    sheetPrimaryButton: { marginTop: 4 },
    sheetFooter: {
      paddingHorizontal: 20,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },

    // ── (legacy full-screen variant — kept for the editing flow if needed) ──
    modalHeader: {
      paddingHorizontal: 22,
      paddingTop: 8,
      paddingBottom: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    modalTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.compactTitle,
      fontWeight: "800",
      letterSpacing: -0.6,
    },
    modalCloseButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    modalBody: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 24,
      gap: 22,
    },
    modalSection: { gap: 10 },
    modalLabel: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
    },
    presetRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
    presetChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    presetChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    presetChipText: {
      color: colors.muted,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    presetChipTextActive: { color: colors.textOnAccent },
    modalFooter: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
    },
    modalPrimaryButton: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    modalPrimaryButtonDisabled: { opacity: 0.45 },
    modalPrimaryText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
    },

    calWrap: { backgroundColor: colors.surface2, borderRadius: 14, padding: 12, gap: 8 },
    calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 4 },
    calNav: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    calNavText: { color: colors.text, fontSize: 22, fontWeight: "700", lineHeight: 24 },
    calMonth: { color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.callout, fontWeight: "700", textTransform: "capitalize" },
    calWeekRow: { flexDirection: "row" },
    calWeekday: { flex: 1, textAlign: "center", color: colors.muted2, fontFamily: fonts.bodySemiBold, ...typeStyles.caption1, fontWeight: "600", textTransform: "uppercase", paddingVertical: 6 },
    calGrid: { flexDirection: "row", flexWrap: "wrap" },
    calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
    calDay: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    calDaySelected: { backgroundColor: colors.primary },
    calDayToday: { borderWidth: 1.5, borderColor: colors.primary },
    calDayText: { color: colors.text, fontFamily: fonts.bodyMedium, ...typeStyles.rowSecondary, fontWeight: "500" },
    calDayTextSelected: { color: colors.textOnAccent, fontWeight: "800" },
    calDayPast: { color: colors.muted3 },
    pressed: { opacity: 0.72 },
    // Card press state: subtle scale, NO opacity. Opacity here would expose
    // the colored swipe-action layer (green/blue/red) sitting under the card
    // through the card's translucent body — looks like a coloured halo.
    cardPressed: { transform: [{ scale: 0.985 }] },
  });
}
