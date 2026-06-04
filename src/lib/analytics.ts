import { Platform } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import PostHog from "posthog-react-native";
import * as Sentry from "@sentry/react-native";

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsProps = Record<string, AnalyticsValue>;

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
const ANALYTICS_ENV = process.env.EXPO_PUBLIC_ANALYTICS_ENV ?? (__DEV__ ? "development" : "production");

const SENSITIVE_KEY_PATTERN =
  /(email|name|full_name|phone|address|password|token|jwt|secret|content|text|ocr|document|image|photo|file|uri|url|path|query|search|scan_id|deadline_id|user_id|case_number|cislo|rodne|birth)/i;

let initialized = false;
let posthogClient: PostHog | null = null;

export function initializeAnalytics() {
  if (initialized) return;
  initialized = true;

  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      enabled: true,
      environment: ANALYTICS_ENV,
      debug: __DEV__,
      tracesSampleRate: 0,
      beforeSend(event) {
        if (event.user) {
          event.user = event.user.id ? { id: event.user.id } : undefined;
        }
        delete event.request;
        return event;
      },
    });
    Sentry.setTag("platform", Platform.OS);
    Sentry.setTag("app_version", getAppVersion());
  }

  if (POSTHOG_KEY) {
    posthogClient = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      flushAt: 10,
      flushInterval: 30_000,
      personProfiles: "identified_only",
      customAppProperties(properties) {
        return {
          ...properties,
          app_environment: ANALYTICS_ENV,
        };
      },
    });
  } else if (__DEV__) {
    console.info("[analytics] EXPO_PUBLIC_POSTHOG_KEY is not set; PostHog disabled");
  }

  if (!SENTRY_DSN && __DEV__) {
    console.info("[analytics] EXPO_PUBLIC_SENTRY_DSN is not set; Sentry disabled");
  }
}

export function trackEvent(name: string, props: AnalyticsProps = {}) {
  const safeProps = sanitizeProps(props);

  if (__DEV__) {
    console.log("[analytics]", name, safeProps);
  }

  const client = getPostHog();
  if (client) {
    client.capture(name, safeProps);
  }

  Sentry.addBreadcrumb({
    category: "analytics",
    message: name,
    data: safeProps,
    level: "info",
  });
}

export function trackScreenView(pathname: string) {
  const screen = normalizeAnalyticsScreen(pathname);

  if (__DEV__) {
    console.log("[analytics] screen_view", { screen });
  }

  const client = getPostHog();
  if (client) {
    void client.screen(screen, { screen });
  }

  Sentry.setTag("screen", screen);
  Sentry.addBreadcrumb({
    category: "navigation",
    message: screen,
    data: { screen },
    level: "info",
  });
}

export function identifyAnalyticsUser(userId: string) {
  if (!userId) return;
  getPostHog()?.identify(userId, {
    platform: Platform.OS,
    app_version: getAppVersion(),
  });
  Sentry.setUser({ id: userId });
}

export function resetAnalyticsUser() {
  getPostHog()?.reset();
  Sentry.setUser(null);
}

export async function flushAnalytics() {
  const client = getPostHog();
  if (!client) return;
  try {
    await client.flush();
  } catch (error) {
    if (__DEV__) console.warn("[analytics] flush failed:", error);
  }
}

export function captureAppError(error: unknown, props: AnalyticsProps = {}) {
  const safeProps = sanitizeProps(props);
  getPostHog()?.captureException(error, safeProps);
  Sentry.captureException(error, { extra: safeProps });
}

function getPostHog() {
  initializeAnalytics();
  return posthogClient;
}

function sanitizeProps(props: AnalyticsProps) {
  const safe: Record<string, string | number | boolean | null> = {};
  Object.entries(props).forEach(([key, value]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) return;
    if (value === undefined) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
    }
  });
  return safe;
}

export function normalizeAnalyticsScreen(pathname: string) {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id]")
    .replace(/\/[A-Za-z0-9_-]{18,}(?=\/|$)/g, "/[id]");
}

function getAppVersion() {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    "0.0.0"
  );
}
