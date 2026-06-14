import { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import type { ColorPalette } from "@/components/ui";
import { triggerSelectionHaptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { DeadlineResponse } from "@/lib/types";
import type { DeadlinesStyles } from "@/features/deadlines/components/deadlinesStyles";
import { SWIPE_ACTION_OVERDRAG, SWIPE_DIRECTION_LOCK_RATIO, SWIPE_FAST_VELOCITY, SWIPE_GESTURE_START_DISTANCE, SWIPE_LEFT_ACTION_WIDTH, SWIPE_LEFT_THRESHOLD, SWIPE_LEFT_WIDTH, SWIPE_RIGHT_COMMIT_THRESHOLD, SWIPE_RIGHT_WIDTH, completedDateLabel, daysUntil, deadlineSourceLabel, parseDayMonthAbbr, relativeTime, tileColors, urgencyTone } from "@/features/deadlines/components/deadlinesData";

export function DeadlineCard({
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
  styles: DeadlinesStyles;
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
  const leftRevealThreshold = done
    ? Math.max(22, SWIPE_LEFT_ACTION_WIDTH * 0.38)
    : SWIPE_LEFT_THRESHOLD;
  const rightRevealThreshold = SWIPE_RIGHT_WIDTH * 0.32;
  const rightCommitThreshold = SWIPE_RIGHT_COMMIT_THRESHOLD;
  const minSwipeX = -(leftWidth + SWIPE_ACTION_OVERDRAG);
  const maxSwipeX = rightWidth + SWIPE_ACTION_OVERDRAG;
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
        // Claim the responder once the user has clearly started a horizontal
        // swipe, while still leaving mostly-vertical drags to the ScrollView.
        onMoveShouldSetPanResponder: (_, gesture) => {
          const absDx = Math.abs(gesture.dx);
          const absDy = Math.abs(gesture.dy);
          if (absDx < SWIPE_GESTURE_START_DISTANCE) return false;
          if (absDx < absDy * SWIPE_DIRECTION_LOCK_RATIO) return false;
          // Completed rows do not have a right-side action, unless the row is
          // already open to the left and the user is swiping right to close it.
          if (done && gesture.dx > 0 && currentX.current >= 0) return false;
          return true;
        },
        onPanResponderGrant: () => {
          thresholdVibrated.current = false;
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.max(minSwipeX, Math.min(maxSwipeX, currentX.current + gesture.dx));
          translateX.setValue(next);

          // Haptic on first crossing of the reveal/commit threshold.
          const crossedLeft = next <= -leftRevealThreshold;
          const crossedRight = rightWidth > 0 && next >= rightRevealThreshold;
          if ((crossedLeft || crossedRight) && !thresholdVibrated.current) {
            thresholdVibrated.current = true;
            triggerSelectionHaptic();
          }
          if (next > -leftRevealThreshold && next < rightRevealThreshold) {
            thresholdVibrated.current = false;
          }
        },
        onPanResponderRelease: (_, gesture) => {
          const next = Math.max(minSwipeX, Math.min(maxSwipeX, currentX.current + gesture.dx));
          const fastLeft = gesture.vx < -SWIPE_FAST_VELOCITY && gesture.dx < -SWIPE_GESTURE_START_DISTANCE;
          const fastRight = gesture.vx > SWIPE_FAST_VELOCITY && gesture.dx > SWIPE_GESTURE_START_DISTANCE;

          if (rightWidth > 0 && next >= rightCommitThreshold) {
            commitDone();
            return;
          }
          if (next <= -leftRevealThreshold || fastLeft) {
            openLeftActions();
            return;
          }
          if (rightWidth > 0 && (next >= rightRevealThreshold || fastRight)) {
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
    [closeRow, commitDone, done, item.id, leftRevealThreshold, maxSwipeX, minSwipeX, openLeftActions, openRightAction, rightCommitThreshold, rightRevealThreshold, rightWidth, setOpenDeadlineId, translateX]
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
          <Text style={[styles.metaText, styles.metaTextManual, done && styles.descriptionDone]} numberOfLines={1}>
            {item.description.replace(/\n+/g, " ").trim()}
          </Text>
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
          <Pressable onPress={commitDone} accessibilityRole="button" accessibilityLabel={t("deadlines.markDone")} style={({ pressed }) => [styles.swipeDoneArea, pressed && styles.pressed]}>
            <AppIcon name="check" size={24} color={colors.greenDark} strokeWidth={2.4} />
          </Pressable>
        )}
        <View style={[styles.swipeLeftActions, done && styles.swipeLeftActionsCompact]}>
          {!done ? (
            <Pressable onPress={commitEdit} accessibilityRole="button" accessibilityLabel={t("common.edit")} style={({ pressed }) => [styles.swipeEditArea, pressed && styles.pressed]}>
              <AppIcon name="sliders" size={22} color={colors.primary} strokeWidth={1.9} />
            </Pressable>
          ) : null}
          <Pressable onPress={commitDelete} accessibilityRole="button" accessibilityLabel={t("common.delete")} style={({ pressed }) => [styles.swipeDeleteArea, pressed && styles.pressed]}>
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

