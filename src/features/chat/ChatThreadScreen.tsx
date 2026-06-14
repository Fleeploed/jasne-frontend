import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View, type DimensionValue, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureViewer } from "react-native-gesture-image-viewer";

import { LinearGradient } from "expo-linear-gradient";

import { AppBar, BackButton, ErrorText, Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PaywallSheet } from "@/components/PaywallSheet";
import { SelectableText } from "@/components/SelectableText";
import { listMessages, streamChat } from "@/features/chat/chatApi";
import { extractOampIdentifier } from "@/features/chat/oampIdentifier";
import { OampTrackingOffer } from "@/features/chat/OampTrackingOffer";
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
import { triggerSelectionHaptic } from "@/lib/haptics";
import { formatCategoryLabel, formatLocalizedDate, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import type { AnalysisDeadline, DeadlineResponse, LimitsResponse, ScanMessage, ScanResponse, UserPlan } from "@/lib/types";

// In-memory cache of last scroll offset per scan id.
// Survives navigation but resets on app restart — that's fine for chat UX.
const chatScrollOffsets = new Map<string, number>();

// Signed URLs expire in 1h; cache for 50 min to keep a safety margin.
const ATTACHMENT_URL_TTL_MS = 50 * 60 * 1000;
const attachmentUrlCache = new Map<string, { urls: string[]; cachedAt: number }>();
const CHAT_IMAGE_CACHE_DIR = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}chat-images/` : null;
const chatImageFileCache = new Map<string, string>();
const chatImageCachePromises = new Map<string, Promise<string | null>>();

// Scans whose analysis deadlines we already synced into the deadlines table
// this session. Prevents recreating deadlines the user has intentionally deleted.
const deadlineSyncDone = new Set<string>();
const REMINDER_DAYS = [30, 14, 7, 1] as const;
const REMINDER_SHEET_HIDDEN = 900;
const REMINDER_TEXT_SCALE = 1;
const CHAT_IMAGE_VIEWER_ID = "chat-image-viewer";
// Telegram-style auto-growing composer input bounds.
const COMPOSER_MIN_INPUT_HEIGHT = 22;
const COMPOSER_MAX_INPUT_HEIGHT = 120;

type ReminderDay = typeof REMINDER_DAYS[number];

function mergeDeadlineLists(current: DeadlineResponse[], incoming: DeadlineResponse[]) {
  if (!incoming.length) return current;
  const byId = new Map(current.map((deadline) => [deadline.id, deadline]));
  incoming.forEach((deadline) => byId.set(deadline.id, deadline));
  return Array.from(byId.values());
}

async function syncAnalysisDeadlines(scan: ScanResponse, knownDeadlines?: DeadlineResponse[]): Promise<DeadlineResponse[]> {
  // Only run once per scan per session, and only when the analysis actually
  // produced deadlines that the scans list grouping cares about.
  if (deadlineSyncDone.has(scan.id)) return [];
  const analysisDeadlines = scan.result?.deadlines ?? [];
  if (!analysisDeadlines.length) return [];
  deadlineSyncDone.add(scan.id);
  try {
    const existing = knownDeadlines ?? await listAllDeadlines(false);
    if (existing.some((d) => d.scan_id === scan.id)) return [];
    const created: DeadlineResponse[] = [];
    for (const d of analysisDeadlines) {
      try {
        const deadline = await createManualDeadline({
          title: d.description,
          description: null,
          due_date: d.date,
          deadline_type: d.type,
          scan_id: scan.id,
        });
        created.push(deadline);
      } catch {
        // Skip individual failures — other deadlines for the same scan still get created.
      }
    }
    return created;
  } catch {
    deadlineSyncDone.delete(scan.id);
    return [];
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

function isRemoteImageUri(uri: string) {
  return /^https?:\/\//i.test(uri);
}

function cachedImageSource(uri: string) {
  return isRemoteImageUri(uri) ? { uri, cache: "force-cache" as const } : { uri };
}

function chatImageCacheExtension(uri: string) {
  const clean = uri.split("?", 1)[0].toLowerCase();
  if (clean.endsWith(".png")) return ".png";
  if (clean.endsWith(".gif")) return ".gif";
  if (clean.endsWith(".webp")) return ".webp";
  if (clean.endsWith(".jpeg")) return ".jpg";
  return ".jpg";
}

function hashCacheKey(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function ensureChatImageCacheDir() {
  if (!CHAT_IMAGE_CACHE_DIR) return null;
  const info = await FileSystem.getInfoAsync(CHAT_IMAGE_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CHAT_IMAGE_CACHE_DIR, { intermediates: true });
  }
  return CHAT_IMAGE_CACHE_DIR;
}

async function cacheChatImage(cacheKey: string, uri: string, index: number) {
  if (!isRemoteImageUri(uri)) return uri;

  const imageCacheKey = `${cacheKey}::${index}`;
  const memoryHit = chatImageFileCache.get(imageCacheKey);
  if (memoryHit) return memoryHit;

  const pending = chatImageCachePromises.get(imageCacheKey);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const dir = await ensureChatImageCacheDir();
      if (!dir) return null;

      const fileUri = `${dir}${hashCacheKey(imageCacheKey)}${chatImageCacheExtension(uri)}`;
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        chatImageFileCache.set(imageCacheKey, fileUri);
        return fileUri;
      }

      const result = await FileSystem.downloadAsync(uri, fileUri);
      chatImageFileCache.set(imageCacheKey, result.uri);
      return result.uri;
    } catch {
      return null;
    } finally {
      chatImageCachePromises.delete(imageCacheKey);
    }
  })();

  chatImageCachePromises.set(imageCacheKey, promise);
  return promise;
}

async function cacheChatImages(cacheKey: string, uris: string[]) {
  const cached = await Promise.all(uris.map((uri, index) => cacheChatImage(cacheKey, uri, index)));
  return uris.map((uri, index) => cached[index] ?? uri);
}

function prefetchImageUris(uris: string[]) {
  uris.forEach((uri) => {
    if (isRemoteImageUri(uri)) {
      void Image.prefetch(uri).catch(() => undefined);
    }
  });
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

function isInitialImageMessage(message: UiMessage) {
  return message.message_type === "image" || message.message_type === "local_image";
}

function orderInitialScanMessages(source: UiMessage[]) {
  const resultIndex = source.findIndex((message) => message.message_type === "result_card");
  if (resultIndex === -1) return source;

  const imageIndex = source.findIndex(isInitialImageMessage);
  if (imageIndex === -1 || imageIndex < resultIndex) return source;

  const ordered = [...source];
  const [imageMessage] = ordered.splice(imageIndex, 1);
  ordered.splice(resultIndex, 0, imageMessage);
  return ordered;
}

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
  const [existingDeadlines, setExistingDeadlines] = useState<DeadlineResponse[]>(cachedEntry?.deadlines ?? []);
  const [deadlinesReady, setDeadlinesReady] = useState(Boolean(cachedEntry?.deadlines));
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
  // Cancels the in-flight answer stream when the user leaves the screen.
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

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

  // Manual stop of an in-flight answer stream. Aborting unwinds ask()'s
  // catch/finally (keeps the partial answer, clears streaming). The backend may
  // have already counted the question before we cancelled, so resync limits.
  const handleStopStreaming = useCallback(() => {
    streamAbortRef.current?.abort();
    refreshCurrentLimits();
  }, [refreshCurrentLimits]);

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
  }, [initialPending, params.id]);

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
  }, [initialPending, pendingId]);

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
          setLimits((current) =>
            current && typeof event.questionsRemaining === "number"
              ? { ...current, questions_used_for_scan: current.max_questions_per_scan - event.questionsRemaining }
              : current
          );
        }
      }, abortController.signal);
    } catch (chatError) {
      // Deliberate cancellation (manual stop or screen unmount): keep whatever
      // tokens already arrived, just drop the bubble if nothing came through.
      if (abortController.signal.aborted) {
        flushTokens();
        removeEmptyLocalAssistant(localAssistant.id);
      } else {
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

  function removeEmptyLocalAssistant(messageId: string) {
    setMessages((current) =>
      current.filter((message) => message.id !== messageId || message.content.trim().length > 0)
    );
  }

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

function ResultCard({ scan, plan, existingDeadlines, deadlinesReady, onReminderCreated, colors, styles }: { scan: ScanResponse; plan: UserPlan; existingDeadlines: DeadlineResponse[]; deadlinesReady: boolean; onReminderCreated: (created: DeadlineResponse) => void; colors: ColorPalette; styles: ReturnType<typeof createStyles> }) {
  const result = scan.result;
  // Detect a trackable OAMP číslo jednací in the document's OCR text so we can
  // offer one-tap automatic status tracking. Hooks inside OampTrackingOffer
  // only run when an identifier is found (component is conditionally mounted).
  const oampIdentifier = useMemo(() => extractOampIdentifier(scan.ocr_text ?? ""), [scan.ocr_text]);
  if (!result) return null;

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <View style={styles.resultIcon}>
          <Text style={styles.resultIconText}>DOC</Text>
        </View>
        <View style={styles.resultHeaderText}>
          <Text style={styles.docKind}>{result.document_type_cz ?? formatCategoryLabel(scan.category)}</Text>
          {result.sender ? <Text style={styles.docFrom}>{result.sender}</Text> : null}
        </View>
        {result.deadlines[0] ? <Text style={[styles.urgencyPill, urgencyPillColors(result.deadlines[0].date, colors)]}>{deadlineDistance(result.deadlines[0].date)}</Text> : null}
      </View>
      <SelectableText style={styles.resultTitle}>{result.document_type_cz ?? result.document_type_localized ?? formatDocTitle(result.document_type ?? scan.doc_type)}</SelectableText>
      <View style={styles.summaryRow}>
        <SelectableText style={[styles.resultSummary, styles.flex1]}>{result.summary}</SelectableText>
        {result.summary ? (
          <CopyButton
            text={result.summary}
            title={result.document_type_cz ?? result.document_type_localized ?? formatDocTitle(result.document_type ?? scan.doc_type)}
            colors={colors}
            styles={styles}
            compact
          />
        ) : null}
      </View>
      {oampIdentifier ? <OampTrackingOffer identifier={oampIdentifier} plan={plan} /> : null}
      {result.actions_required.length ? (
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{t("chat.actions")}</Text>
          <CopyButton
            text={result.actions_required.map((action, index) => `${index + 1}. ${action}`).join("\n")}
            title={t("chat.actions")}
            colors={colors}
            styles={styles}
            compact
          />
        </View>
      ) : null}
      {result.actions_required.map((action, index) => (
        <View key={`${action}-${index}`} style={styles.actionRow}>
          <View style={styles.actionIndex}>
            <Text style={styles.actionIndexText}>{index + 1}</Text>
          </View>
          <SelectableText style={styles.resultLine}>{action}</SelectableText>
        </View>
      ))}
      {result.deadlines.length ? <Text style={styles.sectionTitle}>{t("chat.deadlines")}</Text> : null}
      {result.deadlines.map((deadline, index) => (
        <DeadlineReminderRow
          key={`${deadline.date}-${index}`}
          deadline={deadline}
          scanId={scan.id}
          whereToGo={result.where_to_go ?? null}
          plan={plan}
          existingDeadlines={existingDeadlines}
          deadlinesReady={deadlinesReady}
          onReminderCreated={onReminderCreated}
          styles={styles}
          colors={colors}
        />
      ))}
      {result.where_to_go ? (
        <ResultInfoBlock
          tone="blue"
          title={t("chat.whereToGoLabel")}
          value={result.where_to_go}
          colors={colors}
          styles={styles}
        />
      ) : null}
      {result.documents_needed.length ? (
        <ResultInfoBlock
          tone="amber"
          title={t("chat.documentsNeededLabel")}
          value={result.documents_needed.join(", ")}
          colors={colors}
          styles={styles}
        />
      ) : null}
      {result.penalty ? (
        <ResultInfoBlock
          tone="danger"
          title={t("chat.penaltyLabel")}
          value={result.penalty}
          colors={colors}
          styles={styles}
        />
      ) : null}
      {result.tips ? (
        <ResultInfoBlock
          tone="green"
          title={t("chat.tipLabel")}
          value={result.tips}
          colors={colors}
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
  plan,
  existingDeadlines,
  deadlinesReady,
  onReminderCreated,
  styles,
  colors,
}: {
  deadline: AnalysisDeadline;
  scanId: string;
  whereToGo: string | null;
  plan: UserPlan;
  existingDeadlines: DeadlineResponse[];
  deadlinesReady: boolean;
  onReminderCreated: (created: DeadlineResponse) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
}) {
  const alreadySaved = existingDeadlines.some(
    (d) => d.scan_id === scanId && d.due_date === deadline.date && d.status === "active",
  );
  const [saved, setSaved] = useState(alreadySaved);

  // existingDeadlines arrives asynchronously after mount. Once loaded, keep the
  // button state aligned with the server so deleted/completed reminders unlock it.
  useEffect(() => {
    if (deadlinesReady) setSaved(alreadySaved);
  }, [alreadySaved, deadlinesReady]);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [showReminderSheet, setShowReminderSheet] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const showAddress = (deadline.type === "action" || deadline.type === "response") && Boolean(whereToGo);
  const time = parseTimeFromDescription(deadline.description) ?? parseTimeFromDate(deadline.date);
  const dateLabel = time ? `${formatDeadlineDate(deadline.date)} · ${time}` : formatDeadlineDate(deadline.date);
  const deadlineCopyText = [dateLabel, showAddress && whereToGo ? whereToGo : null].filter(Boolean).join("\n");

  async function handleAdd() {
    if (saved || saving) return;
    setSheetError(null);
    setShowReminderSheet(true);
  }

  async function handleCreateReminder(reminderDays: number[]) {
    const upcomingReminderDays = filterUpcomingReminderDays(deadline.date, reminderDays);
    if (saved || saving || !upcomingReminderDays.length) return;
    setSaving(true);
    setSheetError(null);
    try {
      const created = await createManualDeadline({
        title: deadline.description,
        description: null,
        due_date: deadline.date,
        deadline_type: deadline.type,
        scan_id: scanId,
        reminder_days: upcomingReminderDays,
      });
      setSaved(true);
      onReminderCreated(created);
      setShowReminderSheet(false);
    } catch {
      setSheetError(t("deadlines.createError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <View style={styles.deadlineCard}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.deadlineCardLabel}>{t(`deadlineType.${deadline.type}` as Parameters<typeof t>[0]).toUpperCase()}</Text>
          <CopyButton
            text={deadlineCopyText}
            title={t(`deadlineType.${deadline.type}` as Parameters<typeof t>[0]).toUpperCase()}
            colors={colors}
            styles={styles}
            compact
          />
        </View>
        <SelectableText style={styles.deadlineCardDate}>{dateLabel}</SelectableText>
        {showAddress && whereToGo ? (
          <View style={styles.deadlineCardAddress}>
            <Text style={styles.deadlineCardPin}>⊙</Text>
            <SelectableText style={styles.deadlineCardAddressText}>{whereToGo}</SelectableText>
          </View>
        ) : null}
        <Pressable
          onPress={handleAdd}
          style={[styles.deadlineCardBtn, saved && styles.deadlineCardBtnSaved]}
          accessibilityLabel={t(saved ? "chat.reminderSaved" : "chat.createReminder")}
          disabled={!deadlinesReady || saved || saving}
        >
          {!deadlinesReady || saving ? (
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
      </View>
      <ReminderSheet
        visible={showReminderSheet}
        plan={plan}
        deadline={deadline}
        saving={saving}
        error={sheetError}
        onClose={() => {
          if (!saving) setShowReminderSheet(false);
        }}
        onConfirm={handleCreateReminder}
        onUpgrade={() => {
          setShowReminderSheet(false);
          setShowPaywall(true);
        }}
        colors={colors}
        styles={styles}
      />
      <PaywallSheet visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </>
  );
}

function ReminderSheet({
  visible,
  plan,
  deadline,
  saving,
  error,
  onClose,
  onConfirm,
  onUpgrade,
  colors,
  styles,
}: {
  visible: boolean;
  plan: UserPlan;
  deadline: AnalysisDeadline;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reminderDays: number[]) => void;
  onUpgrade: () => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const insets = useSafeAreaInsets();
  const sheetY = useRef(new Animated.Value(REMINDER_SHEET_HIDDEN)).current;
  const isPro = plan === "pro";
  const availableDays = useMemo(() => filterUpcomingReminderDays(deadline.date, REMINDER_DAYS), [deadline.date]);
  const initialDays = useMemo(
    () => (isPro ? availableDays : availableDays.filter((day) => day === 1)),
    [availableDays, isPro],
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(initialDays);

  useEffect(() => {
    if (!visible) return;
    setSelectedDays(initialDays);
    sheetY.setValue(REMINDER_SHEET_HIDDEN);
    Animated.spring(sheetY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 210,
      mass: 0.9,
    }).start();
  }, [initialDays, sheetY, visible]);

  const enabledCount = selectedDays.length;
  const ctaText = enabledCount > 1
    ? t("chat.reminderSheetCtaMany", { count: enabledCount })
    : t("chat.reminderSheetCtaOne");

  function toggleDay(day: ReminderDay) {
    if (!availableDays.includes(day)) return;
    if (!isPro && day !== 1) {
      onUpgrade();
      return;
    }

    setSelectedDays((current) => {
      if (current.includes(day)) return current.filter((item) => item !== day);
      return [...current, day].sort((a, b) => b - a);
    });
  }

  function close() {
    if (!saving) onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={styles.reminderOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View
          style={[
            styles.reminderSheet,
            {
              paddingBottom: Math.max(insets.bottom + 18, 28),
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <View style={styles.reminderHandleWrap}>
            <View style={styles.reminderHandle} />
          </View>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.reminderSheetContent}
          >
            <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderSheetTitle}>
              {reminderSheetTitle(deadline.type)}
            </Text>
            <View style={styles.reminderDueRow}>
              <View style={styles.reminderTypePill}>
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderTypePillText}>
                  {t(`deadlineType.${deadline.type}` as Parameters<typeof t>[0]).toUpperCase()}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderDueDate}>
                {formatDeadlineDate(deadline.date)}
              </Text>
            </View>

            <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderSectionTitle}>
              {t("chat.reminderSheetChoose")}
            </Text>

            <View style={styles.reminderOptions}>
              {availableDays.length ? availableDays.map((day, index) => {
                const locked = !isPro && day !== 1;
                return (
                  <ReminderOptionRow
                    key={day}
                    day={day}
                    dateLabel={formatReminderTriggerDate(deadline.date, day)}
                    selected={selectedDays.includes(day)}
                    locked={locked}
                    saving={saving}
                    last={index === availableDays.length - 1}
                    onPress={() => toggleDay(day)}
                    onUpgrade={onUpgrade}
                    colors={colors}
                    styles={styles}
                  />
                );
              }) : (
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderNoOptionsText}>
                  {t("chat.reminderSheetNoOptions")}
                </Text>
              )}
            </View>

            {!isPro ? (
              <View style={styles.reminderProHint}>
                <Icon name="star" size={18} color={colors.pro} />
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderProHintText}>
                  {t("chat.reminderSheetProHint")}
                </Text>
              </View>
            ) : null}

            {error ? <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderErrorText}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ctaText}
              disabled={saving || enabledCount === 0}
              onPress={() => onConfirm(filterUpcomingReminderDays(deadline.date, selectedDays).sort((a, b) => b - a))}
              style={({ pressed }) => [
                styles.reminderCta,
                (saving || enabledCount === 0) && styles.reminderCtaDisabled,
                pressed && !saving && enabledCount > 0 && styles.reminderPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderCtaText}>{ctaText}</Text>
              )}
            </Pressable>

            {!isPro ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("chat.reminderSheetTryPro")}
                disabled={saving}
                onPress={onUpgrade}
                style={({ pressed }) => [styles.reminderUpgradeButton, pressed && styles.reminderPressed]}
              >
                <Icon name="star" size={18} color={colors.pro} />
                <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderUpgradeText}>
                  {t("chat.reminderSheetTryPro")}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ReminderOptionRow({
  day,
  dateLabel,
  selected,
  locked,
  saving,
  last,
  onPress,
  onUpgrade,
  colors,
  styles,
}: {
  day: ReminderDay;
  dateLabel: string;
  selected: boolean;
  locked: boolean;
  saving: boolean;
  last: boolean;
  onPress: () => void;
  onUpgrade: () => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: saving }}
      disabled={saving}
      onPress={locked ? onUpgrade : onPress}
      style={({ pressed }) => [
        styles.reminderOptionRow,
        !last && styles.reminderOptionDivider,
        pressed && styles.reminderPressed,
      ]}
    >
      <View style={[styles.reminderIconTile, locked && styles.reminderIconTileLocked]}>
        <Icon name="bell" size={22} color={locked ? colors.muted3 : colors.primary} />
      </View>
      <View style={styles.reminderOptionTextBlock}>
        <Text
          style={[styles.reminderOptionTitle, locked && styles.reminderOptionTitleLocked]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          maxFontSizeMultiplier={REMINDER_TEXT_SCALE}
        >
          {reminderOptionTitle(day)}
        </Text>
        <Text
          maxFontSizeMultiplier={REMINDER_TEXT_SCALE}
          style={[styles.reminderOptionDate, locked && styles.reminderOptionDateLocked]}
          numberOfLines={1}
        >
          {dateLabel}
        </Text>
      </View>
      {locked ? (
        <View style={styles.reminderLockedBadge}>
          <Icon name="lock-small" size={14} color={colors.pro} />
          <Text maxFontSizeMultiplier={REMINDER_TEXT_SCALE} style={styles.reminderLockedBadgeText}>Pro</Text>
        </View>
      ) : null}
      <ReminderToggle selected={selected} disabled={locked || saving} colors={colors} styles={styles} />
    </Pressable>
  );
}

function ReminderToggle({
  selected,
  disabled,
  colors,
  styles,
}: {
  selected: boolean;
  disabled: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View
      style={[
        styles.reminderToggle,
        selected ? styles.reminderToggleOn : styles.reminderToggleOff,
        disabled && styles.reminderToggleDisabled,
        { justifyContent: selected ? "flex-end" : "flex-start" },
      ]}
    >
      <View style={[styles.reminderToggleKnob, disabled && !selected && { backgroundColor: colors.muted3 }]} />
    </View>
  );
}

function reminderSheetTitle(type: AnalysisDeadline["type"]) {
  if (type === "payment") return t("chat.reminderSheetTitlePayment");
  if (type === "action") return t("chat.reminderSheetTitleAction");
  if (type === "response") return t("chat.reminderSheetTitleResponse");
  return t("chat.reminderSheetTitleExpiration");
}

function reminderOptionTitle(day: ReminderDay) {
  if (day === 30) return t("chat.reminderOption30");
  if (day === 14) return t("chat.reminderOption14");
  if (day === 7) return t("chat.reminderOption7");
  return t("chat.reminderOption1");
}

function formatReminderTriggerDate(dueDate: string, daysBefore: number) {
  const date = new Date(`${dueDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dueDate;
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return formatLocalizedDate(date, { day: "numeric", month: "long", year: "numeric" });
}

