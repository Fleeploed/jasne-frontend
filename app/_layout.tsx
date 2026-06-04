import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";

import { AccountDeletionScreen } from "@/features/auth/AccountDeletionScreen";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";
import { ThemeProvider, lightColors, useColors } from "@/components/ui";
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
      <SafeAreaProvider>
        <FontLoadingScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ThemedStatusBar />
          <LocaleProvider>
            <AuthProvider>
              <AnalyticsRouteTracker />
              <RootNavigator />
            </AuthProvider>
          </LocaleProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);

function ThemedStatusBar() {
  const colors = useColors();
  const isLight = colors.bg === lightColors.bg;
  return <StatusBar style={isLight ? "dark" : "light"} backgroundColor={colors.bg} />;
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

    void apiFetch<ProfileResponse>("/profile")
      .then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
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
        onRestored={setProfile}
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
        onRestored={setProfile}
      />
    );
  }

  return <>{children}</>;
}
