import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  checkTracking,
  createTracking,
  listTrackings,
  stopTracking,
  type CreateTrackingInput,
} from "@/features/trackings/trackingsApi";
import { TRACKINGS_QUERY_KEY } from "@/features/trackings/queryKeys";
import type { Tracking, TrackingType } from "@/lib/types";

export function useTrackings(trackingType?: TrackingType) {
  const query = useQuery<Tracking[]>({
    queryKey: trackingType ? [...TRACKINGS_QUERY_KEY, trackingType] : TRACKINGS_QUERY_KEY,
    queryFn: () => listTrackings(trackingType),
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
    onSuccess: () => {
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
      queryClient.setQueriesData<Tracking[]>({ queryKey: TRACKINGS_QUERY_KEY }, (current: Tracking[] | undefined) =>
        current?.filter((item: Tracking) => item.id !== tracking.id) ?? current
      );
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
      queryClient.setQueriesData<Tracking[]>(
        { queryKey: TRACKINGS_QUERY_KEY },
        (current: Tracking[] | undefined) => {
          if (!current) return current;
          if (!updated.is_active) {
            return current.filter((item: Tracking) => item.id !== updated.id);
          }
          return current.map((item: Tracking) => (item.id === updated.id ? updated : item));
        },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: TRACKINGS_QUERY_KEY });
    },
  });
}