function filterUpcomingReminderDays<T extends number>(dueDate: string, days: readonly T[]): T[] {
  return days.filter((day) => isReminderTriggerUpcoming(dueDate, day));
}

function isReminderTriggerUpcoming(dueDate: string, daysBefore: number) {
  const triggerDate = new Date(`${dueDate}T12:00:00Z`);
  if (Number.isNaN(triggerDate.getTime())) return false;
  triggerDate.setUTCDate(triggerDate.getUTCDate() - daysBefore);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return triggerDate.getTime() >= today.getTime();
}

function ResultInfoBlock({ tone, title, value, colors, styles }: {
  tone: "blue" | "amber" | "neutral" | "danger" | "green";
  title: string;
  value: string;
  colors: ColorPalette;
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
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.infoBlockTitle, titleStyle]}>{title}</Text>
        <CopyButton text={value} title={title} colors={colors} styles={styles} compact />
      </View>
      <SelectableText style={styles.infoBlockText}>{value}</SelectableText>
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

function MessageBubble({ message, scan, plan, existingDeadlines, deadlinesReady, onReminderCreated, colors, styles, onOpenViewer }: {
  message: UiMessage;
  scan: ScanResponse | null;
  plan: UserPlan;
  existingDeadlines: DeadlineResponse[];
  deadlinesReady: boolean;
  onReminderCreated: (created: DeadlineResponse) => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  onOpenViewer?: (images: string[], index: number) => void;
}) {
  const isUser = message.role === "user";
  if (message.message_type === "result_card") {
    return scan ? <ResultCard scan={scan} plan={plan} existingDeadlines={existingDeadlines} deadlinesReady={deadlinesReady} onReminderCreated={onReminderCreated} colors={colors} styles={styles} /> : null;
  }
  if (message.message_type === "image") {
    return <DocumentAttachmentBubble scanId={message.scan_id} content={message.content} colors={colors} styles={styles} onOpenViewer={onOpenViewer} />;
  }
  if (message.message_type === "local_image") {
    return <PendingAttachmentBubble attachments={message.attachments} styles={styles} onOpenViewer={onOpenViewer} />;
  }
  const assistantText = markdownToPlainText(message.content || t("chat.thinking"));
  return (
    <View style={isUser ? styles.messageColUser : styles.messageColAssistant}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <SelectableText style={[styles.bubbleText, isUser && styles.userText]}>
          {isUser ? message.content || t("chat.thinking") : assistantText}
        </SelectableText>
      </View>
      {!isUser && message.content ? (
        <View style={styles.messageCopyRow}>
          <CopyButton text={assistantText} colors={colors} styles={styles} compact />
        </View>
      ) : null}
    </View>
  );
}

