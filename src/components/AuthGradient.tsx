import { StyleSheet, View, useWindowDimensions } from "react-native";

import { useColors, lightColors } from "@/components/ui";

/**
 * Pure-JS vertical gradient via many opaque strips with linearly interpolated
 * RGB. Used as the background tint on auth screens.
 *
 * No alpha blending = no visible banding. No native module dependency
 * (avoids needing a fresh dev-client build to install expo-linear-gradient).
 */
export function AuthGradient() {
  const colors = useColors();
  const { height: screenHeight } = useWindowDimensions();

  // Cover top ~35% with the tint; below that = pure bg.
  const totalHeight = Math.round(screenHeight * 0.35);
  const stripHeight = 2;
  const stripCount = Math.ceil(totalHeight / stripHeight);
  const isLight = colors.bg === lightColors.bg;

  // Top color (opaque) and bottom color (== current bg, so transition is invisible).
  const top = isLight ? { r: 236, g: 242, b: 252 } : { r: 28, g: 38, b: 70 };
  const bottom = hexToRgb(colors.bg);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: stripCount }).map((_, i) => {
        const t = i / (stripCount - 1);
        const eased = t * t; // ease-in: blue concentrated near top
        const r = Math.round(top.r + (bottom.r - top.r) * eased);
        const g = Math.round(top.g + (bottom.g - top.g) * eased);
        const b = Math.round(top.b + (bottom.b - top.b) * eased);
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: i * stripHeight,
              height: stripHeight + 1,
              backgroundColor: `rgb(${r}, ${g}, ${b})`,
            }}
          />
        );
      })}
    </View>
  );
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = parseInt(normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}
