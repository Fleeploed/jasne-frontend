// Render is the current backend until the Railway production plan is ready.
// EAS profiles also set EXPO_PUBLIC_API_BASE_URL explicitly; this fallback keeps
// a misconfigured build on the same active backend instead of the old Railway URL.
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://jasne-backend.onrender.com";

export const config = {
  apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
  supabaseUrl: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""),
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""
};

export function assertRuntimeConfig() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      "Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
}
