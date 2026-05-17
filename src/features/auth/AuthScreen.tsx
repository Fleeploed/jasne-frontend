import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { supabase } from "@/lib/supabase";
import { AuthGradient } from "@/components/AuthGradient";
import { Button, fonts, useColors, type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";

type AuthMode = "register" | "login" | "forgot";
type FieldErrors = Partial<Record<"email" | "password" | "confirmPassword", string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const oauthRedirectTo = "jasne://auth/callback";
const passwordResetRedirectTo = ExpoLinking.createURL("auth/reset-password");

WebBrowser.maybeCompleteAuthSession();

export function AuthScreen({ initialMode = "register" }: { initialMode?: "register" | "login" }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<FieldErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"google" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const fieldErrors = useMemo(
    () => validateFields(mode, email, password, confirmPassword),
    [confirmPassword, email, mode, password]
  );
  const isValid = Object.keys(fieldErrors).length === 0;
  const showError = (field: keyof FieldErrors) => Boolean(submitAttempted || touched[field]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setTouched({});
    setSubmitAttempted(false);
    setFormError(null);
    setFormMessage(null);
  }

  async function submit() {
    setSubmitAttempted(true);
    setFormError(null);
    setFormMessage(null);
    if (!isValid || loading) return;

    setLoading(true);
    const credentials = { email: email.trim(), password };
    const { error: authError } =
      mode === "login"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (authError) setFormError(mapAuthError(authError.message));
    setLoading(false);
  }

  async function signInWithGoogle() {
    if (loading || socialLoading) return;
    setFormError(null);
    setFormMessage(null);
    setSocialLoading("google");

    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: oauthRedirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (oauthError) {
        setFormError(mapAuthError(oauthError.message));
        return;
      }
      if (!data.url) {
        setFormError(t("auth.errorFallback"));
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectTo);
      if (result.type !== "success") return;

      const authError = await completeOAuthRedirect(result.url);
      if (authError) setFormError(mapAuthError(authError));
    } catch (oauthError) {
      setFormError(mapAuthError(oauthError instanceof Error ? oauthError.message : ""));
    } finally {
      setSocialLoading(null);
    }
  }

  async function resetPassword() {
    setFormError(null);
    setFormMessage(null);
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !emailPattern.test(trimmedEmail)) {
      setTouched((current) => ({ ...current, email: "1" }));
      setFormError(t("auth.resetEmailRequired"));
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: passwordResetRedirectTo,
    });
    setLoading(false);

    if (resetError) {
      setFormError(mapAuthError(resetError.message));
      return;
    }

    setFormMessage(t("auth.resetEmailSent"));
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
          {mode === "forgot" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              onPress={() => switchMode("login")}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <AppIcon name="chevron-left" size={22} color={colors.text} />
              <Text style={styles.backText}>{t("common.back")}</Text>
            </Pressable>
          ) : null}

          <View style={styles.header}>
            <Text style={styles.logo}>jasně</Text>
            <Text style={styles.subtitle}>
              {mode === "register"
                ? t("auth.registerSubtitle")
                : mode === "forgot"
                  ? t("auth.forgotSubtitle")
                  : t("auth.loginSubtitle")}
            </Text>
          </View>

          {mode !== "forgot" ? (
            <View style={styles.social}>
              <SocialButton
                title={t("auth.continueWithGoogle")}
                icon="G"
                onPress={signInWithGoogle}
                loading={socialLoading === "google"}
                disabled={loading || Boolean(socialLoading)}
                colors={colors}
                styles={styles}
              />
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t("auth.orEmail")}</Text>
                <View style={styles.dividerLine} />
              </View>
            </View>
          ) : null}

          <View style={styles.form}>
            <AuthInput
              label={t("auth.email")}
              value={email}
              onChangeText={setEmail}
              onBlur={() => setTouched((current) => ({ ...current, email: "1" }))}
              placeholder={t("auth.emailPlaceholder")}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              iconLabel="@"
              error={showError("email") ? fieldErrors.email : undefined}
              colors={colors}
              styles={styles}
            />
            {mode !== "forgot" ? (
              <View style={styles.passwordBlock}>
                <AuthInput
                  label={t("auth.password")}
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => setTouched((current) => ({ ...current, password: "1" }))}
                  placeholder={t("auth.passwordPlaceholder")}
                  secureTextEntry
                  textContentType={mode === "login" ? "password" : "newPassword"}
                  autoComplete={mode === "login" ? "password" : "new-password"}
                  iconLabel="•"
                  hint={mode === "register" ? t("auth.errorPasswordLength") : undefined}
                  error={showError("password") ? fieldErrors.password : undefined}
                  colors={colors}
                  styles={styles}
                />
                {mode === "login" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("auth.forgotPassword")}
                    disabled={loading}
                    onPress={() => switchMode("forgot")}
                    style={({ pressed }) => [styles.forgotInline, pressed && styles.pressed]}
                  >
                    <Text style={styles.forgotInlineText}>{t("auth.forgotPassword")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {mode === "register" ? (
              <AuthInput
                label={t("auth.confirmPassword")}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onBlur={() => setTouched((current) => ({ ...current, confirmPassword: "1" }))}
                placeholder={t("auth.confirmPasswordPlaceholder")}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                iconLabel="•"
                error={showError("confirmPassword") ? fieldErrors.confirmPassword : undefined}
                colors={colors}
                styles={styles}
              />
            ) : null}
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
          {formMessage ? <Text style={styles.formMessage}>{formMessage}</Text> : null}
          {mode === "forgot" ? (
            <View style={styles.infoBox}>
              <AppIcon name="info" size={18} color={colors.primary} />
              <Text style={styles.infoText}>{t("auth.resetHint")}</Text>
            </View>
          ) : null}

          <View style={styles.flexSpacer} />

          <View style={styles.actions}>
            {mode === "forgot" ? (
              <Button
                title={t("auth.sendResetLink")}
                onPress={resetPassword}
                loading={loading}
                disabled={!isValid || loading}
              />
            ) : (
              <Button
                title={mode === "register" ? t("auth.register") : t("auth.login")}
                onPress={submit}
                loading={loading}
                disabled={!isValid || loading}
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mode === "register" || mode === "forgot" ? t("auth.haveAccount") : t("auth.createAccount")}
              disabled={loading}
              onPress={() => switchMode(mode === "register" || mode === "forgot" ? "login" : "register")}
              style={({ pressed }) => [styles.inlineSwitchButton, pressed && styles.pressed, loading && styles.disabled]}
            >
              <Text style={styles.inlineSwitchMuted}>
                {mode === "register" || mode === "forgot" ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
                <Text style={styles.inlineSwitchLink}>
                  {mode === "register" || mode === "forgot" ? t("auth.login") : t("auth.createAccount")}
                </Text>
              </Text>
            </Pressable>
          </View>

          {mode === "register" ? (
            <View style={styles.legal}>
              <Text style={styles.legalText}>{t("auth.legalPrefix")} </Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t("auth.terms")}
                onPress={() => void Linking.openURL("https://jasne.app/terms")}
                hitSlop={8}
              >
                <Text style={styles.legalLink}>{t("auth.terms")}</Text>
              </Pressable>
              <Text style={styles.legalText}> {t("auth.legalAnd")} </Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t("auth.privacy")}
                onPress={() => void Linking.openURL("https://jasne.app/privacy")}
                hitSlop={8}
              >
                <Text style={styles.legalLink}>{t("auth.privacy")}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SocialButton({
  title,
  icon,
  onPress,
  loading,
  disabled,
  colors,
  styles,
}: {
  title: string;
  icon: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.socialButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.socialIcon, { color: colors.text }]}>{loading ? "…" : icon}</Text>
      <Text style={styles.socialButtonText}>{title}</Text>
      <View style={styles.socialSpacer} />
    </Pressable>
  );
}

function AuthInput({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  secureTextEntry,
  iconLabel,
  hint,
  keyboardType = "default",
  textContentType,
  autoComplete,
  error,
  colors,
  styles
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  placeholder: string;
  secureTextEntry?: boolean;
  iconLabel?: string;
  hint?: string;
  keyboardType?: "default" | "email-address";
  textContentType?: "emailAddress" | "password" | "newPassword";
  autoComplete?: "email" | "password" | "new-password";
  error?: string;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.inputBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        {iconLabel ? <Text style={styles.inputIcon}>{iconLabel}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.muted3}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          textContentType={textContentType}
          autoComplete={autoComplete}
          style={[styles.input, iconLabel && styles.inputWithIcon, error && styles.inputError]}
        />
      </View>
      {hint && !error ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function validateFields(mode: AuthMode, email: string, password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedEmail = email.trim();

  if (!trimmedEmail) errors.email = t("auth.errorEmailRequired");
  else if (!emailPattern.test(trimmedEmail)) errors.email = t("auth.errorEmailInvalid");

  if (mode === "forgot") return errors;

  if (!password) errors.password = t("auth.errorPasswordRequired");
  else if (mode === "register" && password.length < 8) errors.password = t("auth.errorPasswordLength");

  if (mode === "register") {
    if (!confirmPassword) errors.confirmPassword = t("auth.errorConfirmRequired");
    else if (confirmPassword !== password) errors.confirmPassword = t("auth.errorPasswordMismatch");
  }

  return errors;
}

function mapAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) return t("auth.errorInvalidCredentials");
  if (normalized.includes("already registered") || normalized.includes("already exists") || normalized.includes("user already registered")) {
    return t("auth.errorEmailRegistered");
  }
  if (normalized.includes("weak password") || normalized.includes("password should be") || normalized.includes("password must")) {
    return t("auth.errorWeakPassword");
  }
  if (normalized.includes("network") || normalized.includes("fetch") || normalized.includes("connection")) {
    return t("auth.errorNetwork");
  }

  return t("auth.errorFallback");
}

async function completeOAuthRedirect(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return t("auth.errorFallback");
  }
  const code = parsed.searchParams.get("code");
  const queryError = parsed.searchParams.get("error_description") ?? parsed.searchParams.get("error");
  if (queryError) return queryError;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error?.message ?? null;
  }

  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const hashError = hashParams.get("error_description") ?? hashParams.get("error");
  if (hashError) return hashError;

  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return error?.message ?? null;
  }

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
      gap: 14
    },
    backButton: {
      minHeight: 44,
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginLeft: -4,
      marginBottom: 10
    },
    backIcon: { color: colors.muted, fontSize: 34, lineHeight: 36, fontFamily: fonts.body, fontWeight: "400" },
    backText: { color: colors.muted, fontSize: 17, lineHeight: 22, fontFamily: fonts.bodyBold, fontWeight: "700" },
    header: {
      gap: 12,
      marginBottom: 2
    },
    logo: {
      color: colors.primary,
      fontFamily: fonts.display,
      fontSize: 44,
      lineHeight: 48,
      fontWeight: "600",
      letterSpacing: 0
    },
    subtitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 22,
      lineHeight: 29,
      fontWeight: "600",
      letterSpacing: -0.2
    },
    form: { gap: 10 },
    social: { gap: 10 },
    socialButton: {
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16
    },
    socialIcon: {
      width: 28,
      fontSize: 22,
      lineHeight: 24,
      fontFamily: fonts.bodyExtraBold,
      fontWeight: "800",
      textAlign: "center"
    },
    socialButtonText: {
      color: colors.text,
      fontSize: 16,
      fontFamily: fonts.bodyBold,
      fontWeight: "800"
    },
    socialSpacer: { width: 28 },
    dividerRow: {
      minHeight: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border
    },
    dividerText: {
      color: colors.muted,
      fontSize: 12,
      fontFamily: fonts.bodyBold,
      fontWeight: "700",
      letterSpacing: 0.4
    },
    passwordBlock: { gap: 0 },
    forgotInline: {
      alignSelf: "flex-end",
      paddingVertical: 8,
      paddingHorizontal: 4,
      marginTop: 4
    },
    forgotInlineText: {
      color: colors.primary,
      fontSize: 14,
      fontFamily: fonts.bodyBold,
      fontWeight: "700"
    },
    inputBlock: { gap: 7 },
    label: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 17,
      fontFamily: fonts.bodyBold,
      fontWeight: "800",
      textTransform: "uppercase"
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
      fontWeight: "700"
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
      fontWeight: "400"
    },
    inputWithIcon: { paddingLeft: 48 },
    inputError: { borderColor: colors.danger },
    fieldHint: {
      color: colors.muted2,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: fonts.bodyMedium,
      fontWeight: "500"
    },
    fieldError: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 18
    },
    formError: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.bodySemiBold,
      fontWeight: "600"
    },
    formMessage: {
      color: colors.green,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.bodyBold,
      fontWeight: "700"
    },
    actions: { gap: 12 },
    flexSpacer: { flex: 1, minHeight: 18 },
    inlineSwitchButton: {
      minHeight: 34,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18
    },
    inlineSwitchMuted: {
      color: colors.muted2,
      fontSize: 16,
      lineHeight: 22,
      fontFamily: fonts.bodySemiBold,
      fontWeight: "600",
      textAlign: "center"
    },
    inlineSwitchLink: {
      color: colors.primary,
      fontFamily: fonts.bodyExtraBold,
      fontWeight: "900"
    },
    infoBox: {
      minHeight: 72,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.blueMid,
      backgroundColor: colors.blueSoft,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 14
    },
    infoIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.primary,
      color: colors.primary,
      textAlign: "center",
      lineHeight: 20,
      fontSize: 14,
      fontFamily: fonts.bodyExtraBold,
      fontWeight: "900"
    },
    infoText: {
      flex: 1,
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fonts.bodySemiBold,
      fontWeight: "600"
    },
    legal: {
      minHeight: 44,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center"
    },
    legalText: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 19
    },
    legalLink: {
      color: colors.primary,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.bodyExtraBold,
      fontWeight: "800"
    },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.55 }
  });
}
