import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGradient } from "@/components/AuthGradient";
import { Button, fonts, useColors, type ColorPalette } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

export function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { clearPasswordRecovery, signOut } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordError = validatePassword(password, confirmPassword);
  const showError = touched && passwordError;

  async function submit() {
    setTouched(true);
    setError(null);
    if (passwordError || loading) return;

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(mapResetError(updateError.message));
      return;
    }

    clearPasswordRecovery();
  }

  async function cancel() {
    clearPasswordRecovery();
    await signOut();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <AuthGradient />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.logo}>jasně</Text>
            <Text style={styles.title}>{t("auth.resetTitle")}</Text>
            <Text style={styles.subtitle}>{t("auth.resetSubtitle")}</Text>
          </View>

          <View style={styles.form}>
            <PasswordInput
              label={t("auth.newPassword")}
              value={password}
              onChangeText={setPassword}
              onBlur={() => setTouched(true)}
              placeholder={t("auth.passwordPlaceholder")}
              colors={colors}
              styles={styles}
            />
            <PasswordInput
              label={t("auth.confirmPassword")}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onBlur={() => setTouched(true)}
              placeholder={t("auth.confirmPasswordPlaceholder")}
              colors={colors}
              styles={styles}
            />
            {showError ? <Text style={styles.error}>{passwordError}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <View style={styles.flexSpacer} />

          <View style={styles.actions}>
            <Button
              title={t("auth.saveNewPassword")}
              onPress={submit}
              loading={loading}
              disabled={Boolean(passwordError) || loading}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
              disabled={loading}
              onPress={cancel}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed, loading && styles.disabled]}
            >
              <Text style={styles.cancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function PasswordInput({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  colors,
  styles,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  placeholder: string;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.inputBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Text style={styles.inputIcon}>•</Text>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.muted3}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          style={[styles.input, styles.inputWithIcon]}
        />
      </View>
    </View>
  );
}

function validatePassword(password: string, confirmPassword: string) {
  if (!password) return t("auth.errorPasswordRequired");
  if (password.length < 8) return t("auth.errorPasswordLength");
  if (!confirmPassword) return t("auth.errorConfirmRequired");
  if (password !== confirmPassword) return t("auth.errorPasswordMismatch");
  return null;
}

function mapResetError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("weak password") || normalized.includes("password")) return t("auth.errorWeakPassword");
  if (normalized.includes("network") || normalized.includes("fetch")) return t("auth.errorNetwork");
  return t("auth.errorFallback");
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1 },
    keyboard: { flex: 1 },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingBottom: 28,
      gap: 14,
    },
    header: { gap: 12, marginBottom: 2 },
    logo: {
      color: colors.primary,
      fontFamily: fonts.display,
      fontSize: 44,
      lineHeight: 48,
      fontWeight: "600",
    },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 22,
      lineHeight: 29,
      fontWeight: "600",
      letterSpacing: -0.2,
    },
    subtitle: {
      color: colors.muted,
      fontFamily: fonts.bodySemiBold,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "600",
    },
    form: { gap: 10 },
    inputBlock: { gap: 7 },
    label: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 17,
      fontFamily: fonts.bodyBold,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    inputWrap: { position: "relative", justifyContent: "center" },
    inputIcon: {
      position: "absolute",
      left: 16,
      zIndex: 1,
      color: colors.muted3,
      fontSize: 19,
      lineHeight: 22,
      fontFamily: fonts.bodyBold,
      fontWeight: "700",
    },
    input: {
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      paddingHorizontal: 16,
      fontFamily: fonts.body,
      fontSize: 17,
      fontWeight: "400",
    },
    inputWithIcon: { paddingLeft: 48 },
    flexSpacer: { flex: 1, minHeight: 18 },
    actions: { gap: 8 },
    cancelButton: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    cancelText: {
      color: colors.muted2,
      fontSize: 16,
      lineHeight: 22,
      fontFamily: fonts.bodySemiBold,
      fontWeight: "600",
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.bodySemiBold,
      fontWeight: "600",
    },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.55 },
  });
}
