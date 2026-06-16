import { TransitionPresets } from "@react-navigation/stack";

import { JsStack } from "@/components/JsStack";
import { useColors } from "@/components/ui";

export default function HelpLayout() {
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
