import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { t } from "@/lib/i18n";
import type { DeadlineResponse } from "@/lib/types";

/**
 * Escapes a value for an iCalendar TEXT field per RFC 5545 §3.3.11:
 * backslash, semicolon and comma are escaped, newlines become the literal "\n".
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** "YYYY-MM-DD" → "YYYYMMDD" for a DATE-valued property. */
function toIcsDate(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

/**
 * All-day VEVENTs use a non-inclusive DTEND, so a deadline on 2026-06-15 spans
 * DTSTART 20260615 → DTEND 20260616. Computed in UTC to avoid a local-timezone
 * day shift.
 */
function nextDayIcsDate(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** UTC timestamp for DTSTAMP: "YYYYMMDDTHHMMSSZ". */
function icsTimestamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Builds a single-event iCalendar (.ics) document for a deadline. The event is
 * all-day on the due date; each reminder day becomes a DISPLAY VALARM firing N
 * days before. Pure and deterministic given `now` — unit-tested in isolation.
 */
export function buildDeadlineIcs(deadline: DeadlineResponse, now: Date = new Date()): string {
  const dateKey = deadline.due_date.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? deadline.due_date;
  const summary = escapeIcsText(deadline.title?.trim() || t("common.document"));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jasne//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:jasne-deadline-${deadline.id}@jasne.app`,
    `DTSTAMP:${icsTimestamp(now)}`,
    `DTSTART;VALUE=DATE:${toIcsDate(dateKey)}`,
    `DTEND;VALUE=DATE:${nextDayIcsDate(dateKey)}`,
    `SUMMARY:${summary}`,
  ];

  if (deadline.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(deadline.description.trim())}`);
  }

  const reminderDays = Array.from(new Set(deadline.reminder_days ?? []))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  for (const days of reminderDays) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${summary}`,
      days === 0 ? "TRIGGER:PT0S" : `TRIGGER:-P${days}D`,
      "END:VALARM",
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  // RFC 5545 mandates CRLF line breaks.
  return lines.join("\r\n");
}

/**
 * Writes the deadline as a temporary .ics file and opens the OS share sheet so
 * the user can add it to Apple/Google Calendar (or any app that handles
 * text/calendar). Throws a localized error if sharing is unavailable.
 */
export async function exportDeadlineToCalendar(deadline: DeadlineResponse): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(t("deadlines.calendarShareUnavailable"));
  }

  const safeName =
    (deadline.title || "deadline").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) ||
    "deadline";
  const fileUri = `${FileSystem.cacheDirectory}${safeName}-${deadline.id}.ics`;

  await FileSystem.writeAsStringAsync(fileUri, buildDeadlineIcs(deadline), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(fileUri, {
    mimeType: "text/calendar",
    UTI: "com.apple.ical.ics",
    dialogTitle: t("deadlines.addToCalendar"),
  });
}
