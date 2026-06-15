import { createUserScopedCache } from "@/lib/userScopedCache";
import type { DeadlineResponse, UserPlan } from "@/lib/types";

/**
 * Last-known-good snapshot of the deadlines list (active + completed) so the
 * Sroky screen renders instantly on cold start and stays readable offline.
 */
export type DeadlinesSnapshot = {
  deadlines: DeadlineResponse[];
  plan: UserPlan;
};

export const deadlinesCache = createUserScopedCache<DeadlinesSnapshot>("jasne_deadlines_cache_v1");
