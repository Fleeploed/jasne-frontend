import { decode } from "base64-arraybuffer";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import PdfThumbnail from "react-native-pdf-thumbnail";
import { PDFDocument } from "pdf-lib";

import { apiFetch } from "@/lib/api";
import { getLocale, t } from "@/lib/i18n";
import { streamPost } from "@/lib/sse";
import { supabase } from "@/lib/supabase";
import type { LimitsResponse, ScanListItem, ScanResponse } from "@/lib/types";

export type PickedUpload = {
  uri: string;
  name: string;
  mimeType: string;
};

export type ScanProgressEvent =
  | { type: "status"; step?: string; message?: string; category?: string; doc_type?: string; confidence?: number }
  | { type: "field"; field: string; value: unknown }
  | { type: "done"; scan: ScanResponse }
  | { type: "error"; detail: string; status_code?: number };

const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
const supportedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"];

export const SCANS_PAGE_SIZE = 50;

export type ListScansOptions = {
  limit?: number;
  offset?: number;
};

export async function listScans(options: ListScansOptions = {}) {
  const limit = options.limit ?? SCANS_PAGE_SIZE;
  const offset = options.offset ?? 0;
  return apiFetch<ScanListItem[]>(`/scans?limit=${limit}&offset=${offset}`);
}

export async function getScan(scanId: string) {
  return apiFetch<ScanResponse>(`/scans/${scanId}`);
}

export async function getScanImageUrls(scanId: string, options: { renderPdf?: boolean } = {}) {
  const query = options.renderPdf ? "?render_pdf=true" : "";
  const response = await apiFetch<{ urls: string[] }>(`/scans/${scanId}/image-urls${query}`);
  return response.urls;
}

export async function deleteScan(scanId: string) {
  await apiFetch<void>(`/scans/${scanId}`, { method: "DELETE" });
}

export type ScanCountsResponse = {
  total: number;
  by_category: Record<string, number>;
};

export async function getScanCounts() {
  return apiFetch<ScanCountsResponse>(`/scans/counts`);
}

export type DeleteAllScansResponse = { deleted_scans: number; deleted_deadlines: number };

export async function deleteAllScans() {
  return apiFetch<DeleteAllScansResponse>("/scans", { method: "DELETE" });
}

export async function getLimits(scanId?: string) {
  return apiFetch<LimitsResponse>(scanId ? `/limits?scan_id=${encodeURIComponent(scanId)}` : "/limits");
}

export async function pickDocument(): Promise<PickedUpload[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: allowedMimeTypes,
    copyToCacheDirectory: true,
    multiple: true
  });

  if (result.canceled) return null;
  return result.assets.map((asset) => normalizePickedUpload(asset.uri, asset.name, asset.mimeType));
}

export async function pickImage(selectionLimit = 10): Promise<PickedUpload[] | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(t("scanApi.photoPermission"));

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
    allowsMultipleSelection: true,
    orderedSelection: true,
    selectionLimit
  });

  if (result.canceled) return null;
  return result.assets.map((asset, index) =>
    normalizePickedUpload(asset.uri, asset.fileName ?? `page-${Date.now()}-${index + 1}.jpg`, asset.mimeType)
  );
}

export async function uploadToStorage(files: PickedUpload[]) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  const userId = sessionData.session?.user.id ?? user?.id;

  if (userError && !sessionData.session?.user) throw userError;
  if (!userId) throw new Error(t("scanApi.authRequired"));

  const paths: string[] = [];

  for (const [index, file] of files.entries()) {
    const extension = extensionFor(file.name, file.mimeType, file.uri);
    const safeName = file.name.replace(/[^A-Za-z0-9_.-]/g, "_").replace(/\.[^.]+$/, "");
    const storagePath = `${userId}/${Date.now()}-${index + 1}-${safeName}${extension}`;
    const fileInfo = await FileSystem.getInfoAsync(file.uri);
    if (!fileInfo.exists) {
      throw new Error(t("scanApi.fileReadFailed"));
    }

    const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
    const { error } = await supabase.storage.from("documents").upload(storagePath, decode(base64), {
      contentType: file.mimeType,
      upsert: false
    });

    if (error) {
      if (__DEV__) {
        console.warn("Supabase storage upload failed", {
          bucket: "documents",
          path: storagePath,
          mimeType: file.mimeType,
          message: error.message,
          name: error.name,
        });
      }
      throw new Error(mapStorageUploadError(error.message));
    }
    paths.push(storagePath);
  }

  return paths;
}

