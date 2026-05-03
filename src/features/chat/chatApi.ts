import { apiFetch } from "@/lib/api";
import { t } from "@/lib/i18n";
import { streamPost } from "@/lib/sse";
import type { ScanMessage } from "@/lib/types";

export type ChatStreamEvent =
  | { type: "token"; text: string }
  | { type: "done"; userMessage?: ScanMessage; assistantMessage?: ScanMessage; questionsRemaining?: number }
  | { type: "error"; detail: string };

export async function listMessages(scanId: string) {
  return apiFetch<ScanMessage[]>(`/scans/${scanId}/chat`);
}

export async function streamChat(scanId: string, question: string, onEvent: (event: ChatStreamEvent) => void) {
  await streamPost({
    path: `/scans/${scanId}/chat/stream`,
    body: { question },
    onMessage: ({ event, data }) => {
      if (event === "token" && isRecord(data)) {
        onEvent({ type: "token", text: typeof data.text === "string" ? data.text : "" });
      }
      if (event === "done" && isRecord(data)) {
        onEvent({
          type: "done",
          userMessage: isRecord(data.user_message) ? (data.user_message as ScanMessage) : undefined,
          assistantMessage: isRecord(data.assistant_message) ? (data.assistant_message as ScanMessage) : undefined,
          questionsRemaining:
            typeof data.questions_remaining === "number" ? data.questions_remaining : undefined
        });
      }
      if (event === "error" && isRecord(data)) {
        onEvent({ type: "error", detail: typeof data.detail === "string" ? data.detail : t("chat.answerError") });
      }
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
