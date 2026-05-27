import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View, type DimensionValue, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type TextStyle } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LinearGradient } from "expo-linear-gradient";

import { AppBar, BackButton, ErrorText, Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PaywallSheet } from "@/components/PaywallSheet";
import { listMessages, streamChat } from "@/features/chat/chatApi";
import {
  type ChatCacheEntry,
  getChatCache,
  getChatCacheSync,
  setChatCache,
} from "@/features/chat/chatThreadCache";
import { createManualDeadline, listAllDeadlines } from "@/features/deadlines/deadlinesApi";
import { getLimits, getScan, getScanImageUrls } from "@/features/scans/scansApi";
import {
  type PendingAttachment,
  type PendingScanRecord,
  getPendingScanById,
  removePendingScanById,
  subscribePendingScan,
} from "@/features/scans/pendingScanStore";
import { formatCategoryLabel, formatLocalizedDate, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import type { AnalysisDeadline, LimitsResponse, ScanMessage, ScanResponse } from "@/lib/types";

// In-memory cache of last scroll offset per scan id.
// Survives navigation but resets on app restart — that's fine for chat UX.
const chatScrollOffsets = new Map<string, number>();

// Signed URLs expire in 1h; cache for 50 min to keep a safety margin.
const ATTACHMENT_URL_TTL_MS = 50 * 60 * 1000;
const attachmentUrlCache = new Map<string, { urls: string[]; cachedAt: number }>();

// Scans whose analysis deadlines we already synced into the deadlines table
// this session. Prevents recreating deadlines the user has intentionally deleted.
const deadlineSyncDone = new Set<string>();

async function syncAnalysisDeadlines(scan: ScanResponse) {
  // Only run once per scan per session, and only when the analysis actually
  // produced deadlines that the scans list grouping cares about.
  if (deadlineSyncDone.has(scan.id)) return;
  const analysisDeadlines = scan.result?.deadlines ?? [];
  if (!analysisDeadlines.length) return;
  deadlineSyncDone.add(scan.id);
  try {
    const existing = await listAllDeadlines(false);
    if (existing.some((d) => d.scan_id === scan.id)) return;
    for (const d of analysisDeadlines) {
      try {
        await createManualDeadline({
          title: d.description,
          description: null,
          due_date: d.date,
          deadline_type: d.type,
          scan_id: scan.id,
        });
      } catch {
        // Skip individual failures — other deadlines for the same scan still get created.
      }
    }
  } catch {
    deadlineSyncDone.delete(scan.id);
  }
}

function getCachedAttachmentUrls(key: string): string[] | null {
  const hit = attachmentUrlCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > ATTACHMENT_URL_TTL_MS) {
    attachmentUrlCache.delete(key);
    return null;
  }
  return hit.urls;
}

type UiMessage = ScanMessage | {
  id: string;
  scan_id: string;
  role: "assistant";
  content: string;
  message_type: "text";
  created_at: string;
  pending: true;
} | {
  id: string;
  scan_id: string;
  role: "user";
  content: string;
  message_type: "local_image";
  created_at: string;
  attachments: PendingAttachment[];
};

