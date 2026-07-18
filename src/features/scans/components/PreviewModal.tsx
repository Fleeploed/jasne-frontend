import { useEffect, useState } from "react";
import { Dimensions, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import type { PickedUpload } from "@/features/scans/scansApi";
import { t } from "@/lib/i18n";
import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import { isImageUpload } from "@/features/scans/components/newScanData";
import type { ScannerCopy } from "@/features/scans/components/newScanData";

export function PreviewModal({
  visible,
  files,
  copy,
  onClose,
}: {
  visible: boolean;
  files: PickedUpload[];
  copy: ScannerCopy;
  onClose: () => void;
}) {
  const { scanner, previewStyles } = useScannerTheme();
  const { width } = Dimensions.get("window");
  const [pageIndex, setPageIndex] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) setPageIndex(0);
  }, [visible]);

  useEffect(() => {
    if (pageIndex >= files.length && files.length > 0) {
      setPageIndex(files.length - 1);
    }
  }, [files.length, pageIndex]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={previewStyles.root}>
        <View style={[previewStyles.topBar, { paddingTop: insets.top + 12 }]}>
          <Text style={previewStyles.counter}>
            {files.length ? copy.previewPageOf(pageIndex + 1, files.length) : ""}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={previewStyles.iconButton}>
            <Icon name="x" size={20} color={scanner.ink2} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            if (next !== pageIndex) setPageIndex(next);
          }}
          style={previewStyles.pager}
        >
          {files.map((file, index) => (
            <View key={`${file.uri}-${index}`} style={[previewStyles.page, { width }]}>
              {isImageUpload(file) ? (
                <Image source={{ uri: file.uri }} style={previewStyles.pageImage} resizeMode="contain" />
              ) : (
                <View style={previewStyles.pagePdf}>
                  <Icon name="doc" size={64} color={scanner.brandBlue} />
                  <Text style={previewStyles.pagePdfName} numberOfLines={2}>{file.name}</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {files.length > 1 ? (
          <View style={[previewStyles.dots, { paddingBottom: Math.max(insets.bottom, 14) + 6 }]}>
            {files.map((_, index) => (
              <View
                key={index}
                style={[previewStyles.dot, index === pageIndex && previewStyles.dotActive]}
              />
            ))}
          </View>
        ) : (
          <View style={{ height: Math.max(insets.bottom, 14) + 16 }} />
        )}
      </View>
    </Modal>
  );
}
