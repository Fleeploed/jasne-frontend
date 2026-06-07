import type { AppIconName } from "@/components/AppIcon";
import type { TrackingType } from "@/lib/types";

export type TrackingTone = "amber" | "green" | "red" | "gray";

export type TrackingTypeConfig = {
  statusColors: Record<string, TrackingTone>;
  icon: AppIconName;
  detailRoute: "/oamp/status-result";
  i18nNamespace: string;
};

// Only implemented tracking types are configured here. Consumers must handle
// a missing config (trackingConfigFor returns null) for not-yet-built types.
export const TRACKING_TYPES: Partial<Record<TrackingType, TrackingTypeConfig>> = {
  oamp_status: {
    statusColors: {
      probiha: "amber",
      schvaleno: "green",
      zamitnuto: "red",
      not_found: "gray",
      error: "gray",
    },
    icon: "doc",
    detailRoute: "/oamp/status-result",
    i18nNamespace: "tracking.types.oamp_status",
  },
};

export function trackingConfigFor(type: TrackingType) {
  return TRACKING_TYPES[type] ?? null;
}
