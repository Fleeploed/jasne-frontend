import { formatCategoryLabel, formatLocalizedDate, getLocale, pluralize, t, type PluralForms } from "@/lib/i18n";
import type { ColorPalette } from "@/components/ui";
import type { DeadlineResponse, LimitsResponse, ScanListItem } from "@/lib/types";
import type { ScanCountsResponse } from "@/features/scans/scansApi";
import type { CategoryStyleList } from "./scanListStyles";

export type RowVisual = {
  bg: string;
  fg: string;
  badgeBg?: string;
  badgeFg?: string;
};

export type MeasuredRect = { x: number; y: number; width: number; height: number };
export type DocumentCategoryFilterKey = "all" | `category:${string}`;
export type DocumentCategoryFilter = { key: DocumentCategoryFilterKey; label: string; count: number };

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

export function getActivityDate(scan: ScanListItem) {
  return scan.last_message_at ?? scan.created_at;
}

export function filterScans(scans: ScanListItem[], deadlines: DeadlineResponse[], query: string): ScanListItem[] {
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

export function buildDocumentCategoryFilters(
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

export function filterScansByDocumentCategory(
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

export function splitScans(scans: ScanListItem[], deadlines: DeadlineResponse[], pinnedIds: Set<string>) {
  const todayKey = getTodayDateKey();
  const byScanId = new Map<string, DeadlineResponse>();
  [...deadlines]
    .filter((deadline) => Boolean(deadline.scan_id) && isCurrentDeadline(deadline, todayKey))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .forEach((deadline) => {
      if (deadline.scan_id && !byScanId.has(deadline.scan_id)) byScanId.set(deadline.scan_id, deadline);
    });

  // Analysis deadlines can exist before a DB reminder row is created. Only
  // current dates should promote the scan into the "with deadlines" section.
  scans.forEach((scan) => {
    if (byScanId.has(scan.id)) return;
    if (!scan.has_analysis_deadlines || !scan.next_analysis_deadline_at) return;
    if (!isCurrentDeadlineDate(scan.next_analysis_deadline_at, todayKey)) return;
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

function isCurrentDeadline(deadline: DeadlineResponse, todayKey = getTodayDateKey()) {
  return deadline.status === "active" && isCurrentDeadlineDate(deadline.due_date, todayKey);
}

function isCurrentDeadlineDate(value?: string | null, todayKey = getTodayDateKey()) {
  const dateKey = getDeadlineDateKey(value);
  return Boolean(dateKey && dateKey >= todayKey);
}

function getDeadlineDateKey(value?: string | null) {
  const dateKey = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!dateKey) return null;

  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : dateKey;
}

function getTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mergeScansById(current: ScanListItem[], next: ScanListItem[]) {
  const seen = new Set(current.map((scan) => scan.id));
  const merged = [...current];
  next.forEach((scan) => {
    if (seen.has(scan.id)) return;
    seen.add(scan.id);
    merged.push(scan);
  });
  return merged;
}

export function getScanLimitWarning(limits: LimitsResponse | null) {
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

export function getTitle(item: ScanListItem) {
  if (item.document_type_cz) return item.document_type_cz;
  const raw = item.doc_type ?? item.category ?? t("common.document");
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getDocMeta(item: ScanListItem) {
  return formatCategoryLabel(item.category ?? item.doc_type).toUpperCase();
}

export function getDocVisual(item: ScanListItem, colors: ColorPalette, categoryStyleList: CategoryStyleList): RowVisual {
  const category = normalizeCategoryKey(item.category);
  const categoryStyle = categoryStyleList.find((style) => style.category === category);
  if (categoryStyle) return categoryStyle;

  const haystack = `${item.doc_type ?? ""} ${item.category ?? ""} ${item.summary ?? ""}`.toLowerCase();
  return categoryStyleList.find((style) => style.match.some((token) => haystack.includes(token))) ?? { bg: colors.blueSoft, fg: colors.primary, badgeBg: colors.blueSoft, badgeFg: colors.primary };
}

export function normalizeCategoryKey(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[-\s]+/g, "_") ?? null;
}

export function getDeadlineBadge(value: string) {
  const diffDays = getDaysUntil(value);
  if (diffDays < 0) return t("documents.pastShort");
  if (diffDays === 0) return t("common.today");
  if (diffDays === 1) return t("documents.day");
  return t("common.days", { count: diffDays });
}

export function getDeadlineBadgeColors(value: string, colors: ColorPalette): RowVisual {
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
export function formatDate(value: string) {
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
