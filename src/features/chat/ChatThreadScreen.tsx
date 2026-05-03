import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar, Button, ErrorText, Field, IconButton, Screen, colors } from "@/components/ui";
import { listMessages, streamChat } from "@/features/chat/chatApi";
import { getLimits, getScan } from "@/features/scans/scansApi";
import { formatLocalizedDate, t } from "@/lib/i18n";
import type { LimitsResponse, ScanMessage, ScanResponse } from "@/lib/types";

type UiMessage = ScanMessage | {
  id: string;
  scan_id: string;
  role: "assistant";
  content: string;
  message_type: "text";
  created_at: string;
  pending: true;
};

export function ChatThreadScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const scanId = params.id;
  const insets = useSafeAreaInsets();
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [limits, setLimits] = useState<LimitsResponse | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<UiMessage>>(null);

  const load = useCallback(async () => {
    if (!scanId) return;
    setError(null);
    try {
      const [nextScan, nextMessages, nextLimits] = await Promise.all([getScan(scanId), listMessages(scanId), getLimits(scanId)]);
      setScan(nextScan);
      setMessages(nextMessages);
      setLimits(nextLimits);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("chat.loadError"));
    } finally {
      setLoading(false);
    }
  }, [scanId]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayMessages = useMemo(() => {
    if (!scan?.result || messages.some((message) => message.message_type === "result_card")) {
      return messages;
    }

    const resultMessage: UiMessage = {
      id: `local-result-${scan.id}`,
      scan_id: scan.id,
      role: "assistant",
      content: scan.result.summary,
      message_type: "result_card",
      created_at: scan.created_at
    };
    const firstImageIndex = messages.findIndex((message) => message.message_type === "image");

    if (firstImageIndex === -1) return [resultMessage, ...messages];

    return [
      ...messages.slice(0, firstImageIndex + 1),
      resultMessage,
      ...messages.slice(firstImageIndex + 1)
    ];
  }, [messages, scan]);

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

    try {
      await streamChat(scanId, trimmed, (event) => {
        if (event.type === "token") {
          setMessages((current) =>
            current.map((message) =>
              message.id === localAssistant.id ? { ...message, content: message.content + event.text } : message
            )
          );
        }
        if (event.type === "error") {
          setError(event.detail);
          removeEmptyLocalAssistant(localAssistant.id);
        }
        if (event.type === "done") {
          setMessages((current) => {
            const withoutLocal = current.filter((message) => message.id !== localUser.id && message.id !== localAssistant.id);
            return [...withoutLocal, ...(event.userMessage ? [event.userMessage] : [localUser]), ...(event.assistantMessage ? [event.assistantMessage] : [localAssistant])];
          });
          setLimits((current) =>
            current && typeof event.questionsRemaining === "number"
              ? { ...current, questions_used_for_scan: current.max_questions_per_scan - event.questionsRemaining }
              : current
          );
        }
      });
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : t("chat.answerError"));
      removeEmptyLocalAssistant(localAssistant.id);
    } finally {
      setStreaming(false);
    }
  }

  function removeEmptyLocalAssistant(messageId: string) {
    setMessages((current) =>
      current.filter((message) => message.id !== messageId || message.content.trim().length > 0)
    );
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const questionsUsed = limits?.questions_used_for_scan ?? 0;
  const questionsMax = limits?.max_questions_per_scan ?? 0;
  const noQuestionsLeft = questionsMax <= 0 || questionsUsed >= questionsMax;
  const chatDisabled = streaming || Boolean(limits && noQuestionsLeft);

  return (
    <Screen>
      <AppBar title={t("chat.title")} left={<IconButton label={t("common.back")} onPress={() => router.back()} />} />
      <View style={styles.wrap}>
        <FlatList
          ref={listRef}
          style={styles.list}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.messages, { paddingBottom: Math.max(insets.bottom, 0) + 104 }]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => <MessageBubble message={item} scan={scan} />}
        />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={styles.footerHost}>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            {limits && noQuestionsLeft ? (
              <Text style={styles.warning}>{t("chat.proWarning")}</Text>
            ) : null}
            <ErrorText message={error} />
            <View style={styles.inputRow}>
              <View style={styles.inputWrap}>
                <Field value={question} onChangeText={setQuestion} placeholder={t("chat.placeholder")} />
              </View>
              <Button title={streaming ? t("chat.reading") : t("chat.send")} onPress={ask} disabled={!question.trim() || chatDisabled} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );
}

