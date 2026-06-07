import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { parseErrorBody } from "@/lib/apiErrors";
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

  const error = response.ok ? null : await normalizeErrorBody(response);

  if (response.status === 401 || (response.status === 403 && error?.code !== "account_pending_deletion")) {
    await supabase.auth.signOut();
  }

  if (!response.ok) {
    throw createApiError(response.status, error?.message ?? t("common.serviceDown"), error?.code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
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
