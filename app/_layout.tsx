import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";

import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";
import { ThemeProvider, lightColors, useColors } from "@/components/ui";
import { LocaleProvider } from "@/lib/LocaleContext";
import { configurePurchases } from "@/lib/purchases";

export default function RootLayout() {
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
        <ThemedStatusBar />
        <LocaleProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </LocaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

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
    <Stack
      screenOptions={{
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
    </Stack>
  );
}
