/**
 * Module-level store that bridges the scan streaming (NewScanScreen)
 * with the pending chat screen. No React, no context — just a JS object
 * with a simple pub/sub so both screens share the same live state.
 */

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

export type PendingScanState = {
  active: boolean;
  progress: string[];
  preview: PendingPreview;
  attachments: PendingAttachment[];
  scanId: string | null;
  error: string | null;
};

type Listener = () => void;

const initialState = (): PendingScanState => ({
  active: false,
  progress: [],
  preview: { actions: [] },
  attachments: [],
  scanId: null,
  error: null,
});

let _state: PendingScanState = initialState();
const _listeners = new Set<Listener>();

export function getPendingScan(): PendingScanState {
  return _state;
}

export function updatePendingScan(patch: Partial<PendingScanState>) {
  _state = { ..._state, ...patch };
  _listeners.forEach((fn) => fn());
}

export function pushPendingProgress(step: string) {
  const current = _state.progress;
  if (current[current.length - 1] === step) return;
  _state = { ..._state, progress: [...current, step] };
  _listeners.forEach((fn) => fn());
}

export function resetPendingScan() {
  _state = initialState();
  _listeners.forEach((fn) => fn());
}

export function subscribePendingScan(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
