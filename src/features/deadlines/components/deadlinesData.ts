import type { ColorPalette } from "@/components/ui";
import { formatLocalizedDate, getLocale, pluralize, t } from "@/lib/i18n";
import type { PluralForms } from "@/lib/i18n";
import type { DeadlineResponse, UserPlan } from "@/lib/types";

export const HORIZONTAL_PADDING = 24;

// Slimmer than iOS Mail defaults — keeps the card title visible during
// swipe and reduces accidental reveal. Buttons are still 64pt wide so the
// 44pt iOS minimum tap target is comfortably exceeded.
export const SWIPE_ACTION_WIDTH = 76;       // done (right swipe) — single button
export const SWIPE_LEFT_ACTION_WIDTH = 64;  // edit + delete each (left swipe)
export const SWIPE_LEFT_WIDTH = SWIPE_LEFT_ACTION_WIDTH * 2;
export const SWIPE_RIGHT_WIDTH = SWIPE_ACTION_WIDTH;
export const SWIPE_LEFT_THRESHOLD = SWIPE_LEFT_WIDTH * 0.34;
export const SWIPE_RIGHT_COMMIT_THRESHOLD = SWIPE_RIGHT_WIDTH * 0.86;
export const SWIPE_GESTURE_START_DISTANCE = 6;
export const SWIPE_DIRECTION_LOCK_RATIO = 1.15;
export const SWIPE_ACTION_OVERDRAG = 18;
export const SWIPE_FAST_VELOCITY = 0.45;
export const SHEET_DISMISS_DISTANCE = 96;
export const SHEET_DISMISS_VELOCITY = 0.9;
export const CALENDAR_ANIMATION_MAX_HEIGHT = 430;
export const DEADLINE_ROW_RADIUS = 18;
export const FREE_REMINDER_DAYS = [1] as const;
export const PRO_REMINDER_DAYS = [30, 14, 7, 1] as const;

export const RELATIVE_UNITS: Record<
  ReturnType<typeof getLocale>,
  {
    day: PluralForms;
    week: PluralForms;
    month: PluralForms;
    prefix: string;
  }
> = {
  cs: {
    day: { one: "den", few: "dny", many: "dní" },
    week: { one: "týden", few: "týdny", many: "týdnů" },
    month: { one: "měsíc", few: "měsíce", many: "měsíců" },
    prefix: "Za",
  },
  ru: {
    day: { one: "день", few: "дня", many: "дней" },
    week: { one: "неделю", few: "недели", many: "недель" },
    month: { one: "месяц", few: "месяца", many: "месяцев" },
    prefix: "Через",
  },
  uk: {
    day: { one: "день", few: "дні", many: "днів" },
    week: { one: "тиждень", few: "тижні", many: "тижнів" },
    month: { one: "місяць", few: "місяці", many: "місяців" },
    prefix: "Через",
  },
  en: {
    day: { one: "day", many: "days" },
    week: { one: "week", many: "weeks" },
    month: { one: "month", many: "months" },
    prefix: "In",
  },
};


export function formatReminderDate(date: Date): string {
  // "Напомнить 20 мая" — one day before the deadline (matches reminder_days=[1])
  return formatReminderTriggerDate(date, 1);
}

export function formatReminderTriggerDate(date: Date, daysBefore: number): string {
  const reminderDay = new Date(date);
  reminderDay.setHours(12, 0, 0, 0);
  reminderDay.setDate(reminderDay.getDate() - daysBefore);
  return formatLocalizedDate(reminderDay, { day: "numeric", month: "long", year: "numeric" });
}

export function formatManualReminderSubtitle(days: number[], date: Date): string {
  if (!days.length) return t("deadlines.reminderOffSubtitle");
  if (days.length === 1 && days[0] === 1) {
    return t("deadlines.reminderActiveSubtitle", { date: formatReminderDate(date) });
  }
  return `${t("deadlines.detailRemindBefore")} ${formatReminderDays(days)}`;
}

