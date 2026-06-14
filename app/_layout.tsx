import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AccountDeletionScreen } from "@/features/auth/AccountDeletionScreen";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { readCachedProfile, writeCachedProfile } from "@/features/auth/profileCache";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { ThemeProvider, lightColors, useColors } from "@/components/ui";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AnalyticsRouteTracker } from "@/lib/AnalyticsRouteTracker";
import { LocaleProvider } from "@/lib/LocaleContext";
import { initializeAnalytics } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { t } from "@/lib/i18n";
import { configurePurchases } from "@/lib/purchases";
import {
  addNotificationReceivedListener,
  addNotificationTapListener,
  syncPushTokenAfterSignIn,
} from "@/lib/pushNotifications";
import { queryClient } from "@/lib/queryClient";
import type { ProfileResponse } from "@/lib/types";

initializeAnalytics();

const ONBOARDING_STORAGE_KEY = "jasne_onboarding_v2_seen";
const ROOT_FALLBACK_BG = "#0F0D0B";

function RootLayout() {
  // Initialize RevenueCat once for the whole app session. Safe to call
  // before sign-in — purchases start in anonymous mode and get re-aliased
  // to the Supabase UUID in AuthProvider once a session arrives.
  useEffect(() => {
    void configurePurchases();
  }, []);

  const [fontsLoaded] = useFonts({
    Geist_600SemiBold: require("@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf"),
    Geist_700Bold: require("@expo-google-fonts/geist/700Bold/Geist_700Bold.ttf"),
    Inter_400Regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    Inter_500Medium: require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"),
    Inter_600SemiBold: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
    Inter_800ExtraBold: require("@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf"),
  });

  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider style={{ flex: 1, backgroundColor: ROOT_FALLBACK_BG }}>
          <FontLoadingScreen />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: ROOT_FALLBACK_BG }}>
        <ThemeProvider>
          <ErrorBoundary>
            <ThemedAppRoot>
              <QueryClientProvider client={queryClient}>
                <ThemedStatusBar />
                <LocaleProvider>
                  <AuthProvider>
                    <AnalyticsRouteTracker />
                    <OfflineBanner />
                    <RootNavigator />
                  </AuthProvider>
                </LocaleProvider>
              </QueryClientProvider>
            </ThemedAppRoot>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

function ThemedStatusBar() {
  const colors = useColors();
  const isLight = colors.bg === lightColors.bg;
  return <StatusBar style={isLight ? "dark" : "light"} backgroundColor={colors.bg} />;
}

function ThemedAppRoot({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

function FontLoadingScreen() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function RootNavigator() {
  const { initializing, passwordRecovery, session, hasHadAccount } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then((stored) => setOnboardingSeen(stored === "1"))
      .catch(() => setOnboardingSeen(true));
  }, []);

  const completeOnboarding = useCallback(() => {
    setOnboardingSeen(true);
    void AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "1").catch(() => {});
  }, []);

  useEffect(() => {
    const subscription = addNotificationTapListener((data) => {
      if (data.type === "tracking_status_change") {
        router.push("/deadlines");
        return;
      }
      const scanId = typeof data.scan_id === "string" ? data.scan_id : null;
      if (scanId) {
        router.push(`/scan/${scanId}`);
        return;
      }
      if (data.type === "deadline_reminder" || typeof data.deadline_id === "string") {
        router.push("/deadlines");
      }
    });

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    const subscription = addNotificationReceivedListener();
    return () => subscription.remove();
  }, []);

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (passwordRecovery) return <ResetPasswordScreen />;

  if (!session && !hasHadAccount && onboardingSeen === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session && !hasHadAccount && !onboardingSeen) {
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

  if (!session) return <AuthScreen initialMode={hasHadAccount ? "login" : "register"} />;

  return (
    <AccountGate userId={session.user.id}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.bg },
          headerShown: false,
          // iOS-style edge swipe-back, default on but explicit for clarity
          gestureEnabled: true,
          gestureDirection: "horizontal",
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(app)" />
        <Stack.Screen name="scan/new" />
        <Stack.Screen name="scan/[id]" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="oamp/status-result" />
        <Stack.Screen name="oamp/odvolani-guide" />
      </Stack>
    </AccountGate>
  );
}

function AccountGate({ userId, children }: { userId: string; children: ReactNode }) {
  const colors = useColors();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProfile = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    // Let the user straight in on the last known good profile while the
    // network revalidation runs — the backend can take tens of seconds to
    // cold-start and must not block the whole app behind a spinner.
    void readCachedProfile(userId).then((cached) => {
      if (!active || !cached) return;
      setProfile((current) => current ?? cached);
      setLoading(false);
    });

    void apiFetch<ProfileResponse>("/profile")
      .then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
        setLoadError(null);
        writeCachedProfile(userId, nextProfile);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : t("accountDeletion.loadErrorBody"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => loadProfile(), [loadProfile]);

  const handleRestored = useCallback(
    (restored: ProfileResponse) => {
      setProfile(restored);
      writeCachedProfile(userId, restored);
    },
    [userId]
  );

  useEffect(() => {
    if (profile?.deletion_status !== "active") return;
    void syncPushTokenAfterSignIn().catch((error) => {
      console.warn("Push notification registration failed", error);
    });
  }, [profile?.deletion_status, userId]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError && !profile) {
    return (
      <AccountDeletionScreen
        loadError={loadError}
        onRetry={() => {
          loadProfile();
        }}
        onRestored={handleRestored}
      />
    );
  }

  if (profile?.deletion_status === "pending") {
    return (
      <AccountDeletionScreen
        profile={profile}
        onRetry={() => {
          loadProfile();
        }}
        onRestored={handleRestored}
      />
    );
  }

  return <>{children}</>;
}
