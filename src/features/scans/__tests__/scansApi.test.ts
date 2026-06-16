/* eslint-disable import/first -- jest.mock() must run before the imports it stubs; babel hoists these above the imports. */

// scansApi pulls a pile of native/expo modules at import time. Stub every one
// the upload/cleanup paths don't exercise so the module loads cleanly.
jest.mock("@/lib/i18n", () => ({ t: (key: string) => key, getLocale: () => "en" }));
jest.mock("@/lib/logger", () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/sse", () => ({ streamPost: jest.fn() }));
jest.mock("@/lib/config", () => ({
  config: { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key", apiBaseUrl: "https://api" },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("react-native-pdf-thumbnail", () => ({ __esModule: true, default: { generate: jest.fn() } }));
jest.mock("pdf-lib", () => ({ PDFDocument: { load: jest.fn() } }));

jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  FileSystemUploadType: { BINARY_CONTENT: "binary" },
  getInfoAsync: jest.fn(),
  uploadAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

const mockRemove = jest.fn();
const mockFrom = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    // Lazy wrappers: the factory runs at import time, before the `mock*` consts
    // above are initialized, so reference them at call time instead of capturing
    // their (still-undefined) values.
    storage: { from: (...args: unknown[]) => mockFrom(...args) },
  },
}));

import * as FileSystem from "expo-file-system";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { uploadToStorage, deleteFromStorage } from "@/features/scans/scansApi";
import type { PickedUpload } from "@/features/scans/scansApi";

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const uploadAsync = FileSystem.uploadAsync as jest.Mock;
const getSession = supabase.auth.getSession as unknown as jest.Mock;
const warn = logger.warn as jest.Mock;

function file(overrides: Partial<PickedUpload> = {}): PickedUpload {
  return { uri: "file:///cache/page.jpg", name: "page.jpg", mimeType: "image/jpeg", ...overrides };
}

function withSession(token = "token-123", userId = "user-1") {
  getSession.mockResolvedValue({ data: { session: { access_token: token, user: { id: userId } } }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  getInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
  uploadAsync.mockResolvedValue({ status: 200, body: "" });
});

describe("uploadToStorage — happy path", () => {
  it("returns one storage path per file, scoped under the user id", async () => {
    withSession("token-123", "user-1");
    const paths = await uploadToStorage([
      file({ name: "a.jpg" }),
      file({ uri: "file:///cache/b.png", name: "b.png", mimeType: "image/png" }),
    ]);

    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatch(/^user-1\/\d+-1-a\.jpg$/);
    expect(paths[1]).toMatch(/^user-1\/\d+-2-b\.png$/);
  });

  it("uploads to the documents bucket with auth + anon headers and x-upsert disabled", async () => {
    withSession("token-abc", "user-7");
    await uploadToStorage([file({ name: "doc.pdf", mimeType: "application/pdf", uri: "file:///cache/doc.pdf" })]);

    expect(uploadAsync).toHaveBeenCalledTimes(1);
    const [url, uri, options] = uploadAsync.mock.calls[0];
    expect(url).toMatch(/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/documents\/user-7\/\d+-1-doc\.pdf$/);
    expect(uri).toBe("file:///cache/doc.pdf");
    expect(options.httpMethod).toBe("POST");
    expect(options.uploadType).toBe("binary");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer token-abc",
      apikey: "anon-key",
      "Content-Type": "application/pdf",
      "x-upsert": "false",
    });
  });

  it("sanitizes unsafe characters in the file name", async () => {
    withSession();
    const [path] = await uploadToStorage([file({ name: "Smlouva 2024 (1).jpg" })]);
    expect(path).toMatch(/^user-1\/\d+-1-Smlouva_2024__1_\.jpg$/);
  });
});

describe("uploadToStorage — auth failures", () => {
  it("rethrows a getSession error verbatim", async () => {
    const boom = new Error("session boom");
    getSession.mockResolvedValue({ data: { session: null }, error: boom });
    await expect(uploadToStorage([file()])).rejects.toBe(boom);
    expect(uploadAsync).not.toHaveBeenCalled();
  });

  it("throws authRequired when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.authRequired");
  });

  it("throws authRequired when the session has no user id", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: null } } }, error: null });
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.authRequired");
  });
});

