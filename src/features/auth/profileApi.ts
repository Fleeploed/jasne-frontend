import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { ProfileResponse, UserLanguage } from "@/lib/types";

/**
 * Pushes the user's chosen UI language to their backend profile.
 *
 * The app's LocaleContext (AsyncStorage) stays the source of truth for the UI —
 * this only keeps `profiles.language` aligned so server-side fallbacks match
 * what the user picked (e.g. the chat answer language when a scan has no stored
 * language; `scan.language` is preferred but falls back to the profile).
 *
 * Best-effort and a deliberate no-op when signed out: the language step in
 * onboarding runs before registration, and calling `apiFetch` without a token
 * would 401 and force a sign-out. Callers should swallow rejections.
 */
export async function syncProfileLanguage(language: UserLanguage): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) return;
  await apiFetch<ProfileResponse>("/profile", { method: "PUT", json: { language } });
}
