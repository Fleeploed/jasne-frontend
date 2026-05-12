import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

const HAS_HAD_ACCOUNT_KEY = "jasne_has_had_account";

type AuthContextValue = {
  initializing: boolean;
  session: Session | null;
  user: User | null;
  hasHadAccount: boolean;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [hasHadAccount, setHasHadAccount] = useState(false);

  useEffect(() => {
    async function init() {
      const [{ data }, storedFlag] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(HAS_HAD_ACCOUNT_KEY),
      ]);
      setSession(data.session ?? null);
      setHasHadAccount(storedFlag === "1");
      setInitializing(false);
    }
    void init();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setInitializing(false);
      if (event === "SIGNED_IN" && nextSession) {
        setHasHadAccount(true);
        void AsyncStorage.setItem(HAS_HAD_ACCOUNT_KEY, "1");
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) void handleAuthUrl(url);
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });

    return () => subscription.remove();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      session,
      user: session?.user ?? null,
      hasHadAccount,
      passwordRecovery,
      clearPasswordRecovery: () => setPasswordRecovery(false),
      signOut: async () => {
        await supabase.auth.signOut();
      }
    }),
    [hasHadAccount, initializing, passwordRecovery, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

  async function handleAuthUrl(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    const isResetUrl =
      (parsed.hostname === "auth" && parsed.pathname === "/reset-password") ||
      parsed.pathname === "/auth/reset-password";
    if (!isResetUrl) return;

    const code = parsed.searchParams.get("code");
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) setSession(data.session ?? null);
      setPasswordRecovery(!error);
      return;
    }

    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error) setSession(data.session ?? null);
      setPasswordRecovery(!error);
    }
  }
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
