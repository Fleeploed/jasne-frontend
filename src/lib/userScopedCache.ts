/**
 * A single-key AsyncStorage cache scoped to one user. The owning userId is
 * stored alongside the data so a different account on the same device never
 * reads someone else's snapshot — the same guard `profileCache` uses. Intended
 * for last-known-good lists (scans, deadlines) that should render instantly on
 * cold start and stay visible offline while the network revalidates.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export type UserScopedCache<T> = {
  /** Returns the cached data only if it belongs to `userId`, else null. */
  read(userId: string): Promise<T | null>;
  /** Fire-and-forget write; never throws. */
  write(userId: string, data: T): void;
  /** Drops the entry entirely (used on sign-out). */
  clear(): Promise<void>;
};

export function createUserScopedCache<T>(storageKey: string): UserScopedCache<T> {
  type Entry = { userId: string; data: T };

  return {
    async read(userId: string): Promise<T | null> {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Entry;
        if (parsed.userId !== userId || parsed.data == null) return null;
        return parsed.data;
      } catch {
        return null;
      }
    },

    write(userId: string, data: T): void {
      const entry: Entry = { userId, data };
      void AsyncStorage.setItem(storageKey, JSON.stringify(entry)).catch(() => {});
    },

    async clear(): Promise<void> {
      await AsyncStorage.removeItem(storageKey).catch(() => {});
    },
  };
}
