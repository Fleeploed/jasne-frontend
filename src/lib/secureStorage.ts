import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// iOS caps each SecureStore entry at 2048 bytes. Supabase session JSON is
// typically 1–4 KB, so we split large values into 1800-byte chunks (ASCII-safe
// because base64url tokens are single-byte characters).
const CHUNK_SIZE = 1800;
const countKey = (key: string) => `${key}__n`;
const chunkKey = (key: string, i: number) => `${key}__${i}`;

async function readSecure(key: string): Promise<string | null> {
  const countStr = await SecureStore.getItemAsync(countKey(key));
  if (countStr !== null) {
    const n = parseInt(countStr, 10);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join("");
  }
  // Single-item (value fit in one chunk)
  return SecureStore.getItemAsync(key);
}

async function writeSecure(key: string, value: string): Promise<void> {
  if (value.length <= CHUNK_SIZE) {
    await deleteChunks(key);
    await SecureStore.setItemAsync(key, value);
  } else {
    await SecureStore.deleteItemAsync(key).catch(() => {});
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
  }
}

async function deleteChunks(key: string): Promise<void> {
  const countStr = await SecureStore.getItemAsync(countKey(key)).catch(() => null);
  if (countStr !== null) {
    const n = parseInt(countStr, 10);
    await SecureStore.deleteItemAsync(countKey(key)).catch(() => {});
    for (let i = 0; i < n; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
    }
  }
}

// Supabase SupportedStorage interface
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await readSecure(key);
      if (value !== null) return value;

      // One-time migration: lift the existing session out of AsyncStorage so
      // users are not signed out after the upgrade.
      const legacy = await AsyncStorage.getItem(key).catch(() => null);
      if (legacy !== null) {
        await writeSecure(key, legacy).catch(() => {});
        await AsyncStorage.removeItem(key).catch(() => {});
        return legacy;
      }

      return null;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    await writeSecure(key, value).catch(() => {});
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key).catch(() => {});
      await deleteChunks(key);
      await AsyncStorage.removeItem(key).catch(() => {});
    } catch {}
  },
};
