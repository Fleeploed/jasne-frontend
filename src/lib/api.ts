import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
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

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body
  });

  if (response.status === 401 || response.status === 403) {
    await supabase.auth.signOut();
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const error = new Error(detail) as ApiError;
    error.status = response.status;
    error.detail = detail;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readErrorDetail(response: Response) {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    return JSON.stringify(body.detail ?? body);
  } catch {
    return `Request failed with ${response.status}`;
  }
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
