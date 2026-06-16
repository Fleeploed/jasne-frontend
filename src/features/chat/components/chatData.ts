import * as FileSystem from "expo-file-system";
import { Image } from "react-native";
import type { ColorPalette } from "@/components/ui";
import { createManualDeadline, listAllDeadlines } from "@/features/deadlines/deadlinesApi";
import type { PendingAttachment } from "@/features/scans/pendingScanStore";
import { formatLocalizedDate, t } from "@/lib/i18n";
import type { AnalysisDeadline, DeadlineResponse, ScanMessage, ScanResponse } from "@/lib/types";

export const chatScrollOffsets = new Map<string, number>();

// Signed URLs expire in 1h; cache for 50 min to keep a safety margin.
export const ATTACHMENT_URL_TTL_MS = 50 * 60 * 1000;
export const attachmentUrlCache = new Map<string, { urls: string[]; cachedAt: number }>();
const CHAT_IMAGE_CACHE_DIR = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}chat-images/` : null;
const chatImageFileCache = new Map<string, string>();
const chatImageCachePromises = new Map<string, Promise<string | null>>();

// Scans whose analysis deadlines we already synced into the deadlines table
// this session. Prevents recreating deadlines the user has intentionally deleted.
export const deadlineSyncDone = new Set<string>();
export const REMINDER_DAYS = [30, 14, 7, 1] as const;
export const REMINDER_SHEET_HIDDEN = 900;
export const REMINDER_TEXT_SCALE = 1;

export type ReminderDay = typeof REMINDER_DAYS[number];

export function mergeDeadlineLists(current: DeadlineResponse[], incoming: DeadlineResponse[]) {
  if (!incoming.length) return current;
  const byId = new Map(current.map((deadline) => [deadline.id, deadline]));
  incoming.forEach((deadline) => byId.set(deadline.id, deadline));
  return Array.from(byId.values());
}

export async function syncAnalysisDeadlines(scan: ScanResponse, knownDeadlines?: DeadlineResponse[]): Promise<DeadlineResponse[]> {
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

export function getCachedAttachmentUrls(key: string): string[] | null {
  const hit = attachmentUrlCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > ATTACHMENT_URL_TTL_MS) {
    attachmentUrlCache.delete(key);
    return null;
  }
  return hit.urls;
}

export function isRemoteImageUri(uri: string) {
  return /^https?:\/\//i.test(uri);
}

export function cachedImageSource(uri: string) {
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

export async function cacheChatImages(cacheKey: string, uris: string[]) {
  const cached = await Promise.all(uris.map((uri, index) => cacheChatImage(cacheKey, uri, index)));
  return uris.map((uri, index) => cached[index] ?? uri);
}

export function prefetchImageUris(uris: string[]) {
  uris.forEach((uri) => {
    if (isRemoteImageUri(uri)) {
      void Image.prefetch(uri).catch(() => undefined);
    }
  });
}

export type UiMessage = ScanMessage | {
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

export function isInitialImageMessage(message: UiMessage) {
  return message.message_type === "image" || message.message_type === "local_image";
}

export function orderInitialScanMessages(source: UiMessage[]) {
  const resultIndex = source.findIndex((message) => message.message_type === "result_card");
  if (resultIndex === -1) return source;

  const imageIndex = source.findIndex(isInitialImageMessage);
  if (imageIndex === -1 || imageIndex < resultIndex) return source;

  const ordered = [...source];
  const [imageMessage] = ordered.splice(imageIndex, 1);
  ordered.splice(resultIndex, 0, imageMessage);
  return ordered;
}


export function reminderSheetTitle(type: AnalysisDeadline["type"]) {
  if (type === "payment") return t("chat.reminderSheetTitlePayment");
  if (type === "action") return t("chat.reminderSheetTitleAction");
  if (type === "response") return t("chat.reminderSheetTitleResponse");
  return t("chat.reminderSheetTitleExpiration");
}

export function reminderOptionTitle(day: ReminderDay) {
  if (day === 30) return t("chat.reminderOption30");
  if (day === 14) return t("chat.reminderOption14");
  if (day === 7) return t("chat.reminderOption7");
  return t("chat.reminderOption1");
}

export function formatReminderTriggerDate(dueDate: string, daysBefore: number) {
  const date = new Date(`${dueDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dueDate;
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return formatLocalizedDate(date, { day: "numeric", month: "long", year: "numeric" });
}

export function filterUpcomingReminderDays<T extends number>(dueDate: string, days: readonly T[]): T[] {
  return days.filter((day) => isReminderTriggerUpcoming(dueDate, day));
}

export function isReminderTriggerUpcoming(dueDate: string, daysBefore: number) {
  const triggerDate = new Date(`${dueDate}T12:00:00Z`);
  if (Number.isNaN(triggerDate.getTime())) return false;
  triggerDate.setUTCDate(triggerDate.getUTCDate() - daysBefore);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return triggerDate.getTime() >= today.getTime();
}