export async function streamScan(imagePaths: string[], onEvent: (event: ScanProgressEvent) => void) {
  await streamPost({
    path: "/scans/stream",
    body: { image_paths: imagePaths, language: getLocale() },
    onMessage: ({ event, data }) => {
      if (event === "status" && isRecord(data)) {
        onEvent({
          type: "status",
          step: stringValue(data.step),
          message: stringValue(data.message),
          category: stringValue(data.category),
          doc_type: stringValue(data.doc_type),
          confidence: numberValue(data.confidence)
        });
      }
      if (event === "field" && isRecord(data)) {
        onEvent({ type: "field", field: stringValue(data.field) ?? "field", value: data.value });
      }
      if (event === "done" && isRecord(data)) {
        onEvent({ type: "done", scan: data as ScanResponse });
      }
      if (event === "error" && isRecord(data)) {
        onEvent({
          type: "error",
          detail: stringValue(data.detail) ?? t("scan.failed"),
          status_code: numberValue(data.status_code)
        });
      }
    }
  });
}

function inferMimeType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function normalizePickedUpload(uri: string, name: string, mimeType?: string | null): PickedUpload {
  const uriExtension = extensionFromName(uri);
  const nameExtension = extensionFromName(name);
  const normalizedMime = normalizeMimeType(mimeType, uriExtension, nameExtension);
  const extension = extensionFor(name, normalizedMime, uri);
  const baseName = name.replace(/[^A-Za-z0-9_.-]/g, "_").replace(/\.[^.]+$/, "") || "page";

  if (!allowedMimeTypes.includes(normalizedMime) || !supportedExtensions.includes(extension)) {
    throw new Error(t("scanApi.unsupportedImage"));
  }

  return {
    uri,
    name: `${baseName}${extension}`,
    mimeType: normalizedMime
  };
}

function normalizeMimeType(mimeType: string | null | undefined, uriExtension?: string, nameExtension?: string) {
  if (mimeType === "image/jpg") return "image/jpeg";
  if (mimeType && allowedMimeTypes.includes(mimeType)) return mimeType;

  const extensionMime = mimeTypeForExtension(uriExtension) ?? mimeTypeForExtension(nameExtension);
  if (extensionMime) return extensionMime;

  return mimeType ?? inferMimeType(nameExtension ?? "");
}

function extensionFromName(name: string) {
  return name.toLowerCase().split("?", 1)[0].match(/\.[a-z0-9]+$/)?.[0];
}

function mimeTypeForExtension(extension?: string) {
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".pdf") return "application/pdf";
  return undefined;
}

function extensionFor(name: string, mimeType: string, uri?: string) {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/jpeg") return ".jpg";

  const fromUri = uri ? extensionFromName(uri) : undefined;
  if (fromUri && supportedExtensions.includes(fromUri)) return fromUri;

  const fromName = extensionFromName(name);
  if (fromName && supportedExtensions.includes(fromName)) return fromName;

  return ".jpg";
}

function mapStorageUploadError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("row-level security") ||
    normalized.includes("violates row-level security") ||
    normalized.includes("unauthorized") ||
    normalized.includes("permission")
  ) {
    return t("scanApi.storagePermission");
  }

  if (normalized.includes("bucket not found") || normalized.includes("not found")) {
    return t("scanApi.storageBucketMissing");
  }

  if (normalized.includes("jwt") || normalized.includes("token") || normalized.includes("session")) {
    return t("scanApi.authRequired");
  }

  if (normalized.includes("network") || normalized.includes("fetch") || normalized.includes("failed")) {
    return t("scanApi.networkUpload");
  }

  return `${t("scanApi.uploadFailed")} ${message}`;
}

export async function getPdfPageCount(uri: string): Promise<number> {
  const filePath = uri.startsWith("file://") ? uri : `file://${uri}`;
  const base64 = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.Base64 });
  const doc = await PDFDocument.load(base64, { updateMetadata: false });
  return doc.getPageCount();
}

export async function renderPdfPage(uri: string, pageIndex: number): Promise<PickedUpload> {
  // iOS uses URL(string:) which requires the file:// scheme.
  const filePath = uri.startsWith("file://") ? uri : `file://${uri}`;
  const result = await PdfThumbnail.generate(filePath, pageIndex, 75);
  return {
    uri: result.uri,
    name: `pdf-page-${Date.now()}-${pageIndex + 1}.jpg`,
    mimeType: "image/jpeg",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
