import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { getLimits } from "@/features/scans/scansApi";
import type { LimitsResponse, UserPlan } from "@/lib/types";

export const LIMITS_QUERY_KEY = ["limits"] as const;

/**
 * Shared subscription state backed by React Query: all consumers reuse one
 * cached /limits request, and a transient network failure keeps the last
 * known plan instead of downgrading a paying user to "free".
 */
export function useSubscription() {
  const query = useQuery<LimitsResponse>({
    queryKey: LIMITS_QUERY_KEY,
    queryFn: () => getLimits(),
    staleTime: 60_000,
  });

  const refetch = query.refetch;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const plan: UserPlan = query.data?.plan ?? "free";

  return {
    isPro: plan === "pro",
    loading: query.isPending,
    plan,
    refresh,
  };
}