describe("uploadToStorage — local file guards", () => {
  it("throws fileReadFailed when the file no longer exists on disk", async () => {
    withSession();
    getInfoAsync.mockResolvedValue({ exists: false });
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.fileReadFailed");
    expect(uploadAsync).not.toHaveBeenCalled();
  });

  it("throws fileTooLarge when the file exceeds the 20MB cap", async () => {
    withSession();
    getInfoAsync.mockResolvedValue({ exists: true, size: 21 * 1024 * 1024 });
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.fileTooLarge");
    expect(uploadAsync).not.toHaveBeenCalled();
  });
});

describe("uploadToStorage — maps Supabase storage errors", () => {
  beforeEach(() => withSession());

  function rejectWith(status: number, message: string) {
    uploadAsync.mockResolvedValue({ status, body: JSON.stringify({ message }) });
  }

  it("maps a row-level-security violation to a permission message", async () => {
    rejectWith(403, "new row violates row-level security policy");
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.storagePermission");
  });

  it("maps a missing bucket to the bucket-missing message", async () => {
    rejectWith(404, "Bucket not found");
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.storageBucketMissing");
  });

  it("maps a JWT/token error to authRequired", async () => {
    rejectWith(401, "jwt expired");
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.authRequired");
  });

  it("maps a network error to the network-upload message", async () => {
    rejectWith(500, "network connection lost");
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.networkUpload");
  });

  it("falls back to a generic upload-failed message with the raw text appended", async () => {
    rejectWith(400, "something odd");
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.uploadFailed something odd");
  });

  it("uses the HTTP status when the error body is not JSON", async () => {
    uploadAsync.mockResolvedValue({ status: 418, body: "<html>teapot</html>" });
    await expect(uploadToStorage([file()])).rejects.toThrow("scanApi.uploadFailed HTTP 418");
  });

  it("stops at the first failing file and does not upload the rest", async () => {
    uploadAsync
      .mockResolvedValueOnce({ status: 200, body: "" })
      .mockResolvedValueOnce({ status: 403, body: JSON.stringify({ message: "unauthorized" }) });
    await expect(
      uploadToStorage([
        file({ name: "1.jpg" }),
        file({ name: "2.jpg", uri: "file:///cache/2.jpg" }),
        file({ name: "3.jpg", uri: "file:///cache/3.jpg" }),
      ]),
    ).rejects.toThrow("scanApi.storagePermission");
    expect(uploadAsync).toHaveBeenCalledTimes(2);
  });
});

// Best-effort orphan cleanup that runs when a scan upload succeeded but the
// stream never produced a record (streamScan threw, or the backend emitted an
// error event). It must NEVER throw — the caller is already on a failure path.
describe("deleteFromStorage — cleanup after a failed stream", () => {
  beforeEach(() => {
    mockFrom.mockReturnValue({ remove: mockRemove });
    mockRemove.mockResolvedValue({ error: null });
  });

  it("no-ops on an empty path list without touching storage", async () => {
    await expect(deleteFromStorage([])).resolves.toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("removes the orphaned objects from the documents bucket", async () => {
    await deleteFromStorage(["user-1/a.jpg", "user-1/b.jpg"]);

    expect(mockFrom).toHaveBeenCalledWith("documents");
    expect(mockRemove).toHaveBeenCalledWith(["user-1/a.jpg", "user-1/b.jpg"]);
  });

  it("swallows a Supabase error result and logs it instead of throwing", async () => {
    mockRemove.mockResolvedValue({ error: { message: "object not found" } });
    await expect(deleteFromStorage(["user-1/a.jpg"])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("swallows a thrown error from the storage client", async () => {
    mockRemove.mockRejectedValue(new Error("network down"));
    await expect(deleteFromStorage(["user-1/a.jpg"])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
