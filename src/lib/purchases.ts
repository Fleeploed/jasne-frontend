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

import { Linking, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type {
  CustomerInfo,
  MakePurchaseResult,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
const SUBSCRIPTION_URL_IOS = "https://apps.apple.com/account/subscriptions";
const SUBSCRIPTION_URL_ANDROID = "https://play.google.com/store/account/subscriptions";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let configured = false;
let configurePromise: Promise<boolean> | null = null;
let proPackagesCache: ProPackages | null = null;
let proPackagesPromise: Promise<ProPackages | null> | null = null;

export type RevenueCatPlan = "monthly" | "yearly";

export type ProPackage = {
  plan: RevenueCatPlan;
  rcPackage: PurchasesPackage;
  price: string;
  pricePerMonth: string | null;
};

export type ProPackages = Record<RevenueCatPlan, ProPackage | null>;

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
  if (configured) return true;
  if (configurePromise) return configurePromise;

  configurePromise = configurePurchasesOnce().finally(() => {
    configurePromise = null;
  });

  return configurePromise;
}

async function configurePurchasesOnce() {
  const apiKey = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) {
    // Missing key is expected in dev until env vars are wired — don't spam.
    if (__DEV__) {
      console.warn(
        `[purchases] EXPO_PUBLIC_REVENUECAT_${Platform.OS === "ios" ? "IOS" : "ANDROID"}_KEY is not set`
      );
    }
    return false;
  }
  const Purchases = await getPurchases();
  if (!Purchases) return false;

  try {
    Purchases.setLogLevel(__DEV__ ? ("DEBUG" as never) : ("ERROR" as never));
    Purchases.configure({ apiKey });
    configured = true;
    return true;
  } catch (error) {
    console.warn("[purchases] configure failed:", error);
    return false;
  }
}

async function getConfiguredPurchases() {
  const isConfigured = await configurePurchases();
  if (!isConfigured) return null;
  return getPurchases();
}

export async function getProPackages({ forceRefresh = false } = {}): Promise<ProPackages | null> {
  if (!forceRefresh && proPackagesCache) return proPackagesCache;
  if (!forceRefresh && proPackagesPromise) return proPackagesPromise;

  proPackagesPromise = fetchProPackages().finally(() => {
    proPackagesPromise = null;
  });

  const packages = await proPackagesPromise;
  if (packages) proPackagesCache = packages;
  return packages;
}

async function fetchProPackages(): Promise<ProPackages | null> {
  const Purchases = await getConfiguredPurchases();
  if (!Purchases) return null;

  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.current ?? Object.values(offerings.all)[0] ?? null;
    if (!offering) return { monthly: null, yearly: null };

    return {
      monthly: normalizePackage("monthly", findPackageForPlan(offering, "monthly")),
      yearly: normalizePackage("yearly", findPackageForPlan(offering, "yearly")),
    };
  } catch (error) {
    console.warn("[purchases] getOfferings failed:", error);
    return null;
  }
}

function normalizePackage(plan: RevenueCatPlan, rcPackage: PurchasesPackage | null): ProPackage | null {
  if (!rcPackage) return null;
  return {
    plan,
    rcPackage,
    price: rcPackage.product.priceString,
    pricePerMonth: rcPackage.product.pricePerMonthString,
  };
}

function findPackageForPlan(offering: PurchasesOffering, plan: RevenueCatPlan): PurchasesPackage | null {
  const directPackage = plan === "monthly" ? offering.monthly : offering.annual;
  if (directPackage) return directPackage;

  const packageType = plan === "monthly" ? "MONTHLY" : "ANNUAL";
  const subscriptionPeriod = plan === "monthly" ? "P1M" : "P1Y";
  const identifierHints = plan === "monthly" ? ["monthly", "month"] : ["annual", "yearly", "year"];

  return (
    offering.availablePackages.find((candidate) => String(candidate.packageType) === packageType) ??
    offering.availablePackages.find((candidate) => candidate.product.subscriptionPeriod === subscriptionPeriod) ??
    offering.availablePackages.find((candidate) => {
      const packageId = candidate.identifier.toLowerCase();
      const productId = candidate.product.identifier.toLowerCase();
      return identifierHints.some((hint) => packageId.includes(hint) || productId.includes(hint));
    }) ??
    null
  );
}

export async function purchaseRevenueCatPackage(rcPackage: PurchasesPackage): Promise<MakePurchaseResult> {
  const Purchases = await getConfiguredPurchases();
  if (!Purchases) throw new Error("RevenueCat is not configured.");
  return Purchases.purchasePackage(rcPackage);
}

export async function restoreRevenueCatPurchases(): Promise<CustomerInfo> {
  const Purchases = await getConfiguredPurchases();
  if (!Purchases) throw new Error("RevenueCat is not configured.");
  return Purchases.restorePurchases();
}

export async function getSubscriptionManagementUrl(): Promise<string> {
  const Purchases = await getConfiguredPurchases();
  if (Purchases) {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      if (customerInfo.managementURL) return customerInfo.managementURL;
    } catch (error) {
      if (__DEV__) console.warn("[purchases] getCustomerInfo failed:", error);
    }
  }

  return Platform.OS === "ios" ? SUBSCRIPTION_URL_IOS : SUBSCRIPTION_URL_ANDROID;
}

export async function openSubscriptionManagement(): Promise<void> {
  const url = await getSubscriptionManagementUrl();
  await Linking.openURL(url);
}

export function isRevenueCatPurchaseCancelled(error: unknown) {
  const candidate = error as { code?: unknown; userCancelled?: unknown } | null;
  return candidate?.userCancelled === true || candidate?.code === "1";
}

/**
 * Alias the current device's purchases to the Supabase user UUID.
 * Safe to call multiple times — RevenueCat is idempotent on logIn().
 */
export async function identifyPurchasesUser(userId: string) {
  if (!userId) return;
  const Purchases = await getConfiguredPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logIn(userId);
    proPackagesCache = null;
  } catch (error) {
    console.warn("[purchases] logIn failed:", error);
  }
}

/**
 * Reset the SDK to an anonymous ID. Called from signOut so the next user
 * on the same device doesn't inherit the previous user's purchases.
 */
export async function clearPurchasesIdentity() {
  const Purchases = await getConfiguredPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logOut();
    proPackagesCache = null;
  } catch (error) {
    // logOut throws if the user is already anonymous — safe to ignore.
    if (__DEV__) console.info("[purchases] logOut ignored:", error);
  }
}
