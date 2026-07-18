import * as WebBrowser from "expo-web-browser";

import { supabase } from "@/lib/supabase";
import { t } from "@/lib/i18n";

// Extracted from the removed AuthScreen so the onboarding auth slide (now the
// only sign-in surface) can run the same Supabase OAuth web flow.

export type SocialProvider = "google" | "apple";

export type SocialSignInResult =
  | { ok: true }
  | { ok: false; error: string | null }; // error === null → user cancelled

const oauthRedirectTo = "jasne://auth/callback";

WebBrowser.maybeCompleteAuthSession();

export async function signInWithProvider(provider: SocialProvider): Promise<SocialSignInResult> {
  try {
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: oauthRedirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (oauthError) return { ok: false, error: mapAuthError(oauthError.message) };
    if (!data.url) return { ok: false, error: t("auth.errorFallback") };

    const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectTo);
    if (result.type !== "success") return { ok: false, error: null };

    const authError = await completeOAuthRedirect(result.url);
    if (authError) return { ok: false, error: mapAuthError(authError) };
    return { ok: true };
  } catch (oauthError) {
    return { ok: false, error: mapAuthError(oauthError instanceof Error ? oauthError.message : "") };
  }
}

function mapAuthError(message: string) {
  const normalized = message.toLowerCase();

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
