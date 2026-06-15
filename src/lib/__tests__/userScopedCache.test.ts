import AsyncStorage from "@react-native-async-storage/async-storage";

import { createUserScopedCache } from "@/lib/userScopedCache";

type Snapshot = { items: string[] };

const KEY = "test_cache_key";

describe("createUserScopedCache", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns null when nothing is cached", async () => {
    const cache = createUserScopedCache<Snapshot>(KEY);
    expect(await cache.read("user-1")).toBeNull();
  });

  it("round-trips data for the owning user", async () => {
    const cache = createUserScopedCache<Snapshot>(KEY);
    cache.write("user-1", { items: ["a", "b"] });
    // write is fire-and-forget — let the microtask flush.
    await Promise.resolve();
    expect(await cache.read("user-1")).toEqual({ items: ["a", "b"] });
  });

  it("does not return another user's snapshot", async () => {
    const cache = createUserScopedCache<Snapshot>(KEY);
    cache.write("user-1", { items: ["secret"] });
    await Promise.resolve();
    expect(await cache.read("user-2")).toBeNull();
  });

  it("clear() removes the entry", async () => {
    const cache = createUserScopedCache<Snapshot>(KEY);
    cache.write("user-1", { items: ["a"] });
    await Promise.resolve();
    await cache.clear();
    expect(await cache.read("user-1")).toBeNull();
  });

  it("returns null on corrupt JSON instead of throwing", async () => {
    await AsyncStorage.setItem(KEY, "{not valid json");
    const cache = createUserScopedCache<Snapshot>(KEY);
    expect(await cache.read("user-1")).toBeNull();
  });

  it("isolates entries stored under different keys", async () => {
    const a = createUserScopedCache<Snapshot>("cache_a");
    const b = createUserScopedCache<Snapshot>("cache_b");
    a.write("user-1", { items: ["from-a"] });
    b.write("user-1", { items: ["from-b"] });
    await Promise.resolve();
    expect(await a.read("user-1")).toEqual({ items: ["from-a"] });
    expect(await b.read("user-1")).toEqual({ items: ["from-b"] });
  });
});
