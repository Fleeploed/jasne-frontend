import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createOampTracking,
  deleteOampTracking,
  listOampTrackings,
  type OampTrackingResponse,
} from "@/features/oamp/trackingApi";

export function useOampTracking(cisloJednaci: string) {
  const aliveRef = useRef(true);
  const normalized = useMemo(() => normalizeCisloJednaci(cisloJednaci), [cisloJednaci]);
  const [tracking, setTracking] = useState<OampTrackingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!normalized) {
      setTracking(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listOampTrackings();
      if (!aliveRef.current) return;
      setTracking(rows.find((row) => normalizeCisloJednaci(row.cislo_jednaci) === normalized) ?? null);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : null);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [normalized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enableTracking = useCallback(async () => {
    if (!normalized || mutating) return null;
    setMutating(true);
    setError(null);
    try {
      const next = await createOampTracking(normalized);
      if (aliveRef.current) setTracking(next);
      return next;
    } catch (err) {
      if (aliveRef.current) setError(err instanceof Error ? err.message : null);
      throw err;
    } finally {
      if (aliveRef.current) setMutating(false);
    }
  }, [mutating, normalized]);

  const disableTracking = useCallback(async () => {
    const id = tracking?.id;
    if (!id || mutating) return;
    setMutating(true);
    setError(null);
    try {
      await deleteOampTracking(id);
      if (aliveRef.current) setTracking(null);
    } catch (err) {
      if (aliveRef.current) setError(err instanceof Error ? err.message : null);
      throw err;
    } finally {
      if (aliveRef.current) setMutating(false);
    }
  }, [mutating, tracking?.id]);

  return {
    disableTracking,
    enableTracking,
    error,
    isTracking: Boolean(tracking),
    loading,
    mutating,
    refresh,
    tracking,
  };
}

function normalizeCisloJednaci(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/^0AM/, "OAM");
}
