import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, FlatList, Image, Modal, PanResponder, Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function ImageViewerModal({ images, initialIndex, visible, onClose }: {
  images: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList<string>>(null);
  const dismissY = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) {
      dismissY.setValue(0);
      setCurrentIndex(initialIndex);
      setTimeout(() => {
        flatRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 50);
    }
  }, [dismissY, visible, initialIndex]);

  const closeWithSwipe = useCallback(() => {
    Animated.timing(dismissY, {
      toValue: -height,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      dismissY.setValue(0);
      onClose();
    });
  }, [dismissY, height, onClose]);

  const swipeUpResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, { dx, dy }) =>
          dy < -34 && Math.abs(dy) > Math.abs(dx) * 2.1,
        onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
          dy < -42 && Math.abs(dy) > Math.abs(dx) * 2.1,
        onPanResponderRelease: (_, { dy, vy }) => {
          if (dy < -72 || (dy < -36 && vy < -0.95)) {
            closeWithSwipe();
          }
        },
      }),
    [closeWithSwipe],
  );

  const backdropOpacity = dismissY.interpolate({
    inputRange: [-height * 0.45, 0],
    outputRange: [0.15, 1],
    extrapolate: "clamp",
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden />
      <Animated.View
        {...swipeUpResponder.panHandlers}
        style={{
          flex: 1,
          backgroundColor: "#000",
          opacity: backdropOpacity,
          transform: [{ translateY: dismissY }],
        }}
      >
        <FlatList
          ref={flatRef}
          data={images}
          horizontal
          pagingEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(e) => {
            setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
          renderItem={({ item }) => (
            <ZoomableViewerImage uri={item} width={width} height={height} />
          )}
        />

        {/* Close button */}
        <Pressable
          onPress={onClose}
          style={{
            position: "absolute",
            top: insets.top + 12,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 20, lineHeight: 22, fontWeight: "300" }}>✕</Text>
        </Pressable>

        {/* Page indicator */}
        {images.length > 1 ? (
          <View style={{
            position: "absolute",
            bottom: insets.bottom + 20,
            left: 0,
            right: 0,
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
      </Animated.View>
    </Modal>
  );
}

export type ZoomRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  animated?: boolean;
};

export type ZoomableScrollViewHandle = ScrollView & {
  getScrollResponder?: () => {
    scrollResponderZoomTo?: (rect: ZoomRect, animated?: boolean) => void;
  };
  scrollResponderZoomTo?: (rect: ZoomRect, animated?: boolean) => void;
};

export function ZoomableViewerImage({ uri, width, height }: { uri: string; width: number; height: number }) {
  const scrollRef = useRef<ZoomableScrollViewHandle>(null);
  const lastTapRef = useRef(0);
  const [zoomed, setZoomed] = useState(false);

  function zoomTo(rect: ZoomRect) {
    const responder = scrollRef.current?.getScrollResponder?.();
    const zoom = responder?.scrollResponderZoomTo ?? scrollRef.current?.scrollResponderZoomTo;
    zoom?.({ ...rect, animated: true }, true);
  }

  function handlePress(locationX: number, locationY: number) {
    const now = Date.now();
    if (now - lastTapRef.current > 280) {
      lastTapRef.current = now;
      return;
    }

    lastTapRef.current = 0;
    if (zoomed) {
      zoomTo({ x: 0, y: 0, width, height });
      setZoomed(false);
      return;
    }

    const zoomScale = 2.6;
    const zoomWidth = width / zoomScale;
    const zoomHeight = height / zoomScale;
    zoomTo({
      x: Math.max(locationX - zoomWidth / 2, 0),
      y: Math.max(locationY - zoomHeight / 2, 0),
      width: zoomWidth,
      height: zoomHeight,
    });
    setZoomed(true);
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ width, height }}
      contentContainerStyle={{ width, height }}
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={(event) => handlePress(event.nativeEvent.locationX, event.nativeEvent.locationY)}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </Pressable>
    </ScrollView>
  );
}

