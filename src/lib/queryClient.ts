import { QueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/types";

// 4xx responses are client errors (auth, validation, not-found, payment-required) —
// retrying them just wastes battery and delays the error UI. Only retry transient
// failures (network errors, timeouts, 5xx) and cap the attempts.
function shouldRetry(failureCount: number, error: unknown): boolean {
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
    },
  },
});
