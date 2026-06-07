import * as Haptics from "expo-haptics";
import { Platform, Vibration } from "react-native";

function fallbackVibrate(durationMs: number) {
  if (Platform.OS === "android") {
    Vibration.vibrate(durationMs);
  }
}

function reportUnavailable(error: unknown) {
  if (__DEV__) {
    console.warn("[haptics] native module unavailable. Rebuild the development client.", error);
  }
}

export function triggerLongPressHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch((error) => {
    reportUnavailable(error);
    fallbackVibrate(6);
  });
}

export function triggerSelectionHaptic() {
  void Haptics.selectionAsync().catch((error) => {
    reportUnavailable(error);
    fallbackVibrate(4);
  });
}
