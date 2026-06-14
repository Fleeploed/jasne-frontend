jest.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { UTF8: "utf8" },
  writeAsStringAsync: jest.fn(),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

import { buildDeadlineIcs } from "@/features/deadlines/calendarExport";
import type { DeadlineResponse } from "@/lib/types";

const NOW = new Date("2026-06-15T09:30:45.123Z");

function makeDeadline(overrides: Partial<DeadlineResponse> = {}): DeadlineResponse {
  return {
    id: "abc-123",
    user_id: "u-1",
    scan_id: null,
    title: "Prodloužení pobytu",
    description: null,
    due_date: "2026-08-20",
    reminder_days: [],
    deadline_type: "payment",
    status: "active",
    auto_created: false,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildDeadlineIcs", () => {
  it("emits a well-formed single-event VCALENDAR", () => {
    const ics = buildDeadlineIcs(makeDeadline(), NOW);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:jasne-deadline-abc-123@jasne.app");
    expect(ics).toContain("SUMMARY:Prodloužení pobytu");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("uses CRLF line breaks (RFC 5545)", () => {
    const ics = buildDeadlineIcs(makeDeadline(), NOW);
    expect(ics).toContain("\r\n");
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("renders an all-day event with a non-inclusive next-day DTEND", () => {
    const ics = buildDeadlineIcs(makeDeadline({ due_date: "2026-08-20" }), NOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260820");
    expect(ics).toContain("DTEND;VALUE=DATE:20260821");
  });

  it("rolls DTEND across a month boundary", () => {
    const ics = buildDeadlineIcs(makeDeadline({ due_date: "2026-06-30" }), NOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260630");
    expect(ics).toContain("DTEND;VALUE=DATE:20260701");
  });

  it("rolls DTEND across a year boundary", () => {
    const ics = buildDeadlineIcs(makeDeadline({ due_date: "2026-12-31" }), NOW);
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("derives the date from a due_date that carries a time component", () => {
    const ics = buildDeadlineIcs(makeDeadline({ due_date: "2026-08-20T23:59:00Z" }), NOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260820");
  });

  it("writes a deterministic UTC DTSTAMP from the provided clock", () => {
    const ics = buildDeadlineIcs(makeDeadline(), NOW);
    expect(ics).toContain("DTSTAMP:20260615T093045Z");
  });

  it("escapes commas, semicolons, backslashes and newlines in text fields", () => {
    const ics = buildDeadlineIcs(
      makeDeadline({ title: "Pay; now, please\\fast", description: "line1\nline2" }),
      NOW,
    );
    expect(ics).toContain("SUMMARY:Pay\\; now\\, please\\\\fast");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
  });

  it("omits DESCRIPTION when there is no description", () => {
    const ics = buildDeadlineIcs(makeDeadline({ description: null }), NOW);
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("omits DESCRIPTION when the description is only whitespace", () => {
    const ics = buildDeadlineIcs(makeDeadline({ description: "   \n  " }), NOW);
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("falls back to a generic summary when the title is empty", () => {
    const ics = buildDeadlineIcs(makeDeadline({ title: "  " }), NOW);
    expect(ics).toContain("SUMMARY:common.document");
  });

  it("creates one VALARM per reminder day, sorted, deduped and N days before", () => {
    const ics = buildDeadlineIcs(makeDeadline({ reminder_days: [7, 1, 7, 30] }), NOW);
    const triggers = ics.split("\r\n").filter((line) => line.startsWith("TRIGGER:"));
    expect(triggers).toEqual(["TRIGGER:-P1D", "TRIGGER:-P7D", "TRIGGER:-P30D"]);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
  });

  it("uses a zero-duration trigger for a same-day reminder", () => {
    const ics = buildDeadlineIcs(makeDeadline({ reminder_days: [0] }), NOW);
    expect(ics).toContain("TRIGGER:PT0S");
  });

  it("ignores negative or non-finite reminder days", () => {
    const ics = buildDeadlineIcs(makeDeadline({ reminder_days: [-3, 5, NaN] }), NOW);
    const triggers = ics.split("\r\n").filter((line) => line.startsWith("TRIGGER:"));
    expect(triggers).toEqual(["TRIGGER:-P5D"]);
  });
});
