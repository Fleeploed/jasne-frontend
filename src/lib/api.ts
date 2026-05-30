import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import type { ApiError } from "@/lib/types";

type JsonBody = Record<string, unknown> | unknown[];

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(path: string, options: RequestInit & { json?: JsonBody } = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.json !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...options,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body
    });
  } catch {
    // DNS failure, no connectivity, CORS/TLS — never reached the server.
    throw createApiError(0, t("common.networkError"));
  }

  if (response.status === 401 || response.status === 403) {
    await supabase.auth.signOut();
  }

  if (!response.ok) {
    const detail = await normalizeErrorBody(response);
    throw createApiError(response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function createApiError(status: number, message: string): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.detail = message;
  return error;
}

/**
 * Returns a user-facing error message. The backend returns FastAPI shape
 * (`{ "detail": "..." }`); everything else — Railway's "Application not found",
 * a 502 from the proxy, an HTML 503 page — should collapse to a single
 * localized "service is down" message instead of leaking the raw JSON to UI.
 */
async function normalizeErrorBody(response: Response): Promise<string> {
  if (response.status >= 500) return t("common.serviceDown");

  const text = await response.text().catch(() => "");
  if (!text) return t("common.serviceDown");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return t("common.serviceDown");
  }

  if (!isRecord(parsed)) return t("common.serviceDown");

  if (typeof parsed.detail === "string") return parsed.detail;
  if (isRecord(parsed.detail) && typeof parsed.detail.message === "string") {
    return parsed.detail.message;
  }

  // Platform proxies (Railway, fly.io) return `{ status, code, message, request_id }`
  // when the upstream app is missing or asleep. From the user's perspective
  // this is identical to "server down" — never surface the raw envelope.
  if (parsed.status === "error" && "code" in parsed) {
    return t("common.serviceDown");
  }

  return t("common.serviceDown");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function authHeaders() {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Content-Type": "application/json"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
