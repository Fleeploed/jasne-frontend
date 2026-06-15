/* eslint-disable import/first -- jest.mock() must run before the imports it stubs; babel hoists these above the imports. */
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

import { apiFetch } from "@/lib/api";
import { listAllDeadlines, DEADLINES_PAGE_SIZE } from "@/features/deadlines/deadlinesApi";
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

/** Drives apiFetch off the `offset` query param so each page maps to `pages[i]`. */
function serve(pages: DeadlineResponse[][]) {
  apiFetchMock.mockImplementation((url: string) => {
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    const offset = Number(params.get("offset") ?? "0");
    const index = offset / DEADLINES_PAGE_SIZE;
    return Promise.resolve(pages[index] ?? []);
  });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("listAllDeadlines pagination", () => {
  it("makes a single request when the first page is short", async () => {
    serve([page(3)]);
    const result = await listAllDeadlines();
    expect(result).toHaveLength(3);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array and stops after one call when there are no deadlines", async () => {
    serve([[]]);
    const result = await listAllDeadlines();
    expect(result).toEqual([]);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches a second page when the first is exactly full, then stops on the empty page", async () => {
    serve([page(DEADLINES_PAGE_SIZE, 0), []]);
    const result = await listAllDeadlines();
    expect(result).toHaveLength(DEADLINES_PAGE_SIZE);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it("walks multiple full pages and concatenates them in order until a short page", async () => {
    serve([page(DEADLINES_PAGE_SIZE, 0), page(DEADLINES_PAGE_SIZE, DEADLINES_PAGE_SIZE), page(10, DEADLINES_PAGE_SIZE * 2)]);
    const result = await listAllDeadlines();

    expect(result).toHaveLength(DEADLINES_PAGE_SIZE * 2 + 10);
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
    expect(result[0].id).toBe("d-0");
    expect(result[result.length - 1].id).toBe(`d-${DEADLINES_PAGE_SIZE * 2 + 9}`);
  });

  it("advances the offset by the page size on each request", async () => {
    serve([page(DEADLINES_PAGE_SIZE, 0), page(DEADLINES_PAGE_SIZE, DEADLINES_PAGE_SIZE), page(1, DEADLINES_PAGE_SIZE * 2)]);
    await listAllDeadlines();

    const offsets = apiFetchMock.mock.calls.map(([url]: [string]) => new URLSearchParams(url.split("?")[1]).get("offset"));
    expect(offsets).toEqual(["0", String(DEADLINES_PAGE_SIZE), String(DEADLINES_PAGE_SIZE * 2)]);
  });

  it("passes only_active=true and the page limit by default", async () => {
    serve([page(1)]);
    await listAllDeadlines();
    const params = new URLSearchParams(apiFetchMock.mock.calls[0][0].split("?")[1]);
    expect(params.get("only_active")).toBe("true");
    expect(params.get("limit")).toBe(String(DEADLINES_PAGE_SIZE));
    expect(params.get("status_filter")).toBeNull();
  });

  it("forwards only_active=false and a status filter on every page", async () => {
    serve([page(DEADLINES_PAGE_SIZE, 0), page(2, DEADLINES_PAGE_SIZE)]);
    await listAllDeadlines(false, "completed");

    for (const [url] of apiFetchMock.mock.calls) {
      const params = new URLSearchParams(url.split("?")[1]);
      expect(params.get("only_active")).toBe("false");
      expect(params.get("status_filter")).toBe("completed");
    }
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
