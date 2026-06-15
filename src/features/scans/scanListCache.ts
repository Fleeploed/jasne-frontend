import { createUserScopedCache } from "@/lib/userScopedCache";
import type { ScanCountsResponse } from "@/features/scans/scansApi";
import type { DeadlineResponse, LimitsResponse, ScanListItem } from "@/lib/types";

/**
 * Last-known-good snapshot of the documents list so it renders instantly on
 * cold start and stays readable offline. Only the first page of scans is
 * cached — pagination re-fetches from the network.
 */
export type ScanListSnapshot = {
  scans: ScanListItem[];
  deadlines: DeadlineResponse[];
  counts: ScanCountsResponse | null;
  limits: LimitsResponse | null;
};

export const scanListCache = createUserScopedCache<ScanListSnapshot>("jasne_scanlist_cache_v1");
