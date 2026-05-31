import { useCallback, useEffect, useRef, useState } from "react";

import { getLimits } from "@/features/scans/scansApi";
import type { UserPlan } from "@/lib/types";

export function useSubscription() {
  const aliveRef = useRef(true);
  const [plan, setPlan] = useState<UserPlan>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const limits = await getLimits();
      if (aliveRef.current) setPlan(limits.plan);
    } catch {
      if (aliveRef.current) setPlan("free");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    isPro: plan === "pro",
    loading,
    plan,
    refresh,
  };
}
