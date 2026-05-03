import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

export const colors = {
  // Surfaces — warm paper palette
  bg: "#F9F7F4",
  surface: "#FDFBF8",
  surface2: "#F2EFEA",
  cream: "#FCF5E6",
  blueSoft: "#F0F3F9",
  blueMid: "#E3E9F2",
  border: "#E8E3DB",

  // Ink — warm neutral text
  text: "#1E1B17",
  muted: "#3C3631",
  muted2: "#6B645C",
  muted3: "#948C82",
  textOnAccent: "#FDFBF8",

  // Czech blue accent
  primary: "#1B3A6B",
  primaryDark: "#102549",
  primaryMid: "#3B5E92",

  // Amber — deadlines, warnings
  amber: "#E8A020",
  amberLight: "#FCF5E6",
  amberMid: "#FBECD0",
  amberDark: "#B97E15",
  amberDeep: "#7A4F0A",

  // Green — success, done
  green: "#5E8B6C",
  greenDark: "#3D6B4C",
  greenLight: "#EEF3EF",

  // Danger — muted red
  danger: "#C0483B",
  dangerDark: "#9B3328",
  dangerDeep: "#5E1A14",
  dangerLight: "#FBEEEB",

  // Semantic aliases
  warningBg: "#FCF5E6",
  warningText: "#B97E15",

  // Pro / subscription
  pro: "#7C3AED",
  proLight: "#F3EFFD"
};

export function Screen({ children }: { children: ReactNode }) {
  return <SafeAreaView edges={["top"]} style={styles.screen}>{children}</SafeAreaView>;
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
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Text style={styles.iconButtonText}>{label}</Text>
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
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondaryButton,
        variant === "danger" && styles.dangerButton,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "secondary" ? colors.primary : colors.text} /> : <Text style={[styles.buttonText, variant === "secondary" && styles.secondaryText]}>{title}</Text>}
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
      style={[styles.input, multiline && styles.multiline]}
    />
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail ? <Text style={styles.emptyDetail}>{detail}</Text> : null}
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
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
  appbarCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  appbarTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center"
  },
  appbarSubtitle: {
    color: colors.muted,
    fontSize: 13
  },
  appbarSide: {
    width: 56,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  iconButton: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  iconButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  button: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 18
  },
  secondaryButton: {
    backgroundColor: colors.blueSoft
  },
  dangerButton: {
    backgroundColor: colors.danger
  },
  buttonText: {
    color: colors.textOnAccent,
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryText: {
    color: colors.primary
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    opacity: 0.85
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: colors.surface2,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16
  },
  multiline: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: "top"
  },
  empty: {
    padding: 24,
    alignItems: "center",
    gap: 8
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center"
  },
  emptyDetail: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20
  }
});
