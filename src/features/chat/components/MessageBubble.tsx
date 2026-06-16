import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { SelectableText } from "@/components/SelectableText";
import type { ColorPalette } from "@/components/ui";
import { getScanImageUrls } from "@/features/scans/scansApi";
import type { PendingAttachment } from "@/features/scans/pendingScanStore";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import type { DeadlineResponse, ScanResponse, UserPlan } from "@/lib/types";
import type { ChatStyles } from "@/features/chat/components/chatStyles";
import {
  attachmentKind,
  attachmentUrlCache,
  cacheChatImages,
  cachedImageSource,
  fileNameFromPath,
  getCachedAttachmentUrls,
  isPdfPath,
  isPreviewableAttachment,
  isPreviewableImage,
  markdownToPlainText,
  parseStoragePaths,
  prefetchImageUris,
} from "@/features/chat/components/chatData";
import type { UiMessage } from "@/features/chat/components/chatData";
import { CopyButton } from "@/features/chat/components/CopyButton";
import { ResultCard } from "@/features/chat/components/ResultCard";

export function MessageBubble({ message, scan, plan, existingDeadlines, deadlinesReady, onReminderCreated, colors, styles, onOpenViewer }: {
  message: UiMessage;
  scan: ScanResponse | null;
  plan: UserPlan;
  existingDeadlines: DeadlineResponse[];
  deadlinesReady: boolean;
  onReminderCreated: (created: DeadlineResponse) => void;
  colors: ColorPalette;
  styles: ChatStyles;
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


export function DocumentAttachmentBubble({ scanId, content, colors, styles, onOpenViewer }: {
  scanId: string;
  content: string;
  colors: ColorPalette;
  styles: ChatStyles;
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
    // pathsKey is the serialized form of `paths`; depending on the array ref
    // itself would re-run the effect on every render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey, scanId, cacheKey]);

  useEffect(() => {
    let alive = true;
    setCachedImageUrls([]);
    if (!signedUrls.length) return undefined;

    prefetchImageUris(signedUrls);
    void cacheChatImages(cacheKey, signedUrls).then((cached) => {
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

export function PendingAttachmentBubble({ attachments, styles, onOpenViewer }: {
  attachments: PendingAttachment[];
  styles: ChatStyles;
  onOpenViewer?: (images: string[], index: number) => void;
}) {
  const first = attachments[0];
  if (!first) return null;

  if (isPreviewableImage(first.name) || isPreviewableImage(first.uri) || first.mimeType?.startsWith("image/")) {
    const uris = attachments.map((a) => a.uri);
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
