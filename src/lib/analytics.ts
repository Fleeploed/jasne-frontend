type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: string, props: AnalyticsProps = {}) {
  if (__DEV__) {
    console.log("[analytics]", name, props);
  }
}
