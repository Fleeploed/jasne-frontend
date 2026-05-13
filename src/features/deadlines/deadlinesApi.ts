import { apiFetch } from "@/lib/api";
import type { DeadlineResponse, DeadlineType } from "@/lib/types";

export type { DeadlineResponse };

export async function listDeadlines(onlyActive = true) {
  return apiFetch<DeadlineResponse[]>(`/deadlines?only_active=${onlyActive ? "true" : "false"}`);
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
}) {
  return apiFetch<DeadlineResponse>("/deadlines", {
    method: "POST",
    json: {
      ...input,
      reminder_days: [30, 14, 7, 1]
    }
  });
}

export async function updateManualDeadline(
  deadlineId: string,
  input: { title?: string; description?: string | null; due_date?: string }
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
