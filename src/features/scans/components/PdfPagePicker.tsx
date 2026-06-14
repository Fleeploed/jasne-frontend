import { useEffect, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import type { PickedUpload } from "@/features/scans/scansApi";
import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import type { ScannerCopy } from "@/features/scans/components/newScanData";

export function PdfPagePicker({
  visible,
  pageCount,
  available,
  thumbnails,
  converting,
  copy,
  isPro,
  maxPages,
  onCancel,
  onConfirm,
  onUpgrade,
}: {
  visible: boolean;
  pageCount: number;
  available: number;
  thumbnails: Record<number, PickedUpload>;
  converting: boolean;
  copy: ScannerCopy;
  isPro: boolean;
  maxPages: number;
  onCancel: () => void;
  onConfirm: (indices: number[]) => void;
  onUpgrade: () => void;
}) {
  const { scanner, pickerStyles } = useScannerTheme();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Pre-select first `available` pages whenever picker opens.
  useEffect(() => {
    if (visible && pageCount > 0) {
      const next = new Set<number>();
      for (let i = 0; i < Math.min(pageCount, available); i++) next.add(i);
      setSelected(next);
    } else if (!visible) {
      setSelected(new Set());
    }
  }, [visible, pageCount, available]);

  function toggle(index: number) {
    if (converting) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < available) {
        next.add(index);
      }
      return next;
    });
  }

  const selectedIndices = Array.from(selected).sort((a, b) => a - b);
  const canConfirm = selectedIndices.length > 0 && !converting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={pickerStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={pickerStyles.sheet}>
          <View style={pickerStyles.handle} />
          <View style={pickerStyles.titleRow}>
            <Text style={pickerStyles.title}>{copy.pdfPickerTitle}</Text>
            <Text style={pickerStyles.titleHint}>{copy.pdfPickerTotal(pageCount)}</Text>
          </View>

          {!isPro ? (
            <View style={pickerStyles.warning}>
              <Text style={pickerStyles.warningText}>{copy.freePdfWarning(maxPages)}</Text>
            </View>
          ) : null}

          <ScrollView
            style={pickerStyles.grid}
            contentContainerStyle={pickerStyles.gridContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            <View style={pickerStyles.gridRow}>
              {Array.from({ length: pageCount }).map((_, index) => {
                const isSelected = selected.has(index);
                const canToggle = isSelected || selected.size < available;
                const thumb = thumbnails[index];
                return (
                  <Pressable
                    key={`page-${index}`}
                    onPress={() => toggle(index)}
                    style={[
                      pickerStyles.pageCard,
                      isSelected && pickerStyles.pageCardSelected,
                      !canToggle && pickerStyles.pageCardDim,
                    ]}
                  >
                    {thumb ? (
                      <Image source={{ uri: thumb.uri }} style={pickerStyles.pageCardImage} resizeMode="cover" />
                    ) : (
                      <View style={pickerStyles.pageCardPlaceholder}>
                        <Icon name="doc-text" size={28} color={scanner.ink3} />
                      </View>
                    )}
                    <View style={pickerStyles.pageNumberBadge}>
                      <Text style={pickerStyles.pageNumberBadgeText}>{index + 1}</Text>
                    </View>
                    {isSelected ? (
                      <View style={pickerStyles.checkOverlay}>
                        <Icon name="check" size={13} color={scanner.stageInk} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={pickerStyles.footer}>
            <Pressable
              disabled={!canConfirm}
              onPress={() => onConfirm(selectedIndices)}
              style={[pickerStyles.addButton, !canConfirm && pickerStyles.addButtonDisabled]}
            >
              <Text style={pickerStyles.addButtonText}>
                {converting ? copy.pdfConverting : copy.pdfPickerAdd(selectedIndices.length)}
              </Text>
            </Pressable>
            {!isPro && !converting ? (
              <Pressable onPress={onUpgrade} style={pickerStyles.upgradeButton}>
                <Icon name="star" size={12} color={scanner.purple} />
                <Text style={pickerStyles.upgradeButtonText}>{copy.upgradePdf}</Text>
              </Pressable>
            ) : null}
            {!converting ? (
              <Pressable onPress={onCancel} style={pickerStyles.cancelButton}>
                <Text style={pickerStyles.cancelText}>{copy.cancel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
