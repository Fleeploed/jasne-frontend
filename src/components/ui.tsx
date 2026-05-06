import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

export const lightColors = {
  bg: "#F9F7F4",
  surface: "#FDFBF8",
  surface2: "#F2EFEA",
  cream: "#FCF5E6",
  blueSoft: "#F0F3F9",
  blueMid: "#E3E9F2",
  border: "#E8E3DB",

  text: "#1E1B17",
  muted: "#3C3631",
  muted2: "#6B645C",
  muted3: "#948C82",
  textOnAccent: "#FDFBF8",

  primary: "#1B3A6B",
  primaryDark: "#102549",
  primaryMid: "#3B5E92",

  amber: "#E8A020",
  amberLight: "#FCF5E6",
  amberMid: "#FBECD0",
  amberDark: "#B97E15",
  amberDeep: "#7A4F0A",

  green: "#5E8B6C",
  greenDark: "#3D6B4C",
  greenLight: "#EEF3EF",

  danger: "#C0483B",
  dangerDark: "#9B3328",
  dangerDeep: "#5E1A14",
  dangerLight: "#FBEEEB",

  warningBg: "#FCF5E6",
  warningText: "#B97E15",

  pro: "#7C3AED",
  proLight: "#F3EFFD",

  ink300: "#C0B9AF",
  blue200: "#C7D2E3",
  blue100: "#E3E9F2",
  amber200: "#F5DCA7",
  red200: "#E9BFB8",
  green100: "#DDE8DF",
};

export const darkColors = {
  bg: "#111317",
  surface: "#1A1D23",
  surface2: "#222630",
  cream: "#1E1A0E",
  blueSoft: "#131926",
  blueMid: "#1A2437",
  border: "#2E3240",

  text: "#F2F0EB",
  muted: "#B8B3AC",
  muted2: "#7E7870",
  muted3: "#55504B",
  textOnAccent: "#FDFBF8",

  primary: "#4E81D4",
  primaryDark: "#2F5EAD",
  primaryMid: "#7AA3E8",

  amber: "#E8A020",
  amberLight: "#1E1A0D",
  amberMid: "#2A2310",
  amberDark: "#F5C25A",
  amberDeep: "#FFD98A",

  green: "#6AAD7B",
  greenDark: "#4A9060",
  greenLight: "#111E14",

  danger: "#E05545",
  dangerDark: "#F07060",
  dangerDeep: "#FFB0A0",
  dangerLight: "#1E100C",

  warningBg: "#1E1A0D",
  warningText: "#F5C25A",

  pro: "#A78BFA",
  proLight: "#1E1535",

  ink300: "#3E3A36",
  blue200: "#263042",
  blue100: "#1A2437",
  amber200: "#3A2C10",
  red200: "#3A1410",
  green100: "#131F16",
};

// Backward-compatible alias — always light; screens that use useColors() get theming
export const colors = lightColors;

export type ColorPalette = typeof lightColors;

export function useColors(): ColorPalette {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkColors : lightColors;
}

// ── Shared components ────────────────────────────────────────────

export function Screen({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      {children}
    </SafeAreaView>
  );
}

export function AppBar({
  title,
  left,
  right,
  subtitle
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  subtitle?: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => StyleSheet.create({
    appbar: {
      minHeight: 63,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg
    },
    appbarRow: {
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    appbarSide: {
      width: 44,
      minHeight: 36,
      alignItems: "center",
      justifyContent: "center"
    },
    appbarCenter: {
      flex: 1,
      alignItems: "center",
      gap: 2
    },
    appbarTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "500",
      textAlign: "center"
    },
    appbarSubtitle: {
      color: colors.muted,
      fontSize: 13
    }
  }), [colors]);

  return (
    <View style={styles.appbar}>
      <View style={styles.appbarRow}>
        <View style={styles.appbarSide}>{left}</View>
        <View style={styles.appbarCenter}>
          <Text style={styles.appbarTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.appbarSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.appbarSide}>{right}</View>
      </View>
    </View>
  );
}

export function IconButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          minWidth: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          paddingHorizontal: 8,
          opacity: pressed ? 0.72 : 1
        }
      ]}
    >
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = "primary"
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const colors = useColors();
  const styles = useMemo(() => StyleSheet.create({
    button: {
      minHeight: 50,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18
    },
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.blueSoft },
    danger: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: colors.danger
    },
    primaryText: { color: colors.textOnAccent, fontSize: 16, fontWeight: "600" },
    secondaryText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
    dangerText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
    disabled: { opacity: 0.55 },
    pressed: { opacity: 0.85 }
  }), [colors]);

  const variantStyle = variant === "secondary" ? styles.secondary : variant === "danger" ? styles.danger : styles.primary;
  const textStyle = variant === "secondary" ? styles.secondaryText : variant === "danger" ? styles.dangerText : styles.primaryText;
  const indicatorColor = variant === "secondary" ? colors.primary : variant === "danger" ? colors.danger : colors.textOnAccent;

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variantStyle,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      {loading
        ? <ActivityIndicator color={indicatorColor} />
        : <Text style={textStyle}>{title}</Text>
      }
    </Pressable>
  );
}

export function Field({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = "none",
  keyboardType = "default",
  multiline
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address";
  multiline?: boolean;
}) {
  const colors = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted2}
      secureTextEntry={secureTextEntry}
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
      multiline={multiline}
      style={[
        {
          minHeight: 50,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          color: colors.text,
          paddingHorizontal: 16,
          fontSize: 16
        },
        multiline && { minHeight: 96, paddingTop: 12, textAlignVertical: "top" as const }
      ]}
    />
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  const colors = useColors();
  return (
    <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" }}>{title}</Text>
      {detail ? <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>{detail}</Text> : null}
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  const colors = useColors();
  if (!message) return null;
  return <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 20 }}>{message}</Text>;
}
