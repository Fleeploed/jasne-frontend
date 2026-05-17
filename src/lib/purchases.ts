/**
 * RevenueCat client wrapper.
 *
 * - configure() runs ONCE on app start (idempotent guarded).
 * - identify(userId) is called after Supabase sign-in so RevenueCat ties
 *   the device's anonymous purchases to the Supabase UUID — critical so
 *   the backend webhook (event.app_user_id === supabaseUserId) can flip
 *   profiles.plan correctly.
 * - clearIdentity() resets to an anonymous ID on sign-out.
 *
 * The whole module no-ops in Expo Go and in environments where the native
 * module isn't linked — every call is wrapped in a try/catch and logged so
 * a missing native module never crashes the JS bundle.
 */

import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let configured = false;

/**
 * Lazy-load the native module. Returns null if it's unavailable (Expo Go,
 * web, or simply not linked yet). Callers should silently no-op in that case.
 */
async function getPurchases() {
  if (isExpoGo) return null;
  try {
    const module = await import("react-native-purchases");
    return module.default;
  } catch (error) {
    console.warn("[purchases] native module unavailable:", error);
    return null;
  }
}

export async function configurePurchases() {
  if (configured) return;
  const apiKey = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) {
    // Missing key is expected in dev until env vars are wired — don't spam.
    if (__DEV__) {
      console.warn(
        `[purchases] EXPO_PUBLIC_REVENUECAT_${Platform.OS === "ios" ? "IOS" : "ANDROID"}_KEY is not set`
      );
    }
    return;
  }
  const Purchases = await getPurchases();
  if (!Purchases) return;

  try {
    Purchases.setLogLevel(__DEV__ ? ("DEBUG" as never) : ("ERROR" as never));
    Purchases.configure({ apiKey });
    configured = true;
  } catch (error) {
    console.warn("[purchases] configure failed:", error);
  }
}

/**
 * Alias the current device's purchases to the Supabase user UUID.
 * Safe to call multiple times — RevenueCat is idempotent on logIn().
 */
export async function identifyPurchasesUser(userId: string) {
  if (!userId) return;
  const Purchases = await getPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logIn(userId);
  } catch (error) {
    console.warn("[purchases] logIn failed:", error);
  }
}

/**
 * Reset the SDK to an anonymous ID. Called from signOut so the next user
 * on the same device doesn't inherit the previous user's purchases.
 */
export async function clearPurchasesIdentity() {
  const Purchases = await getPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logOut();
  } catch (error) {
    // logOut throws if the user is already anonymous — safe to ignore.
    if (__DEV__) console.info("[purchases] logOut ignored:", error);
  }
}
