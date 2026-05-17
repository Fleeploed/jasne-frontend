import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, LayoutAnimation, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, UIManager, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Icon } from "@/components/Icon";
import { ErrorText, Screen, fonts, useColors, type ColorPalette } from "@/components/ui";
import { listDeadlines } from "@/features/deadlines/deadlinesApi";
import { getLimits, listScans } from "@/features/scans/scansApi";
import { formatLocalizedDate, t } from "@/lib/i18n";
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

function getCategoryStyles(colors: ColorPalette) {
  return [
    { match: ["dan", "tax", "finan"], bg: colors.cream, fg: colors.amber, badgeBg: colors.amberLight, badgeFg: colors.amberDark },
    { match: ["ciz", "visa", "pobyt", "immigration", "mv čr", "oamp"], bg: colors.blueSoft, fg: colors.primary, badgeBg: colors.blueSoft, badgeFg: colors.primary },
    { match: ["soud", "court"], bg: colors.dangerLight, fg: colors.dangerDark, badgeBg: colors.dangerLight, badgeFg: colors.dangerDark },
    { match: ["ucet", "fakt", "invoice", "vzp", "poji"], bg: colors.greenLight, fg: colors.greenDark, badgeBg: colors.greenLight, badgeFg: colors.greenDark }
  ];
}

export function ScanListScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const categoryStyleList = useMemo(() => getCategoryStyles(colors), [colors]);

  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineResponse[]>([]);
  const [limits, setLimits] = useState<LimitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [doneExpanded, setDoneExpanded] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

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
      const [nextScans, nextLimits, nextDeadlines] = await Promise.all([listScans(), getLimits(), listDeadlines(true)]);
      if (!aliveRef.current) return;
      setScans(nextScans);
      setLimits(nextLimits);
      setDeadlines(nextDeadlines);
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

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filteredScans = useMemo(() => filterScans(scans, deadlines, search), [scans, deadlines, search]);
  const sections = useMemo(
    () => splitScans(filteredScans, deadlines, doneExpanded),
    [deadlines, doneExpanded, filteredScans]
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
  const isEmpty = sections.rows.length === 0;
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
      <ErrorText message={error} />
      {scanDisabled ? <Text style={styles.warning}>{t("documents.limitReached")}</Text> : null}
      <FlatList
        data={sections.rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.list, isEmpty && styles.listEmpty]}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        ListEmptyComponent={
          search.trim() ? (
            <SearchEmpty query={search.trim()} colors={colors} styles={styles} />
          ) : (
            <DocumentsEmpty
              limits={limits}
              scanDisabled={scanDisabled}
              onScan={openNewScan}
              colors={colors}
              styles={styles}
            />
          )
        }
        renderItem={({ item }) => {
          if (item.type === "section") return <Text style={styles.sectionHeader}>{item.title}</Text>;
          if (item.type === "doneToggle") {
            return (
              <DoneSectionToggle
                count={item.count}
                expanded={item.expanded}
                onPress={() => setDoneExpanded((prev) => !prev)}
                colors={colors}
                styles={styles}
              />
            );
          }
          return <DocumentRow item={item.scan} deadline={item.deadline} muted={item.muted} query={search} colors={colors} styles={styles} categoryStyleList={categoryStyleList} />;
        }}
      />
      <Pressable
        onPress={openNewScan}
        disabled={scanDisabled}
        style={({ pressed }) => [styles.fab, scanDisabled && styles.fabDisabled, pressed && !scanDisabled && { opacity: 0.88, transform: [{ scale: 0.94 }] }]}
        accessibilityRole="button"
        accessibilityLabel={t("documents.emptyButton")}
      >
        <Icon name="camera" size={24} color={colors.textOnAccent} />
      </Pressable>
    </Screen>
  );
}

