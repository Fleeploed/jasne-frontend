import { t } from "@/lib/i18n";

export type NormalizedError = {
  message: string;
  code?: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Turns a raw HTTP error body into a user-facing message (and optional code).
 *
 * Shared by the JSON fetch wrapper (`api.ts`) and the SSE stream (`sse.ts`) so
 * both collapse the same shapes identically:
 *   - FastAPI: `{ "detail": "..." }` or `{ "detail": { "message", "code" } }`
 *   - Platform proxies (Railway, fly.io): `{ status, code, message, request_id }`
 *     when the upstream app is missing/asleep — never surfaced raw to the UI.
 *   - 5xx, empty, or unparseable bodies → a single localized "service down".
 *
 * `fallback` is what to show when the body parsed but matched none of the known
 * shapes; callers pick it (JSON → "service down", SSE → "stream failed").
 */
export function parseErrorBody(status: number, text: string, fallback: string): NormalizedError {
  if (status >= 500) return { message: t("common.serviceDown") };
  if (!text) return { message: t("common.serviceDown") };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { message: t("common.serviceDown") };
  }

  if (!isRecord(parsed)) return { message: t("common.serviceDown") };

  if (typeof parsed.detail === "string") return { message: parsed.detail };
  if (isRecord(parsed.detail) && typeof parsed.detail.message === "string") {
    return {
      message: parsed.detail.message,
      code: typeof parsed.detail.code === "string" ? parsed.detail.code : undefined,
    };
  }

  if (parsed.status === "error" && "code" in parsed) {
    return { message: t("common.serviceDown") };
  }

  return { message: fallback };
}
