import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { parseErrorBody } from "@/lib/apiErrors";
import { performSignOut, refreshSessionOnce } from "@/lib/session";
import { t } from "@/lib/i18n";
import type { ApiError } from "@/lib/types";

type JsonBody = Record<string, unknown> | unknown[];

type ApiFetchOptions = RequestInit & {
  json?: JsonBody;
  /** Overall request deadline; aborts the fetch and surfaces a network error. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...requestOptions } = options;

  let response = await sendRequest(path, requestOptions, timeoutMs);

  // An expired access token surfaces as a 401 before supabase-js gets a
  // chance to auto-refresh. Refresh once and retry before giving up; only
  // sign out when the session is truly unrecoverable.
  if (response.status === 401) {
    const refreshed = await refreshSessionOnce();
    if (refreshed) {
      response = await sendRequest(path, requestOptions, timeoutMs);
    }
    if (response.status === 401) {
      await performSignOut();
    }
  }

  if (!response.ok) {
    const error = await normalizeErrorBody(response);
    throw createApiError(response.status, error.message ?? t("common.serviceDown"), error.code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function sendRequest(
  path: string,
  options: RequestInit & { json?: JsonBody },
  timeoutMs: number
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.json !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options.signal ?? null;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort);
  }

  try {
    return await fetch(`${config.apiBaseUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body
    });
  } catch {
    // DNS failure, no connectivity, CORS/TLS, or the timeout above —
    // never reached the server (or gave up waiting for it).
    throw createApiError(0, t("common.networkError"));
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

function createApiError(status: number, message: string, code?: string): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.detail = message;
  error.code = code;
  return error;
}

/**
 * Returns a user-facing error message for a non-OK JSON response. Delegates the
 * shape parsing to the shared `parseErrorBody`; for the JSON API the catch-all
 * fallback is the same localized "service is down" message.
 */
async function normalizeErrorBody(response: Response) {
  const text = response.status >= 500 ? "" : await response.text().catch(() => "");
  return parseErrorBody(response.status, text, t("common.serviceDown"));
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
