import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { usePathname } from "expo-router";

import { normalizeAnalyticsScreen, trackEvent, trackScreenView } from "@/lib/analytics";

export function AnalyticsRouteTracker() {
  const pathname = usePathname();
  const lastPathnameRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!pathname || lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    trackScreenView(pathname);
  }, [pathname]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (previousState === nextState) return;

      if (nextState === "background" || nextState === "inactive") {
        trackEvent("app_backgrounded", {
          screen: lastPathnameRef.current ? normalizeAnalyticsScreen(lastPathnameRef.current) : "unknown",
        });
        return;
      }

      if (nextState === "active" && previousState !== "active") {
        trackEvent("app_foregrounded", {
          screen: lastPathnameRef.current ? normalizeAnalyticsScreen(lastPathnameRef.current) : "unknown",
        });
      }
    });

    return () => subscription.remove();
  }, []);

  return null;
}
