/* eslint-disable import/first -- jest.mock() must run before the imports it stubs; babel hoists these above the imports. */
jest.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import type { PendingScanRecord } from "@/features/scans/pendingScanStore";

const STORAGE_KEY = "jasne_pending_scans_v1";
const deleteAsync = FileSystem.deleteAsync as jest.Mock;

type Store = typeof import("@/features/scans/pendingScanStore");

const flush = () => new Promise((resolve) => setImmediate(resolve));

function seedRecord(overrides: Partial<PendingScanRecord> = {}): PendingScanRecord {
  return {
    localId: "p-1",
    active: false,
    progress: [],
    preview: { actions: [] },
    attachments: [],
    scanId: null,
    error: null,
    startedAt: 1000,
    ...overrides,
  };
}

/**
 * Loads a *fresh* copy of the singleton store with AsyncStorage pre-seeded, so
 * the module-load-time `hydrate()` sees the data we want. Each test gets an
 * isolated module registry to avoid the shared Map leaking across cases.
 */
async function loadStore(seed?: PendingScanRecord[] | string): Promise<Store> {
  let store!: Store;
  await jest.isolateModulesAsync(async () => {
    await AsyncStorage.clear();
    if (typeof seed === "string") {
      await AsyncStorage.setItem(STORAGE_KEY, seed);
    } else if (seed) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic re-import is required to re-run the module's hydrate() with fresh state.
    store = require("@/features/scans/pendingScanStore");
    await flush();
  });
  return store;
}

beforeEach(() => {
  deleteAsync.mockClear();
});

describe("hydrate", () => {
  it("restores an in-flight (active) record as a dismissable interrupted card", async () => {
    const store = await loadStore([seedRecord({ localId: "p-active", active: true, error: null })]);
    const record = store.getPendingScanById("p-active");
    expect(record).not.toBeNull();
    expect(record?.active).toBe(false);
    expect(record?.interrupted).toBe(true);
    expect(record?.error).toBe("scan.interrupted");
  });

  it("preserves an existing error message when restoring", async () => {
    const store = await loadStore([seedRecord({ localId: "p-err", active: true, error: "upload failed" })]);
    expect(store.getPendingScanById("p-err")?.error).toBe("upload failed");
  });

  it("keeps an already-interrupted record interrupted", async () => {
    const store = await loadStore([seedRecord({ localId: "p-int", active: false, interrupted: true, error: "x" })]);
    const record = store.getPendingScanById("p-int");
    expect(record?.interrupted).toBe(true);
    expect(record?.error).toBe("x");
  });

  it("drops settled records (neither active nor interrupted)", async () => {
    const store = await loadStore([seedRecord({ localId: "done", active: false, interrupted: false, scanId: "s-1" })]);
    expect(store.getPendingScanById("done")).toBeNull();
    expect(store.getPendingScanList()).toHaveLength(0);
  });

  it("starts clean on corrupt JSON without throwing", async () => {
    const store = await loadStore("}{ not json");
    expect(store.getPendingScanList()).toHaveLength(0);
  });

  it("starts clean when nothing was persisted", async () => {
    const store = await loadStore();
    expect(store.getPendingScanList()).toHaveLength(0);
  });
});

describe("createPendingScan + mutators", () => {
  it("creates an active record and persists it", async () => {
    const store = await loadStore();
    store.createPendingScan("p-new", [{ uri: "file:///cache/a.jpg", name: "a.jpg" }]);

    const record = store.getPendingScanById("p-new");
    expect(record?.active).toBe(true);
    expect(record?.attachments).toHaveLength(1);

    await flush();
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).toContain("p-new");
  });

  it("sorts the list newest-first by startedAt", async () => {
    const store = await loadStore();
    const now = jest.spyOn(Date, "now");
    now.mockReturnValueOnce(100).mockReturnValueOnce(200);
    store.createPendingScan("older", []);
    store.createPendingScan("newer", []);
    now.mockRestore();

    expect(store.getPendingScanList().map((r) => r.localId)).toEqual(["newer", "older"]);
  });

  it("patches a record via updatePendingScanById", async () => {
    const store = await loadStore();
    store.createPendingScan("p", []);
    store.updatePendingScanById("p", { scanId: "scan-9", active: false });
    expect(store.getPendingScanById("p")).toMatchObject({ scanId: "scan-9", active: false });
  });

  it("appends progress steps but dedupes a repeated last step", async () => {
    const store = await loadStore();
    store.createPendingScan("p", []);
    store.pushPendingProgressById("p", "ocr");
    store.pushPendingProgressById("p", "ocr");
    store.pushPendingProgressById("p", "analysis");
    expect(store.getPendingScanById("p")?.progress).toEqual(["ocr", "analysis"]);
  });

  it("merges preview fields via updatePendingPreviewById", async () => {
    const store = await loadStore();
    store.createPendingScan("p", []);
    store.updatePendingPreviewById("p", { summary: "hi" });
    store.updatePendingPreviewById("p", { documentType: "Faktura" });
    expect(store.getPendingScanById("p")?.preview).toMatchObject({ summary: "hi", documentType: "Faktura", actions: [] });
  });

  it("ignores mutations targeting an unknown id", async () => {
    const store = await loadStore();
    expect(() => store.updatePendingScanById("ghost", { active: false })).not.toThrow();
    expect(() => store.pushPendingProgressById("ghost", "x")).not.toThrow();
    expect(store.getPendingScanList()).toHaveLength(0);
  });
});

describe("cleanup of local attachment files", () => {
  it("deletes cache-dir copies on removePendingScanById but leaves originals alone", async () => {
    const store = await loadStore();
    store.createPendingScan("p", [
      { uri: "file:///cache/scan-1.jpg", name: "scan-1.jpg" },
      { uri: "file:///var/library/original.jpg", name: "original.jpg" },
    ]);

    store.removePendingScanById("p");

    expect(store.getPendingScanById("p")).toBeNull();
    expect(deleteAsync).toHaveBeenCalledTimes(1);
    expect(deleteAsync).toHaveBeenCalledWith("file:///cache/scan-1.jpg", { idempotent: true });
  });

  it("clearPendingScans removes every record and deletes their cache files", async () => {
    const store = await loadStore();
    store.createPendingScan("a", [{ uri: "file:///cache/a.jpg", name: "a.jpg" }]);
    store.createPendingScan("b", [{ uri: "file:///cache/b.jpg", name: "b.jpg" }]);

    store.clearPendingScans();

    expect(store.getPendingScanList()).toHaveLength(0);
    expect(deleteAsync).toHaveBeenCalledTimes(2);
  });
});

describe("subscribePendingScan", () => {
  it("notifies subscribers on change and stops after unsubscribe", async () => {
    const store = await loadStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribePendingScan(listener);

    store.createPendingScan("p", []);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.updatePendingScanById("p", { active: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
