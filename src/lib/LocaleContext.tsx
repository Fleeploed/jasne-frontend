import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReactNode } from "react";

import { syncProfileLanguage } from "@/features/auth/profileApi";
import { getLocale, normalizeLocale, setAppLocale } from "@/lib/i18n";

const STORAGE_KEY = "app_locale";

type LocaleContextValue = {
  locale: string;
  changeLocale: (locale: string) => Promise<void>;
};

// Detect the device locale via the JS Intl API. Works on Hermes/JSC in
// React Native — no native module needed. normalizeLocale() handles the
// fallback if the system returns something we don't support.
function detectSystemLocale(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return "cs";
  }
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: getLocale(),
  changeLocale: async () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(getLocale());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        // User previously chose a language → respect their choice
        setAppLocale(stored);
        setLocale(normalizeLocale(stored));
      } else {
        // First launch → default to the device's system locale
        const system = detectSystemLocale();
        setAppLocale(system);
        setLocale(normalizeLocale(system));
      }
    }).catch((error) => {
      if (__DEV__) logger.warn("Failed to load stored locale", error);
    });
  }, []);

  const changeLocale = useCallback(async (next: string) => {
    const normalized = normalizeLocale(next);
    setAppLocale(next);
    setLocale(normalized);
    await AsyncStorage.setItem(STORAGE_KEY, next);
    // Mirror the choice to the backend profile (best-effort, no-op when signed out).
    void syncProfileLanguage(normalized).catch(() => {});
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, changeLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