function ResultCard({ scan }: { scan: ScanResponse }) {
  const result = scan.result;
  if (!result) return null;

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <View style={styles.resultIcon}>
          <Text style={styles.resultIconText}>DOC</Text>
        </View>
        <View style={styles.resultHeaderText}>
          <Text style={styles.docKind}>{result.document_type_cz ?? scan.category ?? t("common.document")}</Text>
          {result.sender ? <Text style={styles.docFrom}>{result.sender}</Text> : null}
        </View>
        {result.deadlines[0] ? <Text style={styles.urgencyPill}>{deadlineDistance(result.deadlines[0].date)}</Text> : null}
      </View>
      <Text style={styles.resultTitle}>{result.document_type_localized ?? result.document_type ?? scan.doc_type ?? t("common.document")}</Text>
      <Text style={styles.resultSummary}>{result.summary}</Text>
      {result.deadlines[0] ? (
        <View style={styles.deadlineCallout}>
          <Text style={styles.deadlineDate}>{formatDeadlineDate(result.deadlines[0].date)}</Text>
          <Text style={styles.deadlineLabel}>{result.deadlines[0].description}</Text>
        </View>
      ) : null}
      {result.actions_required.length ? <Text style={styles.sectionTitle}>{t("chat.actions")}</Text> : null}
      {result.actions_required.map((action, index) => (
        <View key={`${action}-${index}`} style={styles.actionRow}>
          <View style={styles.actionIndex}>
            <Text style={styles.actionIndexText}>{index + 1}</Text>
          </View>
          <Text style={styles.resultLine}>{action}</Text>
        </View>
      ))}
      {result.deadlines.length ? <Text style={styles.sectionTitle}>{t("chat.deadlines")}</Text> : null}
      {result.deadlines.map((deadline, index) => (
        <View key={`${deadline.date}-${index}`} style={styles.deadlineRow}>
          <Text style={styles.deadlineRowDate}>{formatDeadlineDate(deadline.date)}</Text>
          <Text style={styles.deadlineRowText}>{deadline.description}</Text>
        </View>
      ))}
      {result.where_to_go ? <Text style={styles.placeLine}>{t("chat.whereToGo", { value: result.where_to_go })}</Text> : null}
      {result.documents_needed.length ? <Text style={styles.placeLine}>{t("chat.documentsNeeded", { value: result.documents_needed.join(", ") })}</Text> : null}
      {result.penalty ? <Text style={styles.penalty}>{t("chat.penalty", { value: result.penalty })}</Text> : null}
      {result.tips ? <Text style={styles.verifyNote}>{result.tips}</Text> : null}
    </View>
  );
}

function MessageBubble({ message, scan }: { message: UiMessage; scan: ScanResponse | null }) {
  const isUser = message.role === "user";
  if (message.message_type === "result_card") {
    return scan ? <ResultCard scan={scan} /> : null;
  }
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      <Text style={[styles.bubbleText, isUser && styles.userText]}>
        {message.message_type === "image" ? t("chat.uploadedDocument") : message.content || t("chat.thinking")}
      </Text>
    </View>
  );
}

function formatDeadlineDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatLocalizedDate(parsed, { day: "numeric", month: "long", year: "numeric" });
}

function deadlineDistance(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return t("common.deadline");
  const diffDays = Math.ceil((parsed.getTime() - Date.now()) / 86_400_000);
  if (diffDays < 0) return t("common.overdue");
  if (diffDays === 0) return t("common.today");
  if (diffDays === 1) return t("common.tomorrow");
  if (diffDays < 7) return t("common.inDays", { count: diffDays });
  return t("common.deadline");
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    position: "relative"
  },
  list: {
    flex: 1
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  messages: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12
  },
  resultCard: {
    alignSelf: "flex-start",
    maxWidth: "92%",
    borderRadius: 20,
    backgroundColor: colors.surface,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 10,
    shadowColor: "#1E1B17",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  resultIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  resultIconText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900"
  },
  resultHeaderText: {
    flex: 1,
    gap: 4
  },
  docKind: {
    alignSelf: "flex-start",
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  docFrom: {
    color: colors.muted,
    fontSize: 12
  },
  urgencyPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.dangerLight,
    color: colors.dangerDark,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: "800"
  },
  resultTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28
  },
  resultSummary: {
    color: colors.muted2,
    fontSize: 17,
    lineHeight: 26
  },
  deadlineCallout: {
    backgroundColor: colors.amberLight,
    borderTopWidth: 1,
    borderTopColor: colors.amber200,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2
  },
  deadlineDate: {
    color: colors.amberDark,
    fontSize: 16,
    fontWeight: "800"
  },
  deadlineLabel: {
    color: colors.amberDark,
    fontSize: 11,
    lineHeight: 15
  },
  sectionTitle: {
    color: colors.muted2,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 6
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start"
  },
  actionIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.blue100,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1
  },
  actionIndexText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700"
  },
  resultLine: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22
  },
  deadlineRow: {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    padding: 10,
    gap: 3
  },
  deadlineRowDate: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  deadlineRowText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  placeLine: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    padding: 9
  },
  penalty: {
    backgroundColor: colors.dangerLight,
    color: colors.dangerDeep,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 20
  },
  verifyNote: {
    backgroundColor: colors.blueSoft,
    color: colors.primary,
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    lineHeight: 17
  },
  bubble: {
    maxWidth: "84%",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18
  },
  bubbleText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  userText: {
    color: colors.textOnAccent
  },
  footerHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0
  },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    gap: 8
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  inputWrap: {
    flex: 1
  },
  warning: {
    color: colors.pro,
    backgroundColor: colors.proLight,
    padding: 10,
    borderRadius: 12,
    fontSize: 13,
    fontWeight: "600"
  }
});
