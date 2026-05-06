import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

import { supabase } from "@/lib/supabase";
import { Button, ErrorText, Field, Screen, useColors, type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";

export function AuthScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    setNotice(null);

    const credentials = { email: email.trim(), password };
    const { error: authError } =
      mode === "login"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (authError) setError(authError.message);
    if (!authError && mode === "register") setNotice(t("auth.registerNotice"));
    setLoading(false);
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <View style={styles.panel}>
          <Text style={styles.title}>jasně</Text>
          <Text style={styles.subtitle}>{t("auth.subtitle")}</Text>

          <View style={styles.fields}>
            <Field value={email} onChangeText={setEmail} placeholder="E-mail" keyboardType="email-address" />
            <Field value={password} onChangeText={setPassword} placeholder={t("auth.password")} secureTextEntry />
          </View>

          <ErrorText message={error} />
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Button
            title={mode === "login" ? t("auth.login") : t("auth.register")}
            onPress={submit}
            loading={loading}
            disabled={!email.trim() || password.length < 6}
          />
          <Button
            title={mode === "login" ? t("auth.createAccount") : t("auth.haveAccount")}
            onPress={() => setMode(mode === "login" ? "register" : "login")}
            variant="secondary"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: "center", padding: 20 },
    panel: { gap: 14 },
    title: {
      color: colors.primary,
      fontSize: 38,
      fontWeight: "800",
      letterSpacing: 0
    },
    subtitle: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 22,
      marginBottom: 12
    },
    fields: { gap: 10 },
    notice: { color: colors.primary, fontSize: 14, lineHeight: 20 }
  });
}