function DoneSectionToggle({
  count,
  expanded,
  onPress,
  colors,
  styles,
}: {
  count: number;
  expanded: boolean;
  onPress: () => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.doneToggle, pressed && { opacity: 0.65 }]}
      accessibilityRole="button"
      accessibilityLabel={t(expanded ? "documents.doneCollapseAria" : "documents.doneExpandAria", { count })}
    >
      <Text style={styles.doneToggleText}>
        {t("documents.done")} · {count}
      </Text>
      <Icon
        name="chevron-down"
        size={16}
        color={colors.muted2}
        style={expanded ? { transform: [{ rotate: "180deg" }] } : undefined}
      />
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
      <Text style={styles.logo}>jasně</Text>
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

function DocumentRow({ item, deadline, muted, query, colors, styles, categoryStyleList }: {
  item: ScanListItem;
  deadline?: DeadlineResponse;
  muted?: boolean;
  query?: string;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  categoryStyleList: ReturnType<typeof getCategoryStyles>;
}) {
  const visual = getDocVisual(item, colors, categoryStyleList);
  const badge = muted || !deadline ? null : getDeadlineBadge(deadline.due_date);
  const badgeColors = deadline ? getDeadlineBadgeColors(deadline.due_date, colors) : visual;
  const secondaryBadge = muted ? t("documents.done") : t("scan.pageCount", { count: item.page_count });

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        muted && styles.rowMuted,
        pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }
      ]}
      onPress={() => router.push(`/scan/${item.id}`)}
    >
      <View style={styles.rowTop}>
        <View style={[styles.thumb, { backgroundColor: visual.bg }]}>
          <Icon name="doc-text" size={20} color={visual.fg} />
        </View>
        <View style={styles.rowHeadText}>
          <View style={styles.rowMetaLine}>
            <Text style={styles.rowEyebrow} numberOfLines={1}>{getDocMeta(item)}</Text>
            <Text style={styles.rowTime}>{formatDate(getActivityDate(item))}</Text>
          </View>
          <Text style={[styles.rowTitle, muted && styles.rowTitleMuted]} numberOfLines={1}>
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
      </View>
    </Pressable>
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

type SectionRow = { key: string; type: "section"; title: string };
type DoneToggleRow = { key: string; type: "doneToggle"; count: number; expanded: boolean };
type ScanRow = { key: string; type: "scan"; scan: ScanListItem; deadline?: DeadlineResponse; muted?: boolean };
type ListRow = SectionRow | DoneToggleRow | ScanRow;

function splitScans(scans: ScanListItem[], deadlines: DeadlineResponse[], doneExpanded: boolean) {
  const byScanId = new Map<string, DeadlineResponse>();
  [...deadlines]
    .filter((deadline) => Boolean(deadline.scan_id))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .forEach((deadline) => {
      if (deadline.scan_id && !byScanId.has(deadline.scan_id)) byScanId.set(deadline.scan_id, deadline);
    });

  const sorted = [...scans].sort((a, b) => getActivityDate(b).localeCompare(getActivityDate(a)));

  const scansWithDeadlines = sorted.filter((scan) => byScanId.has(scan.id));
  const active = scansWithDeadlines.length ? scansWithDeadlines : sorted;
  const done = scansWithDeadlines.length ? sorted.filter((scan) => !byScanId.has(scan.id)) : [];
  const rows: ListRow[] = [];

  if (active.length) {
    rows.push({ key: "section-active", type: "section", title: t("documents.active") });
    active.forEach((scan) => rows.push({ key: scan.id, type: "scan", scan, deadline: byScanId.get(scan.id) }));
  }
  if (done.length) {
    // Compact collapsible header: "Vyřízeno (N) ▾". Items only render when expanded.
    rows.push({ key: "section-done-toggle", type: "doneToggle", count: done.length, expanded: doneExpanded });
    if (doneExpanded) {
      done.forEach((scan) => rows.push({ key: scan.id, type: "scan", scan, muted: true }));
    }
  }

  return { rows };
}

