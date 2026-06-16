/* eslint-disable import/first -- jest.mock() must run before the imports it stubs; babel hoists these above the imports. */

// Screen-level guard for the pagination fix: DeadlinesScreen must load EVERY
// page of deadlines (via listAllDeadlines), not just the first 50. We mock the
// screen's boundaries (router, providers, child UI) and let the real
// listAllDeadlines run through a mocked apiFetch, then assert the screen drove
// a second /deadlines request when the first page came back full.

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so React must be require()d here.
  const React = require("react");
  return {
    // Fire the focus callback once on mount so the screen's load() runs.
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        cb();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [cb]);
    },
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    router: { push: jest.fn(), back: jest.fn() },
  };
});

jest.mock("@react-navigation/native", () => ({ useScrollToTop: () => {} }));
jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));
jest.mock("@/hooks/useTrackings", () => ({
  useTrackings: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
}));
jest.mock("@/features/deadlines/deadlinesCache", () => ({
  deadlinesCache: { read: jest.fn().mockResolvedValue(null), write: jest.fn() },
}));
// getLimits is unrelated to pagination; stub it so the real scansApi (and its
// pile of native/expo imports) never loads, and so apiFetch only ever sees the
// /deadlines traffic we want to assert on.
jest.mock("@/features/scans/scansApi", () => ({ getLimits: jest.fn().mockResolvedValue({ plan: "free" }) }));
jest.mock("@/features/deadlines/calendarExport", () => ({ exportDeadlineToCalendar: jest.fn() }));

// Presentational boundaries — rendered as no-ops so the test stays focused on
// the data-loading contract and free of native module imports.
jest.mock("@/components/ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so React must be require()d here.
  const React = require("react");
  return {
    Screen: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    EmptyState: () => null,
    ErrorText: () => null,
    useColors: () => new Proxy({}, { get: () => "#000000" }),
    // createStyles (real) reads fonts.* (strings) and spreads typeStyles.* (objects).
    fonts: new Proxy({}, { get: () => "System" }),
    typeStyles: new Proxy({}, { get: () => ({}) }),
  };
});
jest.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
jest.mock("@/components/tracking/TrackingCard", () => ({ TrackingCard: () => null }));
jest.mock("@/features/deadlines/components/UrgencyDot", () => ({ UrgencyDot: () => null }));
jest.mock("@/features/deadlines/components/DeadlineCard", () => ({ DeadlineCard: () => null }));
jest.mock("@/features/deadlines/components/ManualDeadlineModal", () => ({ ManualDeadlineModal: () => null }));
jest.mock("@/features/deadlines/components/ManualDeadlineDetailModal", () => ({ ManualDeadlineDetailModal: () => null }));
jest.mock("@/features/deadlines/components/DeadlineContextMenu", () => ({ DeadlineContextMenu: () => null }));
jest.mock("@/features/deadlines/components/DeleteDeadlineModal", () => ({ DeleteDeadlineModal: () => null }));

import TestRenderer, { act } from "react-test-renderer";

import { apiFetch } from "@/lib/api";
import { DEADLINES_PAGE_SIZE } from "@/features/deadlines/deadlinesApi";
import { DeadlinesScreen } from "@/features/deadlines/DeadlinesScreen";
import type { DeadlineResponse } from "@/lib/types";

const apiFetchMock = apiFetch as jest.Mock;

function makeDeadline(id: string): DeadlineResponse {
  return {
    id,
    user_id: "u-1",
    scan_id: null,
    title: `Deadline ${id}`,
    description: null,
    due_date: "2026-08-20",
    reminder_days: [1],
    deadline_type: "payment",
    status: "active",
    auto_created: false,
    created_at: "2026-06-01T00:00:00Z",
  };
}

function page(count: number, offset = 0): DeadlineResponse[] {
  return Array.from({ length: count }, (_, i) => makeDeadline(`d-${offset + i}`));
}

/** Serve /deadlines from `pages` keyed by the offset query param. */
function serve(pages: DeadlineResponse[][]) {
  apiFetchMock.mockImplementation((url: string) => {
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    const offset = Number(params.get("offset") ?? "0");
    return Promise.resolve(pages[offset / DEADLINES_PAGE_SIZE] ?? []);
  });
}

/** Offsets of every /deadlines request the screen made, in order. */
function deadlineOffsets(): string[] {
  return apiFetchMock.mock.calls
    .map(([url]: [string]) => url)
    .filter((url) => url.startsWith("/deadlines"))
    .map((url) => new URLSearchParams(url.split("?")[1]).get("offset") ?? "0");
}

async function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<DeadlinesScreen />);
  });
  // Flush the chained load() promise (cache.read → listAllDeadlines pages → state).
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("DeadlinesScreen — loads all pages", () => {
  it("fetches the next page when the first comes back full", async () => {
    serve([page(DEADLINES_PAGE_SIZE, 0), page(3, DEADLINES_PAGE_SIZE)]);

    await renderScreen();

    expect(deadlineOffsets()).toEqual(["0", String(DEADLINES_PAGE_SIZE)]);
  });

  it("requests only the first page when it is not full", async () => {
    serve([page(3, 0)]);

    await renderScreen();

    expect(deadlineOffsets()).toEqual(["0"]);
  });

  it("loads completed deadlines too (only_active=false)", async () => {
    serve([page(3, 0)]);

    await renderScreen();

    const firstUrl = apiFetchMock.mock.calls.find(([url]: [string]) => url.startsWith("/deadlines"))![0];
    expect(new URLSearchParams(firstUrl.split("?")[1]).get("only_active")).toBe("false");
  });
});
