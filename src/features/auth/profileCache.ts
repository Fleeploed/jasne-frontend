/**
 * Last-known-good /profile snapshot, persisted so AccountGate can let the
 * user into the app immediately on cold start while it revalidates in the
 * background. A single storage key holds the owning userId so a different
 * account on the same device never reads someone else's snapshot.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ProfileResponse } from "@/lib/types";

const STORAGE_KEY = "jasne_profile_cache_v1";

type CachedProfile = {
  userId: string;
  profile: ProfileResponse;
};

export async function readCachedProfile(userId: string): Promise<ProfileResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfile;
    if (parsed.userId !== userId || !parsed.profile) return null;
    return parsed.profile;
  } catch {
    return null;
  }
}

export function writeCachedProfile(userId: string, profile: ProfileResponse): void {
  const entry: CachedProfile = { userId, profile };
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entry)).catch(() => {});
}

export async function clearCachedProfile(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
