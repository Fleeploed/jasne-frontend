import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import * as Application from "expo-application";
import Constants from "expo-constants";

import type { ApiError } from "@/lib/types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// 4xx responses are client errors (auth, validation, not-found, payment-required) —
// retrying them just wastes battery and delays the error UI. Only retry transient
// failures (network errors, timeouts, 5xx) and cap the attempts.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as ApiError | undefined)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return failureCount < 3;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      // Exponential backoff: 0.5s, 1s, 2s … capped at 5s.
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
      staleTime: 60_000,
      // A query is only persisted while it lives in the cache. The default
      // gcTime is 5 min, which would evict it long before the 24h persistence
      // window — bump it to match maxAge so restored data survives a cold start.
      gcTime: ONE_DAY_MS,
    },
  },
});

// Persists the query cache to AsyncStorage so tracking statuses and the Pro
// entitlement survive an app restart and are readable offline. Writes are
// throttled so rapid cache churn doesn't hammer storage.
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "jasne_rq_cache_v1",
  throttleTime: 1000,
});

// Tie the cache to the app version: a new build never hydrates a cache shaped by
// older query logic — on a version bump the persisted cache is silently discarded.
const cacheBuster = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0";

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: ONE_DAY_MS,
  buster: cacheBuster,
};
