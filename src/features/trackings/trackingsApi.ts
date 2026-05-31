import { apiFetch } from "@/lib/api";
import type { Tracking, TrackingType } from "@/lib/types";

export type CreateTrackingInput = {
  tracking_type: TrackingType;
  identifier: string;
  metadata?: Record<string, unknown>;
};

export async function listTrackings(trackingType?: TrackingType) {
  const query = trackingType ? `?type=${encodeURIComponent(trackingType)}` : "";
  return apiFetch<Tracking[]>(`/trackings${query}`);
}

export async function createTracking(input: CreateTrackingInput) {
  return apiFetch<Tracking>("/trackings", {
    method: "POST",
    json: input,
  });
}

export async function stopTracking(id: string) {
  await apiFetch<void>(`/trackings/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function checkTracking(id: string) {
  return apiFetch<Tracking>(`/trackings/${encodeURIComponent(id)}/check`, {
    method: "POST",
  });
}
