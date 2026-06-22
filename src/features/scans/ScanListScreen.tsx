import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Keyboard, LayoutAnimation, Platform, Pressable, RefreshControl, Text, TextInput, UIManager, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";

import { Icon } from "@/components/Icon";
import { ErrorText, Screen, useColors } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { listAllDeadlines } from "@/features/deadlines/deadlinesApi";
import { scanListCache } from "@/features/scans/scanListCache";
import { SCANS_PAGE_SIZE, deleteScan, getLimits, getScanCounts, listScans, type ScanCountsResponse } from "@/features/scans/scansApi";
import { invalidateChatCache } from "@/features/chat/chatThreadCache";
import { getPinnedScanIds, togglePinnedScan } from "@/features/scans/pinnedScansStore";
import {
  type PendingScanRecord,
  getPendingScanList,
  removePendingScanById,
  subscribePendingScan,
} from "@/features/scans/pendingScanStore";
import { triggerLongPressHaptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { logger } from "@/lib/logger";
import type { DeadlineResponse, LimitsResponse, ScanListItem } from "@/lib/types";

import { createStyles, getCategoryStyles } from "@/features/scans/components/scanListStyles";
import {
  buildDocumentCategoryFilters,
  filterScans,
  filterScansByDocumentCategory,
  getScanLimitWarning,
  mergeScansById,
  normalizeCategoryKey,
  splitScans,
  type DocumentCategoryFilter,
  type DocumentCategoryFilterKey,
  type ListRow,
  type MeasuredRect,
} from "@/features/scans/components/scanListData";
import { DocumentRow } from "@/features/scans/components/DocumentRow";
import { DocumentContextMenu } from "@/features/scans/components/DocumentContextMenu";
import { PendingScanCard } from "@/features/scans/components/PendingScanCard";
import { CategoryEmpty, DocumentsEmpty, ListLoadingFooter, OfflineState, SearchEmpty } from "@/features/scans/components/ScanListEmptyStates";
import { DocumentCategoryFilterBar, HomeHeader } from "@/features/scans/components/ScanListHeader";

// Enable LayoutAnimation on Android (iOS has it by default).
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ScanListPage = {
  filter: DocumentCategoryFilter;
  rows: ListRow[];
};

export function ScanListScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const categoryStyleList = useMemo(() => getCategoryStyles(colors), [colors]);
  const { user } = useAuth();
  const userId = user?.id ?? null;

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
  const [settledCategoryFilter, setSettledCategoryFilter] = useState<DocumentCategoryFilterKey>("all");
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
  const activeListRef = useRef<FlatList<ListRow>>(null);
  const pagerRef = useRef<FlatList<ScanListPage>>(null);
  const lastPageWidthRef = useRef(0);
  const selectedCategoryFilterRef = useRef<DocumentCategoryFilterKey>("all");
  const settledCategoryFilterRef = useRef<DocumentCategoryFilterKey>("all");
  useScrollToTop(activeListRef);

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

  // Seed from the last-known-good snapshot so the list renders instantly on
  // cold start and stays visible offline. Only fills empty state — a fresh
  // network load that already landed always wins.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void scanListCache.read(userId).then((snapshot) => {
      if (cancelled || !snapshot) return;
      setScans((current) => (current.length ? current : snapshot.scans));
      setDeadlines((current) => (current.length ? current : snapshot.deadlines));
      setCounts((current) => current ?? snapshot.counts);
      setLimits((current) => current ?? snapshot.limits);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
      if (userId) {
        scanListCache.write(userId, {
          scans: nextScans,
          deadlines: nextDeadlines,
          counts: nextCounts,
          limits: nextLimits,
        });
      }
    } catch (loadError) {
      if (!aliveRef.current) return;
      setError(loadError instanceof Error ? loadError.message : t("documents.loadError"));
    } finally {
      if (aliveRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId]);

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
    } catch (error) {
      if (!aliveRef.current) return;
      setScans(previous);
      setCounts(previousCounts);
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn("deleteScan failed", error);
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

  const setSelectedCategoryFilterSynced = useCallback((filter: DocumentCategoryFilterKey) => {
    if (selectedCategoryFilterRef.current === filter) return;
    selectedCategoryFilterRef.current = filter;
    setSelectedCategoryFilter(filter);
  }, []);

  const setSettledCategoryFilterSynced = useCallback((filter: DocumentCategoryFilterKey) => {
    if (settledCategoryFilterRef.current === filter) return;
    settledCategoryFilterRef.current = filter;
    setSettledCategoryFilter(filter);
  }, []);

  useEffect(() => {
    selectedCategoryFilterRef.current = selectedCategoryFilter;
  }, [selectedCategoryFilter]);

  useEffect(() => {
    settledCategoryFilterRef.current = settledCategoryFilter;
  }, [settledCategoryFilter]);

  useEffect(() => {
    const selectedExists = selectedCategoryFilter === "all" || categoryFilters.some((filter) => filter.key === selectedCategoryFilter);
    const settledExists = settledCategoryFilter === "all" || categoryFilters.some((filter) => filter.key === settledCategoryFilter);
    if (!selectedExists || !settledExists) {
      setSelectedCategoryFilterSynced("all");
      setSettledCategoryFilterSynced("all");
      requestAnimationFrame(() => {
        pagerRef.current?.scrollToIndex({ index: 0, animated: false });
      });
    }
  }, [
    categoryFilters,
    selectedCategoryFilter,
    settledCategoryFilter,
    setSelectedCategoryFilterSynced,
    setSettledCategoryFilterSynced,
  ]);

  const categoryPages = useMemo<ScanListPage[]>(
    () =>
      categoryFilters.map((filter) => ({
        filter,
        rows: splitScans(
          filterScansByDocumentCategory(searchedScans, filter.key),
          deadlines,
          pinnedIds,
        ).rows,
      })),
    [categoryFilters, deadlines, pinnedIds, searchedScans],
  );

  const selectedPageIndex = useMemo(() => {
    const index = categoryPages.findIndex((page) => page.filter.key === settledCategoryFilter);
    return index >= 0 ? index : 0;
  }, [categoryPages, settledCategoryFilter]);
  const selectedPage = categoryPages[selectedPageIndex] ?? categoryPages[0] ?? null;
  const allPage = categoryPages[0] ?? null;
  const pageWidth = Math.max(1, screenWidth);

  useEffect(() => {
    if (!categoryPages.length) return;
    if (lastPageWidthRef.current === pageWidth) return;
    lastPageWidthRef.current = pageWidth;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollToIndex({
        index: selectedPageIndex,
        animated: false,
      });
    });
  }, [categoryPages.length, pageWidth, selectedPageIndex]);

  useEffect(() => {
    if (!selectedPage || selectedPage.filter.key === "all") return;
    if (selectedPage.rows.length > 0 || selectedPage.filter.count <= 0) return;
    if (!hasMoreScans || loading || loadingMoreScans || refreshing) return;
    void loadMoreScans();
  }, [hasMoreScans, loadMoreScans, loading, loadingMoreScans, refreshing, selectedPage]);

  const selectCategoryFilter = useCallback((filter: DocumentCategoryFilterKey) => {
    setSelectedCategoryFilterSynced(filter);
    setSettledCategoryFilterSynced(filter);
    const index = categoryPages.findIndex((page) => page.filter.key === filter);
    if (index >= 0) {
      pagerRef.current?.scrollToIndex({ index, animated: true });
    }
  }, [categoryPages, setSelectedCategoryFilterSynced, setSettledCategoryFilterSynced]);

  const syncCategoryFromPagerOffset = useCallback((offsetX: number) => {
    if (!categoryPages.length || pageWidth <= 0) return;
    const rawIndex = offsetX / pageWidth;
    let nextIndex = Math.max(0, Math.min(categoryPages.length - 1, Math.round(rawIndex)));
    const isPageFullyVisible = Math.abs(rawIndex - nextIndex) < 0.02;
    if (!isPageFullyVisible) return;
    nextIndex = Math.max(0, Math.min(categoryPages.length - 1, nextIndex));
    const nextFilter = categoryPages[nextIndex]?.filter.key;
    if (!nextFilter) return;
    setSelectedCategoryFilterSynced(nextFilter);
    setSettledCategoryFilterSynced(nextFilter);
  }, [categoryPages, pageWidth, setSelectedCategoryFilterSynced, setSettledCategoryFilterSynced]);

  const handleCategoryPageMomentumEnd = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    syncCategoryFromPagerOffset(event.nativeEvent.contentOffset.x);
  }, [syncCategoryFromPagerOffset]);

  const scanDisabled = Boolean(limits && limits.scans_remaining <= 0);
  const limitWarning = getScanLimitWarning(limits);
  const activePendingScans = useMemo(() => pendingScans.filter((p) => p.active), [pendingScans]);
  // Scans that were streaming when the app was killed — restored from storage
  // so they don't vanish without a trace. Shown as dismissable cards.
  const interruptedPendingScans = useMemo(() => pendingScans.filter((p) => p.interrupted), [pendingScans]);
  const hasPending = activePendingScans.length > 0 || interruptedPendingScans.length > 0;
  // The empty state lives below the pending-stack header. While a scan is in
  // flight the user *does* have a document — suppress the "you have nothing"
  // placeholder so the two states aren't shown simultaneously.
  const isEmpty = (allPage?.rows.length ?? 0) === 0 && !hasPending;
  // Show the offline state instead of the regular empty state when the load
  // failed and we have no cached scans — otherwise the user sees both the
  // raw API error AND the "scan your first document" pitch at the same time.
  const showOfflineState = Boolean(error) && isEmpty && !search.trim();
  const showEmptyPlaceholder = isEmpty && !showOfflineState;
  const showCategoryFilters = categoryFilters.length > 1 && !showEmptyPlaceholder && !showOfflineState;
  const openNewScan = useCallback(() => {
    router.push({ pathname: "/scan/new", params: { fresh: String(Date.now()) } });
  }, []);

  const toggleSearch = useCallback(() => {
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
  }, [searchOpen]);

  const renderCategoryPage = useCallback(({ item: page, index: pageIndex }: { item: ScanListPage; index: number }) => {
    const shouldRenderPageContent = !showCategoryFilters || Math.abs(pageIndex - selectedPageIndex) <= 1;
    if (!shouldRenderPageContent) {
      return <View style={[styles.categoryPage, { width: pageWidth }]} />;
    }

    const isAllPage = page.filter.key === "all";
    const hasPageHeader = isAllPage && hasPending;
    const pageHasVisibleContent = page.rows.length > 0 || hasPageHeader;

    return (
      <View style={[styles.categoryPage, { width: pageWidth }]}>
        <FlatList
          ref={page.filter.key === settledCategoryFilter ? activeListRef : undefined}
          data={page.rows}
          keyExtractor={(item) => item.key}
          contentContainerStyle={[styles.list, !pageHasVisibleContent && styles.listEmpty]}
          onEndReached={page.filter.key === settledCategoryFilter ? loadMoreScans : undefined}
          onEndReachedThreshold={0.35}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={loadingMoreScans && page.filter.key === settledCategoryFilter ? <ListLoadingFooter color={colors.primary} styles={styles} /> : null}
          refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListHeaderComponent={
            hasPageHeader ? (
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
                {interruptedPendingScans.map((p) => (
                  <PendingScanCard
                    key={p.localId}
                    pending={p}
                    interrupted
                    colors={colors}
                    styles={styles}
                    onPress={() => removePendingScanById(p.localId)}
                  />
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            search.trim() ? (
              <SearchEmpty query={search.trim()} colors={colors} styles={styles} />
            ) : showOfflineState && isAllPage ? (
              <OfflineState
                onRetry={() => {
                  setLoading(true);
                  void load();
                }}
                colors={colors}
                styles={styles}
              />
            ) : showEmptyPlaceholder && isAllPage ? (
              <DocumentsEmpty
                limits={limits}
                scanDisabled={scanDisabled}
                onScan={openNewScan}
                colors={colors}
                styles={styles}
              />
            ) : !isAllPage ? (
              <CategoryEmpty category={page.filter.label} colors={colors} styles={styles} />
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
                  triggerLongPressHaptic();
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
      </View>
    );
  }, [
    activePendingScans,
    categoryStyleList,
    colors,
    hasPending,
    interruptedPendingScans,
    limits,
    load,
    loadMoreScans,
    loadingMoreScans,
    openNewScan,
    pageWidth,
    refreshing,
    scanDisabled,
    search,
    selectedPageIndex,
    settledCategoryFilter,
    showCategoryFilters,
    showEmptyPlaceholder,
    showOfflineState,
    styles,
  ]);

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
          onSelect={selectCategoryFilter}
        />
      ) : null}
      <FlatList
        ref={pagerRef}
        data={categoryPages}
        keyExtractor={(page) => page.filter.key}
        horizontal
        pagingEnabled
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={showCategoryFilters}
        style={styles.categoryPager}
        extraData={selectedPageIndex}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
        onScrollEndDrag={handleCategoryPageMomentumEnd}
        onMomentumScrollEnd={handleCategoryPageMomentumEnd}
        onScrollToIndexFailed={(info) => {
          pagerRef.current?.scrollToOffset({ offset: info.index * pageWidth, animated: false });
        }}
        renderItem={renderCategoryPage}
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
