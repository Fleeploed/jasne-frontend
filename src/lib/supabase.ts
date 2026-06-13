import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";

import { config, assertRuntimeConfig } from "@/lib/config";
import { secureStorage } from "@/lib/secureStorage";

assertRuntimeConfig();

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});
