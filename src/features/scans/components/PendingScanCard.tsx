import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";
import type { PendingScanRecord } from "@/features/scans/pendingScanStore";

import type { ScanListStyles } from "./scanListStyles";

export function PendingScanCard({
  pending,
  colors,
  styles,
  onPress,
  interrupted = false,
}: {
  pending: PendingScanRecord;
  colors: ColorPalette;
  styles: ScanListStyles;
  onPress: () => void;
  interrupted?: boolean;
}) {
  const firstImage = pending.attachments.find((a) => (a.mimeType ?? "").startsWith("image/")) ?? pending.attachments[0];
  const latestStep = interrupted
    ? t("scan.interruptedHint")
    : pending.progress[pending.progress.length - 1] ?? t("scan.uploading");
  const title = pending.preview.documentType?.trim() || t("scan.processingTitle");

  // Restored cards skip the thumbnail: the cached image file may have been
  // evicted by the OS while the app was gone, which would render broken.
  const showImage = !interrupted && firstImage && (firstImage.mimeType ?? "").startsWith("image/");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pendingCard, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
      accessibilityRole="button"
    >
      <View style={styles.pendingTop}>
        <View style={[styles.pendingThumb, { backgroundColor: interrupted ? colors.surface2 : colors.blueSoft }]}>
          {showImage ? (
            <Image source={{ uri: firstImage.uri }} style={styles.pendingThumbImage} resizeMode="cover" />
          ) : (
            <Icon name="doc-text" size={24} color={interrupted ? colors.muted2 : colors.brandBlue} />
          )}
        </View>
        <View style={styles.rowHeadText}>
          <View style={styles.rowMetaLine}>
            <Text style={styles.rowEyebrow} numberOfLines={1}>
              {interrupted ? t("scan.interruptedEyebrow") : t("scan.processingEyebrow")}
            </Text>
            {interrupted ? null : <ActivityIndicator size="small" color={colors.brandBlue} />}
          </View>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.pendingStep} numberOfLines={1}>{latestStep}</Text>
        </View>
      </View>
      {!interrupted && pending.preview.summary ? (
        <Text style={styles.rowPreview} numberOfLines={2}>{pending.preview.summary}</Text>
      ) : null}
    </Pressable>
  );
}
