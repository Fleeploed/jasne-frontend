import { TransitionPresets } from "@react-navigation/stack";

import { JsStack } from "@/components/JsStack";
import { useColors } from "@/components/ui";

export default function ProfileLayout() {
  const colors = useColors();
  return (
    <JsStack
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.bg },
        gestureEnabled: true,
        ...TransitionPresets.SlideFromRightIOS,
      }}
    />
  );
}
