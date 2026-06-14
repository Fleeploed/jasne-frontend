import { useEffect, useRef, useState } from "react";

import { streamChat } from "@/features/chat/chatApi";
import { t } from "@/lib/i18n";

import type { UiMessage } from "./chatData";

/**
 * Owns the chat answer stream: the message list, the composer input, and the
 * optimistic send → SSE token flush → reconcile flow. The screen still owns the
 * initial load (scan/messages/limits) and feeds the result in via
 * `initialMessages` + `setMessages`; on a completed answer the hook reports the
 * remaining question budget back through `onAnswered`.
 */
export function useChatStream({
  scanId,
  initialMessages,
  setError,
  onAnswered,
}: {
  scanId: string | undefined;
  initialMessages: UiMessage[];
  setError: (error: string | null) => void;
  onAnswered: (questionsRemaining: number | undefined) => void;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  // Cancels the in-flight answer stream when the user leaves the screen.
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  function removeEmptyLocalAssistant(messageId: string) {
    setMessages((current) =>
      current.filter((message) => message.id !== messageId || message.content.trim().length > 0)
    );
  }

  async function ask() {
    const trimmed = question.trim();
    if (!trimmed || !scanId) return;

    setQuestion("");
    setStreaming(true);
    setError(null);

    const localUser: UiMessage = {
      id: `local-user-${Date.now()}`,
      scan_id: scanId,
      role: "user",
      content: trimmed,
      message_type: "text",
      created_at: new Date().toISOString()
    };
    const localAssistant: UiMessage = {
      id: `local-assistant-${Date.now()}`,
      scan_id: scanId,
      role: "assistant",
      content: "",
      message_type: "text",
      created_at: new Date().toISOString(),
      pending: true
    };

    setMessages((current) => [...current, localUser, localAssistant]);

    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    // Tokens arrive far faster than the UI needs to update — re-rendering the
    // whole message list per token causes visible jank on long threads.
    // Buffer them and flush at most ~12 times per second.
    let tokenBuffer = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushTokens = () => {
      flushTimer = null;
      if (!tokenBuffer) return;
      const text = tokenBuffer;
      tokenBuffer = "";
      setMessages((current) =>
        current.map((message) =>
          message.id === localAssistant.id ? { ...message, content: message.content + text } : message
        )
      );
    };

    try {
      await streamChat(scanId, trimmed, (event) => {
        if (event.type === "token") {
          tokenBuffer += event.text;
          if (!flushTimer) flushTimer = setTimeout(flushTokens, 80);
        }
        if (event.type === "error") {
          flushTokens();
          setError(event.detail);
          removeEmptyLocalAssistant(localAssistant.id);
        }
        if (event.type === "done") {
          setMessages((current) => {
            const withoutLocal = current.filter((message) => message.id !== localUser.id && message.id !== localAssistant.id);
            return [...withoutLocal, ...(event.userMessage ? [event.userMessage] : [localUser]), ...(event.assistantMessage ? [event.assistantMessage] : [localAssistant])];
          });
          onAnswered(event.questionsRemaining);
        }
      }, abortController.signal);
    } catch (chatError) {
      // Deliberate cancellation (screen unmount) — nothing to surface.
      if (!abortController.signal.aborted) {
        flushTokens();
        setError(chatError instanceof Error ? chatError.message : t("chat.answerError"));
        removeEmptyLocalAssistant(localAssistant.id);
      }
    } finally {
      if (flushTimer) clearTimeout(flushTimer);
      flushTokens();
      if (streamAbortRef.current === abortController) streamAbortRef.current = null;
      setStreaming(false);
    }
  }

  return { messages, setMessages, question, setQuestion, streaming, ask };
}
