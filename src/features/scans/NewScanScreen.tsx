import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Dimensions, Image, Linking, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { fonts, typeStyles, useThemePreference } from "@/components/ui";

import { PaywallSheet } from "@/components/PaywallSheet";
import { ChatThreadScreen } from "@/features/chat/ChatThreadScreen";
import {
  type PickedUpload,
  type ScanProgressEvent,
  getLimits,
  getPdfPageCount,
  pickDocument,
  pickImage,
  renderPdfPage,
  streamScan,
  uploadToStorage
} from "@/features/scans/scansApi";
import {
  createPendingScan,
  generatePendingScanId,
  getPendingScanById,
  pushPendingProgressById,
  removePendingScanById,
  updatePendingPreviewById,
  updatePendingScanById,
} from "@/features/scans/pendingScanStore";
import { getLocale, t } from "@/lib/i18n";
import { triggerSelectionHaptic } from "@/lib/haptics";
import type { UserPlan } from "@/lib/types";

type ScannerCopy = ReturnType<typeof getScannerCopy>;
type CameraFocusPoint = { x: number; y: number; key: number };
type CameraZoomLevel = { label: string; value: number };

const CAMERA_ZOOM_LEVELS: CameraZoomLevel[] = [
  { label: "1x", value: 0 },
  { label: "2x", value: 0.18 },
  { label: "3x", value: 0.32 },
];
const CAMERA_MAX_ZOOM = 0.48;
const SHUTTER_BLACKOUT_MS = 180;

function clampCameraZoom(value: number) {
  return Math.max(0, Math.min(CAMERA_MAX_ZOOM, value));
}

const scannerDark = {
  // Camera viewport ALWAYS stays black — convention for camera UI, regardless of theme.
  stage: "#000",
  // Chrome (app bar, bottom bar, sheets, picker, preview):
  bg: "#0F0D0B",
  bgDeep: "#0A0907",
  surface: "#181512",
  surface2: "#211D19",
  surface3: "#2A2520",
  hairline: "#2C2722",
  blue: "#6FA0E6",
  blueDeep: "#3E6FB8",
  amber: "#E0B45A",
  red: "#E07F73",
  green: "#7FBE9A",
  purple: "#A893E0",
  ink: "#F4EFE6",
  ink2: "#D9D2C5",
  ink3: "#A39A8C",
  ink4: "#6F675D",
  ink5: "#4A443D",
  paper: "#F1EAD9",
  // On-stage text/icons sit over the black viewport — kept light in both themes.
  stageInk: "#F4EFE6",
  stageInk2: "#D9D2C5",
  stageInk3: "#A39A8C",
  greenSoft: "rgba(127,190,154,0.12)",
  greenLine: "rgba(127,190,154,0.28)",
  redSoft: "rgba(224,127,115,0.13)",
  redLine: "rgba(224,127,115,0.32)",
  amberSoft: "rgba(224,180,90,0.13)",
  amberLine: "rgba(224,180,90,0.30)",
  purpleSoft: "rgba(168,147,224,0.13)",
  purpleLine: "rgba(168,147,224,0.30)",
  blueSoft: "rgba(111,160,230,0.13)",
  blueLine: "rgba(111,160,230,0.28)",
};

// Light theme keeps the camera viewport black (camera-app convention),
// but swaps the surrounding chrome to warm paper tones.
const scannerLight: typeof scannerDark = {
  stage: "#000",
  bg: "#F7F1E4",
  bgDeep: "#FBF6EC",
  surface: "#FFFFFF",
  surface2: "#F1EAD9",
  surface3: "#E8DFCB",
  hairline: "#E0D6BE",
  blue: "#3E6FB8",
  blueDeep: "#3E6FB8",
  amber: "#B07E2C",
  red: "#C8493C",
  green: "#4E8C68",
  purple: "#7458B8",
  ink: "#2B2620",
  ink2: "#5A5147",
  ink3: "#8B8175",
  ink4: "#A39A8C",
  ink5: "#C9C0B0",
  paper: "#F1EAD9",
  stageInk: "#F4EFE6",
  stageInk2: "#D9D2C5",
  stageInk3: "#A39A8C",
  greenSoft: "rgba(78,140,104,0.10)",
  greenLine: "rgba(78,140,104,0.30)",
  redSoft: "rgba(200,73,60,0.10)",
  redLine: "rgba(200,73,60,0.30)",
  amberSoft: "rgba(176,126,44,0.10)",
  amberLine: "rgba(176,126,44,0.30)",
  purpleSoft: "rgba(116,88,184,0.10)",
  purpleLine: "rgba(116,88,184,0.30)",
  blueSoft: "rgba(62,111,184,0.10)",
  blueLine: "rgba(62,111,184,0.30)",
};

type ScannerPalette = typeof scannerDark;

function useScannerTheme() {
  const { scheme } = useThemePreference();
  return useMemo(() => {
    const scanner = scheme === "light" ? scannerLight : scannerDark;
    return {
      scheme,
      scanner,
      scannerStyles: createScannerStyles(scanner),
      sheetStyles: createSheetStyles(scanner),
      pickerStyles: createPickerStyles(scanner),
      previewStyles: createPreviewStyles(scanner),
      permissionStyles: createPermissionStyles(scanner),
    };
  }, [scheme]);
}

const stepLabels: Record<string, ReturnType<typeof t>> = {
  preparing_inputs: t("scan.step.preparing_inputs"),
  ocr: t("scan.step.ocr"),
  classified: t("scan.step.classified"),
  rag: t("scan.step.rag"),
  analysis: t("scan.step.analysis"),
  saving: t("scan.step.saving")
};

