import { config } from "@/lib/config";
import { authHeaders } from "@/lib/api";
import { parseErrorBody } from "@/lib/apiErrors";
import { recoverSessionOrSignOut } from "@/lib/session";
import { t } from "@/lib/i18n";
import type { ApiError } from "@/lib/types";

export type SseMessage = {
  event: string;
  data: unknown;
};

type StreamOptions = {
  path: string;
  body: Record<string, unknown>;
  onMessage: (message: SseMessage) => void;
  /** Aborts the underlying request; the promise rejects with an AbortError. */
  signal?: AbortSignal;
};

// A healthy stream emits at least keep-alive/status events well within this
// window; if nothing arrives we assume the connection silently died.
const STALL_TIMEOUT_MS = 60_000;

export async function streamPost({ path, body, onMessage, signal }: StreamOptions) {
  const headers = await authHeaders();
  await streamPostWithXhr(path, body, headers, onMessage, signal);
}

async function streamPostWithXhr(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  onMessage: (message: SseMessage) => void,
  signal?: AbortSignal
) {
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let seenLength = 0;
    let buffer = "";
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        request.abort();
        settleReject(new Error(t("common.streamTimeout")));
      }, STALL_TIMEOUT_MS);
    };

    function onAbort() {
      request.abort();
      const error = new Error("Aborted");
      error.name = "AbortError";
      settleReject(error);
    }

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    request.open("POST", `${config.apiBaseUrl}${path}`);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));

    // Do NOT abort on an error status at HEADERS_RECEIVED — the body carries
    // the server's error detail. Let it download and reject from onload with
    // the parsed message instead of a generic one. onprogress already skips
    // SSE parsing while status >= 400 so the error body is never mis-read.
    request.onprogress = () => {
      if (request.status >= 400) return;
      armStallTimer();
      const nextText = request.responseText.slice(seenLength);
      seenLength = request.responseText.length;
      buffer = consumeSseText(buffer + nextText, onMessage);
    };

    request.onload = () => {
      if (request.status === 0) {
        settleReject(new Error(t("common.networkStream", { status: 0 })));
        return;
      }
      if (request.status >= 400) {
        void handleHttpError(request.status, request.responseText).then(settleReject);
        return;
      }

      const nextText = request.responseText.slice(seenLength);
      buffer = consumeSseText(buffer + nextText, onMessage);
      const tail = parseSseChunk(buffer);
      if (tail) onMessage(tail);
      settleResolve();
    };

    request.onerror = () => settleReject(new Error(t("common.networkError")));
    request.ontimeout = () => settleReject(new Error(t("common.streamTimeout")));
    armStallTimer();
    request.send(JSON.stringify(body));
  });
}

export function consumeSseText(text: string, onMessage: (message: SseMessage) => void) {
  const chunks = text.split("\n\n");
  const rest = chunks.pop() ?? "";
  for (const chunk of chunks) {
    const parsed = parseSseChunk(chunk);
    if (parsed) onMessage(parsed);
  }
  return rest;
}

export function parseSseChunk(chunk: string): SseMessage | null {
  const lines = chunk.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }

  if (!dataLines.length) return null;
  const dataText = dataLines.join("\n");

  try {
    return { event, data: JSON.parse(dataText) };
  } catch {
    return { event, data: dataText };
  }
}

async function handleHttpError(status: number, responseText: string) {
  // A stream can't be transparently retried mid-flight: refresh the session
  // so the user's next attempt succeeds, and only sign out when the session
  // is unrecoverable. 403 means "no permission", not "no session" — never
  // sign out because of it.
  if (status === 401) {
    // Fire-and-forget for the same reason as api.ts: the stream rejects with
    // the error below regardless, and awaiting could deadlock if a stream
    // ever fails during a sign-out task.
    void recoverSessionOrSignOut();
  }

  const detail = parseErrorBody(status, responseText, t("common.networkStream", { status })).message;
  const error = new Error(detail) as ApiError;
  error.status = status;
  error.detail = detail;
  return error;
}
