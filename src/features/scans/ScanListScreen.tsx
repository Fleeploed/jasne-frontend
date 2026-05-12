import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { ErrorText, Screen, useColors, type ColorPalette } from "@/components/ui";
import { listDeadlines } from "@/features/deadlines/deadlinesApi";
import { getLimits, listScans } from "@/features/scans/scansApi";
import { formatLocalizedDate, t } from "@/lib/i18n";
import type { DeadlineResponse, LimitsResponse, ScanListItem } from "@/lib/types";

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

  const sections = useMemo(() => splitScans(scans, deadlines), [deadlines, scans]);

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

  return (
    <Screen>
      <HomeHeader styles={styles} colors={colors} />
      <ErrorText message={error} />
      {scanDisabled ? <Text style={styles.warning}>{t("documents.limitReached")}</Text> : null}
      <FlatList
        data={sections.rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.list, isEmpty && styles.listEmpty]}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        ListHeaderComponent={null}
        ListEmptyComponent={
          <DocumentsEmpty
            limits={limits}
            scanDisabled={scanDisabled}
            onScan={openNewScan}
            colors={colors}
            styles={styles}
          />
        }
        renderItem={({ item }) => {
          if (item.type === "section") return <Text style={styles.sectionHeader}>{item.title}</Text>;
          return <DocumentRow item={item.scan} deadline={item.deadline} muted={item.muted} colors={colors} styles={styles} categoryStyleList={categoryStyleList} />;
        }}
      />
      {isEmpty ? null : (
        <Pressable
          disabled={scanDisabled}
          hitSlop={10}
          onPress={(event) => {
            event.stopPropagation();
            openNewScan();
          }}
          style={({ pressed }) => [styles.fab, scanDisabled && styles.fabDisabled, pressed && !scanDisabled && styles.pressed]}
        >
          <CameraGlyph color={colors.textOnAccent} />
        </Pressable>
      )}
    </Screen>
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
          <FileGlyphLarge color={colors.primary} />
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
        <CameraGlyph color={colors.textOnAccent} />
        <Text style={styles.emptyCtaText}>{t("documents.emptyButton")}</Text>
      </Pressable>

      <Text style={styles.emptyPlanFooter}>{planFooter}</Text>
    </View>
  );
}

function FileGlyphLarge({ color }: { color: string }) {
  return (
    <View style={fileGlyphLarge.wrap}>
      <View style={[fileGlyphLarge.outline, { borderColor: color }]}>
        <View style={[fileGlyphLarge.fold, { borderLeftColor: color, borderBottomColor: color }]} />
        <View style={[fileGlyphLarge.line, { backgroundColor: color }]} />
        <View style={[fileGlyphLarge.line, { backgroundColor: color, marginTop: 4 }]} />
        <View style={[fileGlyphLarge.lineShort, { backgroundColor: color, marginTop: 4 }]} />
      </View>
    </View>
  );
}

const fileGlyphLarge = StyleSheet.create({
  wrap: { width: 44, height: 52, alignItems: "center", justifyContent: "center" },
  outline: { width: 38, height: 48, borderRadius: 5, borderWidth: 2.4, padding: 6, paddingTop: 18 },
  fold: { position: "absolute", right: -2.4, top: -2.4, width: 11, height: 11, borderLeftWidth: 2.4, borderBottomWidth: 2.4, backgroundColor: "transparent" },
  line: { height: 2, borderRadius: 1, alignSelf: "stretch" },
  lineShort: { height: 2, borderRadius: 1, width: "65%" },
});

function HomeHeader({ styles, colors }: { styles: ReturnType<typeof createStyles>; colors: ColorPalette }) {
  return (
    <View style={styles.header}>
      <Text style={styles.logo}>jasně</Text>
      <View style={styles.headerActions}>
        <View style={styles.searchIcon}>
          <View style={[styles.searchCircle, { borderColor: colors.muted2 }]} />
          <View style={[styles.searchHandle, { backgroundColor: colors.muted2 }]} />
        </View>
        <View style={styles.bellIcon}>
          <View style={[styles.bellDome, { borderColor: colors.muted2 }]} />
          <View style={[styles.bellBase, { backgroundColor: colors.muted2 }]} />
          <View style={[styles.notifyDot, { backgroundColor: colors.danger, borderColor: colors.bg }]} />
        </View>
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
          <CameraGlyph color={colors.text} />
          <Text style={styles.ctaButtonText}>{t("documents.ctaButton")}</Text>
        </Pressable>
        <Text style={styles.ctaUsage}>{used} / {max} · {limits?.plan === "pro" ? t("documents.proPlan") : t("documents.freePlan")}</Text>
      </View>
    </View>
  );
}

