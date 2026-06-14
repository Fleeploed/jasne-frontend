import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import type { ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";
import type { DeadlineResponse } from "@/lib/types";
import type { DeadlinesStyles } from "@/features/deadlines/components/deadlinesStyles";
import { DEADLINE_ROW_RADIUS, completedDateLabel, daysUntil, deadlineSourceLabel, parseDayMonthAbbr, relativeTime, tileColors, urgencyTone } from "@/features/deadlines/components/deadlinesData";

// ---------------------------------------------------------------------------
// Long-press context menu (iOS-style popover, NOT a bottom sheet)
// ---------------------------------------------------------------------------

export const CONTEXT_MENU_WIDTH = 240;

export function DeadlineContextMenu({
  anchor,
  colors,
  styles,
  onClose,
  onDone,
  onReactivate,
  onEdit,
  onDelete,
}: {
  anchor: {
    item: DeadlineResponse;
    rect: { x: number; y: number; width: number; height: number };
  } | null;
  colors: ColorPalette;
  styles: DeadlinesStyles;
  onClose: () => void;
  onDone: (item: DeadlineResponse) => void;
  onReactivate: (item: DeadlineResponse) => void;
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

  // 3 rows in both states: (markDone | markActive) + edit + delete.
  const menuHeight = 170;
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
        {isDone ? (
          <MenuRow
            iconName="bell"
            iconBg={colors.blueSoft}
            iconColor={colors.primary}
            label={t("deadlines.markActive")}
            labelColor={colors.text}
            onPress={() => onReactivate(item)}
            styles={styles}
          />
        ) : (
          <MenuRow
            iconName="check"
            iconBg={colors.greenLight}
            iconColor={colors.green}
            label={t("deadlines.markDone")}
            labelColor={colors.text}
            onPress={() => onDone(item)}
            styles={styles}
          />
        )}
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

export function DeadlineRowVisual({
  item,
  colors,
  styles,
  cardWidth,
}: {
  item: DeadlineResponse;
  colors: ColorPalette;
  styles: DeadlinesStyles;
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
          <Text style={[styles.metaText, styles.metaTextManual, done && styles.descriptionDone]} numberOfLines={1}>
            {item.description.replace(/\n+/g, " ").trim()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function MenuRow({
  iconName,
  iconBg,
  iconColor,
  label,
  labelColor,
  onPress,
  styles,
  last,
}: {
  iconName: "check" | "sliders" | "x" | "bell";
  iconBg: string;
  iconColor: string;
  label: string;
  labelColor: string;
  onPress: () => void;
  styles: DeadlinesStyles;
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

