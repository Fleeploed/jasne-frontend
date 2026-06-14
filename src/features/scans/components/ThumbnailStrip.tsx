import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import type { PickedUpload } from "@/features/scans/scansApi";
import { t } from "@/lib/i18n";
import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import { isImageUpload } from "@/features/scans/components/newScanData";

export function ThumbnailStrip({
  files,
  onRemove,
  onPreview,
  previewLabel,
}: {
  files: PickedUpload[];
  onRemove: (index: number) => void;
  onPreview: () => void;
  previewLabel: string;
}) {
  const { scanner, scannerStyles } = useScannerTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={scannerStyles.thumbsContent}
      style={scannerStyles.thumbs}
    >
      <Pressable
        onPress={onPreview}
        accessibilityRole="button"
        accessibilityLabel={previewLabel}
        style={({ pressed }) => [scannerStyles.previewTile, pressed && { opacity: 0.7 }]}
      >
        <Icon name="eye" size={22} color={scanner.blue} />
        <Text style={scannerStyles.previewTileLabel}>{files.length}</Text>
      </Pressable>
      {files.map((file, index) => {
        const isImage = isImageUpload(file);
        return (
          <View key={`${file.uri}-${index}`} style={scannerStyles.thumb}>
            {isImage ? (
              <Image source={{ uri: file.uri }} style={scannerStyles.thumbImage} resizeMode="cover" />
            ) : (
              <View style={scannerStyles.thumbPdf}>
                <Icon name="doc" size={20} color={scanner.blue} />
              </View>
            )}
            <View style={scannerStyles.thumbIndexBadge}>
              <Text style={scannerStyles.thumbIndexText}>{index + 1}</Text>
            </View>
            <Pressable
              onPress={() => onRemove(index)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
              style={scannerStyles.thumbRemove}
            >
              <Icon name="x" size={10} color={scanner.stageInk} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}
