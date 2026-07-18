import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Appearance,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";

export const lightColors = {
  brandBlue: "#1B5FAC",
  bg: "#F9F7F4",
  bgDeep: "#F1ECE5",
  surface: "#FDFBF8",
  surface2: "#F2EFEA",
  surface3: "#ECE6DD",
  cream: "#FCF5E6",
  blueSoft: "#F0F3F9",
  blueMid: "#E3E9F2",
  border: "#E8E3DB",
  borderSoft: "#EFEAE3",

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
  brandBlue: "#1B5FAC",
  bg: "#0F0D0B",
  bgDeep: "#090806",
  surface: "#181512",
  surface2: "#211D19",
  surface3: "#29241F",
  cream: "#2D2000",
  blueSoft: "rgba(111,160,230,0.13)",
  blueMid: "rgba(111,160,230,0.28)",
  border: "#2C2722",
  borderSoft: "#27221E",

  text: "#F4EFE6",
  muted: "#D9D2C5",
  muted2: "#A39A8C",
  muted3: "#6F675D",
  textOnAccent: "#F4EFE6",

  primary: "#6FA0E6",
  primaryDark: "#3E6FB8",
  primaryMid: "#5688D4",

  amber: "#E0B45A",
  amberLight: "rgba(224,180,90,0.13)",
  amberMid: "rgba(224,180,90,0.30)",
  amberDark: "#E0B45A",
  amberDeep: "#FFE8B0",

  green: "#7FBE9A",
  greenDark: "#7FBE9A",
  greenLight: "rgba(127,190,154,0.12)",

  danger: "#E07F73",
  dangerDark: "#E07F73",
  dangerDeep: "#FFB0A0",
  dangerLight: "rgba(224,127,115,0.13)",

  warningBg: "#1E1A0D",
  warningText: "#E0B45A",

  pro: "#A893E0",
  proLight: "rgba(168,147,224,0.13)",

  ink300: "#3E3A36",
  blue200: "#263042",
  blue100: "#1A2437",
  amber200: "#3A2C10",
  red200: "#3A1410",
  green100: "#131F16",
};

// Backward-compatible alias for older code paths. The app is dark-first.
export const colors = darkColors;

export type ColorPalette = typeof lightColors;

export const fonts = {
  display: "Geist_600SemiBold",
  displayBold: "Geist_700Bold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  bodyExtraBold: "Inter_800ExtraBold",
};

export const typeScale = {
  largeTitle: { fontSize: 34, lineHeight: 41 },
  title1: { fontSize: 28, lineHeight: 34 },
  title2: { fontSize: 22, lineHeight: 28 },
  title3: { fontSize: 20, lineHeight: 25 },
  headline: { fontSize: 17, lineHeight: 22 },
  body: { fontSize: 17, lineHeight: 22 },
  callout: { fontSize: 16, lineHeight: 21 },
  subhead: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption1: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 14 },
  sectionHeader: { fontSize: 13, lineHeight: 16 },
} as const;

export const typeStyles = {
  ...typeScale,
  rowTitle: typeScale.headline,
  rowSecondary: typeScale.subhead,
  rowMeta: typeScale.footnote,
  button: typeScale.headline,
  input: typeScale.body,
  screenTitle: typeScale.title1,
  largeScreenTitle: typeScale.largeTitle,
  compactTitle: typeScale.title2,
  sectionHeader: typeScale.sectionHeader,
} as const;

export type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";
type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  scheme: ResolvedTheme;
  colors: ColorPalette;
};

const THEME_STORAGE_KEY = "app_theme_v3";
const LEGACY_THEME_STORAGE_KEYS = ["app_theme", "app_theme_v2"];
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function readSystemTheme(fallback: ResolvedTheme = "dark"): ResolvedTheme {
  const scheme = Appearance.getColorScheme();
  return scheme === "light" || scheme === "dark" ? scheme : fallback;
}

function resolveTheme(preference: ThemePreference, systemTheme: ResolvedTheme): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return systemTheme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => readSystemTheme());
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    void AsyncStorage.multiRemove(LEGACY_THEME_STORAGE_KEYS).catch(() => {});

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (isThemePreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSystemTheme((current) => readSystemTheme(current));
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme === "light" || colorScheme === "dark") {
        setSystemTheme(colorScheme);
      }
    });

    return () => subscription.remove();
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
  }, []);

  const scheme = resolveTheme(preference, systemTheme);
  const palette = scheme === "light" ? lightColors : darkColors;
  const value = useMemo(
    () => ({ preference, setPreference, scheme, colors: palette }),
    [palette, preference, scheme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference(): ThemeContextValue {
  const context = useContext(ThemeContext);
  const systemTheme = readSystemTheme();
  const scheme = resolveTheme("system", systemTheme);
  return context ?? {
    preference: "system",
    setPreference: () => {},
    scheme,
    colors: scheme === "light" ? lightColors : darkColors,
  };
}

export function useColors(): ColorPalette {
  return useThemePreference().colors;
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
  subtitle,
  titleSize,
  compact = false,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  subtitle?: string;
  titleSize?: number;
  compact?: boolean;
}) {
  const colors = useColors();
  const titleType = compact ? typeStyles.headline : typeStyles.compactTitle;
  const resolvedTitleSize = titleSize ?? titleType.fontSize;
  const styles = useMemo(() => StyleSheet.create({
    appbar: {
      minHeight: compact ? 52 : 63,
      paddingHorizontal: 20,
      paddingTop: compact ? 8 : 12,
      paddingBottom: compact ? 10 : 14,
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
      minWidth: compact ? 34 : 36,
      minHeight: compact ? 34 : 36,
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
      fontFamily: fonts.bodySemiBold,
      fontSize: resolvedTitleSize,
      fontWeight: "500",
      textAlign: "center",
      lineHeight: resolvedTitleSize === titleType.fontSize ? titleType.lineHeight : resolvedTitleSize + 4
    },
    appbarSubtitle: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...(compact ? typeStyles.caption1 : typeStyles.rowMeta)
    }
  }), [colors, compact, resolvedTitleSize, titleType]);

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
      <Text style={{ color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.footnote, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Назад"
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <AppIcon name="chevron-left" size={28} color={colors.text} strokeWidth={1.9} />
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
      minHeight: 54,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18
    },
    primary: { backgroundColor: colors.brandBlue },
    secondary: { backgroundColor: colors.blueSoft },
    danger: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: colors.danger
    },
    primaryText: { color: colors.textOnAccent, fontFamily: fonts.bodySemiBold, ...typeStyles.button, fontWeight: "600" },
    secondaryText: { color: colors.primary, fontFamily: fonts.bodySemiBold, ...typeStyles.button, fontWeight: "600" },
    dangerText: { color: colors.danger, fontFamily: fonts.bodySemiBold, ...typeStyles.button, fontWeight: "600" },
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
  multiline,
  editable = true
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address";
  multiline?: boolean;
  editable?: boolean;
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
      editable={editable}
      style={[
        {
          minHeight: 50,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          color: editable ? colors.text : colors.muted3,
          paddingHorizontal: 16,
          fontFamily: fonts.body,
          ...typeStyles.input
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
      <Text style={{ color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.headline, fontWeight: "700", textAlign: "center" }}>{title}</Text>
      {detail ? <Text style={{ color: colors.muted, fontFamily: fonts.body, ...typeStyles.rowSecondary, textAlign: "center" }}>{detail}</Text> : null}
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  const colors = useColors();
  if (!message) return null;
  return <Text style={{ color: colors.danger, fontFamily: fonts.body, ...typeStyles.rowSecondary, paddingHorizontal: 20 }}>{message}</Text>;
}