export function NewScanScreen() {
  const params = useLocalSearchParams<{ fresh?: string; pending?: string }>();
  const insets = useSafeAreaInsets();
  const copy = useMemo(() => getScannerCopy(getLocale()), []);
  const { scannerStyles } = useScannerTheme();

  const cameraRef = useRef<CameraView>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shutterFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(0);
  const [focusPulse, setFocusPulse] = useState(false);
  const [focusPoint, setFocusPoint] = useState<CameraFocusPoint | null>(null);
  const [shutterBlackout, setShutterBlackout] = useState(false);

  const [files, setFiles] = useState<PickedUpload[]>([]);
  const [pageLimit, setPageLimit] = useState<number | null>(null);
  const [plan, setPlan] = useState<UserPlan>("free");
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [pdfPicker, setPdfPicker] = useState<{
    uri: string;
    pageCount: number;
    available: number;
    thumbnails: Record<number, PickedUpload>;
  } | null>(null);
  const [pdfRendering, setPdfRendering] = useState(false);
  const [pdfConverting, setPdfConverting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  // Show chat only when explicitly entered via a pending card (?pending=<localId>).
  // The FAB always enters the scanner with a fresh state.
  const [activePendingId, setActivePendingId] = useState<string | null>(() =>
    params.pending && getPendingScanById(params.pending) ? params.pending : null,
  );
  const showPendingChat = activePendingId !== null;
  const [previewOpen, setPreviewOpen] = useState(false);
  // Transient "page added" feedback — pill auto-hides 2s after each capture.
  const [pillFlash, setPillFlash] = useState<{ label: string; key: number } | null>(null);

  useEffect(() => {
    if (!pillFlash) return;
    const timer = setTimeout(() => setPillFlash((current) => (current?.key === pillFlash.key ? null : current)), 2000);
    return () => clearTimeout(timer);
  }, [pillFlash]);

  useEffect(() => {
    // Always reset the scanner UI on `fresh` entry. Don't clobber any in-flight
    // pending scans in the store — that data drives the pending cards on the list.
    setFiles([]);
    setBusy(false);
    setError(null);
    setImportSheetOpen(false);
    setPdfPicker(null);
    setPdfRendering(false);
    setPdfConverting(false);
    setPermissionDenied(false);
    setCameraZoom(0);
    setFocusPoint(null);
    setFocusPulse(false);
    setShutterBlackout(false);
    setActivePendingId(params.pending && getPendingScanById(params.pending) ? params.pending : null);
  }, [params.fresh, params.pending]);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (shutterFlashTimerRef.current) clearTimeout(shutterFlashTimerRef.current);
    };
  }, []);

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
  }, [params.fresh]);

  // Ask for camera permission on entry so the live preview can show immediately.
  // If the user previously hard-denied it, the permission screen kicks in below.
  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      void requestCameraPermission();
    }
  }, [cameraPermission?.granted, cameraPermission?.canAskAgain]);

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
  }, [pdfPicker?.uri, pdfPicker?.pageCount]);

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

  function handleCameraTap(event: GestureResponderEvent) {
    if (!cameraReady) return;
    const { locationX, locationY } = event.nativeEvent;
    triggerSelectionHaptic();
    setFocusPulse(false);
    setFocusPoint({ x: locationX, y: locationY, key: Date.now() });
    requestAnimationFrame(() => setFocusPulse(true));
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      setFocusPulse(false);
      setFocusPoint(null);
      focusTimerRef.current = null;
    }, 850);
  }

  function triggerShutterBlackout() {
    setShutterBlackout(true);
    if (shutterFlashTimerRef.current) clearTimeout(shutterFlashTimerRef.current);
    shutterFlashTimerRef.current = setTimeout(() => {
      setShutterBlackout(false);
      shutterFlashTimerRef.current = null;
    }, SHUTTER_BLACKOUT_MS);
  }

  async function addCameraScan() {
    if (capturing) return;
    try {
      setError(null);

      // Ensure camera permission right before capturing.
      let granted = cameraPermission?.granted ?? false;
      if (!granted) {
        const result = await requestCameraPermission();
        granted = result.granted;
      }
      if (!granted) {
        setPermissionDenied(true);
        return;
      }

      const availableSlots = await getAvailableSlots();
      if (availableSlots <= 0) return;

      setCapturing(true);
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        appendFiles(
          [{ uri: photo.uri, name: `scan-${Date.now()}.jpg`, mimeType: "image/jpeg" }],
          availableSlots,
        );
      }
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : t("scan.scannerUnavailable"));
    } finally {
      setCapturing(false);
    }
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
      try {
        const paths = await uploadToStorage(files);
        if (paths.length !== files.length) {
          throw new Error(t("scan.uploadCountMismatch"));
        }
        await streamScan(paths, (event) => handleScanEvent(localId, event));
      } catch (scanError) {
        const message = scanError instanceof Error ? scanError.message : t("scan.failed");
        // Don't setError here — component may have unmounted while streaming.
        updatePendingScanById(localId, { error: message, active: false });
      }
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : t("scan.failed");
      setError(message);
    } finally {
      setBusy(false);
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

  const maxPages = pageLimit ?? 3;
  const isPro = plan === "pro";
  const limitReached = files.length >= maxPages;
  const nearLimit = isPro && maxPages - files.length === 1;
  const cameraReady = cameraPermission?.granted ?? false;
  // Show the dedicated permission screen when access was hard-denied (can't ask again)
  // or the user explicitly hit a denial while capturing.
  const showPermissionScreen =
    permissionDenied || (!!cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain);

  if (showPermissionScreen) {
    return (
      <PermissionDeniedScreen
        copy={copy}
        error={error}
        onClose={() => router.back()}
        onOpenSettings={() => void Linking.openSettings()}
        onPickGallery={() => {
          setPermissionDenied(false);
          void addImage();
        }}
        topInset={insets.top}
      />
    );
  }

  if (showPendingChat && activePendingId) return <ChatThreadScreen pendingLocalId={activePendingId} />;

  return (
    <View style={scannerStyles.root}>
      <View style={scannerStyles.appBackground} />
      <ScannerAppBar
        copy={copy}
        count={files.length}
        maxPages={maxPages}
        isPro={isPro}
        limitReached={limitReached}
        torchOn={torchOn}
        onToggleTorch={() => setTorchOn((on) => !on)}
        onClose={() => router.back()}
        topInset={insets.top}
      />

      <ScannerCamera
        copy={copy}
        isPro={isPro}
        files={files}
        limitReached={limitReached}
        cameraRef={cameraRef}
        cameraReady={cameraReady}
        zoom={cameraZoom}
        focusPulse={focusPulse}
        focusPoint={focusPoint}
        shutterBlackout={shutterBlackout}
        torchOn={torchOn}
        flashPill={pillFlash ? { label: pillFlash.label, visible: true } : undefined}
        pdfRendering={pdfRendering}
        onCameraTap={handleCameraTap}
        onZoomChange={setCameraZoom}
      >
        {files.length > 0 ? (
          <ThumbnailStrip
            files={files}
            onRemove={removeFile}
            onPreview={() => setPreviewOpen(true)}
            previewLabel={copy.preview}
          />
        ) : null}
      </ScannerCamera>

      {error ? (
        <View style={scannerStyles.inlineError}>
          <Text style={scannerStyles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}

      {limitReached ? (
        <ProcessBar
          copy={copy}
          count={files.length}
          isPro={isPro}
          onProcess={startScan}
          onUpgrade={() => setShowPaywall(true)}
          bottomInset={insets.bottom}
        />
      ) : (
        <BottomBar
          copy={copy}
          doneActive={files.length > 0}
          nearLimitLabel={nearLimit ? copy.onePageRemaining : undefined}
          onImport={() => setImportSheetOpen(true)}
          onShutter={() => {
            triggerSelectionHaptic();
            triggerShutterBlackout();
            void addCameraScan();
          }}
          onDone={startScan}
          bottomInset={insets.bottom}
        />
      )}

      <ImportSheet
        visible={importSheetOpen}
        copy={copy}
        maxPages={maxPages}
        onClose={() => setImportSheetOpen(false)}
        onPickPdf={() => void addDocument()}
        onPickPhotos={() => void addImage()}
      />
      <PdfPagePicker
        visible={Boolean(pdfPicker)}
        pageCount={pdfPicker?.pageCount ?? 0}
        available={pdfPicker?.available ?? 0}
        thumbnails={pdfPicker?.thumbnails ?? {}}
        converting={pdfConverting}
        copy={copy}
        isPro={isPro}
        maxPages={maxPages}
        onCancel={() => {
          if (pdfConverting) return;
          setPdfPicker(null);
        }}
        onConfirm={(indices) => void confirmPdfSelection(indices)}
        onUpgrade={() => setShowPaywall(true)}
      />
      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchase={() => {
          void getLimits()
            .then((limits) => {
              setPageLimit(limits.max_pages_per_scan);
              setPlan(limits.plan);
              setScansRemaining(limits.scans_remaining);
            })
            .catch(() => {});
        }}
      />
      <PreviewModal
        visible={previewOpen}
        files={files}
        copy={copy}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
}

function ScannerAppBar({
  copy,
  count,
  maxPages,
  isPro,
  limitReached,
  torchOn,
  onToggleTorch,
  onClose,
  topInset,
}: {
  copy: ScannerCopy;
  count: number;
  maxPages: number;
  isPro: boolean;
  limitReached: boolean;
  torchOn: boolean;
  onToggleTorch: () => void;
  onClose: () => void;
  topInset: number;
}) {
  const { scanner, scannerStyles } = useScannerTheme();
  const subtitle = subtitleForState(copy, count, maxPages, isPro, limitReached);

  return (
    <View style={[scannerStyles.appBar, { height: topInset + 56, paddingTop: topInset }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={scannerStyles.appBarButton}>
        <Icon name="x" size={20} color={scanner.ink2} />
      </Pressable>

      <View style={scannerStyles.appBarTitleBlock}>
        <Text style={scannerStyles.appBarTitle}>{copy.newScan}</Text>
        <View style={scannerStyles.subtitleRow}>
          {isPro ? <Icon name="star" size={11} color={scanner.purple} /> : null}
          <Text style={[scannerStyles.appBarSubtitle, subtitle.tone === "red" && scannerStyles.redText, subtitle.tone === "amber" && scannerStyles.amberText]}>
            {subtitle.label}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.flash}
        onPress={onToggleTorch}
        style={[scannerStyles.appBarButton, torchOn && scannerStyles.appBarButtonActive]}
      >
        <Icon name="zap" size={18} color={torchOn ? scanner.amber : scanner.ink2} />
      </Pressable>
    </View>
  );
}

function ScannerCamera({
  copy,
  files,
  cameraRef,
  cameraReady,
  zoom,
  focusPulse,
  focusPoint,
  shutterBlackout,
  torchOn,
  flashPill,
  pdfRendering,
  onCameraTap,
  onZoomChange,
  children,
}: {
  copy: ScannerCopy;
  isPro: boolean;
  files: PickedUpload[];
  limitReached: boolean;
  cameraRef: RefObject<CameraView | null>;
  cameraReady: boolean;
  zoom: number;
  focusPulse: boolean;
  focusPoint: CameraFocusPoint | null;
  shutterBlackout: boolean;
  torchOn: boolean;
  flashPill?: { label: string; visible: boolean };
  pdfRendering?: boolean;
  onCameraTap: (event: GestureResponderEvent) => void;
  onZoomChange: (zoom: number) => void;
  children?: React.ReactNode;
}) {
  const { scanner, scannerStyles } = useScannerTheme();
  const zoomRef = useRef(zoom);
  const zoomStartRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const setGestureZoom = useCallback((nextZoom: number) => {
    const clamped = clampCameraZoom(nextZoom);
    if (Math.abs(clamped - zoomRef.current) < 0.006) return;
    zoomRef.current = clamped;
    onZoomChange(clamped);
  }, [onZoomChange]);

  const cameraPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, { dx, dy }) =>
          Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.25,
        onPanResponderGrant: () => {
          zoomStartRef.current = zoomRef.current;
        },
        onPanResponderMove: (_, { dy }) => {
          setGestureZoom(zoomStartRef.current - dy / 780);
        },
      }),
    [setGestureZoom],
  );

  return (
    <View style={scannerStyles.camera}>
      {cameraReady ? (
        <CameraView
          ref={cameraRef as React.Ref<CameraView>}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          zoom={zoom}
          autofocus={focusPulse ? "on" : "off"}
          animateShutter={false}
        />
      ) : (
        <View style={scannerStyles.emptyState}>
          <Icon name="doc-text" size={48} color={scanner.stageInk3} />
          <Text style={scannerStyles.emptyHint}>{copy.pointCamera}</Text>
        </View>
      )}

      {cameraReady ? (
        <>
          <Pressable
            {...cameraPanResponder.panHandlers}
            accessibilityRole="button"
            accessibilityLabel={copy.pointCamera}
            onPress={onCameraTap}
            style={StyleSheet.absoluteFill}
          />
          {focusPoint ? <FocusMarker point={focusPoint} /> : null}
          <ZoomControls
            levels={CAMERA_ZOOM_LEVELS}
            value={zoom}
            hasFiles={files.length > 0}
            onChange={onZoomChange}
          />
        </>
      ) : null}

      {children}

      {pdfRendering ? (
        <View style={[scannerStyles.statusPill, scannerStyles.statusPillBlue]}>
          <Text style={[scannerStyles.statusPillText, scannerStyles.statusPillTextBlue]}>
            {copy.pdfRendering}
          </Text>
        </View>
      ) : flashPill?.visible ? (
        <View style={[scannerStyles.statusPill, scannerStyles.statusPillGreen]}>
          <Icon name="check" size={14} color={scanner.green} />
          <Text style={[scannerStyles.statusPillText, scannerStyles.statusPillTextGreen]}>
            {flashPill.label}
          </Text>
        </View>
      ) : null}

      {shutterBlackout ? <View pointerEvents="none" style={scannerStyles.shutterBlackout} /> : null}
    </View>
  );
}

