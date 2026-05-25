import { Stack } from "expo-router";

import { useColors } from "@/components/ui";

export default function ProfileLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        gestureEnabled: true,
        gestureDirection: "horizontal",
        animation: "slide_from_right",
      }}
    />
  );
}
