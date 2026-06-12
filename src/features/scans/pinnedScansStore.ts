/**
 * Local pinned-scan store backed by AsyncStorage. Pinning is a UI-only feature
 * (no backend column), so the list lives client-side per device.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "jasne.pinnedScans.v1";

export async function getPinnedScanIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function togglePinnedScan(id: string): Promise<string[]> {
  const current = await getPinnedScanIds();
  const exists = current.includes(id);
  const next = exists ? current.filter((existing) => existing !== id) : [id, ...current];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function clearPinnedScans(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
