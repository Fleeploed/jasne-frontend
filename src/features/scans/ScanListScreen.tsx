import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState, ErrorText, Screen, colors } from "@/components/ui";
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

const categoryStyles = [
  { match: ["dan", "tax", "finan"], bg: colors.cream, fg: colors.amber, badgeBg: colors.amberLight, badgeFg: colors.amberDark },
  { match: ["ciz", "visa", "pobyt", "immigration", "mv čr", "oamp"], bg: colors.blueSoft, fg: colors.primary, badgeBg: colors.blueSoft, badgeFg: colors.primary },
  { match: ["soud", "court"], bg: colors.dangerLight, fg: colors.dangerDark, badgeBg: colors.dangerLight, badgeFg: colors.dangerDark },
  { match: ["ucet", "fakt", "invoice", "vzp", "poji"], bg: colors.greenLight, fg: colors.greenDark, badgeBg: colors.greenLight, badgeFg: colors.greenDark }
];

export function ScanListScreen() {
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineResponse[]>([]);
  const [limits, setLimits] = useState<LimitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextScans, nextLimits, nextDeadlines] = await Promise.all([listScans(), getLimits(), listDeadlines(true)]);
      setScans(nextScans);
      setLimits(nextLimits);
      setDeadlines(nextDeadlines);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("documents.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  return (
    <Screen>
      <HomeHeader />
      <ErrorText message={error} />
      {scanDisabled ? <Text style={styles.warning}>{t("documents.limitReached")}</Text> : null}
      <FlatList
        data={sections.rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        ListHeaderComponent={<ListHeader limits={limits} scanDisabled={scanDisabled} onScan={() => router.push("/scan/new")} />}
        ListEmptyComponent={<EmptyState title={t("documents.emptyTitle")} detail={t("documents.emptyDetail")} />}
        renderItem={({ item }) => {
          if (item.type === "section") return <Text style={styles.sectionHeader}>{item.title}</Text>;
          return <DocumentRow item={item.scan} deadline={item.deadline} muted={item.muted} />;
        }}
      />
      <Pressable
        disabled={scanDisabled}
        onPress={() => router.push("/scan/new")}
        style={({ pressed }) => [styles.fab, scanDisabled && styles.fabDisabled, pressed && !scanDisabled && styles.pressed]}
      >
        <CameraGlyph color={colors.textOnAccent} />
      </Pressable>
    </Screen>
  );
}

function HomeHeader() {
  return (
    <View style={styles.header}>
      <Text style={styles.logo}>jasně</Text>
      <View style={styles.headerActions}>
        <View style={styles.searchIcon}>
          <View style={styles.searchCircle} />
          <View style={styles.searchHandle} />
        </View>
        <View style={styles.bellIcon}>
          <View style={styles.bellDome} />
          <View style={styles.bellBase} />
          <View style={styles.notifyDot} />
        </View>
      </View>
    </View>
  );
}

function ListHeader({ limits, scanDisabled, onScan }: { limits: LimitsResponse | null; scanDisabled: boolean; onScan: () => void }) {
  return <ScanCTACard limits={limits} scanDisabled={scanDisabled} onScan={onScan} />;
}

