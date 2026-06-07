// Fail-safe default points at PRODUCTION (Railway). Local dev and the EAS
// development/preview profiles override this via EXPO_PUBLIC_API_BASE_URL
// (see .env and eas.json). This way a misconfigured release build can never
// silently talk to the develop backend.
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://jasne-backend-production.up.railway.app";

export const config = {
  apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""
};

export function assertRuntimeConfig() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      "Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
}
