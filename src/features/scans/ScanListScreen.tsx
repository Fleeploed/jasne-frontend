import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, FlatList, Image, Keyboard, LayoutAnimation, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, UIManager, useWindowDimensions, Vibration, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";
import { BrandWordmark } from "@/components/BrandMark";
import { Icon, type IconName } from "@/components/Icon";
import { ErrorText, Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { listAllDeadlines } from "@/features/deadlines/deadlinesApi";
import { SCANS_PAGE_SIZE, deleteScan, getLimits, getScanCounts, listScans, type ScanCountsResponse } from "@/features/scans/scansApi";
import { invalidateChatCache } from "@/features/chat/chatThreadCache";
import { getPinnedScanIds, togglePinnedScan } from "@/features/scans/pinnedScansStore";
import {
  type PendingScanRecord,
  getPendingScanList,
  subscribePendingScan,
} from "@/features/scans/pendingScanStore";
import { formatCategoryLabel, formatLocalizedDate, getLocale, pluralize, t, type PluralForms } from "@/lib/i18n";
import type { DeadlineResponse, LimitsResponse, ScanListItem } from "@/lib/types";

// Enable LayoutAnimation on Android (iOS has it by default).
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type RowVisual = {
  bg: string;
  fg: string;
  badgeBg?: string;
  badgeFg?: string;
};

type MeasuredRect = { x: number; y: number; width: number; height: number };
type DocumentCategoryFilterKey = "all" | `category:${string}`;
type DocumentCategoryFilter = { key: DocumentCategoryFilterKey; label: string; count: number };

const DOCUMENT_CONTEXT_MENU_WIDTH = 272;
const DOCUMENT_ROW_RADIUS = 20;
const DOCUMENT_CATEGORY_ORDER = [
  "cizinecka",
  "danove",
  "ucty",
  "socialni",
  "zdravotni",
  "smlouvy",
  "soudni",
  "urad_prace",
  "skolstvi",
  "ostatni",
];

function getCategoryStyles(colors: ColorPalette) {
  return [
    { category: "cizinecka", match: ["ciz", "visa", "pobyt", "immigration", "mv čr", "oamp"], bg: colors.blueSoft, fg: colors.primary, badgeBg: colors.blueSoft, badgeFg: colors.primary },
    { category: "danove", match: ["dan", "tax", "finan"], bg: colors.cream, fg: colors.amber, badgeBg: colors.amberLight, badgeFg: colors.amberDark },
    { category: "ucty", match: ["ucet", "účet", "fakt", "invoice", "platb"], bg: colors.greenLight, fg: colors.greenDark, badgeBg: colors.greenLight, badgeFg: colors.greenDark },
    { category: "socialni", match: ["social", "dávk", "podpor"], bg: "rgba(168,147,224,0.14)", fg: colors.pro, badgeBg: colors.proLight, badgeFg: colors.pro },
    { category: "zdravotni", match: ["zdrav", "pojist", "vzp", "doctor"], bg: "rgba(240,141,160,0.15)", fg: "#F08DA0", badgeBg: "rgba(240,141,160,0.15)", badgeFg: "#F08DA0" },
    { category: "smlouvy", match: ["smlouv", "contract", "nájem"], bg: "rgba(45,188,178,0.14)", fg: "#2DBCB2", badgeBg: "rgba(45,188,178,0.14)", badgeFg: "#2DBCB2" },
    { category: "soudni", match: ["soud", "court"], bg: colors.dangerLight, fg: colors.dangerDark, badgeBg: colors.dangerLight, badgeFg: colors.dangerDark },
    { category: "urad_prace", match: ["urad_prace", "úřad práce", "prace", "zaměstn"], bg: "rgba(239,137,69,0.15)", fg: "#EF8945", badgeBg: "rgba(239,137,69,0.15)", badgeFg: "#EF8945" },
    { category: "skolstvi", match: ["skol", "škol", "school", "student"], bg: "rgba(154,163,255,0.16)", fg: "#9AA3FF", badgeBg: "rgba(154,163,255,0.16)", badgeFg: "#9AA3FF" },
    { category: "ostatni", match: ["ostat", "other"], bg: colors.surface3, fg: colors.muted2, badgeBg: colors.surface3, badgeFg: colors.muted2 }
  ];
}

export function ScanListScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const categoryStyleList = useMemo(() => getCategoryStyles(colors), [colors]);

  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineResponse[]>([]);
  const [limits, setLimits] = useState<LimitsResponse | null>(null);
  const [counts, setCounts] = useState<ScanCountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMoreScans, setLoadingMoreScans] = useState(false);
  const [hasMoreScans, setHasMoreScans] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<DocumentCategoryFilterKey>("all");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [documentMenu, setDocumentMenu] = useState<{
    scan: ScanListItem;
    deadline?: DeadlineResponse;
    pinned?: boolean;
    query?: string;
    rect: MeasuredRect;
  } | null>(null);
  const [pendingScans, setPendingScans] = useState<PendingScanRecord[]>(() => getPendingScanList());
  const searchInputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<any>>(null);
  useScrollToTop(listRef);

  useEffect(() => {
    const unsubscribe = subscribePendingScan(() => setPendingScans(getPendingScanList()));
    setPendingScans(getPendingScanList());
    return unsubscribe;
  }, []);

  const handledScanIdsRef = useRef<Set<string>>(new Set());

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
      const [nextScans, nextLimits, nextDeadlines, nextPinned, nextCounts] = await Promise.all([
        listScans({ limit: SCANS_PAGE_SIZE, offset: 0 }),
        getLimits(),
        listAllDeadlines(true, "active"),
        getPinnedScanIds(),
        getScanCounts().catch(() => null),
      ]);
      if (!aliveRef.current) return;
      setScans(nextScans);
      setHasMoreScans(nextScans.length === SCANS_PAGE_SIZE);
      setLimits(nextLimits);
      setDeadlines(nextDeadlines);
      setPinnedIds(new Set(nextPinned));
      if (nextCounts) setCounts(nextCounts);
    } catch (loadError) {
      if (!aliveRef.current) return;
      setError(loadError instanceof Error ? loadError.message : t("documents.loadError"));
    } finally {
      if (aliveRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadMoreScans = useCallback(async () => {
    if (loading || refreshing || loadingMoreScans || !hasMoreScans) return;
    setLoadingMoreScans(true);
    setError(null);
    try {
      const nextScans = await listScans({ limit: SCANS_PAGE_SIZE, offset: scans.length });
      if (!aliveRef.current) return;
      setScans((current) => mergeScansById(current, nextScans));
      setHasMoreScans(nextScans.length === SCANS_PAGE_SIZE);
    } catch (loadError) {
      if (!aliveRef.current) return;
      setError(loadError instanceof Error ? loadError.message : t("documents.loadError"));
    } finally {
      if (aliveRef.current) setLoadingMoreScans(false);
    }
  }, [hasMoreScans, loading, loadingMoreScans, refreshing, scans.length]);

  const togglePin = useCallback(async (scanId: string) => {
    const next = await togglePinnedScan(scanId);
    if (!aliveRef.current) return;
    setPinnedIds(new Set(next));
  }, []);

  const performDelete = useCallback(async (scan: ScanListItem) => {
    const previous = scans;
    const previousCounts = counts;
    setScans((current) => current.filter((s) => s.id !== scan.id));
    setDeadlines((current) => current.filter((d) => d.scan_id !== scan.id));
    setCounts((current) => {
      if (!current) return current;
      const key = normalizeCategoryKey(scan.category ?? scan.doc_type) ?? "ostatni";
      const nextByCategory = { ...current.by_category };
      const nextValue = (nextByCategory[key] ?? 0) - 1;
      if (nextValue <= 0) delete nextByCategory[key];
      else nextByCategory[key] = nextValue;
      return { total: Math.max(0, current.total - 1), by_category: nextByCategory };
    });
    try {
      await deleteScan(scan.id);
      invalidateChatCache(scan.id);
      // TODO: once push notifications are wired, cancel locally scheduled
      // reminders for this scan's deadlines here. Backend cascades the rows;
      // only client-side scheduled notifications remain.
    } catch (error) {
      if (!aliveRef.current) return;
      setScans(previous);
      setCounts(previousCounts);
      const detail = error instanceof Error ? error.message : String(error);
      console.warn("deleteScan failed", error);
      Alert.alert(t("documents.deleteErrorToast"), detail);
    }
  }, [scans, counts]);

  const confirmDelete = useCallback((scan: ScanListItem) => {
    Alert.alert(
      t("documents.deleteConfirmTitle"),
      t("documents.deleteConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("documents.deleteConfirmCta"), style: "destructive", onPress: () => void performDelete(scan) },
      ],
      { cancelable: true },
    );
  }, [performDelete]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // When any pending scan settles (scanId arrives), refresh the list so the
  // pending card transitions into a regular scan row.
  useEffect(() => {
    const settled = pendingScans.filter((p) => p.scanId && !handledScanIdsRef.current.has(p.scanId));
    if (settled.length === 0) return;
    settled.forEach((p) => p.scanId && handledScanIdsRef.current.add(p.scanId));
    void load();
  }, [load, pendingScans]);

  const searchedScans = useMemo(() => filterScans(scans, deadlines, search), [scans, deadlines, search]);
  // When not searching, use authoritative server counts for the chips so they
  // reflect the full DB instead of the currently paginated page. While searching,
  // fall back to local counts of the visible results.
  const categoryFilters = useMemo(
    () => buildDocumentCategoryFilters(searchedScans, search.trim() ? null : counts),
    [searchedScans, search, counts],
  );

  useEffect(() => {
    if (
      selectedCategoryFilter !== "all" &&
      !categoryFilters.some((filter) => filter.key === selectedCategoryFilter)
    ) {
      setSelectedCategoryFilter("all");
    }
  }, [categoryFilters, selectedCategoryFilter]);

  const filteredScans = useMemo(
    () => filterScansByDocumentCategory(searchedScans, selectedCategoryFilter),
    [searchedScans, selectedCategoryFilter]
  );
  const sections = useMemo(
    () => splitScans(filteredScans, deadlines, pinnedIds),
    [deadlines, filteredScans, pinnedIds]
  );

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const scanDisabled = Boolean(limits && limits.scans_remaining <= 0);
  const limitWarning = getScanLimitWarning(limits);
  const activePendingScans = pendingScans.filter((p) => p.active);
  const hasPending = activePendingScans.length > 0;
  // The empty state lives below the pending-stack header. While a scan is in
  // flight the user *does* have a document — suppress the "you have nothing"
  // placeholder so the two states aren't shown simultaneously.
  const isEmpty = sections.rows.length === 0 && !hasPending;
  // Show the offline state instead of the regular empty state when the load
  // failed and we have no cached scans — otherwise the user sees both the
  // raw API error AND the "scan your first document" pitch at the same time.
  const showOfflineState = Boolean(error) && isEmpty && !search.trim();
  const showEmptyPlaceholder = isEmpty && !showOfflineState;
  const showCategoryFilters = categoryFilters.length > 1 && !showEmptyPlaceholder && !showOfflineState;
  const openNewScan = () => {
    router.push({ pathname: "/scan/new", params: { fresh: String(Date.now()) } });
  };

  const toggleSearch = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, "easeInEaseOut", "opacity"));
    if (searchOpen) {
      Keyboard.dismiss();
      setSearch("");
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
      // Defer focus to next frame so the input is mounted
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  };

  return (
    <Screen>
      <HomeHeader
        styles={styles}
        colors={colors}
        searchOpen={searchOpen}
        search={search}
        onSearch={setSearch}
        onToggleSearch={toggleSearch}
        searchInputRef={searchInputRef}
      />
      {error && !showOfflineState ? <ErrorText message={error} /> : null}
      {limitWarning ? <Text style={styles.warning}>{limitWarning}</Text> : null}
      {showCategoryFilters ? (
        <DocumentCategoryFilterBar
          filters={categoryFilters}
          selected={selectedCategoryFilter}
          styles={styles}
          onSelect={setSelectedCategoryFilter}
        />
      ) : null}
      <FlatList
        ref={listRef}
        data={sections.rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.list, isEmpty && styles.listEmpty]}
        onEndReached={loadMoreScans}
        onEndReachedThreshold={0.35}
        ListFooterComponent={loadingMoreScans ? <ListLoadingFooter color={colors.primary} styles={styles} /> : null}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        ListHeaderComponent={
          hasPending ? (
            <View style={styles.pendingStack}>
              {activePendingScans.map((p) => (
                <PendingScanCard
                  key={p.localId}
                  pending={p}
                  colors={colors}
                  styles={styles}
                  onPress={() =>
                    router.push({
                      pathname: "/scan/new",
                      params: { pending: p.localId, fresh: String(Date.now()) },
                    })
                  }
                />
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          search.trim() ? (
            <SearchEmpty query={search.trim()} colors={colors} styles={styles} />
          ) : showOfflineState ? (
            <OfflineState
              onRetry={() => {
                setLoading(true);
                void load();
              }}
              colors={colors}
              styles={styles}
            />
          ) : showEmptyPlaceholder ? (
            <DocumentsEmpty
              limits={limits}
              scanDisabled={scanDisabled}
              onScan={openNewScan}
              colors={colors}
              styles={styles}
            />
          ) : null
        }
        renderItem={({ item }) => {
          if (item.type === "section") return <Text style={styles.sectionHeader}>{item.title}</Text>;
          return (
            <DocumentRow
              item={item.scan}
              deadline={item.deadline}
              pinned={item.pinned}
              query={search}
              colors={colors}
              styles={styles}
              categoryStyleList={categoryStyleList}
              onLongPress={(rect) => {
                Vibration.vibrate(12);
                setDocumentMenu({
                  scan: item.scan,
                  deadline: item.deadline,
                  pinned: item.pinned,
                  query: search,
                  rect,
                });
              }}
            />
          );
        }}
      />
      <DocumentContextMenu
        anchor={documentMenu}
        pinnedIds={pinnedIds}
        colors={colors}
        styles={styles}
        categoryStyleList={categoryStyleList}
        onClose={() => setDocumentMenu(null)}
        onTogglePin={(scan) => {
          setDocumentMenu(null);
          void togglePin(scan.id);
        }}
        onDelete={(scan) => {
          setDocumentMenu(null);
          requestAnimationFrame(() => confirmDelete(scan));
        }}
      />
      {(showEmptyPlaceholder || showOfflineState) && !search.trim() ? null : (
        <Pressable
          onPress={openNewScan}
          disabled={scanDisabled}
          style={({ pressed }) => [styles.fab, scanDisabled && styles.fabDisabled, pressed && !scanDisabled && { opacity: 0.88, transform: [{ scale: 0.94 }] }]}
          accessibilityRole="button"
          accessibilityLabel={t("documents.emptyButton")}
        >
          <Icon name="camera" size={24} color={colors.textOnAccent} />
        </Pressable>
      )}
    </Screen>
  );
}

function PendingScanCard({
  pending,
  colors,
  styles,
  onPress,
}: {
  pending: PendingScanRecord;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
  const firstImage = pending.attachments.find((a) => (a.mimeType ?? "").startsWith("image/")) ?? pending.attachments[0];
  const latestStep = pending.progress[pending.progress.length - 1] ?? t("scan.uploading");
  const title = pending.preview.documentType?.trim() || t("scan.processingTitle");

  const showImage = firstImage && (firstImage.mimeType ?? "").startsWith("image/");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pendingCard, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
      accessibilityRole="button"
    >
      <View style={styles.pendingTop}>
        <View style={[styles.pendingThumb, { backgroundColor: colors.blueSoft }]}>
          {showImage ? (
            <Image source={{ uri: firstImage.uri }} style={styles.pendingThumbImage} resizeMode="cover" />
          ) : (
            <Icon name="doc-text" size={24} color={colors.primary} />
          )}
        </View>
        <View style={styles.rowHeadText}>
          <View style={styles.rowMetaLine}>
            <Text style={styles.rowEyebrow} numberOfLines={1}>{t("scan.processingEyebrow")}</Text>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.pendingStep} numberOfLines={1}>{latestStep}</Text>
        </View>
      </View>
      {pending.preview.summary ? (
        <Text style={styles.rowPreview} numberOfLines={2}>{pending.preview.summary}</Text>
      ) : null}
    </Pressable>
  );
}

function ListLoadingFooter({ color, styles }: { color: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.listFooter}>
      <ActivityIndicator color={color} />
    </View>
  );
}

function DocumentContextMenu({
  anchor,
  pinnedIds,
  colors,
  styles,
  categoryStyleList,
  onClose,
  onTogglePin,
  onDelete,
}: {
  anchor: {
    scan: ScanListItem;
    deadline?: DeadlineResponse;
    pinned?: boolean;
    query?: string;
    rect: MeasuredRect;
  } | null;
  pinnedIds: Set<string>;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  categoryStyleList: ReturnType<typeof getCategoryStyles>;
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
  styles: ReturnType<typeof createStyles>;
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

function SearchEmpty({ query, colors, styles }: {
  query: string;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.searchEmpty}>
      <Icon name="search" size={40} color={colors.muted3} />
      <Text style={styles.searchEmptyTitle}>{t("documents.searchEmptyTitle")}</Text>
      <Text style={styles.searchEmptyDetail}>
        {t("documents.searchEmptyDetail", { query })}
      </Text>
    </View>
  );
}

function OfflineState({
  onRetry,
  colors,
  styles,
}: {
  onRetry: () => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyHeroIcon, styles.offlineHeroIcon]}>
        <Icon name="alert" size={44} color={colors.muted2} />
      </View>
      <Text style={styles.emptyHeroTitle}>{t("common.offlineTitle")}</Text>
      <Text style={styles.emptyHeroDetail}>{t("common.offlineDetail")}</Text>

      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t("common.tryAgain")}
      >
        <Text style={styles.emptyCtaText}>{t("common.tryAgain")}</Text>
      </Pressable>
    </View>
  );
}