export function reminderOptionLabel(day: number) {
  if (day === 30) return t("chat.reminderOption30");
  if (day === 14) return t("chat.reminderOption14");
  if (day === 7) return t("chat.reminderOption7");
  return t("chat.reminderOption1");
}

export function reminderDaysForPlan(plan: UserPlan, date: Date): number[] {
  return filterUpcomingReminderDays(date, plan === "pro" ? PRO_REMINDER_DAYS : FREE_REMINDER_DAYS);
}

export function filterUpcomingReminderDays(date: Date, days: readonly number[]) {
  return days.filter((day) => isReminderTriggerUpcoming(date, day));
}

export function isReminderTriggerUpcoming(date: Date, daysBefore: number) {
  if (Number.isNaN(date.getTime())) return false;
  const triggerDate = new Date(date);
  triggerDate.setHours(12, 0, 0, 0);
  triggerDate.setDate(triggerDate.getDate() - daysBefore);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return triggerDate.getTime() >= today.getTime();
}


export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}


export function compareDeadlines(a: DeadlineResponse, b: DeadlineResponse) {
  if (a.status !== b.status) return a.status === "active" ? -1 : 1;
  if (a.status === "completed") return b.due_date.localeCompare(a.due_date);
  return a.due_date.localeCompare(b.due_date);
}

export type DeadlineGroup = {
  title: string;
  data: DeadlineResponse[];
  completed: boolean;
};

export function groupDeadlines(deadlines: DeadlineResponse[]): DeadlineGroup[] {
  // Order: active months in chronological order, then completed months in
  // reverse chronological order under the single expandable "done" header.
  const groups = new Map<string, DeadlineGroup>();

  deadlines.forEach((deadline) => {
    const isDone = deadline.status === "completed";
    const due = parseDateOnly(deadline.due_date);
    const key = `${isDone ? "completed" : "active"}-${due.getFullYear()}-${due.getMonth()}`;
    const label = formatLocalizedDate(due, { month: "long" });

    if (!groups.has(key)) {
      groups.set(key, { title: label.toUpperCase(), data: [], completed: isDone });
    }
    groups.get(key)?.data.push(deadline);
  });

  // Sort active groups by month chronologically; keep completed last.
  return Array.from(groups.values()).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const dateA = parseDateOnly(a.data[0].due_date);
    const dateB = parseDateOnly(b.data[0].due_date);
    if (a.completed) return dateB.getTime() - dateA.getTime();
    return dateA.getTime() - dateB.getTime();
  });
}

export function completedDateLabel(value: string): string {
  const date = parseDateOnly(value);
  const label = formatLocalizedDate(date, { day: "numeric", month: "short" });
  return `${t("deadlines.completedTag")} ${label}`;
}

/**
 * Source line shown under the title. Prefers the deadline description (often
 * the source document name on auto-created deadlines) and falls back to a
 * generic "From document" / "Manual" tag.
 */
export function deadlineSourceLabel(item: DeadlineResponse): string {
  const description = item.description?.replace(/\n+/g, " ").trim();
  if (description) return description;
  if (item.scan_id) return t("deadlines.fromDocument");
  return t(item.auto_created ? "deadlines.auto" : "deadlines.manual");
}

/** "10 МАЯ" → { day: "10", month: "МАЯ" }. Month is short 3-letter form. */
export function parseDayMonthAbbr(value: string): { day: string; month: string } {
  const date = parseDateOnly(value);
  const day = String(date.getDate());
  const monthFull = formatLocalizedDate(date, { month: "long" });
  // Take the first 3 characters as the abbreviation; works cleanly for cs/ru/uk/en.
  const month = monthFull.slice(0, 3).toUpperCase();
  return { day, month };
}


export type UrgencyTone = "urgent" | "soon" | "later" | "done";

export function urgencyTone(days: number): UrgencyTone {
  if (days < 7) return "urgent";
  if (days <= 30) return "soon";
  return "later";
}