function DocumentRow({ item, deadline, muted, colors, styles, categoryStyleList }: {
  item: ScanListItem;
  deadline?: DeadlineResponse;
  muted?: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  categoryStyleList: ReturnType<typeof getCategoryStyles>;
}) {
  const visual = getDocVisual(item, colors, categoryStyleList);
  const badge = muted || !deadline ? null : getDeadlineBadge(deadline.due_date);
  const badgeColors = deadline ? getDeadlineBadgeColors(deadline.due_date, colors) : visual;

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => router.push(`/scan/${item.id}`)}>
      <View style={[styles.thumb, { backgroundColor: visual.bg }]}>
        <FileGlyph color={visual.fg} />
      </View>
      <View style={styles.rowMid}>
        <Text style={[styles.rowTitle, muted && styles.rowTitleMuted]} numberOfLines={1}>{getTitle(item)}</Text>
        <Text style={styles.rowPreview} numberOfLines={1}>{item.summary ?? t("documents.analysisReady")}</Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.rowTime}>{formatDate(getActivityDate(item))}</Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badgeColors.badgeBg ?? colors.blueSoft }]}>
            <Text style={[styles.badgeText, { color: badgeColors.badgeFg ?? colors.primary }]}>{badge}</Text>
          </View>
        ) : null}
        <Text style={styles.rowChevron}>›</Text>
      </View>
    </Pressable>
  );
}

function getActivityDate(scan: ScanListItem) {
  return scan.last_message_at ?? scan.created_at;
}

function splitScans(scans: ScanListItem[], deadlines: DeadlineResponse[]) {
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
  const rows: Array<
    | { key: string; type: "section"; title: string }
    | { key: string; type: "scan"; scan: ScanListItem; deadline?: DeadlineResponse; muted?: boolean }
  > = [];

  if (active.length) {
    rows.push({ key: "section-active", type: "section", title: t("documents.active") });
    active.forEach((scan) => rows.push({ key: scan.id, type: "scan", scan, deadline: byScanId.get(scan.id) }));
  }
  if (done.length) {
    rows.push({ key: "section-done", type: "section", title: t("documents.done") });
    done.forEach((scan) => rows.push({ key: scan.id, type: "scan", scan, muted: true }));
  }

  return { rows };
}

function getTitle(item: ScanListItem) {
  if (item.document_type_cz) return item.document_type_cz;
  const raw = item.doc_type ?? item.category ?? t("common.document");
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function formatDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString())
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === yesterday.toDateString()) return t("common.yesterday");
  return formatLocalizedDate(date, { day: "numeric", month: "short" });
}

function FileGlyph({ color }: { color: string }) {
  return (
    <View style={[fileGlyphBase.wrap, { borderColor: color }]}>
      <View style={[fileGlyphBase.fold, { borderLeftColor: color, borderBottomColor: color }]} />
    </View>
  );
}

const fileGlyphBase = StyleSheet.create({
  wrap: { width: 15, height: 18, borderRadius: 2, borderWidth: 1.4 },
  fold: { position: "absolute", right: -1.4, top: -1.4, width: 6, height: 6, borderLeftWidth: 1.4, borderBottomWidth: 1.4, backgroundColor: "transparent" }
});

function CameraGlyph({ color }: { color: string }) {
  return (
    <View style={cameraGlyphBase.wrap}>
      <View style={[cameraGlyphBase.body, { borderColor: color }]}>
        <View style={[cameraGlyphBase.top, { backgroundColor: color }]} />
        <View style={[cameraGlyphBase.lens, { borderColor: color }]} />
      </View>
    </View>
  );
}

const cameraGlyphBase = StyleSheet.create({
  wrap: { width: 26, height: 22, alignItems: "center", justifyContent: "center" },
  body: { width: 24, height: 17, borderRadius: 4, borderWidth: 1.8, alignItems: "center", justifyContent: "center" },
  top: { position: "absolute", top: -5, width: 9, height: 5, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  lens: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.7 }
});

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      minHeight: 72,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between"
    },
    logo: {
      color: colors.primary,
      fontSize: 26,
      lineHeight: 28,
      fontWeight: "800",
      letterSpacing: -1
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
    searchIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
    searchCircle: { width: 15, height: 15, borderRadius: 8, borderWidth: 1.6 },
    searchHandle: { width: 8, height: 1.6, borderRadius: 2, transform: [{ rotate: "45deg" }], marginTop: -1, marginLeft: 12 },
    bellIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
    bellDome: { width: 15, height: 16, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 1.5, borderBottomWidth: 0 },
    bellBase: { width: 19, height: 1.5, borderRadius: 2, marginTop: -1 },
    notifyDot: { position: "absolute", right: 8, top: 9, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
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
      paddingBottom: 132,
      gap: 8,
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
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      paddingHorizontal: 4,
      paddingTop: 16,
      paddingBottom: 4
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 20,
      backgroundColor: colors.surface,
      shadowColor: "#1E1B17",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1
    },
    thumb: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    rowMid: { flex: 1, minWidth: 0, gap: 3 },
    rowTitle: { color: colors.text, fontSize: 15, fontWeight: "500" },
    rowTitleMuted: { color: colors.muted2 },
    rowPreview: { color: colors.muted, fontSize: 13, lineHeight: 18 },
    rowEnd: { alignItems: "flex-end", gap: 5 },
    rowTime: { color: colors.muted2, fontSize: 12 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    badgeText: { fontSize: 12, fontWeight: "600" },
    rowChevron: { color: colors.muted3, fontSize: 22, lineHeight: 26, fontWeight: "300", marginTop: -2 },
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
    pressed: { opacity: 0.72 }
  });
}
