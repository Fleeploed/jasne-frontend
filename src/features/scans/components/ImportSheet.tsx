import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import type { ScannerCopy } from "@/features/scans/components/newScanData";

export function ImportSheet({
  visible,
  copy,
  maxPages,
  onClose,
  onPickPdf,
  onPickPhotos,
}: {
  visible: boolean;
  copy: ScannerCopy;
  maxPages: number;
  onClose: () => void;
  onPickPdf: () => void;
  onPickPhotos: () => void;
}) {
  const { sheetStyles } = useScannerTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sectionLabel}>{copy.addToScan}</Text>
          <View style={sheetStyles.rows}>
            <SheetRow icon="doc-text" title={copy.pdfFile} detail={copy.importFromFiles} onPress={onPickPdf} />
            <View style={sheetStyles.divider} />
            <SheetRow icon="pages" title={copy.photosFromGallery} detail={copy.selectPhotos(maxPages)} onPress={onPickPhotos} />
          </View>
          <Pressable onPress={onClose} style={sheetStyles.cancelButton}>
            <Text style={sheetStyles.cancelText}>{copy.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function SheetRow({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress: () => void }) {
  const { scanner, sheetStyles } = useScannerTheme();
  return (
    <Pressable onPress={onPress} style={sheetStyles.row}>
      <View style={sheetStyles.rowIcon}>
        <Icon name={icon} size={20} color={scanner.blue} />
      </View>
      <View style={sheetStyles.rowText}>
        <Text style={sheetStyles.rowTitle}>{title}</Text>
        <Text style={sheetStyles.rowDetail}>{detail}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={scanner.ink3} />
    </Pressable>
  );
}
