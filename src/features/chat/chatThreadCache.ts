/**
 * Persistent cache of loaded chat threads, backed by AsyncStorage.
 *
 * Lets ChatThreadScreen render instantly on revisit — even after a cold start —
 * while a background refetch keeps data fresh. The server is still source of truth.
 *
 * Layers:
 *   - in-memory Map (synchronous, hit during a single app session)
 *   - AsyncStorage (asynchronous, survives cold start)
 *
 * Storage keys: `chat:v1:<scanId>`. The version segment lets us bump and
 * invalidate older formats without touching unrelated AsyncStorage entries.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { DeadlineResponse, LimitsResponse, ScanMessage, ScanResponse } from "@/lib/types";

const KEY_PREFIX = "chat:v1:";
const INDEX_KEY = "chat:v1:__index";

export type ChatCacheEntry = {
  scan: ScanResponse;
  messages: ScanMessage[];
  limits: LimitsResponse;
  deadlines?: DeadlineResponse[];
};

const memory = new Map<string, ChatCacheEntry>();
const inflightLoads = new Map<string, Promise<ChatCacheEntry | null>>();

function storageKey(scanId: string) {
  return `${KEY_PREFIX}${scanId}`;
}

export function getChatCacheSync(scanId: string): ChatCacheEntry | null {
  return memory.get(scanId) ?? null;
}

export async function getChatCache(scanId: string): Promise<ChatCacheEntry | null> {
  const hit = memory.get(scanId);
  if (hit) return hit;

  const existing = inflightLoads.get(scanId);
  if (existing) return existing;

  const load = (async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(scanId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ChatCacheEntry;
      memory.set(scanId, parsed);
      return parsed;
    } catch {
      return null;
    } finally {
      inflightLoads.delete(scanId);
    }
  })();

  inflightLoads.set(scanId, load);
  return load;
}

export function setChatCache(scanId: string, entry: ChatCacheEntry): void {
  memory.set(scanId, entry);
  void AsyncStorage.setItem(storageKey(scanId), JSON.stringify(entry)).catch(() => {});
  void trackIndex(scanId);
}

export function invalidateChatCache(scanId?: string): void {
  if (scanId) {
    memory.delete(scanId);
    void AsyncStorage.removeItem(storageKey(scanId)).catch(() => {});
    void untrackIndex(scanId);
    return;
  }
  memory.clear();
  void clearAllPersisted().catch(() => {});
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function trackIndex(scanId: string) {
  const list = await readIndex();
  if (list.includes(scanId)) return;
  list.push(scanId);
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(list)).catch(() => {});
}

async function untrackIndex(scanId: string) {
  const list = await readIndex();
  const next = list.filter((id) => id !== scanId);
  if (next.length === list.length) return;
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next)).catch(() => {});
}

async function clearAllPersisted() {
  const list = await readIndex();
  if (list.length) {
    await AsyncStorage.multiRemove(list.map(storageKey));
  }
  await AsyncStorage.removeItem(INDEX_KEY);
}
