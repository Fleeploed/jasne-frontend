import { useCallback, useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { AppIcon } from "@/components/AppIcon";
import type { ColorPalette } from "@/components/ui";
import { triggerSelectionHaptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { DeadlineResponse } from "@/lib/types";
import type { DeadlinesStyles } from "@/features/deadlines/components/deadlinesStyles";
import {
  SWIPE_LEFT_THRESHOLD,
  SWIPE_RIGHT_WIDTH,
  completedDateLabel,
  daysUntil,
  deadlineSourceLabel,
  parseDayMonthAbbr,
  relativeTime,
  tileColors,
  urgencyTone,
} from "@/features/deadlines/components/deadlinesData";

export function DeadlineCard({
  item,
  colors,
  styles,
  cardWidth,
  openDeadlineId,
  setOpenDeadlineId,
  onDone,
  onSwipeDelete,
  onEdit,
  onOpenManual,
  onLongPress,
  onOpenScan,
}: {
  item: DeadlineResponse;
  colors: ColorPalette;
  styles: DeadlinesStyles;
  cardWidth: number;
  openDeadlineId: string | null;
  setOpenDeadlineId: (deadlineId: string | null) => void;
  onDone: (deadlineId: string) => Promise<void>;
  onSwipeDelete: (deadline: DeadlineResponse) => void;
  onEdit: (deadline: DeadlineResponse) => void;
  onOpenManual: (deadline: DeadlineResponse) => void;
  onLongPress: (
    deadline: DeadlineResponse,
    rect: { x: number; y: number; width: number; height: number }
  ) => void;
  onOpenScan: (scanId: string) => void;
}) {
  const done = item.status === "completed";
  const activeSwipe = openDeadlineId === item.id;
  const days = daysUntil(item.due_date);
  const tone = done ? "done" : urgencyTone(days);
  const tile = tileColors(tone, colors);
  const relativeLabelColor = tone === "urgent" ? colors.danger : colors.text;
  const { day, month } = parseDayMonthAbbr(item.due_date);

  // Ref on the outer wrapper of the row — measureInWindow gives us absolute
  // screen coords for the long-press preview, independent of scroll offset.
  const wrapperRef = useRef<View>(null);
  const swipeableRef = useRef<SwipeableMethods>(null);

  const handleLongPress = useCallback(() => {
    wrapperRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress(item, { x, y, width, height });
    });
  }, [item, onLongPress]);

  // Close this row's swipe when another row is being swiped.
  useEffect(() => {
    if (openDeadlineId !== null && openDeadlineId !== item.id) {
      swipeableRef.current?.close();
    }
  }, [openDeadlineId, item.id]);

  // Swipe right reveals a green "done" check — active rows only.
  const renderDoneAction = useCallback(
    () => (
      <View style={styles.swipeDoneArea}>
        <AppIcon name="check" size={24} color={colors.greenDark} strokeWidth={2.4} />
      </View>
    ),
    [colors.greenDark, styles.swipeDoneArea]
  );

  // Swipe left reveals tappable action buttons (they stay open until tapped):
  // active rows get Edit + Delete; completed rows get Delete only.
  const renderRightActions = useCallback(
    () => (
      <View style={[styles.swipeLeftActions, done && styles.swipeLeftActionsCompact]}>
        {done ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.edit")}
            onPress={() => {
              swipeableRef.current?.close();
              onEdit(item);
            }}
            style={({ pressed }) => [styles.swipeEditArea, pressed && styles.cardPressed]}
          >
            <AppIcon name="sliders" size={22} color={colors.brandBlue} strokeWidth={2} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.delete")}
          onPress={() => {
            swipeableRef.current?.close();
            onSwipeDelete(item);
          }}
          style={({ pressed }) => [styles.swipeDeleteArea, pressed && styles.cardPressed]}
        >
          <AppIcon name="x" size={22} color={colors.dangerDark} strokeWidth={2.2} />
        </Pressable>
      </View>
    ),
    [done, item, onEdit, onSwipeDelete, colors.primary, colors.dangerDark, styles]
  );

  const sourceLabel = item.scan_id ? deadlineSourceLabel(item) : null;

  const card = (
    <View
      style={[
        styles.deadline,
        activeSwipe && styles.deadlineSwiping,
        done && styles.deadlineCompleted,
        { width: cardWidth },
      ]}
    >
      {/* Dim opacity lives on this inner row, not the card View, so the card's
          opaque surface keeps covering the swipe-delete layer behind it. */}
      <View style={[styles.deadlineInner, done && styles.deadlineDone]}>
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
            <Text style={[styles.metaText, styles.metaTextManual, done && styles.descriptionDone]} numberOfLines={1}>
              {item.description.replace(/\n+/g, " ").trim()}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View ref={wrapperRef} style={[styles.rowShell, done && styles.rowShellCompleted, { width: cardWidth }]}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={1.6}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={SWIPE_RIGHT_WIDTH * 0.5}
        rightThreshold={SWIPE_LEFT_THRESHOLD}
        renderLeftActions={done ? undefined : renderDoneAction}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={() => setOpenDeadlineId(item.id)}
        onSwipeableOpen={(direction, swipeable) => {
          triggerSelectionHaptic();
          // direction "left" = left actions revealed = swiped RIGHT → quick
          // complete (active only): fire and snap closed.
          if (direction === "left") {
            void onDone(item.id);
            swipeable.close();
            return;
          }
          // direction "right" = right actions revealed = swiped LEFT.
          // Completed rows quick-delete; active rows reveal Edit/Delete buttons
          // and stay open so the user can tap one.
          if (done) {
            onSwipeDelete(item);
            swipeable.close();
          }
        }}
        onSwipeableClose={() => {
          if (openDeadlineId === item.id) setOpenDeadlineId(null);
        }}
      >
        <Pressable
          onPress={() => {
            if (item.scan_id) onOpenScan(item.scan_id);
            else onOpenManual(item);
          }}
          onLongPress={handleLongPress}
          delayLongPress={350}
          style={({ pressed }) => pressed && styles.cardPressed}
        >
          {card}
        </Pressable>
      </ReanimatedSwipeable>
    </View>
  );
}
