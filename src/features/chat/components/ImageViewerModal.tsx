import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Gallery, { type RenderItemInfo } from "react-native-awesome-gallery";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cachedImageSource, prefetchImageUris } from "@/features/chat/components/chatData";
import { t } from "@/lib/i18n";

export function ImageViewerModal({ images, initialIndex, visible, onClose }: {
  images: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Measure the real fullscreen modal area instead of trusting
  // useWindowDimensions(): on Android the window height excludes the system
  // navigation bar while this translucent modal draws under it, so the gallery
  // would center within a shorter box and push the image up (large black gap
  // below). onLayout gives the true drawable height on both platforms.
  const [container, setContainer] = useState<{ width: number; height: number } | null>(null);
  const closingRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const safeInitialIndex = images.length > 0 ? Math.max(0, Math.min(initialIndex, images.length - 1)) : 0;

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    setCurrentIndex(safeInitialIndex);
    prefetchImageUris(images);
  }, [images, safeInitialIndex, visible]);

  useEffect(() => {
    if (!visible) return;
    prefetchImageUris([
      images[currentIndex - 1],
      images[currentIndex],
      images[currentIndex + 1],
    ].filter((uri): uri is string => Boolean(uri)));
  }, [visible, images, currentIndex]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  const renderImage = useCallback(({ item, setImageDimensions }: RenderItemInfo<string>) => (
    <Image
      onLoad={(event) => {
        const { width: imageWidth, height: imageHeight } = event.nativeEvent.source;
        if (imageWidth > 0 && imageHeight > 0) {
          setImageDimensions({ width: imageWidth, height: imageHeight });
        }
      }}
      source={cachedImageSource(item)}
      resizeMode="contain"
      style={StyleSheet.absoluteFill}
    />
  ), []);

  if (!visible || images.length === 0) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={requestClose} statusBarTranslucent>
      <StatusBar hidden />
      <View
        style={styles.root}
        onLayout={(event) => {
          const { width: w, height: h } = event.nativeEvent.layout;
          if (w > 0 && h > 0) setContainer({ width: w, height: h });
        }}
      >
        <View pointerEvents="none" style={styles.backdrop} />
        <Gallery
          data={images}
          initialIndex={safeInitialIndex}
          keyExtractor={(item, index) => `${item}-${index}`}
          renderItem={renderImage}
          onIndexChange={(index) => {
            setCurrentIndex(index);
          }}
          onSwipeToClose={requestClose}
          containerDimensions={container ?? { width, height }}
          doubleTapScale={2.6}
          maxScale={4}
          disableTransitionOnScaledImage
          hideAdjacentImagesOnScaledImage
          style={styles.gallery}
        />

        <Pressable
          onPress={requestClose}
          style={[styles.closeButton, { top: insets.top + 12 }]}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {images.length > 1 ? (
          <View pointerEvents="none" style={[styles.pageIndicator, { bottom: insets.bottom + 20 }]}>
            {images.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.pageDot,
                  index === currentIndex ? styles.pageDotActive : styles.pageDotInactive,
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  gallery: {
    flex: 1,
    backgroundColor: "transparent",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "#fff",
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "300",
  },
  pageIndicator: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  pageDot: {
    height: 6,
    borderRadius: 3,
  },
  pageDotActive: {
    width: 18,
    backgroundColor: "#fff",
  },
  pageDotInactive: {
    width: 6,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
});
