import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";
import { AppIcon } from "@/components/AppIcon";
import { TrackingCard } from "@/components/tracking/TrackingCard";
import { EmptyState, ErrorText, Screen, useColors } from "@/components/ui";
import { completeDeadline, deleteDeadline, listDeadlines, reactivateDeadline } from "@/features/deadlines/deadlinesApi";
import { getLimits } from "@/features/scans/scansApi";
import { useTrackings } from "@/hooks/useTrackings";
import { triggerLongPressHaptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { DeadlineResponse, Tracking, UserPlan } from "@/lib/types";
import { createStyles } from "@/features/deadlines/components/deadlinesStyles";
import { HORIZONTAL_PADDING, compareDeadlines, groupDeadlines, tallyUrgency } from "@/features/deadlines/components/deadlinesData";
import { UrgencyDot } from "@/features/deadlines/components/UrgencyDot";
import { DeadlineCard } from "@/features/deadlines/components/DeadlineCard";
import { ManualDeadlineModal } from "@/features/deadlines/components/ManualDeadlineModal";
import { ManualDeadlineDetailModal } from "@/features/deadlines/components/ManualDeadlineDetailModal";
import { DeadlineContextMenu } from "@/features/deadlines/components/DeadlineContextMenu";
import { DeleteDeadlineModal } from "@/features/deadlines/components/DeleteDeadlineModal";

export function DeadlinesScreen() {
  const colors = useColors();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const trackingsQuery = useTrackings();
  const trackings: Tracking[] = trackingsQuery.data ?? [];
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.max(0, screenWidth - HORIZONTAL_PADDING * 2);

  const [deadlines, setDeadlines] = useState<DeadlineResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<DeadlineResponse | null>(null);
  const [openDeadlineId, setOpenDeadlineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Collapsed by default — active items are the focus, completed are
  // reference. Count badge stays visible so user knows they exist.
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeadlineResponse | null>(null);
  const [detailDeadline, setDetailDeadline] = useState<DeadlineResponse | null>(null);
  // Pending action queued while detail modal finishes its iOS dismiss
  // animation. iOS forbids presenting a second Modal while the first is
  // still mid-dismiss, so we wait for onDismiss before opening edit/delete.
  const [pendingAfterDetailDismiss, setPendingAfterDetailDismiss] = useState<
    { kind: "edit" | "delete"; item: DeadlineResponse } | null
  >(null);
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
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
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

  async function markActive(deadlineId: string) {
    try {
      const updated = await reactivateDeadline(deadlineId);
      setDeadlines((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)).sort(compareDeadlines)
      );
    } catch (activeError) {
      setError(activeError instanceof Error ? activeError.message : t("deadlines.completeError"));
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

  function confirmClearCompleted() {
    const completedItems = deadlines.filter((d) => d.status === "completed");
    if (completedItems.length === 0) return;
    Alert.alert(
      t("deadlines.clearCompletedConfirmTitle"),
      t("deadlines.clearCompletedConfirmBody", { count: completedItems.length }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => void clearAllCompleted(completedItems.map((d) => d.id)),
        },
      ],
      { cancelable: true },
    );
  }

  async function clearAllCompleted(ids: string[]) {
    // Optimistic removal — restore on error.
    const previous = deadlines;
    setDeadlines((current) => current.filter((item) => !ids.includes(item.id)));
    const results = await Promise.allSettled(ids.map((id) => deleteDeadline(id)));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      setDeadlines(previous);
      setError(t("deadlines.clearCompletedError"));
    }
  }

  function confirmDelete(item: DeadlineResponse) {
    if (item.status === "completed") {
      void removeDeadline(item.id);
      return;
    }
    requestAnimationFrame(() => setPendingDelete(item));
  }

  const hasActive = activeSections.length > 0;
  const hasCompleted = completedCount > 0;
  const hasTrackings = trackings.length > 0;
  const hasAnyItems = deadlines.length > 0 || hasTrackings;
  const trackingError = trackingsQuery.error instanceof Error ? trackingsQuery.error.message : null;

  if (loading || (trackingsQuery.isLoading && !trackingsQuery.data)) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  function refreshAll() {
    setRefreshing(true);
    void Promise.all([load(), trackingsQuery.refetch()]).finally(() => {
      if (aliveRef.current) setRefreshing(false);
    });
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.screenTitle}>{t("deadlines.title")}</Text>
          <Pressable
            onPress={() => setModalOpen(true)}
            style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("deadlines.addAria")}
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
      <ErrorText message={error ?? trackingError} />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={hasAnyItems ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={refreshAll} />}
      >
        {!hasAnyItems ? (
          <EmptyState title={t("deadlines.emptyTitle")} detail={t("deadlines.emptyDetail")} />
        ) : (
          <>
            {hasTrackings ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>{t("tracking.section.title")}</Text>
                  <View style={styles.sectionCount}>
                    <Text style={styles.sectionCountText}>{trackings.length}</Text>
                  </View>
                </View>
                <View style={styles.sectionCards}>
                  {trackings.map((item) => (
                    <TrackingCard key={item.id} tracking={item} />
                  ))}
                </View>
              </View>
            ) : null}

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
                        triggerLongPressHaptic();
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
                                triggerLongPressHaptic();
                                setContextMenu({ item: d, rect });
                              }}
                              onOpenScan={(scanId) => router.push(`/scan/${scanId}`)}
                            />
                          ))}
                        </View>
                      </View>
                    ))}
                    <Pressable
                      onPress={confirmClearCompleted}
                      style={({ pressed }) => [styles.clearCompletedButton, pressed && styles.pressed]}
                      accessibilityRole="button"
                    >
                      <AppIcon name="x" size={14} color={colors.danger} strokeWidth={2.2} />
                      <Text style={styles.clearCompletedText}>{t("deadlines.clearCompleted")}</Text>
                    </Pressable>
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
        onReactivate={(item) => {
          setContextMenu(null);
          void markActive(item.id);
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
        onDismissed={() => {
          // Detail modal fully dismissed on iOS — safe to open the next one.
          if (!pendingAfterDetailDismiss) return;
          const { kind, item } = pendingAfterDetailDismiss;
          setPendingAfterDetailDismiss(null);
          if (kind === "edit") setEditingDeadline(item);
          else confirmDelete(item);
        }}
        onDone={(item) => {
          setDetailDeadline(null);
          void markDone(item.id);
        }}
        onEdit={(item) => {
          setPendingAfterDetailDismiss({ kind: "edit", item });
          setDetailDeadline(null);
        }}
        onDelete={(item) => {
          setPendingAfterDetailDismiss({ kind: "delete", item });
          setDetailDeadline(null);
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