/** Soft tinted background + foreground for the date tile, per urgency tone. */
export function tileColors(tone: UrgencyTone, colors: ColorPalette): { bg: string; fg: string } {
  switch (tone) {
    case "urgent":
      return { bg: colors.dangerLight, fg: colors.dangerDark };
    case "soon":
      return { bg: colors.amberLight, fg: colors.amberDark };
    case "later":
      return { bg: colors.greenLight, fg: colors.greenDark };
    case "done":
      return { bg: colors.surface2, fg: colors.muted3 };
  }
}

/**
 * Count active (non-completed) deadlines by urgency tier for the header
 * subtitle "1 срочно · 2 скоро · 1 позже".
 */
export function tallyUrgency(deadlines: DeadlineResponse[]): { urgent: number; soon: number; later: number } {
  const counts = { urgent: 0, soon: 0, later: 0 };
  deadlines.forEach((d) => {
    if (d.status === "completed") return;
    const tone = urgencyTone(daysUntil(d.due_date));
    if (tone === "urgent") counts.urgent++;
    else if (tone === "soon") counts.soon++;
    else counts.later++;
  });
  return counts;
}


/**
 * Parse a backend "YYYY-MM-DD" date as a *local* calendar day anchored at noon.
 * Using the local constructor instead of `new Date("...T12:00:00Z")` keeps
 * day-level comparisons correct in every timezone (the old form shifted the
 * calendar day for offsets beyond ±12h), and noon dodges DST midnight edges.
 * formatLocalizedDate renders in local time, so labels are unchanged for cs/pl.
 */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

export function daysUntil(value: string) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const due = parseDateOnly(value);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function relativeTime(value: string): string {
  const diffDays = daysUntil(value);

  if (diffDays < 0) return t("deadlines.overdue");
  if (diffDays === 0) return t("deadlines.today");
  if (diffDays === 1) return t("deadlines.tomorrow");
  if (diffDays < 7) return formatRelativeUnit(diffDays, "day");
  if (diffDays < 30) {
    const weeks = Math.round(diffDays / 7);
    return formatRelativeUnit(weeks, "week");
  }
  const months = Math.round(diffDays / 30);
  return formatRelativeUnit(months, "month");
}

export function formatRelativeUnit(count: number, unit: "day" | "week" | "month") {
  const locale = getLocale();
  const copy = RELATIVE_UNITS[locale];
  return `${copy.prefix} ${count} ${pluralize(count, copy[unit], locale)}`;
}

export function getUrgencyColor(value: string, colors: ColorPalette) {
  const diffDays = daysUntil(value);
  if (diffDays < 7) return colors.danger;
  if (diffDays <= 30) return colors.amber;
  return colors.green;
}

export function getUrgencyPillBg(days: number, colors: ColorPalette) {
  if (days < 7) return colors.dangerLight;
  if (days <= 30) return colors.amberLight;
  return colors.greenLight;
}

export function getUrgencyPillText(days: number, colors: ColorPalette) {
  if (days < 7) return colors.dangerDark;
  if (days <= 30) return colors.amberDark;
  return colors.greenDark;
}


export function formatReminderDays(days: number[]) {
  if (!days.length) return t("deadlines.reminderOffSubtitle");
  const locale = getLocale();
  const sorted = [...days].sort((a, b) => b - a);
  const last = sorted[sorted.length - 1] ?? 1;
  return `${sorted.join(", ")} ${pluralize(last, REMINDER_DAY_FORMS[locale], locale)}`;
}

export const REMINDER_DAY_FORMS: Record<ReturnType<typeof getLocale>, PluralForms> = {
  cs: { one: "den", few: "dny", many: "dní" },
  ru: { one: "день", few: "дня", many: "дней" },
  uk: { one: "день", few: "дні", many: "днів" },
  en: { one: "day", many: "days" },
};

export function reminderPlanForDays(days: number[]) {
  return days.some((day) => day > 1) ? "Pro" : "Free";
}

export function reminderDisplayPlan(days: number[], plan: UserPlan) {
  if (plan === "pro") return "Pro";
  return reminderPlanForDays(days);
}

