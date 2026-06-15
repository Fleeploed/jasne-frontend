import { setAppLocale, t } from "@/lib/i18n";
import type { DeadlineResponse } from "@/lib/types";
import {
  addDays,
  compareDeadlines,
  completedDateLabel,
  daysUntil,
  deadlineSourceLabel,
  filterUpcomingReminderDays,
  formatReminderDays,
  groupDeadlines,
  isReminderTriggerUpcoming,
  parseDateOnly,
  parseDayMonthAbbr,
  relativeTime,
  reminderDaysForPlan,
  reminderDisplayPlan,
  reminderPlanForDays,
  tallyUrgency,
  urgencyTone,
} from "@/features/deadlines/components/deadlinesData";

// Pin "today" so every relative calculation is deterministic. 2026-06-15.
const TODAY = new Date("2026-06-15T08:00:00");

function deadline(overrides: Partial<DeadlineResponse> = {}): DeadlineResponse {
  return {
    id: "d-1",
    user_id: "u-1",
    scan_id: null,
    title: "Deadline",
    description: null,
    due_date: "2026-08-20",
    reminder_days: [1],
    deadline_type: "payment",
    status: "active",
    auto_created: false,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
  setAppLocale("en");
});

afterAll(() => {
  jest.useRealTimers();
});

describe("parseDateOnly", () => {
  it("parses a YYYY-MM-DD string as a local calendar day at noon", () => {
    const date = parseDateOnly("2026-08-20");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7); // August (0-indexed)
    expect(date.getDate()).toBe(20);
    expect(date.getHours()).toBe(12);
  });

  it("defaults missing month/day components to January 1st", () => {
    const date = parseDateOnly("2026");
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });
});

describe("addDays", () => {
  it("advances a date by N days without mutating the input", () => {
    const base = new Date(2026, 5, 15, 12, 0, 0);
    const next = addDays(base, 5);
    expect(next.getDate()).toBe(20);
    expect(base.getDate()).toBe(15);
  });

  it("rolls across a month boundary", () => {
    const next = addDays(new Date(2026, 5, 30, 12, 0, 0), 1);
    expect(next.getMonth()).toBe(6);
    expect(next.getDate()).toBe(1);
  });
});

describe("daysUntil", () => {
  it("returns 0 for today", () => expect(daysUntil("2026-06-15")).toBe(0));
  it("returns 1 for tomorrow", () => expect(daysUntil("2026-06-16")).toBe(1));
  it("returns a negative count for a past date", () => expect(daysUntil("2026-06-10")).toBe(-5));
  it("counts across a month boundary", () => expect(daysUntil("2026-07-15")).toBe(30));
});

describe("urgencyTone", () => {
  it("is urgent under 7 days", () => {
    expect(urgencyTone(0)).toBe("urgent");
    expect(urgencyTone(6)).toBe("urgent");
  });
  it("is soon from 7 to 30 days inclusive", () => {
    expect(urgencyTone(7)).toBe("soon");
    expect(urgencyTone(30)).toBe("soon");
  });
  it("is later beyond 30 days", () => expect(urgencyTone(31)).toBe("later"));
});

describe("relativeTime", () => {
  it("returns the overdue label for a past date", () => {
    expect(relativeTime("2026-06-10")).toBe(t("deadlines.overdue"));
  });
  it("returns today/tomorrow labels", () => {
    expect(relativeTime("2026-06-15")).toBe(t("deadlines.today"));
    expect(relativeTime("2026-06-16")).toBe(t("deadlines.tomorrow"));
  });
  it("counts in days under a week", () => {
    expect(relativeTime("2026-06-18")).toBe("In 3 days");
  });
  it("rounds to whole weeks under a month", () => {
    expect(relativeTime("2026-06-23")).toBe("In 1 week"); // 8 days → 1 week
    expect(relativeTime("2026-07-05")).toBe("In 3 weeks"); // 20 days → 3 weeks
  });
  it("rounds to whole months beyond 30 days", () => {
    expect(relativeTime("2026-07-30")).toBe("In 2 months"); // 45 days → 2 months
  });
});

describe("compareDeadlines", () => {
  it("orders active before completed", () => {
    const active = deadline({ status: "active" });
    const done = deadline({ status: "completed" });
    expect(compareDeadlines(active, done)).toBeLessThan(0);
    expect(compareDeadlines(done, active)).toBeGreaterThan(0);
  });

  it("orders active deadlines by ascending due date", () => {
    const early = deadline({ due_date: "2026-07-01" });
    const late = deadline({ due_date: "2026-09-01" });
    expect(compareDeadlines(early, late)).toBeLessThan(0);
  });

  it("orders completed deadlines by descending due date", () => {
    const early = deadline({ status: "completed", due_date: "2026-07-01" });
    const late = deadline({ status: "completed", due_date: "2026-09-01" });
    expect(compareDeadlines(early, late)).toBeGreaterThan(0);
  });
});