function CopyButton({ text, title, colors, styles, compact = false }: {
  text: string;
  title?: string;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    const body = text.trim();
    if (!body) return;
    const heading = title?.trim();
    const value = heading ? `${heading}\n${body}` : body;
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      return;
    }
    triggerSelectionHaptic();
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [text, title]);

  const tint = copied ? colors.green : colors.muted2;

  return (
    <Pressable
      onPress={handleCopy}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t(copied ? "chat.copied" : "chat.copy")}
      style={({ pressed }) => [compact ? styles.copyIconBtn : styles.copyChip, pressed && styles.copyPressed]}
    >
      <Icon name={copied ? "check" : "copy"} size={14} color={tint} />
      {compact ? null : (
        <Text style={[styles.copyChipText, { color: tint }]}>{t(copied ? "chat.copied" : "chat.copy")}</Text>
      )}
    </Pressable>
  );
}
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
  const [cachedImageUrls, setCachedImageUrls] = useState<string[]>([]);
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

  useEffect(() => {
    let alive = true;
    setCachedImageUrls([]);
    if (!signedUrls.length) return undefined;

    prefetchImageUris(signedUrls);
    cacheChatImages(cacheKey, signedUrls).then((cached) => {
      if (alive) setCachedImageUrls(cached);
    });

    return () => {
      alive = false;
    };
  }, [cacheKey, signedUrls]);

  const firstPath = paths[0] ?? "";
  const viewerUrls = cachedImageUrls.length === signedUrls.length ? cachedImageUrls : signedUrls;
  const firstUrl = viewerUrls[0];
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
      <Pressable style={styles.imageBubble} onPress={onOpenViewer ? () => onOpenViewer(viewerUrls, 0) : undefined}>
        <Image source={cachedImageSource(firstUrl)} style={styles.sentImage} resizeMode="cover" />
        {viewerUrls.length > 1 ? (
          <View style={styles.imageCountBadge}>
            <Text style={styles.imageCountText}>+{viewerUrls.length - 1}</Text>
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
  const uris = useMemo(() => attachments.map((a) => a.uri), [attachments]);

  useEffect(() => {
    prefetchImageUris(uris);
  }, [uris]);

  const first = attachments[0];
  if (!first) return null;

  if (isPreviewableImage(first.name) || isPreviewableImage(first.uri) || first.mimeType?.startsWith("image/")) {
    return (
      <Pressable style={styles.imageBubble} onPress={onOpenViewer ? () => onOpenViewer(uris, 0) : undefined}>
        <Image source={cachedImageSource(first.uri)} style={styles.sentImage} resizeMode="cover" />
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
  onStop,
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
  onStop?: () => void;
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
        multiline
        submitBehavior="newline"
        textAlignVertical="top"
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
        onStop={onStop}
        colors={colors}
      />
    </View>
  );
}

function SendButton({ streaming, disabled, muted = false, onPress, onStop, colors }: {
  streaming: boolean;
  disabled: boolean;
  muted?: boolean;
  onPress: () => void;
  onStop?: () => void;
  colors: ColorPalette;
}) {
  // Chat answer is streaming and can be cancelled → active stop button.
  // A scan still processing (muted) shows a non-interactive muted square.
  const stoppable = streaming && !muted && Boolean(onStop);
  const accent = stoppable || (!streaming && !disabled);
  const backgroundColor = accent ? colors.primary : colors.surface2;
  const iconColor = accent ? colors.textOnAccent : colors.muted3;
  const pressDisabled = stoppable ? false : disabled || streaming;

  return (
    <Pressable
      onPress={stoppable ? onStop : onPress}
      disabled={pressDisabled}
      accessibilityRole="button"
      accessibilityLabel={stoppable ? t("chat.stop") : t("chat.send")}
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
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const safeInitialIndex = images.length > 0 ? Math.max(0, Math.min(initialIndex, images.length - 1)) : 0;

  useEffect(() => {
    if (visible) {
      setCurrentIndex(safeInitialIndex);
      prefetchImageUris(images);
    }
  }, [visible, safeInitialIndex, images]);

  useEffect(() => {
    if (!visible) return;
    prefetchImageUris([
      images[currentIndex - 1],
      images[currentIndex],
      images[currentIndex + 1],
    ].filter((uri): uri is string => Boolean(uri)));
  }, [visible, images, currentIndex]);

  if (!visible || images.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <GestureViewer
          id={CHAT_IMAGE_VIEWER_ID}
          data={images}
          initialIndex={safeInitialIndex}
          ListComponent={ScrollView}
          width={width}
          height={height}
          onIndexChange={setCurrentIndex}
          onDismiss={onClose}
          enableDismissGesture
          enableSwipeGesture={images.length > 1}
          enableZoomGesture
          enableDoubleTapGesture
          enableZoomPanGesture
          dismissThreshold={80}
          resistance={2}
          maxZoomScale={4}
          animateBackdrop
          backdropStyle={{ backgroundColor: "#000" }}
          containerStyle={{ flex: 1, backgroundColor: "#000" }}
          listProps={{
            directionalLockEnabled: true,
            bounces: false,
            alwaysBounceHorizontal: false,
            alwaysBounceVertical: false,
          }}
          renderItem={(item: string) => (
            <View style={{ width, height, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
              <Image source={cachedImageSource(item)} style={{ width, height }} resizeMode="contain" />
            </View>
          )}
        />

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          style={{
            position: "absolute",
            top: insets.top + 12,
            right: 16,
            zIndex: 2,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="x" size={20} color="#fff" />
        </Pressable>

        {images.length > 1 ? (
          <View style={{
            position: "absolute",
            bottom: insets.bottom + 20,
            left: 0,
            right: 0,
            zIndex: 2,
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

function createStyles(colors: ColorPalette) {
  const isDark = colors.bg === "#0F0D0B";

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
    resultSummary: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowSecondary, fontSize: 16, lineHeight: 22 },
    sectionTitle: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1.6
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
    resultLine: { flex: 1, color: colors.text, fontFamily: fonts.body, ...typeStyles.rowSecondary, fontSize: 16, lineHeight: 22 },
    deadlineCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.blueMid,
      backgroundColor: colors.blueSoft,
      padding: 14,
      marginTop: 8,
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
      fontSize: 15,
      lineHeight: 21,
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
    reminderOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: isDark ? "rgba(0,0,0,0.74)" : "rgba(30,27,23,0.45)",
    },
    reminderSheet: {
      maxHeight: "90%",
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: isDark ? 0.32 : 0.12,
      shadowRadius: 22,
      elevation: 12,
    },
    reminderHandleWrap: {
      alignItems: "center",
      paddingTop: 14,
      paddingBottom: 12,
    },
    reminderHandle: {
      width: 42,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: isDark ? "#6F675D" : "#C0B9AF",
    },
    reminderSheetContent: {
      paddingHorizontal: 22,
      gap: 16,
    },
    reminderSheetTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.compactTitle,
      fontWeight: "700",
    },
    reminderDueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: -4,
    },
    reminderTypePill: {
      minHeight: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.amber200,
      backgroundColor: colors.amberLight,
      paddingHorizontal: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    reminderTypePillText: {
      color: colors.amberDark,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      letterSpacing: 0.9,
      fontWeight: "800",
    },
    reminderDueDate: {
      flex: 1,
      minWidth: 0,
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.callout,
    },
    reminderSectionTitle: {
      color: colors.amberDark,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      letterSpacing: 1.8,
      textTransform: "uppercase",
    },
    reminderOptions: {
      gap: 0,
    },
    reminderNoOptionsText: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
      paddingVertical: 12,
    },
    reminderOptionRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 9,
    },
    reminderOptionDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    reminderPressed: {
      opacity: 0.76,
    },
    reminderIconTile: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    reminderIconTileLocked: {
      opacity: 0.46,
    },
    reminderOptionTextBlock: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    reminderOptionTitle: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
    },
    reminderOptionTitleLocked: {
      color: colors.muted3,
      opacity: 0.7,
    },
    reminderOptionDate: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    reminderOptionDateLocked: {
      color: colors.muted3,
      opacity: 0.7,
    },
    reminderLockedBadge: {
      height: 26,
      minWidth: 60,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.proLight,
      backgroundColor: isDark ? "rgba(168,147,224,0.08)" : "rgba(124,58,237,0.05)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 8,
    },
    reminderLockedBadgeText: {
      color: colors.pro,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
      fontWeight: "800",
    },
    reminderToggle: {
      width: 48,
      height: 28,
      borderRadius: 14,
      padding: 3,
      flexDirection: "row",
      alignItems: "center",
    },
    reminderToggleOn: {
      backgroundColor: colors.primaryMid,
    },
    reminderToggleOff: {
      backgroundColor: colors.surface2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    reminderToggleDisabled: {
      opacity: 0.55,
    },
    reminderToggleKnob: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.12 : 0.16,
      shadowRadius: 4,
      elevation: 3,
    },
    reminderProHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 2,
    },
    reminderProHintText: {
      flex: 1,
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
    },
    reminderErrorText: {
      color: colors.dangerDark,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
    },
    reminderCta: {
      minHeight: 52,
      borderRadius: 17,
      backgroundColor: colors.primaryMid,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    reminderCtaDisabled: {
      opacity: 0.5,
    },
    reminderCtaText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
      textAlign: "center",
    },
    reminderUpgradeButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    reminderUpgradeText: {
      color: colors.pro,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
    },
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
      fontSize: 16,
      lineHeight: 22,
    },
    bubble: { paddingHorizontal: 12, paddingVertical: 10, maxWidth: "82%" },
    userBubble: {
      backgroundColor: colors.primary,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 4
    },
    assistantBubble: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18
    },
    bubbleText: { color: colors.text, fontFamily: fonts.body, fontSize: 16, lineHeight: 21 },
    userText: { color: colors.textOnAccent },
    messageColAssistant: { alignItems: "flex-start" },
    messageColUser: { alignItems: "flex-end" },
    messageCopyRow: { marginTop: 2, marginLeft: 2 },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    flex1: { flex: 1 },
    copyChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 7, borderRadius: 8 },
    copyChipText: { fontFamily: fonts.bodyBold, fontSize: 11.5, fontWeight: "600", letterSpacing: 0.2 },
    copyIconBtn: { padding: 5, borderRadius: 8 },
    copyPressed: { opacity: 0.5 },
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
      minHeight: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      flexDirection: "row",
      alignItems: "flex-end",
      paddingLeft: 18,
      paddingRight: 6,
      paddingVertical: 6,
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
      lineHeight: 18,
      paddingTop: 0,
      paddingBottom: 0,
      // Auto-grow up to ~6 lines, then the field scrolls internally.
      minHeight: COMPOSER_MIN_INPUT_HEIGHT,
      maxHeight: COMPOSER_MAX_INPUT_HEIGHT,
      // Vertically center the single-line state against the 36px send button.
      marginBottom: 7
    },
    composerCounter: {
      color: colors.muted3,
      fontFamily: fonts.body,
      ...typeStyles.caption2,
      minWidth: 24,
      textAlign: "right",
      alignSelf: "center"
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