function ScanCTACard({ limits, scanDisabled, onScan }: { limits: LimitsResponse | null; scanDisabled: boolean; onScan: () => void }) {
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

function DocumentRow({ item, deadline, muted }: { item: ScanListItem; deadline?: DeadlineResponse; muted?: boolean }) {
  const visual = getDocVisual(item);
  const badge = muted || !deadline ? null : getDeadlineBadge(deadline.due_date);
  const badgeColors = deadline ? getDeadlineBadgeColors(deadline.due_date) : visual;

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
        <Text style={styles.rowTime}>{formatDate(item.created_at)}</Text>
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

function splitScans(scans: ScanListItem[], deadlines: DeadlineResponse[]) {
  const byScanId = new Map<string, DeadlineResponse>();
  [...deadlines]
    .filter((deadline) => Boolean(deadline.scan_id))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .forEach((deadline) => {
      if (deadline.scan_id && !byScanId.has(deadline.scan_id)) byScanId.set(deadline.scan_id, deadline);
    });

  const scansWithDeadlines = scans.filter((scan) => byScanId.has(scan.id));
  const active = scansWithDeadlines.length ? scansWithDeadlines : scans;
  const done = scansWithDeadlines.length ? scans.filter((scan) => !byScanId.has(scan.id)) : [];
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
  return item.doc_type ?? item.category ?? t("common.document");
}

function getDocVisual(item: ScanListItem): RowVisual {
  const haystack = `${item.doc_type ?? ""} ${item.category ?? ""} ${item.summary ?? ""}`.toLowerCase();
  return categoryStyles.find((style) => style.match.some((token) => haystack.includes(token))) ?? { bg: colors.blueSoft, fg: colors.primary, badgeBg: colors.blueSoft, badgeFg: colors.primary };
}

function getDeadlineBadge(value: string) {
  const diffDays = getDaysUntil(value);
  if (diffDays < 0) return t("documents.pastShort");
  if (diffDays === 0) return t("common.today");
  if (diffDays === 1) return t("documents.day");
  return t("common.days", { count: diffDays });
}

function getDeadlineBadgeColors(value: string): RowVisual {
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
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return t("common.today");
  return formatLocalizedDate(date, { day: "numeric", month: "short" });
}

function FileGlyph({ color }: { color: string }) {
  return (
    <View style={[styles.fileGlyph, { borderColor: color }]}>
      <View style={[styles.fileFold, { borderLeftColor: color, borderBottomColor: color }]} />
    </View>
  );
}

function CameraGlyph({ color }: { color: string }) {
  return (
    <View style={styles.cameraGlyph}>
      <View style={[styles.cameraBody, { borderColor: color }]}>
        <View style={[styles.cameraTop, { backgroundColor: color }]} />
        <View style={[styles.cameraLens, { borderColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  searchIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  searchCircle: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.6,
    borderColor: colors.muted2
  },
  searchHandle: {
    width: 8,
    height: 1.6,
    borderRadius: 2,
    backgroundColor: colors.muted2,
    transform: [{ rotate: "45deg" }],
    marginTop: -1,
    marginLeft: 12
  },
  bellIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  bellDome: {
    width: 15,
    height: 16,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: colors.muted2
  },
  bellBase: {
    width: 19,
    height: 1.5,
    borderRadius: 2,
    backgroundColor: colors.muted2,
    marginTop: -1
  },
  notifyDot: {
    position: "absolute",
    right: 8,
    top: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.bg
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
  ctaRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 16
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.amber,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  ctaButtonDisabled: {
    opacity: 0.5
  },
  ctaButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  ctaUsage: {
    color: "rgba(253,251,248,0.60)",
    fontSize: 13
  },
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
    paddingBottom: 106,
    gap: 8,
    backgroundColor: colors.bg
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
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  fileGlyph: {
    width: 15,
    height: 18,
    borderRadius: 2,
    borderWidth: 1.4
  },
  fileFold: {
    position: "absolute",
    right: -1.4,
    top: -1.4,
    width: 6,
    height: 6,
    borderLeftWidth: 1.4,
    borderBottomWidth: 1.4,
    backgroundColor: "transparent"
  },
  rowMid: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500"
  },
  rowTitleMuted: {
    color: colors.muted2
  },
  rowPreview: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  rowEnd: {
    alignItems: "flex-end",
    gap: 5
  },
  rowTime: {
    color: colors.muted2,
    fontSize: 12
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600"
  },
  rowChevron: {
    color: colors.muted3,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "300",
    marginTop: -2
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 92,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 22
  },
  fabDisabled: {
    opacity: 0.45
  },
  cameraGlyph: {
    width: 26,
    height: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  cameraBody: {
    width: 24,
    height: 17,
    borderRadius: 4,
    borderWidth: 1.8,
    alignItems: "center",
    justifyContent: "center"
  },
  cameraTop: {
    position: "absolute",
    top: -5,
    width: 9,
    height: 5,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3
  },
  cameraLens: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.7
  },
  pressed: {
    opacity: 0.72
  }
});