function FocusMarker({ point }: { point: CameraFocusPoint }) {
  const { scannerStyles } = useScannerTheme();
  return (
    <View
      key={point.key}
      pointerEvents="none"
      style={[
        scannerStyles.focusMarker,
        {
          left: point.x - 34,
          top: point.y - 34,
        },
      ]}
    >
      <View style={scannerStyles.focusMarkerDot} />
    </View>
  );
}

function ZoomControls({
  levels,
  value,
  hasFiles,
  onChange,
}: {
  levels: CameraZoomLevel[];
  value: number;
  hasFiles: boolean;
  onChange: (zoom: number) => void;
}) {
  const { scannerStyles } = useScannerTheme();
  return (
    <View style={[scannerStyles.zoomControls, hasFiles && scannerStyles.zoomControlsRaised]}>
      {levels.map((level) => {
        const active = Math.abs(value - level.value) < 0.01;
        return (
          <Pressable
            key={level.label}
            accessibilityRole="button"
            accessibilityLabel={level.label}
            onPress={() => {
              if (active) return;
              triggerSelectionHaptic();
              onChange(level.value);
            }}
            style={[scannerStyles.zoomButton, active && scannerStyles.zoomButtonActive]}
          >
            <Text style={[scannerStyles.zoomButtonText, active && scannerStyles.zoomButtonTextActive]}>
              {level.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function isImageUpload(file: PickedUpload) {
  if (file.mimeType?.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic)$/i.test(file.name) || /\.(jpe?g|png|gif|webp|heic)$/i.test(file.uri);
}

function ThumbnailStrip({
  files,
  onRemove,
  onPreview,
  previewLabel,
}: {
  files: PickedUpload[];
  onRemove: (index: number) => void;
  onPreview: () => void;
  previewLabel: string;
}) {
  const { scanner, scannerStyles } = useScannerTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={scannerStyles.thumbsContent}
      style={scannerStyles.thumbs}
    >
      <Pressable
        onPress={onPreview}
        accessibilityRole="button"
        accessibilityLabel={previewLabel}
        style={({ pressed }) => [scannerStyles.previewTile, pressed && { opacity: 0.7 }]}
      >
        <Icon name="eye" size={22} color={scanner.blue} />
        <Text style={scannerStyles.previewTileLabel}>{files.length}</Text>
      </Pressable>
      {files.map((file, index) => {
        const isImage = isImageUpload(file);
        return (
          <View key={`${file.uri}-${index}`} style={scannerStyles.thumb}>
            {isImage ? (
              <Image source={{ uri: file.uri }} style={scannerStyles.thumbImage} resizeMode="cover" />
            ) : (
              <View style={scannerStyles.thumbPdf}>
                <Icon name="doc" size={20} color={scanner.blue} />
              </View>
            )}
            <View style={scannerStyles.thumbIndexBadge}>
              <Text style={scannerStyles.thumbIndexText}>{index + 1}</Text>
            </View>
            <Pressable
              onPress={() => onRemove(index)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
              style={scannerStyles.thumbRemove}
            >
              <Icon name="x" size={10} color={scanner.stageInk} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function BottomBar({
  copy,
  doneActive,
  nearLimitLabel,
  onImport,
  onShutter,
  onDone,
  bottomInset,
}: {
  copy: ScannerCopy;
  doneActive: boolean;
  nearLimitLabel?: string;
  onImport: () => void;
  onShutter: () => void;
  onDone: () => void;
  bottomInset: number;
}) {
  const { scanner, scannerStyles } = useScannerTheme();
  return (
    <View style={[scannerStyles.bottomBar, { paddingBottom: Math.max(bottomInset, 18) + 10 }]}>
      <Pressable accessibilityRole="button" onPress={onImport} style={scannerStyles.sideAction}>
        <Icon name="pages" size={24} color={scanner.ink2} />
        <Text style={scannerStyles.sideActionText}>{copy.import}</Text>
      </Pressable>

      <View style={scannerStyles.shutterSlot} />

      <Pressable accessibilityRole="button" disabled={!doneActive} onPress={onDone} style={scannerStyles.doneAction}>
        <Text style={[scannerStyles.doneText, !doneActive && scannerStyles.doneTextDisabled]}>{copy.done}</Text>
      </Pressable>

      <View style={scannerStyles.shutterWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.capture} onPress={onShutter} style={({ pressed }) => [scannerStyles.shutter, pressed && scannerStyles.shutterPressed]}>
          <View style={scannerStyles.shutterInner} />
        </Pressable>
        {nearLimitLabel ? <Text style={scannerStyles.nearLimitLabel}>{nearLimitLabel}</Text> : null}
      </View>
    </View>
  );
}

function ProcessBar({
  copy,
  count,
  isPro,
  onProcess,
  onUpgrade,
  bottomInset,
}: {
  copy: ScannerCopy;
  count: number;
  isPro: boolean;
  onProcess: () => void;
  onUpgrade: () => void;
  bottomInset: number;
}) {
  const { scanner, scannerStyles } = useScannerTheme();
  return (
    <View style={[scannerStyles.processBar, { paddingBottom: Math.max(bottomInset, 18) + 10 }]}>
      <Pressable accessibilityRole="button" onPress={onProcess} style={scannerStyles.processButton}>
        <Text style={scannerStyles.processButtonText}>{copy.processPages(count)}</Text>
      </Pressable>
      {isPro ? (
        <Text style={scannerStyles.processCaption}>{copy.maximumPages}</Text>
      ) : (
        <Pressable onPress={onUpgrade} style={scannerStyles.upgradeRibbon}>
          <Icon name="star" size={12} color={scanner.purple} />
          <Text style={scannerStyles.upgradeText}>{copy.upgradeToPro}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ImportSheet({
  visible,
  copy,
  maxPages,
  onClose,
  onPickPdf,
  onPickPhotos,
}: {
  visible: boolean;
  copy: ScannerCopy;
  maxPages: number;
  onClose: () => void;
  onPickPdf: () => void;
  onPickPhotos: () => void;
}) {
  const { sheetStyles } = useScannerTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sectionLabel}>{copy.addToScan}</Text>
          <View style={sheetStyles.rows}>
            <SheetRow icon="doc-text" title={copy.pdfFile} detail={copy.importFromFiles} onPress={onPickPdf} />
            <View style={sheetStyles.divider} />
            <SheetRow icon="pages" title={copy.photosFromGallery} detail={copy.selectPhotos(maxPages)} onPress={onPickPhotos} />
          </View>
          <Pressable onPress={onClose} style={sheetStyles.cancelButton}>
            <Text style={sheetStyles.cancelText}>{copy.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function PdfPagePicker({
  visible,
  pageCount,
  available,
  thumbnails,
  converting,
  copy,
  isPro,
  maxPages,
  onCancel,
  onConfirm,
  onUpgrade,
}: {
  visible: boolean;
  pageCount: number;
  available: number;
  thumbnails: Record<number, PickedUpload>;
  converting: boolean;
  copy: ScannerCopy;
  isPro: boolean;
  maxPages: number;
  onCancel: () => void;
  onConfirm: (indices: number[]) => void;
  onUpgrade: () => void;
}) {
  const { scanner, pickerStyles } = useScannerTheme();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Pre-select first `available` pages whenever picker opens.
  useEffect(() => {
    if (visible && pageCount > 0) {
      const next = new Set<number>();
      for (let i = 0; i < Math.min(pageCount, available); i++) next.add(i);
      setSelected(next);
    } else if (!visible) {
      setSelected(new Set());
    }
  }, [visible, pageCount, available]);

  function toggle(index: number) {
    if (converting) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < available) {
        next.add(index);
      }
      return next;
    });
  }

  const selectedIndices = Array.from(selected).sort((a, b) => a - b);
  const canConfirm = selectedIndices.length > 0 && !converting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={pickerStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={pickerStyles.sheet}>
          <View style={pickerStyles.handle} />
          <View style={pickerStyles.titleRow}>
            <Text style={pickerStyles.title}>{copy.pdfPickerTitle}</Text>
            <Text style={pickerStyles.titleHint}>{copy.pdfPickerTotal(pageCount)}</Text>
          </View>

          {!isPro ? (
            <View style={pickerStyles.warning}>
              <Text style={pickerStyles.warningText}>{copy.freePdfWarning(maxPages)}</Text>
            </View>
          ) : null}

          <ScrollView
            style={pickerStyles.grid}
            contentContainerStyle={pickerStyles.gridContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            <View style={pickerStyles.gridRow}>
              {Array.from({ length: pageCount }).map((_, index) => {
                const isSelected = selected.has(index);
                const canToggle = isSelected || selected.size < available;
                const thumb = thumbnails[index];
                return (
                  <Pressable
                    key={`page-${index}`}
                    onPress={() => toggle(index)}
                    style={[
                      pickerStyles.pageCard,
                      isSelected && pickerStyles.pageCardSelected,
                      !canToggle && pickerStyles.pageCardDim,
                    ]}
                  >
                    {thumb ? (
                      <Image source={{ uri: thumb.uri }} style={pickerStyles.pageCardImage} resizeMode="cover" />
                    ) : (
                      <View style={pickerStyles.pageCardPlaceholder}>
                        <Icon name="doc-text" size={28} color={scanner.ink3} />
                      </View>
                    )}
                    <View style={pickerStyles.pageNumberBadge}>
                      <Text style={pickerStyles.pageNumberBadgeText}>{index + 1}</Text>
                    </View>
                    {isSelected ? (
                      <View style={pickerStyles.checkOverlay}>
                        <Icon name="check" size={13} color={scanner.stageInk} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={pickerStyles.footer}>
            <Pressable
              disabled={!canConfirm}
              onPress={() => onConfirm(selectedIndices)}
              style={[pickerStyles.addButton, !canConfirm && pickerStyles.addButtonDisabled]}
            >
              <Text style={pickerStyles.addButtonText}>
                {converting ? copy.pdfConverting : copy.pdfPickerAdd(selectedIndices.length)}
              </Text>
            </Pressable>
            {!isPro && !converting ? (
              <Pressable onPress={onUpgrade} style={pickerStyles.upgradeButton}>
                <Icon name="star" size={12} color={scanner.purple} />
                <Text style={pickerStyles.upgradeButtonText}>{copy.upgradePdf}</Text>
              </Pressable>
            ) : null}
            {!converting ? (
              <Pressable onPress={onCancel} style={pickerStyles.cancelButton}>
                <Text style={pickerStyles.cancelText}>{copy.cancel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SheetRow({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress: () => void }) {
  const { scanner, sheetStyles } = useScannerTheme();
  return (
    <Pressable onPress={onPress} style={sheetStyles.row}>
      <View style={sheetStyles.rowIcon}>
        <Icon name={icon} size={20} color={scanner.blue} />
      </View>
      <View style={sheetStyles.rowText}>
        <Text style={sheetStyles.rowTitle}>{title}</Text>
        <Text style={sheetStyles.rowDetail}>{detail}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={scanner.ink3} />
    </Pressable>
  );
}

function PreviewModal({
  visible,
  files,
  copy,
  onClose,
}: {
  visible: boolean;
  files: PickedUpload[];
  copy: ScannerCopy;
  onClose: () => void;
}) {
  const { scanner, previewStyles } = useScannerTheme();
  const { width } = Dimensions.get("window");
  const [pageIndex, setPageIndex] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) setPageIndex(0);
  }, [visible]);

  useEffect(() => {
    if (pageIndex >= files.length && files.length > 0) {
      setPageIndex(files.length - 1);
    }
  }, [files.length, pageIndex]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={previewStyles.root}>
        <View style={[previewStyles.topBar, { paddingTop: insets.top + 12 }]}>
          <Text style={previewStyles.counter}>
            {files.length ? copy.previewPageOf(pageIndex + 1, files.length) : ""}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={previewStyles.iconButton}>
            <Icon name="x" size={20} color={scanner.ink2} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            if (next !== pageIndex) setPageIndex(next);
          }}
          style={previewStyles.pager}
        >
          {files.map((file, index) => (
            <View key={`${file.uri}-${index}`} style={[previewStyles.page, { width }]}>
              {isImageUpload(file) ? (
                <Image source={{ uri: file.uri }} style={previewStyles.pageImage} resizeMode="contain" />
              ) : (
                <View style={previewStyles.pagePdf}>
                  <Icon name="doc" size={64} color={scanner.blue} />
                  <Text style={previewStyles.pagePdfName} numberOfLines={2}>{file.name}</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {files.length > 1 ? (
          <View style={[previewStyles.dots, { paddingBottom: Math.max(insets.bottom, 14) + 6 }]}>
            {files.map((_, index) => (
              <View
                key={index}
                style={[previewStyles.dot, index === pageIndex && previewStyles.dotActive]}
              />
            ))}
          </View>
        ) : (
          <View style={{ height: Math.max(insets.bottom, 14) + 16 }} />
        )}
      </View>
    </Modal>
  );
}

function PermissionDeniedScreen({
  copy,
  error,
  onClose,
  onOpenSettings,
  onPickGallery,
  topInset,
}: {
  copy: ScannerCopy;
  error: string | null;
  onClose: () => void;
  onOpenSettings: () => void;
  onPickGallery: () => void;
  topInset: number;
}) {
  const { scanner, permissionStyles } = useScannerTheme();
  return (
    <View style={permissionStyles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={onClose}
        style={[permissionStyles.closeButton, { top: topInset + 8 }]}
      >
        <Icon name="x" size={20} color={scanner.ink2} />
      </Pressable>
      <Icon name="camera" size={58} color={scanner.ink4} style={{ marginBottom: 20 }} />
      <Text style={permissionStyles.title}>{copy.cameraAccessNeeded}</Text>
      <Text style={permissionStyles.body}>{copy.cameraAccessBody}</Text>
      {error ? <Text style={permissionStyles.error}>{error}</Text> : null}
      <View style={permissionStyles.actions}>
        <Pressable onPress={onOpenSettings} style={permissionStyles.primaryButton}>
          <Text style={permissionStyles.primaryButtonText}>{copy.openSettings}</Text>
        </Pressable>
        <Pressable onPress={onPickGallery} style={permissionStyles.secondaryButton}>
          <Text style={permissionStyles.secondaryButtonText}>{copy.pickGalleryInstead}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function subtitleForState(copy: ScannerCopy, count: number, maxPages: number, isPro: boolean, limitReached: boolean) {
  const planLabel = isPro ? "Pro" : "Free";

  if (limitReached) {
    return {
      label: `${planLabel} · ${copy.limitReachedSuffix}`,
      tone: (isPro ? "amber" : "red") as "amber" | "red",
    };
  }
  return {
    label: `${planLabel} · ${copy.countOfMax(count, maxPages)}`,
    tone: "default" as const,
  };
}

function isPdfUpload(file: PickedUpload) {
  return file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function getScannerCopy(locale: string) {
  const language = locale === "ru" || locale === "uk" || locale === "en" ? locale : "cs";
  const copies = {
    cs: {
      newScan: "Nový sken",
      flash: "Blesk",
      capture: "Skenovat",
      import: "Import",
      done: "Hotovo",
      cancel: "Zrušit",
      pointCamera: "Namiř kameru na dokument",
      documentFound: "Dokument nalezen",
      pageAdded: (count: number) => `Strana ${count} přidána`,
      freeLimit: (max: number) => `Free · max ${max} strany`,
      proLimit: (max: number) => `Pro · max ${max} stran`,
      countOfLimit: (count: number, max: number, label: string) => `${count} z ${max} · ${label}`,
      countOfMax: (count: number, max: number) => `${count} z ${max}`,
      limitReachedSuffix: "limit dosažen",
      freeLimitReached: "Free limit dosažen",
      maximumReached: "Maximum dosaženo · Pro",
      onePageRemaining: "Zbývá 1 strana",
      processPages: (count: number) => `Zpracovat ${count} ${count === 1 ? "stranu" : "strany"} →`,
      maximumPages: "Maximum 10 stran na jeden sken",
      upgradeToPro: "Přejít na Pro · až 10 stran",
      addToScan: "Přidat do skenu",
      pdfFile: "PDF soubor",
      importFromFiles: "Import z aplikace Soubory",
      photosFromGallery: "Fotky z galerie",
      selectPhotos: (max: number) => `Vyber až ${max} fotek`,
      pdfPickerTitle: "Vybrat stránky PDF",
      pdfPickerTotal: (total: number) => `${total} stran celkem`,
      pdfPickerAdd: (count: number) => `Přidat ${count} ${count === 1 ? "stranu" : "strany"} →`,
      pdfRendering: "Načítám stránky…",
      pdfConverting: "Zpracovávám…",
      pdfRenderError: "Nepodařilo se načíst stránky PDF",
      freePdfWarning: (max: number) => `Free plán podporuje max ${max} strany na jeden sken`,
      upgradePdf: "Pro zpracuje až 10 stran",
      cameraAccessNeeded: "Je potřeba přístup ke kameře",
      cameraAccessBody: "Jasně potřebuje kameru ke skenování dokumentů. Přístup můžeš povolit v Nastavení.",
      openSettings: "Otevřít Nastavení",
      pickGalleryInstead: "Vybrat z galerie",
      preview: "Náhled",
      previewPageOf: (page: number, total: number) => `Strana ${page} z ${total}`,
    },
    ru: {
      newScan: "Новый скан",
      flash: "Вспышка",
      capture: "Сканировать",
      import: "Импорт",
      done: "Готово",
      cancel: "Отмена",
      pointCamera: "Наведите камеру на документ",
      documentFound: "Документ найден",
      pageAdded: (count: number) => `Страница ${count} добавлена`,
      freeLimit: (max: number) => `Free · до ${max} страниц`,
      proLimit: (max: number) => `Pro · до ${max} страниц`,
      countOfLimit: (count: number, max: number, label: string) => `${count} из ${max} · ${label}`,
      countOfMax: (count: number, max: number) => `${count} из ${max}`,
      limitReachedSuffix: "лимит достигнут",
      freeLimitReached: "Лимит Free достигнут",
      maximumReached: "Максимум достигнут · Pro",
      onePageRemaining: "Осталась 1 страница",
      processPages: (count: number) => `Обработать ${count} стр. →`,
      maximumPages: "Максимум 10 страниц за один скан",
      upgradeToPro: "Перейти на Pro · до 10 страниц",
      addToScan: "Добавить в скан",
      pdfFile: "PDF-файл",
      importFromFiles: "Импорт из Files",
      photosFromGallery: "Фото из галереи",
      selectPhotos: (max: number) => `Выберите до ${max} фото`,
      pdfPickerTitle: "Выберите страницы PDF",
      pdfPickerTotal: (total: number) => `${total} стр. всего`,
      pdfPickerAdd: (count: number) => `Добавить ${count} стр. →`,
      pdfRendering: "Открываю PDF…",
      pdfConverting: "Конвертирую…",
      pdfRenderError: "Не удалось загрузить страницы PDF",
      freePdfWarning: (max: number) => `Free поддерживает максимум ${max} страницы за один скан`,
      upgradePdf: "Pro обработает до 10 страниц",
      cameraAccessNeeded: "Нужен доступ к камере",
      cameraAccessBody: "Jasně нужен доступ к камере для сканирования документов. Его можно включить в настройках.",
      openSettings: "Открыть настройки",
      pickGalleryInstead: "Выбрать из галереи",
      preview: "Предпросмотр",
      previewPageOf: (page: number, total: number) => `Стр. ${page} из ${total}`,
    },
    uk: {
      newScan: "Новий скан",
      flash: "Спалах",
      capture: "Сканувати",
      import: "Імпорт",
      done: "Готово",
      cancel: "Скасувати",
      pointCamera: "Наведіть камеру на документ",
      documentFound: "Документ знайдено",
      pageAdded: (count: number) => `Сторінку ${count} додано`,
      freeLimit: (max: number) => `Free · до ${max} сторінок`,
      proLimit: (max: number) => `Pro · до ${max} сторінок`,
      countOfLimit: (count: number, max: number, label: string) => `${count} з ${max} · ${label}`,
      countOfMax: (count: number, max: number) => `${count} з ${max}`,
      limitReachedSuffix: "ліміт досягнуто",
      freeLimitReached: "Ліміт Free досягнуто",
      maximumReached: "Максимум досягнуто · Pro",
      onePageRemaining: "Залишилась 1 сторінка",
      processPages: (count: number) => `Обробити ${count} стор. →`,
      maximumPages: "Максимум 10 сторінок за один скан",
      upgradeToPro: "Перейти на Pro · до 10 сторінок",
      addToScan: "Додати до скану",
      pdfFile: "PDF-файл",
      importFromFiles: "Імпорт із Files",
      photosFromGallery: "Фото з галереї",
      selectPhotos: (max: number) => `Виберіть до ${max} фото`,
      pdfPickerTitle: "Виберіть сторінки PDF",
      pdfPickerTotal: (total: number) => `${total} стор. всього`,
      pdfPickerAdd: (count: number) => `Додати ${count} стор. →`,
      pdfRendering: "Відкриваю PDF…",
      pdfConverting: "Конвертую…",
      pdfRenderError: "Не вдалося завантажити сторінки PDF",
      freePdfWarning: (max: number) => `Free підтримує максимум ${max} сторінки за один скан`,
      upgradePdf: "Pro обробить до 10 сторінок",
      cameraAccessNeeded: "Потрібен доступ до камери",
      cameraAccessBody: "Jasně потрібен доступ до камери для сканування документів. Його можна ввімкнути в налаштуваннях.",
      openSettings: "Відкрити налаштування",
      pickGalleryInstead: "Вибрати з галереї",
      preview: "Перегляд",
      previewPageOf: (page: number, total: number) => `Стор. ${page} з ${total}`,
    },
    en: {
      newScan: "New scan",
      flash: "Flash",
      capture: "Scan",
      import: "Import",
      done: "Done",
      cancel: "Cancel",
      pointCamera: "Point camera at document",
      documentFound: "Document found",
      pageAdded: (count: number) => `Page ${count} added`,
      freeLimit: (max: number) => `Free · up to ${max} pages`,
      proLimit: (max: number) => `Pro · up to ${max} pages`,
      countOfLimit: (count: number, max: number, label: string) => `${count} of ${max} · ${label}`,
      countOfMax: (count: number, max: number) => `${count} of ${max}`,
      limitReachedSuffix: "limit reached",
      freeLimitReached: "Free limit reached",
      maximumReached: "Maximum reached · Pro",
      onePageRemaining: "1 page remaining",
      processPages: (count: number) => `Process ${count} ${count === 1 ? "page" : "pages"} →`,
      maximumPages: "Maximum 10 pages per scan",
      upgradeToPro: "Upgrade to Pro · up to 10 pages",
      addToScan: "Add to scan",
      pdfFile: "PDF file",
      importFromFiles: "Import from Files app",
      photosFromGallery: "Photos from gallery",
      selectPhotos: (max: number) => `Select up to ${max} photos`,
      pdfPickerTitle: "Select PDF pages",
      pdfPickerTotal: (total: number) => `${total} pages total`,
      pdfPickerAdd: (count: number) => `Add ${count} ${count === 1 ? "page" : "pages"} →`,
      pdfRendering: "Opening PDF…",
      pdfConverting: "Converting…",
      pdfRenderError: "Could not load PDF pages",
      freePdfWarning: (max: number) => `Free plan supports max ${max} pages per scan`,
      upgradePdf: "Pro processes up to 10 pages",
      cameraAccessNeeded: "Camera access needed",
      cameraAccessBody: "Jasně needs camera access to scan documents. You can enable it in Settings.",
      openSettings: "Open Settings",
      pickGalleryInstead: "Pick from gallery instead",
      preview: "Preview",
      previewPageOf: (page: number, total: number) => `Page ${page} of ${total}`,
    },
  };

  return copies[language];
}

const createScannerStyles = (scanner: ScannerPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: scanner.bg },
  appBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: scanner.bg },
  appBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    flexShrink: 0,
  },
  appBarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: scanner.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  appBarButtonActive: { backgroundColor: scanner.amberSoft },
  appBarTitleBlock: { alignItems: "center", justifyContent: "center" },
  appBarTitle: { color: scanner.ink, fontFamily: fonts.bodyMedium, ...typeStyles.callout, fontWeight: "500" },
  subtitleRow: { marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  appBarSubtitle: { color: scanner.ink3, fontFamily: fonts.body, ...typeStyles.caption1 },
  redText: { color: scanner.red },
  amberText: { color: scanner.amber },
  camera: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#000",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // Corner markers sit on the always-black camera viewport — always light.
  corner: { position: "absolute", width: 14, height: 14, opacity: 0.55, borderColor: scanner.stageInk },
  cornerTL: { top: 24, left: 24, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 4 },
  cornerTR: { top: 24, right: 24, borderTopWidth: 1.5, borderRightWidth: 1.5, borderTopRightRadius: 4 },
  cornerBL: { bottom: 24, left: 24, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 24, right: 24, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 4 },
  focusMarker: {
    position: "absolute",
    width: 68,
    height: 68,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: scanner.amber,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(224,180,90,0.08)",
  },
  focusMarkerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: scanner.amber,
  },
  zoomControls: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.48)",
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.12)",
    gap: 2,
  },
  zoomControlsRaised: {
    bottom: 100,
  },
  zoomButton: {
    minWidth: 42,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  zoomButtonActive: {
    backgroundColor: scanner.stageInk,
  },
  zoomButtonText: {
    color: scanner.stageInk2,
    fontFamily: fonts.bodySemiBold,
    ...typeStyles.caption1,
  },
  zoomButtonTextActive: {
    color: "#0A0907",
  },
  shutterBlackout: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  emptyState: { alignItems: "center", gap: 14 },
  // Sits over the always-black camera viewport, so colour stays light in both themes.
  emptyHint: { color: scanner.stageInk3, fontFamily: fonts.body, ...typeStyles.rowMeta, textAlign: "center" },
  previewTile: {
    width: 60,
    height: 80,
    borderRadius: 8,
    backgroundColor: scanner.surface3,
    borderWidth: 1,
    borderColor: scanner.blueLine,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  previewTileLabel: { color: scanner.ink2, fontFamily: fonts.bodyBold, ...typeStyles.caption2, fontWeight: "700" },
  statusPill: {
    position: "absolute",
    bottom: 116,
    alignSelf: "center",
    minHeight: 28,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusPillGreen: { backgroundColor: scanner.surface2 },
  statusPillBlue: { backgroundColor: scanner.surface2 },
  statusPillText: { fontFamily: fonts.bodySemiBold, ...typeStyles.rowMeta, fontWeight: "600" },
  statusPillTextGreen: { color: scanner.green },
  statusPillTextBlue: { color: scanner.blue },
  thumbs: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 10,
    flexGrow: 0,
  },
  thumbsContent: { paddingHorizontal: 16, gap: 10 },
  thumb: {
    width: 60,
    height: 80,
    borderRadius: 8,
    backgroundColor: scanner.surface3,
    borderWidth: 1,
    borderColor: scanner.blueLine,
    overflow: "hidden",
    position: "relative",
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbPdf: { flex: 1, alignItems: "center", justifyContent: "center" },
  thumbIndexBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Index number sits on a dark rgba badge — always light text.
  thumbIndexText: { color: scanner.stageInk, fontFamily: fonts.bodyBold, ...typeStyles.caption2, fontWeight: "700" },
  thumbRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  inlineError: { backgroundColor: scanner.redSoft, borderTopWidth: 1, borderTopColor: scanner.redLine, paddingHorizontal: 16, paddingVertical: 9 },
  inlineErrorText: { color: scanner.red, fontFamily: fonts.body, ...typeStyles.caption1, textAlign: "center" },
  bottomBar: {
    flexShrink: 0,
    backgroundColor: scanner.bg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingHorizontal: 24,
    position: "relative",
    minHeight: 84,
  },
  sideAction: {
    alignItems: "center",
    gap: 6,
    minWidth: 64,
    minHeight: 56,
    paddingVertical: 4,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  sideActionText: { color: scanner.ink2, fontFamily: fonts.bodyMedium, ...typeStyles.caption2, fontWeight: "500" },
  shutterSlot: { width: 60 },
  doneAction: {
    minWidth: 64,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  doneText: { color: scanner.blue, fontFamily: fonts.bodyMedium, ...typeStyles.rowSecondary, fontWeight: "500" },
  doneTextDisabled: { color: scanner.ink5 },
  shutterWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 8,
    alignItems: "center",
    gap: 6,
    pointerEvents: "box-none",
  },
  shutter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: scanner.ink,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  shutterInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: scanner.ink,
  },
  shutterPressed: { opacity: 0.7 },
  nearLimitLabel: { color: scanner.ink3, fontFamily: fonts.body, ...typeStyles.caption2 },
  processBar: { flexShrink: 0, backgroundColor: scanner.bg, paddingTop: 14, paddingHorizontal: 16, gap: 10 },
  processButton: { height: 54, borderRadius: 12, backgroundColor: scanner.blueDeep, alignItems: "center", justifyContent: "center" },
  // Text on the always-blue button stays light in both themes.
  processButtonText: { color: scanner.stageInk, fontFamily: fonts.bodyMedium, ...typeStyles.rowSecondary, fontWeight: "500" },
  processCaption: { color: scanner.ink4, fontFamily: fonts.body, ...typeStyles.caption2, textAlign: "center" },
  upgradeRibbon: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  upgradeText: { color: scanner.purple, fontFamily: fonts.body, ...typeStyles.caption2 },
});

const createSheetStyles = (scanner: ScannerPalette) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10,9,7,0.50)" },
  sheet: { backgroundColor: scanner.surface2, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 },
  handle: { width: 36, height: 4, borderRadius: 999, backgroundColor: scanner.ink3, alignSelf: "center", marginTop: 10 },
  sectionLabel: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8, color: scanner.ink4, fontFamily: fonts.bodyExtraBold, ...typeStyles.sectionHeader, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  rows: { paddingHorizontal: 16 },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 6 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: scanner.surface3, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: scanner.ink, fontFamily: fonts.bodyMedium, ...typeStyles.rowMeta, fontWeight: "500" },
  rowDetail: { color: scanner.ink3, fontFamily: fonts.body, ...typeStyles.caption2, marginTop: 1 },
  divider: { height: 1, backgroundColor: scanner.hairline, opacity: 0.6 },
  cancelButton: { height: 48, alignItems: "center", justifyContent: "center", marginHorizontal: 22, marginTop: 8, borderRadius: 12 },
  cancelText: { color: scanner.ink2, fontFamily: fonts.body, ...typeStyles.rowSecondary, fontWeight: "400" },
});

const createPickerStyles = (scanner: ScannerPalette) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10,9,7,0.60)" },
  sheet: {
    backgroundColor: scanner.surface2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: "85%",
  },
  handle: { width: 36, height: 4, borderRadius: 999, backgroundColor: scanner.ink3, alignSelf: "center", marginTop: 10 },
  titleRow: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, flexDirection: "row", alignItems: "baseline", gap: 8 },
  title: { color: scanner.ink, fontFamily: fonts.bodySemiBold, ...typeStyles.callout, fontWeight: "600" },
  titleHint: { color: scanner.blue, fontFamily: fonts.body, ...typeStyles.caption1 },
  warning: {
    marginHorizontal: 20,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: scanner.amberSoft,
    borderWidth: 1,
    borderColor: scanner.amberLine,
  },
  warningText: { color: scanner.amber, fontFamily: fonts.body, ...typeStyles.caption1 },
  grid: { flexGrow: 0, marginTop: 12 },
  gridContent: { paddingHorizontal: 16, paddingBottom: 8 },
  gridRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pageCard: {
    width: "47%",
    aspectRatio: 0.72,
    borderRadius: 10,
    position: "relative",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: scanner.hairline,
    backgroundColor: scanner.surface3,
  },
  pageCardSelected: {
    borderColor: scanner.blue,
  },
  pageCardDim: { opacity: 0.4 },
  pageCardImage: { width: "100%", height: "100%" },
  pageCardPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  pageNumberBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageNumberBadgeText: { color: scanner.stageInk, fontFamily: fonts.bodyBold, ...typeStyles.caption1, fontWeight: "700" },
  checkOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: scanner.blueDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  addButton: { height: 52, borderRadius: 12, backgroundColor: scanner.blueDeep, alignItems: "center", justifyContent: "center" },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: { color: scanner.stageInk, fontFamily: fonts.bodyMedium, ...typeStyles.rowSecondary, fontWeight: "500" },
  upgradeButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: scanner.purpleLine,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  upgradeButtonText: { color: scanner.purple, fontFamily: fonts.bodyMedium, ...typeStyles.rowMeta, fontWeight: "500" },
  cancelButton: { height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  cancelText: { color: scanner.ink2, fontFamily: fonts.body, ...typeStyles.rowSecondary, fontWeight: "400" },
});

const createPreviewStyles = (scanner: ScannerPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: scanner.bgDeep },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: scanner.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  counter: { color: scanner.ink2, fontFamily: fonts.bodySemiBold, ...typeStyles.rowMeta, fontWeight: "600", flex: 1 },
  pager: { flex: 1 },
  page: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  pageImage: { width: "100%", height: "100%", borderRadius: 10 },
  pagePdf: {
    width: "100%",
    aspectRatio: 0.72,
    borderRadius: 12,
    backgroundColor: scanner.surface2,
    borderWidth: 1,
    borderColor: scanner.blueLine,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 14,
  },
  pagePdfName: { color: scanner.ink, fontFamily: fonts.bodyMedium, ...typeStyles.rowSecondary, fontWeight: "500", textAlign: "center" },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 14,
    gap: 7,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: scanner.ink5 },
  dotActive: { width: 18, backgroundColor: scanner.blue },
});

const createPermissionStyles = (scanner: ScannerPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: scanner.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  closeButton: { position: "absolute", right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: scanner.surface2, alignItems: "center", justifyContent: "center" },
  title: { color: scanner.ink, fontFamily: fonts.bodySemiBold, ...typeStyles.rowTitle, fontWeight: "600", textAlign: "center" },
  body: { color: scanner.ink3, fontFamily: fonts.body, ...typeStyles.rowMeta, textAlign: "center", marginTop: 10, marginBottom: 22 },
  error: { color: scanner.red, fontFamily: fonts.body, ...typeStyles.caption1, textAlign: "center", marginBottom: 18 },
  actions: { width: "100%", gap: 10 },
  primaryButton: { height: 52, borderRadius: 12, backgroundColor: scanner.blueDeep, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: scanner.stageInk, fontFamily: fonts.bodyMedium, ...typeStyles.rowSecondary, fontWeight: "500" },
  secondaryButton: { height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: scanner.ink2, fontFamily: fonts.bodyMedium, ...typeStyles.rowMeta, fontWeight: "500" },
});