describe("groupDeadlines", () => {
  it("groups by month, active first in chronological order, completed last", () => {
    const groups = groupDeadlines([
      deadline({ id: "a", due_date: "2026-09-10" }),
      deadline({ id: "b", due_date: "2026-07-05" }),
      deadline({ id: "c", status: "completed", due_date: "2026-06-01" }),
    ]);

    expect(groups.map((g) => g.completed)).toEqual([false, false, true]);
    // July group precedes September group.
    expect(groups[0].data[0].id).toBe("b");
    expect(groups[1].data[0].id).toBe("a");
    expect(groups[2].completed).toBe(true);
  });
});

describe("tallyUrgency", () => {
  it("counts active deadlines by tier and ignores completed ones", () => {
    const counts = tallyUrgency([
      deadline({ due_date: "2026-06-18" }), // 3 days → urgent
      deadline({ due_date: "2026-07-05" }), // 20 days → soon
      deadline({ due_date: "2026-09-01" }), // ~78 days → later
      deadline({ status: "completed", due_date: "2026-06-16" }), // ignored
    ]);
    expect(counts).toEqual({ urgent: 1, soon: 1, later: 1 });
  });
});

describe("parseDayMonthAbbr", () => {
  it("splits a date into day and a 3-letter uppercase month", () => {
    expect(parseDayMonthAbbr("2026-05-10")).toEqual({ day: "10", month: "MAY" });
  });
});

describe("reminder trigger windows", () => {
  it("keeps a reminder whose trigger day is still in the future", () => {
    // due in 10 days; a 1-day-before trigger is upcoming.
    expect(isReminderTriggerUpcoming(parseDateOnly("2026-06-25"), 1)).toBe(true);
  });

  it("drops a reminder whose trigger day has already passed", () => {
    // due in 10 days; a 30-day-before trigger is well in the past.
    expect(isReminderTriggerUpcoming(parseDateOnly("2026-06-25"), 30)).toBe(false);
  });

  it("returns false for an unparseable date", () => {
    expect(isReminderTriggerUpcoming(new Date(NaN), 1)).toBe(false);
  });

  it("filters a list down to still-upcoming trigger days", () => {
    expect(filterUpcomingReminderDays(parseDateOnly("2026-06-25"), [30, 14, 7, 1])).toEqual([7, 1]);
  });
});

describe("reminderDaysForPlan", () => {
  it("uses the single free reminder, clipped to upcoming triggers", () => {
    expect(reminderDaysForPlan("free", parseDateOnly("2026-12-01"))).toEqual([1]);
  });

  it("uses the full pro ladder when the due date is far enough out", () => {
    expect(reminderDaysForPlan("pro", parseDateOnly("2026-12-01"))).toEqual([30, 14, 7, 1]);
  });

  it("clips the pro ladder when the due date is near", () => {
    expect(reminderDaysForPlan("pro", parseDateOnly("2026-06-25"))).toEqual([7, 1]);
  });
});

describe("reminder plan labels", () => {
  it("formats a sorted reminder-days summary", () => {
    expect(formatReminderDays([7, 1])).toBe("7, 1 day");
  });

  it("treats any day greater than 1 as a Pro-only configuration", () => {
    expect(reminderPlanForDays([1])).toBe("Free");
    expect(reminderPlanForDays([7, 1])).toBe("Pro");
  });

  it("displays Pro for pro users regardless of the configured days", () => {
    expect(reminderDisplayPlan([1], "pro")).toBe("Pro");
    expect(reminderDisplayPlan([1], "free")).toBe("Free");
    expect(reminderDisplayPlan([7], "free")).toBe("Pro");
  });
});

describe("completedDateLabel", () => {
  it("prefixes the completed tag before a short date", () => {
    const label = completedDateLabel("2026-05-10");
    expect(label.startsWith(t("deadlines.completedTag"))).toBe(true);
    expect(label).toContain("10");
  });
});

describe("deadlineSourceLabel", () => {
  it("prefers the description, collapsing newlines to spaces", () => {
    expect(deadlineSourceLabel(deadline({ description: "Faktura\n2024" }))).toBe("Faktura 2024");
  });

  it("falls back to the from-document label when linked to a scan", () => {
    expect(deadlineSourceLabel(deadline({ description: null, scan_id: "s-1" }))).toBe(t("deadlines.fromDocument"));
  });

  it("falls back to manual vs auto labels when there is no scan", () => {
    expect(deadlineSourceLabel(deadline({ description: null, scan_id: null, auto_created: true }))).toBe(t("deadlines.auto"));
    expect(deadlineSourceLabel(deadline({ description: null, scan_id: null, auto_created: false }))).toBe(t("deadlines.manual"));
  });
});
