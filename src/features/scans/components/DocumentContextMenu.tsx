import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";
import type { DeadlineResponse, ScanListItem } from "@/lib/types";

import { DocumentRowVisual } from "./DocumentRow";
import type { CategoryStyleList, ScanListStyles } from "./scanListStyles";
import type { MeasuredRect } from "./scanListData";

const DOCUMENT_CONTEXT_MENU_WIDTH = 272;

export type DocumentContextMenuAnchor = {
  scan: ScanListItem;
  deadline?: DeadlineResponse;
  pinned?: boolean;
  query?: string;
  rect: MeasuredRect;
};

export function DocumentContextMenu({
  anchor,
  pinnedIds,
  colors,
  styles,
  categoryStyleList,
  onClose,
  onTogglePin,
  onDelete,
}: {
  anchor: DocumentContextMenuAnchor | null;
  pinnedIds: Set<string>;
  colors: ColorPalette;
  styles: ScanListStyles;
  categoryStyleList: CategoryStyleList;
  onClose: () => void;
  onTogglePin: (scan: ScanListItem) => void;
  onDelete: (scan: ScanListItem) => void;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
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

  const { scan, deadline, rect } = anchor;
  const isPinned = pinnedIds.has(scan.id);
  const menuHeight = 112;
  const cardLift = 6;
  const cardTop = rect.y;
  const previewBottom = cardTop + rect.height - cardLift;
  const topLimit = 40;
  const bottomLimit = screenH - 180;
  const menuGap = 8;
  const menuBelowTop = previewBottom + menuGap;
  const menuAboveTop = cardTop - cardLift - menuGap - menuHeight;
  const hasRoomBelow = menuBelowTop + menuHeight <= bottomLimit;
  const menuTop = hasRoomBelow
    ? menuBelowTop
    : Math.max(topLimit, Math.min(menuAboveTop, bottomLimit - menuHeight));
  const menuLeft = Math.min(
    Math.max(16, rect.x + rect.width - DOCUMENT_CONTEXT_MENU_WIDTH - 16),
    screenW - DOCUMENT_CONTEXT_MENU_WIDTH - 16,
  );

  const dimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const previewOpacity = progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] });
  const cardScale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const cardTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -cardLift] });
  const menuScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.docMenuBackdrop, { opacity: dimOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.docMenuPreview,
          {
            left: rect.x,
            top: cardTop,
            width: rect.width,
            minHeight: rect.height,
            opacity: previewOpacity,
            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
          },
        ]}
      >
        <DocumentRowVisual
          item={scan}
          deadline={deadline}
          pinned={isPinned}
          query={anchor.query}
          colors={colors}
          styles={styles}
          categoryStyleList={categoryStyleList}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.docMenuContainer,
          {
            top: menuTop,
            left: menuLeft,
            width: DOCUMENT_CONTEXT_MENU_WIDTH,
            opacity: progress,
            transform: [{ scale: menuScale }],
          },
        ]}
      >
        <DocumentMenuRow
          iconName="pin"
          iconBg={colors.blueSoft}
          iconColor={colors.primary}
          label={t(isPinned ? "documents.unpin" : "documents.pin")}
          labelColor={colors.text}
          onPress={() => onTogglePin(scan)}
          styles={styles}
        />
        <DocumentMenuRow
          iconName="trash"
          iconBg={colors.dangerLight}
          iconColor={colors.danger}
          label={t("documents.actionDelete")}
          labelColor={colors.danger}
          onPress={() => onDelete(scan)}
          styles={styles}
          divider={false}
        />
      </Animated.View>
    </View>
  );
}

function DocumentMenuRow({
  iconName,
  iconBg,
  iconColor,
  label,
  labelColor,
  onPress,
  styles,
  divider = true,
}: {
  iconName: IconName;
  iconBg: string;
  iconColor: string;
  label: string;
  labelColor: string;
  onPress: () => void;
  styles: ScanListStyles;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.docMenuRow,
        divider && styles.docMenuRowDivider,
        pressed && styles.docMenuRowPressed,
      ]}
    >
      <View style={[styles.docMenuIconTile, { backgroundColor: iconBg }]}>
        <Icon name={iconName} size={20} color={iconColor} />
      </View>
      <Text style={[styles.docMenuLabel, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}
