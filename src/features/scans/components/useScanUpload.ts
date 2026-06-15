import { useEffect, useState } from "react";

import {
  deleteFromStorage,
  getLimits,
  getPdfPageCount,
  pickDocument,
  pickImage,
  renderPdfPage,
  streamScan,
  uploadToStorage,
} from "@/features/scans/scansApi";
import type { PickedUpload, ScanProgressEvent } from "@/features/scans/scansApi";
import {
  createPendingScan,
  generatePendingScanId,
  getPendingScanById,
  pushPendingProgressById,
  updatePendingPreviewById,
  updatePendingScanById,
} from "@/features/scans/pendingScanStore";
import { t } from "@/lib/i18n";
import type { UserPlan } from "@/lib/types";

import { isPdfUpload, stepLabels, type ScannerCopy } from "./newScanData";

type PdfPickerState = {
  uri: string;
  pageCount: number;
  available: number;
  thumbnails: Record<number, PickedUpload>;
};

/**
 * Owns the document side of the scanner: page selection (camera frames flow in
 * via `appendFiles`), gallery/PDF imports, the monthly/page limits, and the
 * upload → SSE pipeline that turns the picked files into a pending scan. The
 * screen keeps only the live-camera UI state and wires its captures here.
 */
export function useScanUpload({
  fresh,
  pending,
  copy,
}: {
  fresh?: string;
  pending?: string;
  copy: ScannerCopy;
}) {
  const [files, setFiles] = useState<PickedUpload[]>([]);
  const [pageLimit, setPageLimit] = useState<number | null>(null);
  const [plan, setPlan] = useState<UserPlan>("free");
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [pdfPicker, setPdfPicker] = useState<PdfPickerState | null>(null);
  const [pdfRendering, setPdfRendering] = useState(false);
  const [pdfConverting, setPdfConverting] = useState(false);
  // Show chat only when explicitly entered via a pending card (?pending=<localId>).
  const [activePendingId, setActivePendingId] = useState<string | null>(() =>
    pending && getPendingScanById(pending) ? pending : null,
  );
  // Transient "page added" feedback — pill auto-hides 2s after each capture.
  const [pillFlash, setPillFlash] = useState<{ label: string; key: number } | null>(null);

  useEffect(() => {
    if (!pillFlash) return;
    const timer = setTimeout(() => setPillFlash((current) => (current?.key === pillFlash.key ? null : current)), 2000);
    return () => clearTimeout(timer);
  }, [pillFlash]);

  useEffect(() => {
    // Always reset the document state on `fresh` entry. Don't clobber any
    // in-flight pending scans in the store — that data drives the pending cards.
    setFiles([]);
    setBusy(false);
    setError(null);
    setImportSheetOpen(false);
    setPdfPicker(null);
    setPdfRendering(false);
    setPdfConverting(false);
    setActivePendingId(pending && getPendingScanById(pending) ? pending : null);
  }, [fresh, pending]);

  useEffect(() => {
    let alive = true;
    getLimits()
      .then((limits) => {
        if (!alive) return;
        setPageLimit(limits.max_pages_per_scan);
        setPlan(limits.plan);
        setScansRemaining(limits.scans_remaining);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fresh]);

  // Stream thumbnails into the picker one-by-one after it opens. Cancelled
  // automatically when the picker closes or the source URI changes.
  useEffect(() => {
    if (!pdfPicker) return;
    const { uri, pageCount } = pdfPicker;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < pageCount; i++) {
        if (cancelled) return;
        try {
          const page = await renderPdfPage(uri, i);
          if (cancelled) return;
          setPdfPicker((current) =>
            current && current.uri === uri
              ? { ...current, thumbnails: { ...current.thumbnails, [i]: page } }
              : current
          );
        } catch {
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPicker?.uri, pdfPicker?.pageCount]);

  async function getAvailableSlots() {
    const limits = await getLimits();
    setPageLimit(limits.max_pages_per_scan);
    setPlan(limits.plan);
    setScansRemaining(limits.scans_remaining);

    if (limits.scans_remaining <= 0) {
      setError(t("documents.limitReached"));
      return 0;
    }

    const remaining = limits.max_pages_per_scan - files.length;
    if (remaining <= 0) {
      setError(t("scan.pageLimitError", { count: limits.max_pages_per_scan }));
      return 0;
    }

    return remaining;
  }

  function appendFiles(nextFiles: PickedUpload[], availableSlots: number) {
    if (!nextFiles.length) return;

    const accepted = nextFiles.slice(0, availableSlots);
    let acceptedCount = 0;
    setFiles((current) => {
      const existingUris = new Set(current.map((file) => file.uri));
      const uniqueAccepted = accepted.filter((file) => !existingUris.has(file.uri));
      acceptedCount = uniqueAccepted.length;
      const next = [...current, ...uniqueAccepted];
      if (acceptedCount > 0) {
        setPillFlash({ label: copy.pageAdded(next.length), key: Date.now() });
      }
      return next;
    });

    if (nextFiles.length > availableSlots) {
      setError(t("scan.partialAdd", { count: availableSlots, limit: pageLimit ?? files.length + availableSlots }));
    }
  }

  function removeFile(indexToRemove: number) {
    if (busy) return;
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setError(null);
  }

  async function addDocument() {
    try {
      setError(null);
      const availableSlots = await getAvailableSlots();
      if (availableSlots <= 0) return;

      const pickedFiles = await pickDocument();
      if (!pickedFiles?.length) return;

      setImportSheetOpen(false);

      const pdfFile = pickedFiles.find(isPdfUpload);
      if (!pdfFile) {
        appendFiles(pickedFiles, availableSlots);
        return;
      }

      // Parse PDF metadata to get page count without rendering — fast (<200ms).
      setPdfRendering(true);
      let pageCount: number;
      try {
        pageCount = await getPdfPageCount(pdfFile.uri);
      } catch {
        setPdfRendering(false);
        setError(copy.pdfRenderError);
        return;
      }
      setPdfRendering(false);

      if (pageCount <= 0) {
        setError(copy.pdfRenderError);
        return;
      }

      if (pageCount === 1) {
        // Single-page PDF → render once and add directly.
        setPdfConverting(true);
        try {
          const page = await renderPdfPage(pdfFile.uri, 0);
          appendFiles([page], availableSlots);
        } catch {
          setError(copy.pdfRenderError);
        } finally {
          setPdfConverting(false);
        }
        return;
      }

      // Multi-page → open picker with placeholders. Thumbnails stream in via useEffect.
      setPdfPicker({ uri: pdfFile.uri, pageCount, available: availableSlots, thumbnails: {} });
    } catch (pickError) {
      setPdfRendering(false);
      setError(pickError instanceof Error ? pickError.message : t("scan.pickDocumentError"));
    }
  }

  async function confirmPdfSelection(indices: number[]) {
    if (!pdfPicker || indices.length === 0) return;
    const { uri, available, thumbnails } = pdfPicker;
    setPdfConverting(true);
    try {
      // Reuse already-rendered thumbnails; render only the missing ones.
      const pages = await Promise.all(
        indices.map(async (idx) => thumbnails[idx] ?? (await renderPdfPage(uri, idx)))
      );
      setPdfPicker(null);
      appendFiles(pages, available);
    } catch {
      setError(copy.pdfRenderError);
    } finally {
      setPdfConverting(false);
    }
  }

  async function addImage() {
    try {
      setError(null);
      const availableSlots = await getAvailableSlots();
      if (availableSlots <= 0) return;
      const pickedFiles = await pickImage(availableSlots);
      if (pickedFiles) {
        setImportSheetOpen(false);
        appendFiles(pickedFiles, availableSlots);
      }
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : t("scan.pickPhotoError"));
    }
  }

  function handleScanEvent(localId: string, event: ScanProgressEvent) {
    if (event.type === "status") {
      const label = event.step ? stepLabels[event.step] ?? event.message ?? event.step : event.message;
      if (label) pushPendingProgressById(localId, label);
      return;
    }

    if (event.type === "field") {
      if (event.field === "summary") {
        updatePendingPreviewById(localId, { summary: String(event.value ?? "") });
      }
      if (event.field === "document_type_localized" || event.field === "document_type") {
        updatePendingPreviewById(localId, { documentType: String(event.value ?? "") });
      }
      if (event.field === "actions_required" && Array.isArray(event.value)) {
        updatePendingPreviewById(localId, {
          actions: event.value.filter((value): value is string => typeof value === "string"),
        });
      }
      return;
    }

    if (event.type === "error") {
      updatePendingScanById(localId, { error: event.detail, active: false });
      return;
    }

    updatePendingScanById(localId, { scanId: event.scan.id, active: false });
  }

  async function startScan() {
    if (!files.length || busy) return;

    setBusy(true);
    setError(null);

    try {
      const limits = await getLimits();
      setPageLimit(limits.max_pages_per_scan);
      setPlan(limits.plan);
      setScansRemaining(limits.scans_remaining);
      if (limits.scans_remaining <= 0 || files.length > limits.max_pages_per_scan) {
        if (limits.scans_remaining <= 0) {
          setError(t("documents.limitReached"));
        } else {
          setError(t("scan.pageLimitError", { count: limits.max_pages_per_scan }));
        }
        return;
      }

      const localId = generatePendingScanId();
      createPendingScan(
        localId,
        files.map((file) => ({ uri: file.uri, name: file.name, mimeType: file.mimeType })),
      );
      setActivePendingId(localId);

      pushPendingProgressById(localId, t("scan.uploading"));
      let uploadedPaths: string[] | null = null;
      try {
        uploadedPaths = await uploadToStorage(files);
        if (uploadedPaths.length !== files.length) {
          throw new Error(t("scan.uploadCountMismatch"));
        }
        await streamScan(uploadedPaths, (event) => handleScanEvent(localId, event));
      } catch (scanError) {
        const message = scanError instanceof Error ? scanError.message : t("scan.failed");
        // Don't setError here — component may have unmounted while streaming.
        updatePendingScanById(localId, { error: message, active: false });
      } finally {
        // If the upload succeeded but no scan record came back (stream threw or
        // the backend streamed an error event — which doesn't throw), the
        // uploaded objects would orphan in storage. Best-effort cleanup; never
        // touches the user's local files. Skip when a scan was created, since
        // the record references these same objects.
        if (uploadedPaths?.length && !getPendingScanById(localId)?.scanId) {
          void deleteFromStorage(uploadedPaths);
        }
      }
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : t("scan.failed");
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  // Re-pull limits after a successful purchase so the page/scan caps update.
  function refreshLimits() {
    void getLimits()
      .then((limits) => {
        setPageLimit(limits.max_pages_per_scan);
        setPlan(limits.plan);
        setScansRemaining(limits.scans_remaining);
      })
      .catch(() => {});
  }

  const maxPages = pageLimit ?? 3;
  const isPro = plan === "pro";
  const limitReached = files.length >= maxPages;
  const nearLimit = isPro && maxPages - files.length === 1;

  return {
    files,
    scansRemaining,
    busy,
    error,
    setError,
    importSheetOpen,
    setImportSheetOpen,
    pdfPicker,
    setPdfPicker,
    pdfRendering,
    pdfConverting,
    activePendingId,
    pillFlash,
    maxPages,
    isPro,
    limitReached,
    nearLimit,
    getAvailableSlots,
    appendFiles,
    removeFile,
    addDocument,
    addImage,
    confirmPdfSelection,
    startScan,
    refreshLimits,
  };
}
