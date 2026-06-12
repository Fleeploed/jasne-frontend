/**
 * Module-level store for in-flight scans. Multi-slot: each scan has a unique
 * local id (generated on Done press in NewScanScreen) so users can queue
 * several scans in parallel and see a separate pending card for each.
 *
 * No React, no context — just a JS object with a simple pub/sub so both
 * NewScanScreen, ChatThreadScreen, and ScanListScreen share the same live state.
 */

import * as FileSystem from "expo-file-system";

export type PendingPreview = {
  documentType?: string;
  summary?: string;
  actions: string[];
};

export type PendingAttachment = {
  uri: string;
  name: string;
  mimeType?: string;
};

export type PendingScanRecord = {
  localId: string;
  active: boolean;
  progress: string[];
  preview: PendingPreview;
  attachments: PendingAttachment[];
  scanId: string | null;
  error: string | null;
  startedAt: number;
};

type Listener = () => void;

const _records = new Map<string, PendingScanRecord>();
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function generatePendingScanId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPendingScan(localId: string, attachments: PendingAttachment[]): PendingScanRecord {
  const record: PendingScanRecord = {
    localId,
    active: true,
    progress: [],
    preview: { actions: [] },
    attachments,
    scanId: null,
    error: null,
    startedAt: Date.now(),
  };
  _records.set(localId, record);
  notify();
  return record;
}

export function getPendingScanById(localId: string): PendingScanRecord | null {
  return _records.get(localId) ?? null;
}

export function getPendingScanList(): PendingScanRecord[] {
  // Newest first — recent scans appear at the top of the list.
  return Array.from(_records.values()).sort((a, b) => b.startedAt - a.startedAt);
}

export function updatePendingScanById(localId: string, patch: Partial<Omit<PendingScanRecord, "localId">>) {
  const current = _records.get(localId);
  if (!current) return;
  _records.set(localId, { ...current, ...patch });
  notify();
}

export function pushPendingProgressById(localId: string, step: string) {
  const current = _records.get(localId);
  if (!current) return;
  if (current.progress[current.progress.length - 1] === step) return;
  _records.set(localId, { ...current, progress: [...current.progress, step] });
  notify();
}

export function updatePendingPreviewById(localId: string, patch: Partial<PendingPreview>) {
  const current = _records.get(localId);
  if (!current) return;
  _records.set(localId, { ...current, preview: { ...current.preview, ...patch } });
  notify();
}

export function removePendingScanById(localId: string) {
  const record = _records.get(localId);
  if (!record) return;
  _records.delete(localId);
  deleteLocalAttachmentFiles(record.attachments);
  notify();
}

export function clearPendingScans() {
  if (!_records.size) return;
  const records = Array.from(_records.values());
  _records.clear();
  records.forEach((record) => deleteLocalAttachmentFiles(record.attachments));
  notify();
}

/**
 * Documents are sensitive — once a scan record is gone (the server has the
 * images, or the user dismissed the scan) its camera/picker copies must not
 * linger in the cache directory. Best-effort: only touches files inside the
 * app's own cache, never the originals in the user's library.
 */
function deleteLocalAttachmentFiles(attachments: PendingAttachment[]) {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return;
  for (const attachment of attachments) {
    if (!attachment.uri.startsWith(cacheDir)) continue;
    void FileSystem.deleteAsync(attachment.uri, { idempotent: true }).catch(() => {});
  }
}

export function subscribePendingScan(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