function DocumentsEmpty({
  limits,
  scanDisabled,
  onScan,
  colors,
  styles,
}: {
  limits: LimitsResponse | null;
  scanDisabled: boolean;
  onScan: () => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const planFooter = limits?.plan === "pro"
    ? t("documents.emptyFooterPro")
    : t("documents.emptyFooterFree");

  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyHeroIcon}>
        <View style={styles.emptyHeroFile}>
          <Icon name="doc-text" size={44} color={colors.primary} />
        </View>
      </View>
      <Text style={styles.emptyHeroTitle}>{t("documents.emptyTitle")}</Text>
      <Text style={styles.emptyHeroDetail}>{t("documents.emptyDetail")}</Text>

      <Pressable
        disabled={scanDisabled}
        onPress={onScan}
        style={({ pressed }) => [
          styles.emptyCta,
          scanDisabled && styles.fabDisabled,
          pressed && !scanDisabled && styles.pressed,
        ]}
      >
        <Icon name="camera" size={24} color={colors.textOnAccent} />
        <Text style={styles.emptyCtaText}>{t("documents.emptyButton")}</Text>
      </Pressable>

      <Text style={styles.emptyPlanFooter}>{planFooter}</Text>
    </View>
  );
}

function HomeHeader({
  styles,
  colors,
  searchOpen,
  search,
  onSearch,
  onToggleSearch,
  searchInputRef,
}: {
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
  searchOpen: boolean;
  search: string;
  onSearch: (text: string) => void;
  onToggleSearch: () => void;
  searchInputRef: React.RefObject<TextInput>;
}) {
  if (searchOpen) {
    return (
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Icon name="search" size={18} color={colors.muted2} style={{ marginRight: 8 }} />
          <TextInput
            ref={searchInputRef}
            value={search}
            onChangeText={onSearch}
            placeholder={t("documents.searchPlaceholder")}
            placeholderTextColor={colors.muted3}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {search.length > 0 ? (
            <Pressable
              onPress={() => onSearch("")}
              hitSlop={10}
              style={styles.searchClear}
              accessibilityLabel={t("documents.searchClearAria")}
            >
              <Icon name="x" size={18} color={colors.muted3} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={onToggleSearch}
          hitSlop={8}
          style={({ pressed }) => [styles.searchCancel, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.searchCancelText}>{t("common.cancel")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <BrandWordmark height={36} style={styles.logo} />
      <View style={styles.headerActions}>
        <Pressable
          onPress={onToggleSearch}
          hitSlop={6}
          style={({ pressed }) => [styles.searchIcon, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={t("documents.searchAria")}
        >
          <Icon name="search" size={22} color={colors.muted2} />
        </Pressable>
      </View>
    </View>
  );
}

function DocumentCategoryFilterBar({
  filters,
  selected,
  styles,
  onSelect,
}: {
  filters: DocumentCategoryFilter[];
  selected: DocumentCategoryFilterKey;
  styles: ReturnType<typeof createStyles>;
  onSelect: (filter: DocumentCategoryFilterKey) => void;
}) {
  return (
    <View style={styles.categoryFilterShell}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryFilterContent}
      >
        {filters.map((filter) => {
          const active = filter.key === selected;
          return (
            <Pressable
              key={filter.key}
              onPress={() => onSelect(filter.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${filter.label} ${filter.count}`}
              style={({ pressed }) => [
                styles.categoryChip,
                active && styles.categoryChipActive,
                pressed && { opacity: 0.82 },
              ]}
            >
              <Text style={[styles.categoryChipLabel, active && styles.categoryChipLabelActive]} numberOfLines={1}>
                {filter.label}
              </Text>
              <Text style={[styles.categoryChipCount, active && styles.categoryChipCountActive]}>
                {filter.count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ListHeader({ limits, scanDisabled, onScan, styles, colors }: {
  limits: LimitsResponse | null;
  scanDisabled: boolean;
  onScan: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
}) {
  return <ScanCTACard limits={limits} scanDisabled={scanDisabled} onScan={onScan} styles={styles} colors={colors} />;
}

function ScanCTACard({ limits, scanDisabled, onScan, styles, colors }: {
  limits: LimitsResponse | null;
  scanDisabled: boolean;
  onScan: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
}) {
  const used = limits?.scans_used ?? 0;
  const max = limits?.scans_max ?? 5;

  return (
    <View style={styles.ctaCard}>
      <View style={styles.ctaHalo} />
      <Text style={styles.ctaTitle}>{t("documents.ctaTitle")}</Text>
      <Text style={styles.ctaSubtitle}>{t("documents.ctaSubtitle")}</Text>
      <View style={styles.ctaRow}>
        <Pressable
          disabled={scanDisabled}
          onPress={onScan}
          style={({ pressed }) => [styles.ctaButton, scanDisabled && styles.ctaButtonDisabled, pressed && !scanDisabled && styles.pressed]}
        >
          <Icon name="camera" size={22} color={colors.text} />
          <Text style={styles.ctaButtonText}>{t("documents.ctaButton")}</Text>
        </Pressable>
        <Text style={styles.ctaUsage}>{used} / {max} · {limits?.plan === "pro" ? t("documents.proPlan") : t("documents.freePlan")}</Text>
      </View>
    </View>
  );
}

function DocumentRow({ item, deadline, pinned, query, colors, styles, categoryStyleList, onLongPress }: {
  item: ScanListItem;
  deadline?: DeadlineResponse;
  pinned?: boolean;
  query?: string;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  categoryStyleList: ReturnType<typeof getCategoryStyles>;
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

function DocumentRowVisual({ item, deadline, pinned, query, colors, styles, categoryStyleList }: {
  item: ScanListItem;
  deadline?: DeadlineResponse;
  pinned?: boolean;
  query?: string;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  categoryStyleList: ReturnType<typeof getCategoryStyles>;
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

function getActivityDate(scan: ScanListItem) {
  return scan.last_message_at ?? scan.created_at;
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

function filterScans(scans: ScanListItem[], deadlines: DeadlineResponse[], query: string): ScanListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return scans;

  // Pre-compute which scan ids have a deadline that matches the query
  const matchingScanIdsByDeadline = new Set<string>();
  deadlines.forEach((d) => {
    if (!d.scan_id) return;
    const deadlineHaystack = [d.title, d.description, d.due_date]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (deadlineHaystack.includes(q)) {
      matchingScanIdsByDeadline.add(d.scan_id);
    }
  });

  return scans.filter((scan) => {
    if (matchingScanIdsByDeadline.has(scan.id)) return true;
    const haystack = [
      scan.document_type_cz,
      scan.doc_type,
      scan.category,
      scan.sender,
      scan.summary,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function buildDocumentCategoryFilters(
  scans: ScanListItem[],
  serverCounts: ScanCountsResponse | null,
): DocumentCategoryFilter[] {
  const local = new Map<string, number>();
  scans.forEach((scan) => {
    const category = getScanCategoryKey(scan);
    local.set(category, (local.get(category) ?? 0) + 1);
  });

  // Server counts are authoritative when available — they cover the full DB
  // including scans not yet paginated into the list.
  const source = serverCounts
    ? new Map<string, number>(
        Object.entries(serverCounts.by_category).map(([key, count]) => [
          normalizeCategoryKey(key) ?? "ostatni",
          count,
        ]),
      )
    : local;
  const totalCount = serverCounts?.total ?? scans.length;

  const categories = [...source.keys()].sort(compareCategoryKeys);

  return [
    { key: "all", label: t("documents.filter.all"), count: totalCount },
    ...categories.map((category) => ({
      key: `category:${category}` as const,
      label: formatCategoryLabel(category),
      count: source.get(category) ?? 0,
    })),
  ];
}

function filterScansByDocumentCategory(
  scans: ScanListItem[],
  filter: DocumentCategoryFilterKey,
): ScanListItem[] {
  if (filter === "all") return scans;
  return scans.filter((scan) => getScanCategoryFilterKey(scan) === filter);
}

function getScanCategoryFilterKey(scan: ScanListItem): Exclude<DocumentCategoryFilterKey, "all"> {
  return `category:${getScanCategoryKey(scan)}`;
}

function getScanCategoryKey(scan: ScanListItem) {
  return normalizeCategoryKey(scan.category ?? scan.doc_type) ?? "ostatni";
}

function compareCategoryKeys(a: string, b: string) {
  const aIndex = DOCUMENT_CATEGORY_ORDER.indexOf(a);
  const bIndex = DOCUMENT_CATEGORY_ORDER.indexOf(b);
  const aKnown = aIndex >= 0;
  const bKnown = bIndex >= 0;

  if (aKnown && bKnown) return aIndex - bIndex;
  if (aKnown) return -1;
  if (bKnown) return 1;

  return formatCategoryLabel(a).localeCompare(formatCategoryLabel(b));
}

type SectionRow = { key: string; type: "section"; title: string };
type ScanRow = { key: string; type: "scan"; scan: ScanListItem; deadline?: DeadlineResponse; pinned?: boolean };
type ListRow = SectionRow | ScanRow;

function splitScans(scans: ScanListItem[], deadlines: DeadlineResponse[], pinnedIds: Set<string>) {
  const byScanId = new Map<string, DeadlineResponse>();
  [...deadlines]
    .filter((deadline) => Boolean(deadline.scan_id))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .forEach((deadline) => {
      if (deadline.scan_id && !byScanId.has(deadline.scan_id)) byScanId.set(deadline.scan_id, deadline);
    });

  // Treat scans whose analysis extracted a deadline as "with deadlines" even
  // if no DB deadline row exists yet — matches the chat UI, which shows the
  // "Create reminder" CTA derived from the same analysis data.
  scans.forEach((scan) => {
    if (byScanId.has(scan.id)) return;
    if (!scan.has_analysis_deadlines || !scan.next_analysis_deadline_at) return;
    byScanId.set(scan.id, synthesizeAnalysisDeadline(scan));
  });

  const sorted = [...scans].sort((a, b) => getActivityDate(b).localeCompare(getActivityDate(a)));

  const pinned = sorted.filter((scan) => pinnedIds.has(scan.id));
  const rest = sorted.filter((scan) => !pinnedIds.has(scan.id));
  const withDeadlines = rest.filter((scan) => byScanId.has(scan.id));
  const withoutDeadlines = rest.filter((scan) => !byScanId.has(scan.id));

  const rows: ListRow[] = [];

  if (pinned.length) {
    rows.push({ key: "section-pinned", type: "section", title: t("documents.pinned") });
    pinned.forEach((scan) =>
      rows.push({ key: `pin-${scan.id}`, type: "scan", scan, deadline: byScanId.get(scan.id), pinned: true }),
    );
  }
  if (withDeadlines.length) {
    rows.push({ key: "section-with-deadlines", type: "section", title: t("documents.withDeadlines") });
    withDeadlines.forEach((scan) => rows.push({ key: scan.id, type: "scan", scan, deadline: byScanId.get(scan.id) }));
  }
  if (withoutDeadlines.length) {
    rows.push({ key: "section-without-deadlines", type: "section", title: t("documents.withoutDeadlines") });
    withoutDeadlines.forEach((scan) => rows.push({ key: scan.id, type: "scan", scan }));
  }

  return { rows };
}

function synthesizeAnalysisDeadline(scan: ScanListItem): DeadlineResponse {
  return {
    id: `analysis-${scan.id}`,
    user_id: "",
    scan_id: scan.id,
    title: "",
    description: null,
    due_date: scan.next_analysis_deadline_at as string,
    reminder_days: [],
    deadline_type: "payment",
    status: "active",
    auto_created: false,
    created_at: scan.created_at,
  };
}

function mergeScansById(current: ScanListItem[], next: ScanListItem[]) {
  const seen = new Set(current.map((scan) => scan.id));
  const merged = [...current];
  next.forEach((scan) => {
    if (seen.has(scan.id)) return;
    seen.add(scan.id);
    merged.push(scan);
  });
  return merged;
}

function getScanLimitWarning(limits: LimitsResponse | null) {
  if (!limits || limits.scans_remaining > 0) return null;
  if (limits.plan !== "pro") return t("documents.limitReached");

  const days = getDaysUntilScanLimitReset(limits.month);
  return t("documents.limitReachedPro", { days: formatLimitResetDays(days) });
}

function getDaysUntilScanLimitReset(period?: string) {
  const resetDate = parseScanLimitResetDate(period);
  if (!resetDate) return 1;

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(1, Math.ceil((resetDate.getTime() - today.getTime()) / 86_400_000));
}

function parseScanLimitResetDate(period?: string) {
  if (!period) return null;

  if (period.startsWith("pro:")) {
    const [, , endDate] = period.split(":");
    if (!endDate) return null;
    const resetDate = new Date(`${endDate}T12:00:00`);
    return Number.isNaN(resetDate.getTime()) ? null : resetDate;
  }

  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return null;
  return new Date(year, month, 1, 12);
}

function formatLimitResetDays(days: number) {
  const locale = getLocale();
  return `${days} ${pluralize(days, LIMIT_RESET_DAY_FORMS[locale], locale)}`;
}

const LIMIT_RESET_DAY_FORMS: Record<ReturnType<typeof getLocale>, PluralForms> = {
  cs: { one: "den", few: "dny", many: "dní" },
  ru: { one: "день", few: "дня", many: "дней" },
  uk: { one: "день", few: "дні", many: "днів" },
  en: { one: "day", many: "days" },
};

function getTitle(item: ScanListItem) {
  if (item.document_type_cz) return item.document_type_cz;
  const raw = item.doc_type ?? item.category ?? t("common.document");
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDocMeta(item: ScanListItem) {
  return formatCategoryLabel(item.category ?? item.doc_type).toUpperCase();
}

function formatDocLabel(value?: string | null) {
  if (!value) return t("common.document");
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDocVisual(item: ScanListItem, colors: ColorPalette, categoryStyleList: ReturnType<typeof getCategoryStyles>): RowVisual {
  const category = normalizeCategoryKey(item.category);
  const categoryStyle = categoryStyleList.find((style) => style.category === category);
  if (categoryStyle) return categoryStyle;

  const haystack = `${item.doc_type ?? ""} ${item.category ?? ""} ${item.summary ?? ""}`.toLowerCase();
  return categoryStyleList.find((style) => style.match.some((token) => haystack.includes(token))) ?? { bg: colors.blueSoft, fg: colors.primary, badgeBg: colors.blueSoft, badgeFg: colors.primary };
}

function normalizeCategoryKey(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[-\s]+/g, "_") ?? null;
}

function getDeadlineBadge(value: string) {
  const diffDays = getDaysUntil(value);
  if (diffDays < 0) return t("documents.pastShort");
  if (diffDays === 0) return t("common.today");
  if (diffDays === 1) return t("documents.day");
  return t("common.days", { count: diffDays });
}

function getDeadlineBadgeColors(value: string, colors: ColorPalette): RowVisual {
  const diffDays = getDaysUntil(value);
  if (diffDays < 7) return { bg: colors.dangerLight, fg: colors.dangerDark, badgeBg: colors.dangerLight, badgeFg: colors.dangerDark };
  if (diffDays <= 30) return { bg: colors.cream, fg: colors.amber, badgeBg: colors.amberLight, badgeFg: colors.amberDark };
  return { bg: colors.blueSoft, fg: colors.primary, badgeBg: colors.blueSoft, badgeFg: colors.primary };
}

function getDaysUntil(value: string) {
  const dueDate = new Date(`${value}T12:00:00Z`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Unified relative timestamp for chat-list rows. Mirrors the Telegram /
 * Apple Mail pattern so the column never mixes "7:14 PM" with "vчera" with
 * "12. 5." styles inconsistently.
 *
 *   today           → "19:14"           (24-hour, no AM/PM marker)
 *   yesterday       → "Včera" / "Вчера"
 *   this year       → "12. května"      (day + short month)
 *   older           → "12. 5. 2024"     (day + month + year)
 */
function formatDate(value: string) {
  const date = new Date(value);
  const now = new Date();

  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return formatLocalizedDate(date, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return t("common.yesterday");

  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameYear) {
    return formatLocalizedDate(date, { day: "numeric", month: "short" });
  }
  return formatLocalizedDate(date, { day: "numeric", month: "numeric", year: "numeric" });
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      minHeight: 61,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      backgroundColor: colors.bg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    logo: {},
    headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
    searchIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
    searchBar: {
      flex: 1,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 12,
      paddingRight: 6,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
      paddingVertical: 0,
    },
    searchClear: {
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 6,
    },
    searchCancel: {
      paddingHorizontal: 4,
      paddingVertical: 6,
    },
    searchCancelText: {
      color: colors.primary,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowSecondary,
    },
    searchEmpty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingVertical: 64,
      gap: 12,
    },
    searchEmptyTitle: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowTitle,
      textAlign: "center",
      marginTop: 4,
    },
    searchEmptyDetail: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
      textAlign: "center",
      maxWidth: 280,
    },
    highlight: {
      backgroundColor: colors.amberLight,
      color: colors.amberDark,
      fontWeight: "700",
    },
    ctaCard: {
      marginHorizontal: 16,
      marginTop: 14,
      borderRadius: 24,
      backgroundColor: colors.primary,
      padding: 24,
      gap: 10,
      overflow: "hidden"
    },
    ctaHalo: {
      position: "absolute",
      right: -20,
      top: -20,
      width: 160,
      height: 160,
      borderRadius: 999,
      backgroundColor: "rgba(232,160,32,0.12)"
    },
    ctaTitle: {
      color: colors.textOnAccent,
      fontFamily: fonts.display,
      ...typeStyles.compactTitle,
      fontWeight: "700",
    },
    ctaSubtitle: {
      color: "rgba(253,251,248,0.72)",
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
    },
    ctaRow: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: 16 },
    ctaButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.amber,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10
    },
    ctaButtonDisabled: { opacity: 0.5 },
    ctaButtonText: { color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.rowSecondary, fontWeight: "700" },
    ctaUsage: { color: "rgba(253,251,248,0.60)", fontFamily: fonts.body, ...typeStyles.rowMeta },
    warning: {
      marginHorizontal: 16,
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.warningBg,
      color: colors.warningText,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600"
    },
    categoryFilterShell: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bg,
    },
    categoryFilterContent: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
    },
    categoryChip: {
      minHeight: 38,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    categoryChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    categoryChipLabel: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
      fontWeight: "600",
    },
    categoryChipLabelActive: {
      color: colors.textOnAccent,
    },
    categoryChipCount: {
      color: colors.muted3,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
      fontVariant: ["tabular-nums"],
      fontWeight: "600",
    },
    categoryChipCountActive: {
      color: colors.textOnAccent,
      opacity: 0.72,
    },
    list: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 120,
      gap: 14,
      backgroundColor: colors.bg
    },
    listFooter: { paddingVertical: 18, alignItems: "center" },
    listEmpty: { flexGrow: 1, paddingHorizontal: 0, paddingBottom: 0 },
    emptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingBottom: 48,
      gap: 16,
    },
    emptyHeroIcon: {
      width: 96,
      height: 96,
      borderRadius: 24,
      backgroundColor: colors.blueSoft,
      borderWidth: 1,
      borderColor: colors.blueMid,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    offlineHeroIcon: {
      backgroundColor: colors.surface3,
      borderColor: colors.border,
    },
    emptyHeroFile: { alignItems: "center", justifyContent: "center" },
    emptyHeroTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      ...typeStyles.compactTitle,
      fontWeight: "700",
      textAlign: "center",
      maxWidth: 280,
    },
    emptyHeroDetail: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
      textAlign: "center",
      maxWidth: 320,
    },
    emptyCta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      marginTop: 16,
      minHeight: 56,
      paddingHorizontal: 28,
      borderRadius: 18,
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 18,
    },
    emptyCtaText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.button,
      fontWeight: "700",
    },
    emptyPlanFooter: {
      marginTop: 18,
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
      textAlign: "center",
    },
    sectionHeader: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "600",
      letterSpacing: 1.54,
      textTransform: "uppercase",
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0
    },
    row: {
      gap: 12,
      padding: 16,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 12,
      elevation: 1
    },
    docMenuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.58)",
    },
    docMenuPreview: {
      position: "absolute",
      borderRadius: DOCUMENT_ROW_RADIUS,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.34,
      shadowRadius: 24,
      elevation: 14,
    },
    docMenuContainer: {
      position: "absolute",
      backgroundColor: colors.surface2,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 20,
      elevation: 12,
    },
    docMenuRow: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    docMenuRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    docMenuRowPressed: { backgroundColor: colors.surface3 },
    docMenuIconTile: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    docMenuLabel: {
      flex: 1,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.callout,
      fontWeight: "500",
    },
    pendingStack: { gap: 10, marginBottom: 14 },
    pendingCard: {
      gap: 12,
      padding: 16,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 3,
    },
    // Pending card uses a slightly larger thumb (56) so the live preview
    // balances visually with the 3-line text block (eyebrow + title + step).
    pendingTop: { flexDirection: "row", alignItems: "center", gap: 14 },
    pendingThumb: {
      width: 56,
      height: 56,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    pendingThumbImage: { width: "100%", height: "100%" },
    pendingStep: {
      color: colors.primary,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowMeta,
      marginTop: 2,
    },
    rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
    thumb: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    rowHeadText: { flex: 1, minWidth: 0 },
    rowMetaLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
    rowEyebrow: {
      flex: 1,
      minWidth: 0,
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "600",
      letterSpacing: 1.4,
      textTransform: "uppercase"
    },
    rowTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      ...typeStyles.rowTitle,
      fontWeight: "600",
      letterSpacing: -0.17,
      marginTop: 2,
    },
    rowSender: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
      marginTop: 2
    },
    rowPreview: { color: colors.muted, fontFamily: fonts.body, ...typeStyles.rowSecondary },
    rowPills: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    // Pinned indicator floats to the bottom-right corner of the card.
    pinTrail: { marginLeft: "auto", alignItems: "center", justifyContent: "center" },
    rowTime: { color: colors.muted3, fontFamily: fonts.body, ...typeStyles.caption1 },
    badge: {
      minHeight: 24,
      paddingHorizontal: 10,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center"
    },
    badgeText: { fontFamily: fonts.bodySemiBold, ...typeStyles.caption1, fontWeight: "600" },
    secondaryBadge: { backgroundColor: colors.blueSoft },
    secondaryBadgeText: { color: colors.primary },
    fab: {
      position: "absolute",
      right: 24,
      bottom: 28,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.primary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(244,239,230,0.28)",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.36,
      shadowRadius: 20,
      elevation: 16,
      zIndex: 100
    },
    fabDisabled: { opacity: 0.45 },
    pressed: { opacity: 0.85 }
  });
}
