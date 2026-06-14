import { useCallback, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { Icon } from "@/components/Icon";
import { type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";
import type { DeadlineResponse, ScanListItem } from "@/lib/types";

import type { CategoryStyleList, ScanListStyles } from "./scanListStyles";
import {
  formatDate,
  getActivityDate,
  getDeadlineBadge,
  getDeadlineBadgeColors,
  getDocMeta,
  getDocVisual,
  getTitle,
  type MeasuredRect,
} from "./scanListData";

export function DocumentRow({ item, deadline, pinned, query, colors, styles, categoryStyleList, onLongPress }: {
  item: ScanListItem;
  deadline?: DeadlineResponse;
  pinned?: boolean;
  query?: string;
  colors: ColorPalette;
  styles: ScanListStyles;
  categoryStyleList: CategoryStyleList;
  onLongPress?: (rect: MeasuredRect) => void;
}) {
  const rowRef = useRef<View>(null);

  const handleLongPress = useCallback(() => {
    rowRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress?.({ x, y, width, height });
    });
  }, [onLongPress]);

  return (
    <View ref={rowRef} collapsable={false}>
      <Pressable
        style={({ pressed }) => pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }}
        onPress={() => router.push(`/scan/${item.id}`)}
        onLongPress={handleLongPress}
        delayLongPress={350}
      >
        <DocumentRowVisual
          item={item}
          deadline={deadline}
          pinned={pinned}
          query={query}
          colors={colors}
          styles={styles}
          categoryStyleList={categoryStyleList}
        />
      </Pressable>
    </View>
  );
}

export function DocumentRowVisual({ item, deadline, pinned, query, colors, styles, categoryStyleList }: {
  item: ScanListItem;
  deadline?: DeadlineResponse;
  pinned?: boolean;
  query?: string;
  colors: ColorPalette;
  styles: ScanListStyles;
  categoryStyleList: CategoryStyleList;
}) {
  const visual = getDocVisual(item, colors, categoryStyleList);
  const badge = deadline ? getDeadlineBadge(deadline.due_date) : null;
  const badgeColors = deadline ? getDeadlineBadgeColors(deadline.due_date, colors) : visual;
  const secondaryBadge = t("scan.pageCount", { count: item.page_count });

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={[styles.thumb, { backgroundColor: visual.bg }]}>
          <Icon name="doc-text" size={20} color={visual.fg} />
        </View>
        <View style={styles.rowHeadText}>
          <View style={styles.rowMetaLine}>
            <Text style={styles.rowEyebrow} numberOfLines={1}>{getDocMeta(item)}</Text>
            <Text style={styles.rowTime}>{formatDate(getActivityDate(item))}</Text>
          </View>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {highlightMatch(getTitle(item), query, styles.highlight)}
          </Text>
          {item.sender ? (
            <Text style={styles.rowSender} numberOfLines={1}>
              {highlightMatch(item.sender, query, styles.highlight)}
            </Text>
          ) : null}
        </View>
      </View>
      {item.summary ? (
        <Text style={styles.rowPreview} numberOfLines={2}>
          {highlightMatch(item.summary, query, styles.highlight)}
        </Text>
      ) : null}
      <View style={styles.rowPills}>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badgeColors.badgeBg ?? colors.blueSoft }]}>
            <Text style={[styles.badgeText, { color: badgeColors.badgeFg ?? colors.primary }]}>{badge}</Text>
          </View>
        ) : null}
        <View style={[styles.badge, styles.secondaryBadge]}>
          <Text style={[styles.badgeText, styles.secondaryBadgeText]}>{secondaryBadge}</Text>
        </View>
        {pinned ? (
          <View style={styles.pinTrail}>
            <Icon name="pin" size={14} color={colors.muted2} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function highlightMatch(text: string, query: string | undefined, highlightStyle: object) {
  const q = query?.trim();
  if (!q) return text;
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerText.indexOf(lowerQ);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <Text style={highlightStyle}>{text.slice(idx, idx + q.length)}</Text>
      {text.slice(idx + q.length)}
    </>
  );
}
