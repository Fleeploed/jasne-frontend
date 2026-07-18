import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBar, BackButton, ErrorText, Screen, typeStyles, useColors } from "@/components/ui";
import { PaywallSheet } from "@/components/PaywallSheet";
import { listMessages } from "@/features/chat/chatApi";
import { getChatCache, getChatCacheSync, setChatCache } from "@/features/chat/chatThreadCache";
import type { ChatCacheEntry } from "@/features/chat/chatThreadCache";
import { listAllDeadlines } from "@/features/deadlines/deadlinesApi";
import { getLimits, getScan } from "@/features/scans/scansApi";
import { getPendingScanById, removePendingScanById, subscribePendingScan } from "@/features/scans/pendingScanStore";
import type { PendingAttachment, PendingScanRecord } from "@/features/scans/pendingScanStore";
import { t } from "@/lib/i18n";
import type { DeadlineResponse, LimitsResponse, ScanResponse } from "@/lib/types";
import { createStyles } from "@/features/chat/components/chatStyles";
import { chatScrollOffsets, formatPendingScanError, isInitialImageMessage, mergeDeadlineLists, orderInitialScanMessages, syncAnalysisDeadlines } from "@/features/chat/components/chatData";
import type { UiMessage } from "@/features/chat/components/chatData";
import { SkeletonResultCard } from "@/features/chat/components/ResultCard";
import { MessageBubble, PendingAttachmentBubble } from "@/features/chat/components/MessageBubble";
import { ChatComposer, LockedChatComposer } from "@/features/chat/components/ChatComposer";
import { ImageViewerModal } from "@/features/chat/components/ImageViewerModal";
import { useChatStream } from "@/features/chat/components/useChatStream";

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
  const [existingDeadlines, setExistingDeadlines] = useState<DeadlineResponse[]>(cachedEntry?.deadlines ?? []);
  const [deadlinesReady, setDeadlinesReady] = useState(Boolean(cachedEntry?.deadlines));
  // Pending mode is used when ChatThreadScreen is mounted with a localId
  // (either prop from NewScanScreen or ?pending=<localId> from the pending card).
  const initialPending = Boolean(pendingId);
  const [loading, setLoading] = useState(!initialPending && !cachedEntry);
  const [showPaywall, setShowPaywall] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [error, setError] = useState<string | null>(initialPending ? formatPendingScanError(pendingSnapshot?.error ?? null) : null);
  const [pendingActive, setPendingActive] = useState(pendingSnapshot?.active ?? false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>(pendingSnapshot?.attachments ?? []);
  const [pendingProgress, setPendingProgress] = useState<string[]>(pendingSnapshot?.progress ?? []);
  const isPending = initialPending && !scan;
  const scanId = isPending ? "pending" : params.id;

  // Chat answer stream — owns the message list, composer input, and the
  // optimistic send → SSE flow. Initial load below feeds it via setMessages.
  const { messages, setMessages, question, setQuestion, streaming, ask, stop } = useChatStream({
    scanId,
    initialMessages: cachedEntry?.messages ?? [],
    setError,
    onAnswered: (questionsRemaining) =>
      setLimits((current) =>
        current && typeof questionsRemaining === "number"
          ? { ...current, questions_used_for_scan: current.max_questions_per_scan - questionsRemaining }
          : current
      ),
  });

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

  const refreshCurrentLimits = useCallback(() => {
    const targetId = scan?.id ?? (!initialPending ? params.id : undefined);
    if (!targetId) return;
    void getLimits(targetId)
      .then((nextLimits) => {
        setLimits(nextLimits);
        const entry = getChatCacheSync(targetId);
        if (entry) setChatCache(targetId, { ...entry, limits: nextLimits });
      })
      .catch(() => {});
  }, [initialPending, params.id, scan?.id]);

  // Manual stop of an in-flight answer stream. The backend may have already
  // counted the question before cancellation, so resync limits right after.
  const handleStopStreaming = useCallback(() => {
    stop();
    refreshCurrentLimits();
  }, [refreshCurrentLimits, stop]);

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
        const [nextScan, nextMessages, nextLimits, nextDeadlines] = await Promise.all([
          getScan(targetId),
          listMessages(targetId),
          getLimits(targetId),
          listAllDeadlines(false),
        ]);
        if (!alive) return;
        serverHydratedRef.current = true;
        setScan(nextScan);
        setMessages(nextMessages);
        setLimits(nextLimits);
        setExistingDeadlines(nextDeadlines);
        setDeadlinesReady(true);
        setChatCache(targetId, { scan: nextScan, messages: nextMessages, limits: nextLimits, deadlines: nextDeadlines });
        void syncAnalysisDeadlines(nextScan, nextDeadlines).then((created) => {
          if (!alive || !created.length) return;
          setExistingDeadlines((current) => mergeDeadlineLists(current, created));
          const entry = getChatCacheSync(targetId);
          if (entry) {
            setChatCache(targetId, {
              ...entry,
              deadlines: mergeDeadlineLists(entry.deadlines ?? nextDeadlines, created),
            });
          }
        });
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
  }, [initialPending, params.id, setMessages]);

  // Refresh existing deadlines whenever the screen comes back into focus so
  // that deleting or completing a deadline on the Deadlines screen immediately
  // unlocks the reminder button on return.
  useFocusEffect(
    useCallback(() => {
      if (initialPending) return;
      let alive = true;
      const targetId = params.id;
      listAllDeadlines(false)
        .then((deadlines) => {
          if (!alive) return;
          setExistingDeadlines(deadlines);
          setDeadlinesReady(true);
          if (targetId) {
            const entry = getChatCacheSync(targetId);
            if (entry) setChatCache(targetId, { ...entry, deadlines });
          }
        })
        .catch(() => {});
      return () => { alive = false; };
    }, [initialPending, params.id]),
  );

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
      if (entry.deadlines) {
        setExistingDeadlines(entry.deadlines);
        setDeadlinesReady(true);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [initialPending, params.id, cachedEntry, setMessages]);

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
          const [nextScan, nextMessages, nextLimits, nextDeadlines] = await Promise.all([
            getScan(realId),
            listMessages(realId),
            getLimits(realId),
            listAllDeadlines(false),
          ]);
          if (!alive) return;
          setScan(nextScan);
          setMessages(nextMessages);
          setLimits(nextLimits);
          setExistingDeadlines(nextDeadlines);
          setDeadlinesReady(true);
          setChatCache(realId, { scan: nextScan, messages: nextMessages, limits: nextLimits, deadlines: nextDeadlines });
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
  }, [initialPending, pendingId, setMessages]);

  const displayMessages = useMemo(() => {
    const orderedMessages = orderInitialScanMessages(messages);
    const hasResultCard = orderedMessages.some((message) => message.message_type === "result_card");
    const hasImageMessage = orderedMessages.some(isInitialImageMessage);
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
      return orderInitialScanMessages(localImageMessage ? [localImageMessage, ...orderedMessages] : orderedMessages);
    }

    const resultMessage: UiMessage = {
      id: `local-result-${scan.id}`,
      scan_id: scan.id,
      role: "assistant",
      content: scan.result.summary,
      message_type: "result_card",
      created_at: scan.created_at
    };
    const sourceMessages = orderInitialScanMessages(localImageMessage ? [localImageMessage, ...orderedMessages] : orderedMessages);
    const firstImageIndex = sourceMessages.findIndex(isInitialImageMessage);

    if (firstImageIndex === -1) return [resultMessage, ...sourceMessages];

    return [
      ...sourceMessages.slice(0, firstImageIndex + 1),
      resultMessage,
      ...sourceMessages.slice(firstImageIndex + 1)
    ];
  }, [messages, pendingAttachments, scan]);

  const handleReminderCreated = useCallback((created: DeadlineResponse) => {
    setExistingDeadlines((current) => mergeDeadlineLists(current, [created]));
    setDeadlinesReady(true);
    const targetId = created.scan_id ?? scan?.id ?? params.id ?? null;
    if (!targetId) return;
    const entry = getChatCacheSync(targetId);
    if (entry) {
      setChatCache(targetId, {
        ...entry,
        deadlines: mergeDeadlineLists(entry.deadlines ?? existingDeadlines, [created]),
      });
    }
  }, [existingDeadlines, params.id, scan?.id]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandBlue} />
        </View>
      </Screen>
    );
  }

  const questionsUsed = limits?.questions_used_for_scan ?? 0;
  const questionsMax = limits?.max_questions_per_scan ?? 0;
  const noQuestionsLeft = questionsMax <= 0 || questionsUsed >= questionsMax;
  const chatDisabled = streaming || isPending || Boolean(limits && noQuestionsLeft);
  const canSend = question.trim().length > 0 && !chatDisabled;

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
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                scan={scan}
                plan={limits?.plan ?? "free"}
                existingDeadlines={existingDeadlines}
                deadlinesReady={deadlinesReady}
                onReminderCreated={handleReminderCreated}
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
                onStop={handleStopStreaming}
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
      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchase={refreshCurrentLimits}
      />
    </Screen>
  );
}
