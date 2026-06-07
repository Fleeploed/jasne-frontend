import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  checkTracking,
  createTracking,
  listTrackings,
  stopTracking,
  type CreateTrackingInput,
} from "@/features/trackings/trackingsApi";
import { TRACKINGS_QUERY_KEY } from "@/features/trackings/queryKeys";
import type { Tracking, TrackingType } from "@/lib/types";

function trackingsQueryKey(trackingType?: TrackingType) {
  return trackingType ? [...TRACKINGS_QUERY_KEY, trackingType] as const : TRACKINGS_QUERY_KEY;
}

function dedupeTrackings(items: Tracking[]) {
  const byId = new Map<string, Tracking>();
  items.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

function cachedTrackings(queryClient: QueryClient, trackingType?: TrackingType): Tracking[] | undefined {
  const exact = queryClient.getQueryData<Tracking[]>(trackingsQueryKey(trackingType));

  if (trackingType) {
    const all = queryClient.getQueryData<Tracking[]>(TRACKINGS_QUERY_KEY);
    const fromAll = all?.filter((item) => item.tracking_type === trackingType) ?? [];
    const merged = dedupeTrackings([...(exact ?? []), ...fromAll]);
    return exact || merged.length ? merged : undefined;
  }

  const merged = queryClient
    .getQueriesData<Tracking[]>({ queryKey: TRACKINGS_QUERY_KEY })
    .flatMap(([, data]) => data ?? []);

  return exact || merged.length ? dedupeTrackings([...(exact ?? []), ...merged]) : undefined;
}

function mergeTracking(current: Tracking[] | undefined, tracking: Tracking, trackingType?: TrackingType) {
  const withoutCurrent = (current ?? []).filter((item) => item.id !== tracking.id);
  if (!tracking.is_active || (trackingType && tracking.tracking_type !== trackingType)) {
    return withoutCurrent;
  }
  return dedupeTrackings([tracking, ...withoutCurrent]);
}

function writeTrackingToCache(queryClient: QueryClient, tracking: Tracking) {
  queryClient.setQueryData<Tracking[]>(
    TRACKINGS_QUERY_KEY,
    (current: Tracking[] | undefined) => mergeTracking(current, tracking),
  );
  queryClient.setQueryData<Tracking[]>(
    trackingsQueryKey(tracking.tracking_type),
    (current: Tracking[] | undefined) => mergeTracking(current, tracking, tracking.tracking_type),
  );
}

function removeTrackingFromCache(queryClient: QueryClient, tracking: Tracking) {
  queryClient.setQueriesData<Tracking[]>(
    { queryKey: TRACKINGS_QUERY_KEY },
    (current: Tracking[] | undefined) => current?.filter((item: Tracking) => item.id !== tracking.id) ?? current,
  );
}

export function useTrackings(trackingType?: TrackingType) {
  const queryClient = useQueryClient();
  const query = useQuery<Tracking[]>({
    queryKey: trackingsQueryKey(trackingType),
    queryFn: () => listTrackings(trackingType),
    initialData: () => cachedTrackings(queryClient, trackingType),
    staleTime: 60_000,
    // Poll while any tracking is still waiting for its first background check
    // (backend creates the row with last_checked_at=null and runs the probe
    // asynchronously). 4s gives near-real-time updates without hammering the
    // API once the first check has landed.
    refetchInterval: (q) => {
      const data = q.state.data as Tracking[] | undefined;
      const anyPending = data?.some((item) => item.last_checked_at == null);
      return anyPending ? 4000 : false;
    },
  });
  const refetch = query.refetch;

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  return query;
}

export function useCreateTracking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTrackingInput) => createTracking(input),
    onSuccess: (created) => {
      writeTrackingToCache(queryClient, created);
      void queryClient.invalidateQueries({ queryKey: TRACKINGS_QUERY_KEY });
    },
  });
}

export function useStopTracking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tracking: Tracking) => stopTracking(tracking.id),
    onMutate: async (tracking) => {
      await queryClient.cancelQueries({ queryKey: TRACKINGS_QUERY_KEY });
      const previous = queryClient.getQueriesData<Tracking[]>({ queryKey: TRACKINGS_QUERY_KEY });
      removeTrackingFromCache(queryClient, tracking);
      return { previous };
    },
    onError: (_error, _tracking, context) => {
      context?.previous.forEach(([key, value]) => {
        queryClient.setQueryData(key, value);
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: TRACKINGS_QUERY_KEY });
    },
  });
}

export function useCheckTracking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tracking: Tracking) => checkTracking(tracking.id),
    onSuccess: (updated) => {
      writeTrackingToCache(queryClient, updated);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: TRACKINGS_QUERY_KEY });
    },
  });
}
