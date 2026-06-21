import { useCallback, useRef } from "react";
import { Animated, PanResponder } from "react-native";

/**
 * Swipe-down-to-dismiss for bottom sheets. Returns a `dragY` Animated.Value to
 * add onto the sheet's translateY, `panHandlers` to spread on the sheet view,
 * and `reset` to zero the drag when the sheet (re)opens.
 *
 * The finger drags the sheet down; releasing past ~100px (or a fast flick)
 * calls `onClose`, otherwise it springs back. Taps fall through to children
 * (rows stay pressable); only clear downward drags are claimed.
 *
 * `capture` (default true) steals vertical drags from children so the sheet
 * can be dragged from anywhere. Pass `false` for sheets containing a
 * ScrollView so the list still scrolls — drags then only work on non-scrolling
 * areas like the grab handle.
 */
export function useSwipeToClose(onClose: () => void, { capture = true }: { capture?: boolean } = {}) {
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dy, dx }) => dy > 6 && Math.abs(dy) > Math.abs(dx) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, { dy, dx }) =>
        capture && dy > 12 && Math.abs(dy) > Math.abs(dx) * 1.5,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) dragY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 100 || vy > 0.6) {
          onCloseRef.current();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const reset = useCallback(() => dragY.setValue(0), [dragY]);

  return { dragY, panHandlers: panResponder.panHandlers, reset };
}