export function ChatThreadScreen({ pendingLocalId }: { pendingLocalId?: string } = {}) {
  const params = useLocalSearchParams<{ id?: string; pending?: string }>();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Pending local-id sources, in priority order: explicit prop, URL ?pending=,
  // then null (regular scan-by-id mode).
  const pendingId = pendingLocalId ?? (params.pending && params.pending !== "1" ? params.pending : null);
  const pendingSnapshot: PendingScanRecord | null = pendingId ? getPendingScanById(pendingId) : null;

  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Hydrate from in-memory cache so revisiting a chat shows messages instantly.
  // A background refetch below keeps data fresh. If the entry is only on disk
  // (cold start), the async useEffect below will fill it in.
  const cachedEntry = !pendingId && params.id ? getChatCacheSync(params.id) : null;
  const [scan, setScan] = useState<ScanResponse | null>(cachedEntry?.scan ?? null);
  const [limits, setLimits] = useState<LimitsResponse | null>(cachedEntry?.limits ?? null);
  const [messages, setMessages] = useState<UiMessage[]>(cachedEntry?.messages ?? []);
  const [question, setQuestion] = useState("");
  // Pending mode is used when ChatThreadScreen is mounted with a localId
  // (either prop from NewScanScreen or ?pending=<localId> from the pending card).
  const initialPending = Boolean(pendingId);
  const [loading, setLoading] = useState(!initialPending && !cachedEntry);
  const [showPaywall, setShowPaywall] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(initialPending ? formatPendingScanError(pendingSnapshot?.error ?? null) : null);
  const [pendingActive, setPendingActive] = useState(pendingSnapshot?.active ?? false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>(pendingSnapshot?.attachments ?? []);
  const [pendingProgress, setPendingProgress] = useState<string[]>(pendingSnapshot?.progress ?? []);
  const isPending = initialPending && !scan;
  const scanId = isPending ? "pending" : params.id;
  const listRef = useRef<FlatList<UiMessage>>(null);
  const pendingDoneHandledRef = useRef(false);
  // Whether the FlatList already laid out its content for the first time —
  // used to distinguish initial scroll restore vs subsequent content growth.
  const initialLayoutDoneRef = useRef(false);
  // Whether the user is near the bottom of the chat — controls whether
  // a new streaming token should auto-scroll the view down.
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isAtBottomRef.current = distanceFromBottom < 80;
    if (initialLayoutDoneRef.current && scanId && scanId !== "pending") {
      chatScrollOffsets.set(scanId, contentOffset.y);
    }
  }, [scanId]);

  const handleContentSizeChange = useCallback(() => {
    if (!initialLayoutDoneRef.current) {
      initialLayoutDoneRef.current = true;
      const saved = scanId && scanId !== "pending" ? chatScrollOffsets.get(scanId) : undefined;
      if (saved !== undefined) {
        listRef.current?.scrollToOffset({ offset: saved, animated: false });
      } else {
        listRef.current?.scrollToEnd({ animated: false });
      }
      return;
    }
    // Subsequent content growth (new message / streaming token) — only follow
    // along if the user was already pinned to the bottom.
    if (isAtBottomRef.current) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [scanId]);

  // Tracks whether the server fetch has populated state, so a slower disk
  // hydrate doesn't overwrite fresh data with stale.
  const serverHydratedRef = useRef(Boolean(cachedEntry));

  useEffect(() => {
    if (initialPending || !params.id) return;
    let alive = true;
    const targetId = params.id;
    (async () => {
      setError(null);
      try {
        const [nextScan, nextMessages, nextLimits] = await Promise.all([getScan(targetId), listMessages(targetId), getLimits(targetId)]);
        if (!alive) return;
        serverHydratedRef.current = true;
        setScan(nextScan);
        setMessages(nextMessages);
        setLimits(nextLimits);
        setChatCache(targetId, { scan: nextScan, messages: nextMessages, limits: nextLimits });
        void syncAnalysisDeadlines(nextScan);
      } catch (loadError) {
        if (!alive) return;
        setError(loadError instanceof Error ? loadError.message : t("chat.loadError"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialPending, params.id]);

  // Cold-start hydrate: if there was no in-memory cache, try disk in parallel
  // with the server fetch. Whichever arrives first fills state; server always
  // wins if it returned already.
  useEffect(() => {
    if (initialPending || !params.id || cachedEntry) return;
    let alive = true;
    const targetId = params.id;
    (async () => {
      const entry: ChatCacheEntry | null = await getChatCache(targetId);
      if (!alive || !entry || serverHydratedRef.current) return;
      setScan(entry.scan);
      setMessages(entry.messages);
      setLimits(entry.limits);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [initialPending, params.id, cachedEntry]);

  // Subscribe to this specific pending scan record. When its scanId arrives,
  // load scan data IN PLACE (no navigation flash), update URL silently, and
  // remove the entry from the pending store so the card disappears from the list.
  useEffect(() => {
    if (!initialPending || !pendingId) return;
    let alive = true;
    const unsub = subscribePendingScan(async () => {
      if (!alive) return;
      const state = getPendingScanById(pendingId);
      if (!state) return;
      setPendingActive(state.active);
      setPendingAttachments([...state.attachments]);
      setPendingProgress([...state.progress]);
      if (state.error) setError(formatPendingScanError(state.error));

      if (state.scanId && !pendingDoneHandledRef.current) {
        pendingDoneHandledRef.current = true;
        const realId = state.scanId;
        try {
          const [nextScan, nextMessages, nextLimits] = await Promise.all([
            getScan(realId),
            listMessages(realId),
            getLimits(realId),
          ]);
          if (!alive) return;
          setScan(nextScan);
          setMessages(nextMessages);
          setLimits(nextLimits);
          setChatCache(realId, { scan: nextScan, messages: nextMessages, limits: nextLimits });
          removePendingScanById(pendingId);
          router.replace(`/scan/${realId}`);
        } catch (loadError) {
          if (!alive) return;
          setError(loadError instanceof Error ? loadError.message : t("chat.loadError"));
        }
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [initialPending, pendingId]);

  const displayMessages = useMemo(() => {
    const hasResultCard = messages.some((message) => message.message_type === "result_card");
    const hasImageMessage = messages.some((message) => message.message_type === "image" || message.message_type === "local_image");
    const localImageMessage: UiMessage | null = !hasImageMessage && pendingAttachments.length
      ? {
          id: `local-image-${scan?.id ?? "pending"}`,
          scan_id: scan?.id ?? "pending",
          role: "user",
          content: "",
          message_type: "local_image",
          created_at: scan?.created_at ?? new Date().toISOString(),
          attachments: pendingAttachments
        }
      : null;

    if (!scan?.result || hasResultCard) {
      return localImageMessage ? [localImageMessage, ...messages] : messages;
    }

    const resultMessage: UiMessage = {
      id: `local-result-${scan.id}`,
      scan_id: scan.id,
      role: "assistant",
      content: scan.result.summary,
      message_type: "result_card",
      created_at: scan.created_at
    };
    const sourceMessages = localImageMessage ? [localImageMessage, ...messages] : messages;
    const firstImageIndex = sourceMessages.findIndex((message) => message.message_type === "image" || message.message_type === "local_image");

    if (firstImageIndex === -1) return [resultMessage, ...sourceMessages];

    return [
      ...sourceMessages.slice(0, firstImageIndex + 1),
      resultMessage,
      ...sourceMessages.slice(firstImageIndex + 1)
    ];
  }, [messages, pendingAttachments, scan]);

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
  const chatDisabled = streaming || isPending || Boolean(limits && noQuestionsLeft);
  const canSend = question.trim().length > 0 && !chatDisabled;
  const displayQuestionLimit = questionsMax > 0 ? questionsMax : 10;

  return (
    <Screen>
      <AppBar title={scan?.result?.document_type_cz ?? scan?.doc_type ?? t("chat.title")} titleSize={typeStyles.title3.fontSize} left={<BackButton onPress={() => router.back()} />} />
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {isPending ? (
          <ScrollView
            style={styles.pendingScroll}
            contentContainerStyle={styles.pendingWrap}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <PendingAttachmentBubble attachments={pendingAttachments} styles={styles} />
            <SkeletonResultCard progress={pendingProgress} colors={colors} styles={styles} />
            {error ? (
              <View style={styles.pendingErrorBubble}>
                <Text style={styles.pendingErrorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.list}
            data={displayMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messages}
            onContentSizeChange={handleContentSizeChange}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                scan={scan}
                colors={colors}
                styles={styles}
                onOpenViewer={(images, index) => { setViewerImages(images); setViewerIndex(index); }}
              />
            )}
          />
        )}
        <View
          style={[
            styles.footer,
            {
              paddingBottom: keyboardOpen
                ? 4
                : Platform.OS === "android"
                  ? insets.bottom
                  : Math.max(insets.bottom, 10),
            },
          ]}
        >
          {limits && noQuestionsLeft ? (
            <LockedChatComposer
              styles={styles}
              colors={colors}
              plan={limits.plan}
              questionsUsed={questionsUsed}
              questionsMax={questionsMax > 0 ? questionsMax : 10}
              onPress={limits.plan === "pro" ? undefined : () => setShowPaywall(true)}
            />
          ) : (
            <>
              {!isPending ? <ErrorText message={error} /> : null}
              <ChatComposer
                value={question}
                onChangeText={setQuestion}
                placeholder={t("chat.placeholder")}
                editable={!chatDisabled}
                streaming={streaming || (isPending && pendingActive)}
                disabled={!canSend}
                muted={isPending}
                questionsUsed={questionsUsed}
                questionsMax={questionsMax}
                onSend={ask}
                colors={colors}
                styles={styles}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
      <ImageViewerModal
        images={viewerImages}
        initialIndex={viewerIndex}
        visible={viewerImages.length > 0}
        onClose={() => setViewerImages([])}
      />
      <PaywallSheet visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </Screen>
  );
}

function ResultCard({ scan, colors, styles }: { scan: ScanResponse; colors: ColorPalette; styles: ReturnType<typeof createStyles> }) {
  const result = scan.result;
  if (!result) return null;

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <View style={styles.resultIcon}>
          <Text style={styles.resultIconText}>DOC</Text>
        </View>
        <View style={styles.resultHeaderText}>
          <Text selectable style={styles.docKind}>{result.document_type_cz ?? formatCategoryLabel(scan.category)}</Text>
          {result.sender ? <Text selectable style={styles.docFrom}>{result.sender}</Text> : null}
        </View>
        {result.deadlines[0] ? <Text style={[styles.urgencyPill, urgencyPillColors(result.deadlines[0].date, colors)]}>{deadlineDistance(result.deadlines[0].date)}</Text> : null}

      </View>
      <Text selectable style={styles.resultTitle}>{result.document_type_cz ?? result.document_type_localized ?? formatDocTitle(result.document_type ?? scan.doc_type)}</Text>
      <Text selectable style={styles.resultSummary}>{result.summary}</Text>
      {result.actions_required.length ? <Text style={styles.sectionTitle}>{t("chat.actions")}</Text> : null}
      {result.actions_required.map((action, index) => (
        <View key={`${action}-${index}`} style={styles.actionRow}>
          <View style={styles.actionIndex}>
            <Text style={styles.actionIndexText}>{index + 1}</Text>
          </View>
          <Text selectable style={styles.resultLine}>{action}</Text>
        </View>
      ))}
      {result.deadlines.length ? <Text style={styles.sectionTitle}>{t("chat.deadlines")}</Text> : null}
      {result.deadlines.map((deadline, index) => (
        <DeadlineReminderRow
          key={`${deadline.date}-${index}`}
          deadline={deadline}
          scanId={scan.id}
          whereToGo={result.where_to_go ?? null}
          styles={styles}
          colors={colors}
        />
      ))}
      {result.where_to_go ? (
        <ResultInfoBlock
          tone="blue"
          title={t("chat.whereToGoLabel")}
          value={result.where_to_go}
          styles={styles}
        />
      ) : null}
      {result.documents_needed.length ? (
        <ResultInfoBlock
          tone="amber"
          title={t("chat.documentsNeededLabel")}
          value={result.documents_needed.join(", ")}
          styles={styles}
        />
      ) : null}
      {result.penalty ? (
        <ResultInfoBlock
          tone="danger"
          title={t("chat.penaltyLabel")}
          value={result.penalty}
          styles={styles}
        />
      ) : null}
      {result.tips ? (
        <ResultInfoBlock
          tone="green"
          title={t("chat.tipLabel")}
          value={result.tips}
          styles={styles}
        />
      ) : null}
    </View>
  );
}

function DeadlineReminderRow({
  deadline,
  scanId,
  whereToGo,
  styles,
  colors,
}: {
  deadline: AnalysisDeadline;
  scanId: string;
  whereToGo: string | null;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const showAddress = (deadline.type === "action" || deadline.type === "response") && Boolean(whereToGo);
  const time = parseTimeFromDescription(deadline.description) ?? parseTimeFromDate(deadline.date);
  const dateLabel = time ? `${formatDeadlineDate(deadline.date)} · ${time}` : formatDeadlineDate(deadline.date);

  async function handleAdd() {
    if (saved || saving) return;
    setSaving(true);
    try {
      await createManualDeadline({
        title: deadline.description,
        description: null,
        due_date: deadline.date,
        deadline_type: deadline.type,
        scan_id: scanId,
      });
      setSaved(true);
    } catch {
      // silent — user can tap again
    } finally {
      setSaving(false);
    }
  }

  return (
    <LinearGradient
      colors={["rgba(111,160,230,0.16)", "rgba(111,160,230,0.06)"]}
      style={styles.deadlineCard}
    >
      <Text style={styles.deadlineCardLabel}>{t(`deadlineType.${deadline.type}` as Parameters<typeof t>[0]).toUpperCase()}</Text>
      <Text selectable style={styles.deadlineCardDate}>{dateLabel}</Text>
      {showAddress && whereToGo ? (
        <View style={styles.deadlineCardAddress}>
          <Text style={styles.deadlineCardPin}>⊙</Text>
          <Text selectable style={styles.deadlineCardAddressText}>{whereToGo}</Text>
        </View>
      ) : null}
      <Pressable
        onPress={handleAdd}
        style={[styles.deadlineCardBtn, saved && styles.deadlineCardBtnSaved]}
        accessibilityLabel={t(saved ? "chat.reminderSaved" : "chat.createReminder")}
        disabled={saved || saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color={colors.textOnAccent} />
        ) : saved ? (
          <Text style={[styles.deadlineCardBtnText, styles.deadlineCardBtnTextSaved]}>
            {`✓  ${t("chat.reminderSaved")}`}
          </Text>
        ) : (
          <>
            <Icon name="calendar" size={16} color={colors.textOnAccent} />
            <Text style={styles.deadlineCardBtnText}>{t("chat.createReminder")}</Text>
          </>
        )}
      </Pressable>
    </LinearGradient>
  );
}

function ResultInfoBlock({ tone, title, value, styles }: {
  tone: "blue" | "amber" | "neutral" | "danger" | "green";
  title: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const toneStyle =
    tone === "blue"
      ? styles.infoBlockBlue
      : tone === "danger"
        ? styles.infoBlockDanger
        : tone === "green"
          ? styles.infoBlockGreen
          : tone === "amber"
            ? styles.infoBlockAmber
            : styles.infoBlockNeutral;
  const titleStyle =
    tone === "blue"
      ? styles.infoBlockTitleBlue
      : tone === "danger"
        ? styles.infoBlockTitleDanger
        : tone === "green"
          ? styles.infoBlockTitleGreen
          : tone === "amber"
            ? styles.infoBlockTitleAmber
            : styles.infoBlockTitleNeutral;

  return (
    <View style={[styles.infoBlock, toneStyle]}>
      <Text style={[styles.infoBlockTitle, titleStyle]}>{title}</Text>
      <Text selectable style={styles.infoBlockText}>{value}</Text>
    </View>
  );
}

function LockedChatComposer({
  styles,
  colors,
  plan,
  questionsUsed,
  questionsMax,
  onPress
}: {
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
  plan: string;
  questionsUsed: number;
  questionsMax: number;
  onPress?: () => void;
}) {
  // Free user — never had access → show upgrade CTA
  if (plan !== "pro") {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.lockedInputPill, pressed && { opacity: 0.75 }]}
      >
        <Icon name="lock-small" size={18} color={colors.muted3} />
        <Text style={styles.lockedInputText} numberOfLines={1}>
          {t("chat.proWarning")}
        </Text>
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>Pro</Text>
        </View>
      </Pressable>
    );
  }

  // Pro user exhausted quota → show counter + label
  return (
    <View style={styles.lockedComposer}>
      <Text style={styles.lockedComposerLabel}>{t("chat.questionLimitTitle")}</Text>
      <View style={[styles.lockedInputPill, { opacity: 0.72 }]}>
        <Icon name="lock-small" size={18} color={colors.muted3} />
        <Text style={styles.lockedInputText} numberOfLines={1}>
          {t("chat.questionLimitUsed", { used: questionsUsed, max: questionsMax })}
        </Text>
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>{t("chat.questionLimitBadge")}</Text>
        </View>
      </View>
    </View>
  );
}

function MessageBubble({ message, scan, colors, styles, onOpenViewer }: {
  message: UiMessage;
  scan: ScanResponse | null;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  onOpenViewer?: (images: string[], index: number) => void;
}) {
  const isUser = message.role === "user";
  if (message.message_type === "result_card") {
    return scan ? <ResultCard scan={scan} colors={colors} styles={styles} /> : null;
  }
  if (message.message_type === "image") {
    return <DocumentAttachmentBubble scanId={message.scan_id} content={message.content} colors={colors} styles={styles} onOpenViewer={onOpenViewer} />;
  }
  if (message.message_type === "local_image") {
    return <PendingAttachmentBubble attachments={message.attachments} styles={styles} onOpenViewer={onOpenViewer} />;
  }
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      {isUser ? (
        <SelectableBubbleText
          value={message.content || t("chat.thinking")}
          style={[styles.bubbleText, styles.userText]}
        />
      ) : (
        <MarkdownText content={message.content || t("chat.thinking")} styles={styles} />
      )}
    </View>
  );
}

function SelectableBubbleText({ value, style }: {
  value: string;
  style: StyleProp<TextStyle>;
}) {
  return (
    <TextInput
      value={value}
      editable={false}
      multiline
      scrollEnabled={false}
      contextMenuHidden={false}
      style={[stylesForSelectableTextInput.base, style]}
    />
  );
}

function MarkdownText({ content, styles }: {
  content: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return <SelectableBubbleText value={markdownToPlainText(content)} style={styles.bubbleText} />;
}

const stylesForSelectableTextInput = StyleSheet.create({
  base: {
    backgroundColor: "transparent",
    borderWidth: 0,
    margin: 0,
    padding: 0,
    textAlignVertical: "top",
  },
});

type MarkdownPart = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
};

function normalizeMarkdownListLine(line: string) {
  const bulletMatch = /^(\s*)[-*]\s+(.+)$/.exec(line);
  if (bulletMatch) return `${bulletMatch[1]}• ${bulletMatch[2]}`;
  return line;
}

function parseInlineMarkdown(input: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  let index = 0;

  function pushText(text: string, extra: Omit<MarkdownPart, "text"> = {}) {
    if (!text) return;
    parts.push({ text, ...extra });
  }

  while (index < input.length) {
    const nextCode = input.indexOf("`", index);
    const nextBold = input.indexOf("**", index);
    const nextLink = input.indexOf("[", index);
    const nextItalicStar = findNextSingleMarker(input, "*", index);
    const nextItalicUnderscore = findNextSingleMarker(input, "_", index);
    const candidates = [nextCode, nextBold, nextLink, nextItalicStar, nextItalicUnderscore].filter((value) => value >= 0);
    const next = candidates.length ? Math.min(...candidates) : -1;

    if (next < 0) {
      pushText(input.slice(index));
      break;
    }

    if (next > index) {
      pushText(input.slice(index, next));
      index = next;
    }

    if (input.startsWith("`", index)) {
      const end = input.indexOf("`", index + 1);
      if (end < 0) {
        pushText(input.slice(index));
        break;
      }
      pushText(input.slice(index + 1, end), { code: true });
      index = end + 1;
      continue;
    }

    if (input.startsWith("**", index)) {
      const end = input.indexOf("**", index + 2);
      if (end < 0) {
        pushText(input.slice(index));
        break;
      }
      pushText(input.slice(index + 2, end), { bold: true });
      index = end + 2;
      continue;
    }

    if (input.startsWith("[", index)) {
      const textEnd = input.indexOf("]", index + 1);
      const urlStart = textEnd >= 0 ? input.indexOf("(", textEnd + 1) : -1;
      const urlEnd = urlStart === textEnd + 1 ? input.indexOf(")", urlStart + 1) : -1;
      const href = urlEnd >= 0 ? normalizeMarkdownUrl(input.slice(urlStart + 1, urlEnd)) : null;
      if (href) {
        pushText(input.slice(index + 1, textEnd), { href });
        index = urlEnd + 1;
        continue;
      }
    }

    const marker = input[index];
    if (marker === "*" || marker === "_") {
      const end = findClosingSingleMarker(input, marker, index + 1);
      if (end >= 0) {
        pushText(input.slice(index + 1, end), { italic: true });
        index = end + 1;
        continue;
      }
    }

    pushText(input[index]);
    index += 1;
  }

  return parts.length ? parts : [{ text: input }];
}

function findNextSingleMarker(input: string, marker: "*" | "_", fromIndex: number) {
  let current = input.indexOf(marker, fromIndex);
  while (current >= 0) {
    const previousIsSame = current > 0 && input[current - 1] === marker;
    const nextIsSame = input[current + 1] === marker;
    if (!previousIsSame && !nextIsSame) return current;
    current = input.indexOf(marker, current + 1);
  }
  return -1;
}

function findClosingSingleMarker(input: string, marker: "*" | "_", fromIndex: number) {
  let current = input.indexOf(marker, fromIndex);
  while (current >= 0) {
    const previousIsSame = current > 0 && input[current - 1] === marker;
    const nextIsSame = input[current + 1] === marker;
    if (!previousIsSame && !nextIsSame) return current;
    current = input.indexOf(marker, current + 1);
  }
  return -1;
}

function normalizeMarkdownUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function markdownToPlainText(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => parseInlineMarkdown(normalizeMarkdownListLine(line)).map((part) => part.text).join(""))
    .join("\n");
}

function DocumentAttachmentBubble({ scanId, content, colors, styles, onOpenViewer }: {
  scanId: string;
  content: string;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  onOpenViewer?: (images: string[], index: number) => void;
}) {
  const paths = useMemo(() => parseStoragePaths(content), [content]);
  const pathsKey = paths.join("\n");
  const cacheKey = `${scanId}::${pathsKey}`;
  const cachedUrls = getCachedAttachmentUrls(cacheKey);
  const [signedUrls, setSignedUrls] = useState<string[]>(cachedUrls ?? []);
  const [loading, setLoading] = useState(paths.length > 0 && !cachedUrls);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const signedPaths = paths.filter(isPreviewableAttachment);

    async function loadSignedUrls() {
      if (!signedPaths.length) {
        if (alive) setLoading(false);
        return;
      }

      const cached = getCachedAttachmentUrls(cacheKey);
      if (cached) {
        if (alive) {
          setSignedUrls(cached);
          setFailed(false);
          setLoading(false);
        }
        return;
      }

      setFailed(false);
      let urls: string[] = [];

      try {
        urls = await getScanImageUrls(scanId, { renderPdf: true });
      } catch {
        const { data } = await supabase.storage.from("documents").createSignedUrls(signedPaths, 60 * 60);
        urls = data?.map((item) => item.signedUrl).filter((url): url is string => Boolean(url)) ?? [];
      }

      if (!alive) return;
      if (!urls.length) {
        setSignedUrls([]);
        setFailed(true);
      } else {
        attachmentUrlCache.set(cacheKey, { urls, cachedAt: Date.now() });
        setSignedUrls(urls);
      }
      setLoading(false);
    }

    void loadSignedUrls();
    return () => {
      alive = false;
    };
  }, [pathsKey, scanId, cacheKey]);

  const firstPath = paths[0] ?? "";
  const firstUrl = signedUrls[0];
  const firstIsPdf = isPdfPath(firstPath);
  const firstUrlIsImage = !firstIsPdf || isPreviewableImage(firstUrl ?? "") || firstUrl?.startsWith("data:image/");

  if (!paths.length) return null;

  if (loading) {
    return (
      <View style={styles.attachmentBubble}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (firstUrl && !failed && firstUrlIsImage) {
    return (
      <Pressable style={styles.imageBubble} onPress={onOpenViewer ? () => onOpenViewer(signedUrls, 0) : undefined}>
        <Image source={{ uri: firstUrl }} style={styles.sentImage} resizeMode="cover" />
        {signedUrls.length > 1 ? (
          <View style={styles.imageCountBadge}>
            <Text style={styles.imageCountText}>+{signedUrls.length - 1}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      style={styles.attachmentBubble}
      disabled={!firstUrl || !firstIsPdf}
      onPress={firstUrl && firstIsPdf ? () => void WebBrowser.openBrowserAsync(firstUrl) : undefined}
    >
      <Text style={styles.attachmentKind}>{attachmentKind(firstPath)}</Text>
      <Text style={styles.attachmentName} numberOfLines={1}>{fileNameFromPath(firstPath)}</Text>
      {paths.length > 1 ? <Text style={styles.attachmentMeta}>{paths.length} стр.</Text> : null}
    </Pressable>
  );
}

function PendingAttachmentBubble({ attachments, styles, onOpenViewer }: {
  attachments: PendingAttachment[];
  styles: ReturnType<typeof createStyles>;
  onOpenViewer?: (images: string[], index: number) => void;
}) {
  const first = attachments[0];
  if (!first) return null;

  if (isPreviewableImage(first.name) || isPreviewableImage(first.uri) || first.mimeType?.startsWith("image/")) {
    const uris = attachments.map((a) => a.uri);
    return (
      <Pressable style={styles.imageBubble} onPress={onOpenViewer ? () => onOpenViewer(uris, 0) : undefined}>
        <Image source={{ uri: first.uri }} style={styles.sentImage} resizeMode="cover" />
        {attachments.length > 1 ? (
          <View style={styles.imageCountBadge}>
            <Text style={styles.imageCountText}>+{attachments.length - 1}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.attachmentBubble}>
      <Text style={styles.attachmentKind}>{attachmentKind(first.name)}</Text>
      <Text style={styles.attachmentName} numberOfLines={1}>{first.name}</Text>
      {attachments.length > 1 ? <Text style={styles.attachmentMeta}>{attachments.length} стр.</Text> : null}
    </View>
  );
}

function parseStoragePaths(content: string) {
  return content
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function isPreviewableImage(path: string) {
  return /\.(jpe?g|png|gif|webp)$/i.test(path);
}

function isPdfPath(path: string) {
  return /\.pdf$/i.test(path);
}

function isPreviewableAttachment(path: string) {
  return isPreviewableImage(path) || isPdfPath(path);
}

function fileNameFromPath(path: string) {
  return path.split("/").pop() || "document";
}

function attachmentKind(path: string) {
  if (/\.pdf$/i.test(path)) return "PDF";
  return "DOC";
}

function ChatComposer({
  value,
  onChangeText,
  placeholder,
  editable,
  streaming,
  disabled,
  muted,
  questionsUsed,
  questionsMax,
  onSend,
  colors,
  styles,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  editable: boolean;
  streaming: boolean;
  disabled: boolean;
  muted: boolean;
  questionsUsed: number;
  questionsMax: number;
  onSend: () => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const showCounter = questionsMax > 0;

  return (
    <View style={styles.composerPill}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted2}
        editable={editable}
        autoCapitalize="sentences"
        returnKeyType="send"
        onSubmitEditing={() => {
          if (!disabled && !streaming) onSend();
        }}
        style={styles.composerInput}
      />
      {showCounter ? (
        <Text style={styles.composerCounter}>{questionsUsed}/{questionsMax}</Text>
      ) : null}
      <SendButton
        streaming={streaming}
        disabled={disabled}
        muted={muted}
        onPress={onSend}
        colors={colors}
      />
    </View>
  );
}

function SendButton({ streaming, disabled, muted = false, onPress, colors }: {
  streaming: boolean;
  disabled: boolean;
  muted?: boolean;
  onPress: () => void;
  colors: ColorPalette;
}) {
  const backgroundColor = streaming && muted ? colors.surface2 : disabled ? colors.surface2 : colors.primary;
  const iconColor = streaming && muted ? colors.muted3 : disabled ? colors.muted3 : colors.textOnAccent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || streaming}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        opacity: pressed ? 0.86 : 1,
      })}
    >
      {streaming ? (
        // Square = stop / loading indicator
        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: iconColor }} />
      ) : (
        <Text style={{ color: iconColor, fontSize: 18, lineHeight: 20, transform: [{ rotate: "-22deg" }] }}>➤</Text>
      )}
    </Pressable>
  );
}

function SkeletonResultCard({ progress, colors, styles }: {
  progress: string[];
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const shimmer = useRef(new Animated.Value(0.35)).current;
  const steps = pendingPipelineSteps();
  const activeIndex = pendingPipelineIndex(progress);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.35,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return (
    <View style={styles.pendingResultCard}>
      <View style={styles.pendingSkeletonHeader}>
        <Animated.View style={[styles.pendingSkeletonIcon, { opacity: shimmer }]} />
        <View style={styles.pendingSkeletonTitleLines}>
          <SkeletonLine width="48%" height={13} shimmer={shimmer} colors={colors} />
          <SkeletonLine width="72%" height={12} shimmer={shimmer} colors={colors} />
        </View>
      </View>

      <View style={styles.pendingSkeletonSection}>
        <SkeletonLine width="78%" height={24} shimmer={shimmer} colors={colors} />
        <SkeletonLine width="58%" height={24} shimmer={shimmer} colors={colors} />
      </View>

      <View style={styles.pendingSkeletonSection}>
        <SkeletonLine width="96%" height={16} shimmer={shimmer} colors={colors} />
        <SkeletonLine width="90%" height={16} shimmer={shimmer} colors={colors} />
        <SkeletonLine width="72%" height={16} shimmer={shimmer} colors={colors} />
      </View>

      <View style={styles.pendingProgressBlock}>
        <Text style={styles.pendingProgressTitle}>{t("scan.pipelineTitle")}</Text>
        <View style={styles.pendingSteps}>
          {steps.map((label, index) => {
            const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "waiting";
            return (
              <View key={`${label}-${index}`} style={styles.pendingStepRow}>
                <View
                  style={[
                    styles.pendingStepIcon,
                    state === "done" && styles.pendingStepIconDone,
                    state === "active" && styles.pendingStepIconActive
                  ]}
                >
                  {state === "done" ? (
                    <Text style={styles.pendingStepCheck}>✓</Text>
                  ) : state === "active" ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <View style={styles.pendingStepDot} />
                  )}
                </View>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.pendingStepText,
                    state === "done" && styles.pendingStepTextDone,
                    state === "active" && styles.pendingStepTextActive
                  ]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.pendingProgressHint}>{t("scan.pipelineHint")}</Text>
      </View>
    </View>
  );
}

function pendingPipelineSteps() {
  return [
    t("scan.pipelineUpload"),
    t("scan.pipelineRead"),
    t("scan.pipelineFind"),
    t("scan.pipelineExplain"),
    t("scan.pipelineSave")
  ];
}

function pendingPipelineIndex(progress: string[]) {
  const joined = progress.join(" ").toLowerCase();
  if (/сохраня|зберіга|uklád|saving|save|saved|ulož/.test(joined)) return 4;
  if (/summary|объяснен|пояснен|vysvět|explain|analysis|анал|explanation|prepared/.test(joined)) return 3;
  if (/срок|термін|term|deadline|risk|rag|правил|pravid|important|важн|action/.test(joined)) return 2;
  if (/ocr|чита|čtu|ctu|read|текст|text|classified|распознан|document/.test(joined)) return 1;
  return 0;
}

function SkeletonLine({ width, height, shimmer, colors }: {
  width: DimensionValue;
  height: number;
  shimmer: Animated.Value;
  colors: ColorPalette;
}) {
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: Math.max(4, height / 2),
        backgroundColor: colors.surface2,
        opacity: shimmer,
      }}
    />
  );
}

function formatDocTitle(raw?: string | null) {
  if (!raw) return t("common.document");
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseTimeFromDescription(description: string): string | null {
  const match = /\b(\d{1,2}:\d{2})\b/.exec(description);
  return match?.[1] ?? null;
}

function parseTimeFromDate(dateStr: string): string | null {
  const match = /T(\d{2}:\d{2})/.exec(dateStr);
  return match?.[1] ?? null;
}

function formatDeadlineDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatLocalizedDate(parsed, { day: "numeric", month: "long", year: "numeric" });
}

function urgencyPillColors(date: string, colors: ColorPalette) {
  const days = Math.ceil((new Date(`${date}T12:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (days < 7) return { backgroundColor: colors.dangerLight, color: colors.dangerDark };
  if (days <= 30) return { backgroundColor: colors.amberLight, color: colors.amberDark };
  return { backgroundColor: colors.greenLight, color: colors.greenDark };
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

function formatPendingScanError(message: string | null) {
  if (!message) return null;
  if (/invalid json|classifier|schema validation|truncated|maximum context|maximum tokens/i.test(message)) {
    return "Не получилось завершить распознавание. Попробуйте ещё раз — фото загружены, но ответ анализа был обрезан.";
  }
  if (/could not read document/i.test(message)) {
    return "Не получилось прочитать документ. Попробуйте более чёткое фото без бликов и обрезанных краёв.";
  }
  return message;
}

function ImageViewerModal({ images, initialIndex, visible, onClose }: {
  images: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList<string>>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setTimeout(() => {
        flatRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 50);
    }
  }, [visible, initialIndex]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <FlatList
          ref={flatRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(e) => {
            setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
          renderItem={({ item }) => (
            <ZoomableViewerImage uri={item} width={width} height={height} />
          )}
        />

        {/* Close button */}
        <Pressable
          onPress={onClose}
          style={{
            position: "absolute",
            top: insets.top + 12,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 20, lineHeight: 22, fontWeight: "300" }}>✕</Text>
        </Pressable>

        {/* Page indicator */}
        {images.length > 1 ? (
          <View style={{
            position: "absolute",
            bottom: insets.bottom + 20,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}>
            {images.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === currentIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === currentIndex ? "#fff" : "rgba(255,255,255,0.4)",
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

type ZoomRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  animated?: boolean;
};

type ZoomableScrollViewHandle = ScrollView & {
  getScrollResponder?: () => {
    scrollResponderZoomTo?: (rect: ZoomRect, animated?: boolean) => void;
  };
  scrollResponderZoomTo?: (rect: ZoomRect, animated?: boolean) => void;
};

function ZoomableViewerImage({ uri, width, height }: { uri: string; width: number; height: number }) {
  const scrollRef = useRef<ZoomableScrollViewHandle>(null);
  const lastTapRef = useRef(0);
  const [zoomed, setZoomed] = useState(false);

  function zoomTo(rect: ZoomRect) {
    const responder = scrollRef.current?.getScrollResponder?.();
    const zoom = responder?.scrollResponderZoomTo ?? scrollRef.current?.scrollResponderZoomTo;
    zoom?.({ ...rect, animated: true }, true);
  }

  function handlePress(locationX: number, locationY: number) {
    const now = Date.now();
    if (now - lastTapRef.current > 280) {
      lastTapRef.current = now;
      return;
    }

    lastTapRef.current = 0;
    if (zoomed) {
      zoomTo({ x: 0, y: 0, width, height });
      setZoomed(false);
      return;
    }

    const zoomScale = 2.6;
    const zoomWidth = width / zoomScale;
    const zoomHeight = height / zoomScale;
    zoomTo({
      x: Math.max(locationX - zoomWidth / 2, 0),
      y: Math.max(locationY - zoomHeight / 2, 0),
      width: zoomWidth,
      height: zoomHeight,
    });
    setZoomed(true);
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ width, height }}
      contentContainerStyle={{ width, height }}
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={(event) => handlePress(event.nativeEvent.locationX, event.nativeEvent.locationY)}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    list: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    pendingScroll: { flex: 1 },
    pendingWrap: {
      flexGrow: 1,
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 16,
      gap: 14
    },
    pendingResultCard: {
      alignSelf: "flex-start",
      width: "92%",
      borderTopLeftRadius: 6,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 14,
      gap: 14
    },
    pendingSkeletonHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    pendingSkeletonIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.blueSoft
    },
    pendingSkeletonTitleLines: { flex: 1, gap: 8, paddingTop: 2 },
    pendingSkeletonSection: { gap: 8 },
    pendingProgressBlock: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: 12,
      marginTop: 2,
      gap: 10
    },
    pendingProgressTitle: {
      color: colors.primary,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      letterSpacing: 2,
      textTransform: "uppercase"
    },
    pendingSteps: { gap: 8 },
    pendingStepRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    pendingStepIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center"
    },
    pendingStepIconDone: { backgroundColor: colors.greenLight },
    pendingStepIconActive: {
      backgroundColor: "transparent",
      borderWidth: 0,
      borderColor: "transparent"
    },
    pendingStepCheck: {
      color: colors.greenDark,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
    },
    pendingStepDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.muted3
    },
    pendingStepText: {
      flex: 1,
      minWidth: 0,
      color: colors.muted3,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowMeta,
    },
    pendingStepTextDone: { color: colors.muted2 },
    pendingStepTextActive: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold
    },
    pendingProgressHint: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.caption1,
      paddingTop: 2
    },
    pendingErrorBubble: {
      alignSelf: "flex-start",
      width: "92%",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.dangerDark,
      backgroundColor: colors.dangerLight,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    pendingErrorText: {
      color: colors.dangerDeep,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
    },
    messages: {
      flexGrow: 1,
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
      gap: 12
    },
    resultCard: {
      alignSelf: "flex-start",
      maxWidth: "92%",
      borderTopLeftRadius: 6,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 18,
      gap: 10,
      shadowColor: "#1E1B17",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1
    },
    resultHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    resultIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.blueSoft,
      alignItems: "center",
      justifyContent: "center"
    },
    resultIconText: { color: colors.primary, fontFamily: fonts.bodyExtraBold, ...typeStyles.caption2, fontWeight: "900" },
    resultHeaderText: { flex: 1, gap: 4 },
    docKind: {
      alignSelf: "flex-start",
      color: colors.primary,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase"
    },
    docFrom: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowMeta },
    urgencyPill: {
      alignSelf: "flex-start",
      borderRadius: 999,
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "800"
    },
    resultTitle: { color: colors.text, fontFamily: fonts.displayBold, ...typeStyles.compactTitle, fontWeight: "700" },
    resultSummary: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowSecondary },
    sectionTitle: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1.6,
      marginTop: 6
    },
    actionRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    actionIndex: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.blue100,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1
    },
    actionIndexText: { color: colors.primary, fontFamily: fonts.bodyBold, ...typeStyles.caption1, fontWeight: "700" },
    resultLine: { flex: 1, color: colors.text, fontFamily: fonts.body, ...typeStyles.rowSecondary },
    deadlineCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.blueMid,
      padding: 14,
    },
    deadlineCardLabel: {
      color: colors.primary,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "700",
      letterSpacing: 1.54,
      textTransform: "uppercase",
    },
    deadlineCardDate: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: 26,
      fontWeight: "600",
      letterSpacing: -0.52,
      marginTop: 6,
    },
    deadlineCardAddress: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      marginTop: 4,
    },
    deadlineCardPin: {
      color: colors.primary,
      fontSize: 11,
      lineHeight: 15,
    },
    deadlineCardAddressText: {
      flex: 1,
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    deadlineCardBtn: {
      marginTop: 12,
      height: 38,
      borderRadius: 10,
      backgroundColor: colors.primaryDark,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
    },
    deadlineCardBtnSaved: { backgroundColor: colors.greenLight },
    deadlineCardBtnText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    deadlineCardBtnTextSaved: { color: colors.greenDark },
    placeLine: {
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.caption1,
      backgroundColor: colors.blueSoft,
      borderRadius: 8,
      padding: 9
    },
    penalty: {
      backgroundColor: colors.dangerLight,
      color: colors.dangerDeep,
      fontFamily: fonts.body,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      ...typeStyles.rowMeta,
    },
    verifyNote: {
      backgroundColor: colors.blueSoft,
      color: colors.primary,
      fontFamily: fonts.body,
      borderRadius: 10,
      padding: 10,
      ...typeStyles.caption1,
    },
    infoBlock: {
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6
    },
    infoBlockBlue: { backgroundColor: colors.blueSoft, borderColor: colors.blueMid },
    infoBlockAmber: { backgroundColor: colors.amberLight, borderColor: colors.amber },
    infoBlockNeutral: { backgroundColor: colors.surface2, borderColor: colors.border },
    infoBlockDanger: { backgroundColor: colors.dangerLight, borderColor: colors.dangerDark },
    infoBlockGreen: { backgroundColor: colors.greenLight, borderColor: colors.greenDark },
    infoBlockTitle: {
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      letterSpacing: 1.8,
      textTransform: "uppercase"
    },
    infoBlockTitleBlue: { color: colors.primary },
    infoBlockTitleAmber: { color: colors.amberDark },
    infoBlockTitleNeutral: { color: colors.muted2 },
    infoBlockTitleDanger: { color: colors.dangerDark },
    infoBlockTitleGreen: { color: colors.greenDark },
    infoBlockText: {
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    bubble: { maxWidth: "84%", paddingHorizontal: 12, paddingVertical: 10 },
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
    bubbleText: { color: colors.text, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
    userText: { color: colors.textOnAccent },
    markdownBold: { fontFamily: fonts.bodyBold },
    markdownItalic: { fontStyle: "italic" },
    markdownCode: {
      color: colors.text,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
      fontSize: 12.5,
      lineHeight: 18,
      backgroundColor: colors.surface2,
      borderRadius: 4,
      paddingHorizontal: 3
    },
    markdownLink: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      textDecorationLine: "underline"
    },
    imageBubble: {
      alignSelf: "flex-end",
      width: 176,
      height: 236,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border
    },
    sentImage: {
      width: "100%",
      height: "100%"
    },
    imageCountBadge: {
      position: "absolute",
      right: 8,
      bottom: 8,
      minWidth: 34,
      height: 28,
      borderRadius: 14,
      paddingHorizontal: 9,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center"
    },
    imageCountText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
      fontWeight: "800"
    },
    attachmentBubble: {
      alignSelf: "flex-end",
      maxWidth: "78%",
      minWidth: 164,
      borderRadius: 18,
      borderBottomRightRadius: 4,
      backgroundColor: colors.primary,
      padding: 12,
      gap: 5
    },
    attachmentKind: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      fontWeight: "900",
      letterSpacing: 0.4
    },
    attachmentName: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowMeta,
      fontWeight: "700"
    },
    attachmentMeta: {
      color: colors.textOnAccent,
      opacity: 0.78,
      fontFamily: fonts.bodyBold,
      ...typeStyles.caption1,
      fontWeight: "700"
    },
    footer: {
      paddingHorizontal: 28,
      paddingTop: 8,
      backgroundColor: colors.bg,
      gap: 8
    },
    composerPill: {
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 18,
      paddingRight: 6,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 }
    },
    composerInput: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 17,
      paddingVertical: 0
    },
    composerCounter: {
      color: colors.muted3,
      fontFamily: fonts.body,
      ...typeStyles.caption2,
      minWidth: 24,
      textAlign: "right"
    },
    lockedComposer: {
      gap: 8
    },
    lockedComposerLabel: {
      color: colors.muted3,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      paddingHorizontal: 2
    },
    lockedInputPill: {
      minHeight: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingLeft: 16,
      paddingRight: 8
    },
    lockGlyph: {
      width: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center"
    },
    lockShackle: {
      position: "absolute",
      top: 1,
      width: 12,
      height: 10,
      borderWidth: 1.6,
      borderBottomWidth: 0,
      borderColor: colors.muted3,
      borderTopLeftRadius: 7,
      borderTopRightRadius: 7
    },
    lockBody: {
      position: "absolute",
      bottom: 2,
      width: 15,
      height: 11,
      borderWidth: 1.6,
      borderColor: colors.muted3,
      borderRadius: 3
    },
    lockedInputText: {
      flex: 1,
      minWidth: 0,
      color: colors.muted2,
      fontFamily: fonts.body,
      fontSize: 15.5,
      lineHeight: 20
    },
    proBadge: {
      minWidth: 62,
      height: 34,
      paddingHorizontal: 14,
      borderRadius: 17,
      backgroundColor: colors.proLight,
      alignItems: "center",
      justifyContent: "center"
    },
    proBadgeText: {
      color: colors.pro,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
      letterSpacing: 0.2
    }
  });
}
