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
  // Playwright scraping ipc.gov.cz takes ~40 s warm and can exceed that on a
  // cold Render free-tier start. The default 30 s frontend timeout fired first
  // and surfaced a false "check your internet" error. Allow up to 120 s so the
  // request outlasts both the scrape and a cold backend boot.
  return apiFetch<Tracking>(`/trackings/${encodeURIComponent(id)}/check`, {
    method: "POST",
    timeoutMs: 120_000,
  });
}
