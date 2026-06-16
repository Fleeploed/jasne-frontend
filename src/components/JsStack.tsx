import { createStackNavigator } from "@react-navigation/stack";
import type { StackNavigationEventMap, StackNavigationOptions } from "@react-navigation/stack";
import type { ParamListBase, StackNavigationState } from "@react-navigation/native";
import { withLayoutContext } from "expo-router";

const { Navigator } = createStackNavigator();

// JS-based stack navigator instead of expo-router's default native-stack.
// Reason: native-stack's swipe-back gesture is iOS-only, so "swipe left to
// close" never worked on Android. The JS stack honors `gestureEnabled` on
// Android too, giving Telegram-style swipe-to-close on both platforms.
export const JsStack = withLayoutContext<
  StackNavigationOptions,
  typeof Navigator,
  StackNavigationState<ParamListBase>,
  StackNavigationEventMap
>(Navigator);
