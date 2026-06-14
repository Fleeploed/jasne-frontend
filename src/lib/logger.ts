import * as Sentry from "@sentry/react-native";

/**
 * Thin logging wrapper. In development everything goes to the console. In
 * production the console stays quiet and we instead leave Sentry breadcrumbs
 * (info/warn) so the trail is attached to any later crash; genuine errors are
 * captured as exceptions.
 *
 * `debug` is dev-only and never reaches Sentry — use it for high-frequency or
 * verbose output (e.g. per-event analytics) that would otherwise flood the
 * breadcrumb ring buffer.
 */

type Args = readonly unknown[];

function messageFrom(args: Args): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function errorFrom(args: Args): Error | undefined {
  return args.find((arg): arg is Error => arg instanceof Error);
}

export const logger = {
  debug(...args: Args) {
    if (__DEV__) console.debug(...args);
  },
  info(...args: Args) {
    if (__DEV__) {
      console.info(...args);
      return;
    }
    Sentry.addBreadcrumb({ level: "info", message: messageFrom(args) });
  },
  warn(...args: Args) {
    if (__DEV__) {
      console.warn(...args);
      return;
    }
    Sentry.addBreadcrumb({ level: "warning", message: messageFrom(args) });
  },
  error(...args: Args) {
    if (__DEV__) {
      console.error(...args);
      return;
    }
    const error = errorFrom(args);
    if (error) {
      Sentry.captureException(error, { extra: { detail: messageFrom(args) } });
    } else {
      Sentry.captureMessage(messageFrom(args), "error");
    }
  },
};