export type MarkdownPart = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
};

export function normalizeMarkdownListLine(line: string) {
  const bulletMatch = /^(\s*)[-*]\s+(.+)$/.exec(line);
  if (bulletMatch) return `${bulletMatch[1]}• ${bulletMatch[2]}`;
  return line;
}

export function parseInlineMarkdown(input: string): MarkdownPart[] {
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

export function findNextSingleMarker(input: string, marker: "*" | "_", fromIndex: number) {
  let current = input.indexOf(marker, fromIndex);
  while (current >= 0) {
    const previousIsSame = current > 0 && input[current - 1] === marker;
    const nextIsSame = input[current + 1] === marker;
    if (!previousIsSame && !nextIsSame) return current;
    current = input.indexOf(marker, current + 1);
  }
  return -1;
}

export function findClosingSingleMarker(input: string, marker: "*" | "_", fromIndex: number) {
  let current = input.indexOf(marker, fromIndex);
  while (current >= 0) {
    const previousIsSame = current > 0 && input[current - 1] === marker;
    const nextIsSame = input[current + 1] === marker;
    if (!previousIsSame && !nextIsSame) return current;
    current = input.indexOf(marker, current + 1);
  }
  return -1;
}

export function normalizeMarkdownUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export function markdownToPlainText(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => parseInlineMarkdown(normalizeMarkdownListLine(line)).map((part) => part.text).join(""))
    .join("\n");
}

export function parseStoragePaths(content: string) {
  return content
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

export function isPreviewableImage(path: string) {
  return /\.(jpe?g|png|gif|webp)$/i.test(path);
}

export function isPdfPath(path: string) {
  return /\.pdf$/i.test(path);
}

export function isPreviewableAttachment(path: string) {
  return isPreviewableImage(path) || isPdfPath(path);
}

export function fileNameFromPath(path: string) {
  return path.split("/").pop() || "document";
}

export function attachmentKind(path: string) {
  if (/\.pdf$/i.test(path)) return "PDF";
  return "DOC";
}


export function pendingPipelineSteps() {
  return [
    t("scan.pipelineUpload"),
    t("scan.pipelineRead"),
    t("scan.pipelineFind"),
    t("scan.pipelineExplain"),
    t("scan.pipelineSave")
  ];
}

export function pendingPipelineIndex(progress: string[]) {
  const joined = progress.join(" ").toLowerCase();
  if (/сохраня|зберіга|uklád|saving|save|saved|ulož/.test(joined)) return 4;
  if (/summary|объяснен|пояснен|vysvět|explain|analysis|анал|explanation|prepared/.test(joined)) return 3;
  if (/срок|термін|term|deadline|risk|rag|правил|pravid|important|важн|action/.test(joined)) return 2;
  if (/ocr|чита|čtu|ctu|read|текст|text|classified|распознан|document/.test(joined)) return 1;
  return 0;
}


export function formatDocTitle(raw?: string | null) {
  if (!raw) return t("common.document");
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseTimeFromDescription(description: string): string | null {
  const match = /\b(\d{1,2}:\d{2})\b/.exec(description);
  return match?.[1] ?? null;
}

export function parseTimeFromDate(dateStr: string): string | null {
  const match = /T(\d{2}:\d{2})/.exec(dateStr);
  return match?.[1] ?? null;
}

export function formatDeadlineDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatLocalizedDate(parsed, { day: "numeric", month: "long", year: "numeric" });
}

export function urgencyPillColors(date: string, colors: ColorPalette) {
  const days = Math.ceil((new Date(`${date}T12:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (days < 7) return { backgroundColor: colors.dangerLight, color: colors.dangerDark };
  if (days <= 30) return { backgroundColor: colors.amberLight, color: colors.amberDark };
  return { backgroundColor: colors.greenLight, color: colors.greenDark };
}

export function deadlineDistance(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return t("common.deadline");
  const diffDays = Math.ceil((parsed.getTime() - Date.now()) / 86_400_000);
  if (diffDays < 0) return t("common.overdue");
  if (diffDays === 0) return t("common.today");
  if (diffDays === 1) return t("common.tomorrow");
  if (diffDays < 7) return t("common.inDays", { count: diffDays });
  return t("common.deadline");
}

export function formatPendingScanError(message: string | null) {
  if (!message) return null;
  if (/invalid json|classifier|schema validation|truncated|maximum context|maximum tokens/i.test(message)) {
    return "Не получилось завершить распознавание. Попробуйте ещё раз — фото загружены, но ответ анализа был обрезан.";
  }
  if (/could not read document/i.test(message)) {
    return "Не получилось прочитать документ. Попробуйте более чёткое фото без бликов и обрезанных краёв.";
  }
  return message;
}