function getTitle(item: ScanListItem) {
  if (item.document_type_cz) return item.document_type_cz;
  const raw = item.doc_type ?? item.category ?? t("common.document");
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDocMeta(item: ScanListItem) {
  const category = formatDocLabel(item.category ?? item.doc_type);
  return `${t("common.document").toUpperCase()} · ${category}`;
}

function formatDocLabel(value?: string | null) {
  if (!value) return t("common.document");
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDocVisual(item: ScanListItem, colors: ColorPalette, categoryStyleList: ReturnType<typeof getCategoryStyles>): RowVisual {
  const haystack = `${item.doc_type ?? ""} ${item.category ?? ""} ${item.summary ?? ""}`.toLowerCase();
  return categoryStyleList.find((style) => style.match.some((token) => haystack.includes(token))) ?? { bg: colors.blueSoft, fg: colors.primary, badgeBg: colors.blueSoft, badgeFg: colors.primary };
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
    logo: {
      color: colors.primary,
      fontSize: 30,
      lineHeight: 39,
      fontFamily: "Geist_600SemiBold",
      fontWeight: "600",
      letterSpacing: -1.2
    },
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
      fontSize: 15,
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
      fontSize: 15,
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
      fontSize: 18,
      textAlign: "center",
      marginTop: 4,
    },
    searchEmptyDetail: {
      color: colors.muted2,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      maxWidth: 280,
    },
    highlight: {
      backgroundColor: colors.amberLight,
      color: colors.amberDark,
      fontWeight: "700",
    },
    doneToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
      paddingHorizontal: 2,
      marginTop: 4,
    },
    doneToggleText: {
      color: colors.muted2,
      fontFamily: fonts.bodySemiBold,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 1.54,
      textTransform: "uppercase",
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
      fontSize: 22,
      fontWeight: "700",
      lineHeight: 28
    },
    ctaSubtitle: {
      color: "rgba(253,251,248,0.72)",
      fontSize: 14,
      lineHeight: 20
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
    ctaButtonText: { color: colors.text, fontSize: 15, fontWeight: "700" },
    ctaUsage: { color: "rgba(253,251,248,0.60)", fontSize: 13 },
    warning: {
      marginHorizontal: 16,
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.warningBg,
      color: colors.warningText,
      fontSize: 13,
      fontWeight: "600"
    },
    list: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 120,
      gap: 14,
      backgroundColor: colors.bg
    },
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
    emptyHeroFile: { alignItems: "center", justifyContent: "center" },
    emptyHeroTitle: {
      color: colors.text,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "700",
      textAlign: "center",
      maxWidth: 280,
    },
    emptyHeroDetail: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 22,
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
      fontSize: 17,
      lineHeight: 22,
      fontWeight: "700",
    },
    emptyPlanFooter: {
      marginTop: 18,
      color: colors.muted2,
      fontSize: 14,
      lineHeight: 19,
      textAlign: "center",
    },
    sectionHeader: {
      color: colors.muted2,
      fontSize: 11,
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
    rowMuted: { opacity: 0.65 },
    rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    thumb: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    rowHeadText: { flex: 1, minWidth: 0 },
    rowMetaLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
    rowEyebrow: {
      flex: 1,
      minWidth: 0,
      color: colors.muted3,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: "600",
      letterSpacing: 1.4,
      textTransform: "uppercase"
    },
    rowTitle: {
      color: colors.text,
      fontFamily: "Geist_600SemiBold",
      fontSize: 17,
      lineHeight: 21.25,
      fontWeight: "600",
      letterSpacing: -0.17,
      marginTop: 2
    },
    rowTitleMuted: { color: colors.muted2 },
    rowSender: {
      color: colors.muted2,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 17,
      marginTop: 2
    },
    rowPreview: { color: colors.muted, fontSize: 14.5, lineHeight: 21.025 },
    rowPills: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    rowTime: { color: colors.muted3, fontSize: 12, lineHeight: 14.5 },
    badge: {
      minHeight: 24,
      paddingHorizontal: 10,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center"
    },
    badgeText: { fontSize: 12, fontWeight: "600" },
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
