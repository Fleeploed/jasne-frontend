import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { authHeaders } from "@/lib/api";
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
};

export async function streamPost({ path, body, onMessage }: StreamOptions) {
  const headers = await authHeaders();
  await streamPostWithXhr(path, body, headers, onMessage);
}

async function streamPostWithXhr(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  onMessage: (message: SseMessage) => void
) {
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let seenLength = 0;
    let buffer = "";

    request.open("POST", `${config.apiBaseUrl}${path}`);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));

    request.onreadystatechange = () => {
      if (request.readyState === XMLHttpRequest.HEADERS_RECEIVED && request.status >= 400) {
        request.abort();
        void handleHttpError(request.status, request.responseText).then(reject);
      }
    };

    request.onprogress = () => {
      if (request.status >= 400) return;
      const nextText = request.responseText.slice(seenLength);
      seenLength = request.responseText.length;
      buffer = consumeSseText(buffer + nextText, onMessage);
    };

    request.onload = () => {
      if (request.status === 0) {
        reject(new Error(t("common.networkStream", { status: 0 })));
        return;
      }
      if (request.status >= 400) {
        void handleHttpError(request.status, request.responseText).then(reject);
        return;
      }

      const nextText = request.responseText.slice(seenLength);
      buffer = consumeSseText(buffer + nextText, onMessage);
      const tail = parseSseChunk(buffer);
      if (tail) onMessage(tail);
      resolve();
    };

    request.onerror = () => reject(new Error("Network error while streaming response."));
    request.ontimeout = () => reject(new Error("Streaming request timed out."));
    request.send(JSON.stringify(body));
  });
}

function consumeSseText(text: string, onMessage: (message: SseMessage) => void) {
  const chunks = text.split("\n\n");
  const rest = chunks.pop() ?? "";
  for (const chunk of chunks) {
    const parsed = parseSseChunk(chunk);
    if (parsed) onMessage(parsed);
  }
  return rest;
}

function parseSseChunk(chunk: string): SseMessage | null {
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
  if (status === 401 || status === 403) {
    await supabase.auth.signOut();
  }

  const detail = readErrorDetail(status, responseText);
  const error = new Error(detail) as ApiError;
  error.status = status;
  error.detail = detail;
  return error;
}

function readErrorDetail(status: number, responseText: string) {
  try {
    const body = JSON.parse(responseText) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : JSON.stringify(body);
  } catch {
    return t("common.networkStream", { status });
  }
}
