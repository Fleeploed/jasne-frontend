import { apiFetch } from "@/lib/api";
import type { DeadlineResponse, DeadlineStatus, DeadlineType } from "@/lib/types";

export type { DeadlineResponse };

export const DEADLINES_PAGE_SIZE = 50;

export type ListDeadlinesOptions = {
  limit?: number;
  offset?: number;
  status?: DeadlineStatus;
};

export async function listDeadlines(onlyActive = true, options: ListDeadlinesOptions = {}) {
  const params = new URLSearchParams({
    only_active: onlyActive ? "true" : "false",
    limit: String(options.limit ?? DEADLINES_PAGE_SIZE),
    offset: String(options.offset ?? 0),
  });
  if (options.status) params.set("status_filter", options.status);
  return apiFetch<DeadlineResponse[]>(`/deadlines?${params.toString()}`);
}

export async function completeDeadline(deadlineId: string) {
  return apiFetch<DeadlineResponse>(`/deadlines/${deadlineId}`, {
    method: "PATCH",
    json: { status: "completed" }
  });
}

export async function createManualDeadline(input: {
  title: string;
  description?: string | null;
  due_date: string;
  deadline_type: DeadlineType;
  scan_id?: string;
  reminder_days?: number[];
}) {
  const { reminder_days, ...rest } = input;
  return apiFetch<DeadlineResponse>("/deadlines", {
    method: "POST",
    json: {
      ...rest,
      // Manual deadlines default to a single 1-day reminder; pass [] to disable.
      reminder_days: reminder_days ?? [1],
    }
  });
}

export async function updateManualDeadline(
  deadlineId: string,
  input: { title?: string; description?: string | null; due_date?: string; reminder_days?: number[] }
) {
  return apiFetch<DeadlineResponse>(`/deadlines/${deadlineId}`, {
    method: "PATCH",
    json: input
  });
}

export async function deleteDeadline(deadlineId: string) {
  await apiFetch<void>(`/deadlines/${deadlineId}`, {
    method: "DELETE"
  });
}
