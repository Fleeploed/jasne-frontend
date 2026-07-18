import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
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
  const [mounted, setMounted] = useState(visible);
  const latestVisibleRef = useRef(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  // Swipe-down-to-dismiss. dragY is added to the entrance translateY so the
  // sheet follows the finger; releasing past a threshold closes it.
  const { dragY, panHandlers, reset: resetDrag } = useSwipeToClose(onClose);

  useEffect(() => {
    latestVisibleRef.current = visible;
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    progress.stopAnimation();
    if (visible) {
      progress.setValue(0);
      resetDrag();
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: true,
        damping: 22,
        stiffness: 260,
        mass: 0.8,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !latestVisibleRef.current) {
        setMounted(false);
      }
    });
  }, [mounted, progress, resetDrag, visible]);

  if (!mounted) return null;

  const sheetTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });
  const sheetOpacity = progress.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0, 1, 1],
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={sheetStyles.root}>
        <Animated.View style={[sheetStyles.overlay, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          {...panHandlers}
          style={[
            sheetStyles.sheet,
            {
              opacity: sheetOpacity,
              transform: [{ translateY: Animated.add(sheetTranslateY, dragY) }],
            },
          ]}
        >
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
        </Animated.View>
      </View>
    </Modal>
  );
}

export function SheetRow({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress: () => void }) {
  const { scanner, sheetStyles } = useScannerTheme();
  return (
    <Pressable onPress={onPress} style={sheetStyles.row}>
      <View style={sheetStyles.rowIcon}>
        <Icon name={icon} size={20} color={scanner.brandBlue} />
      </View>
      <View style={sheetStyles.rowText}>
        <Text style={sheetStyles.rowTitle}>{title}</Text>
        <Text style={sheetStyles.rowDetail}>{detail}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={scanner.ink3} />
    </Pressable>
  );
}
