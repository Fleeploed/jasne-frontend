import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";

import { PaywallSheet } from "@/components/PaywallSheet";
import { ChatThreadScreen } from "@/features/chat/ChatThreadScreen";
import { getLocale, t } from "@/lib/i18n";
import { triggerSelectionHaptic } from "@/lib/haptics";

import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import {
  SHUTTER_BLACKOUT_MS,
  cameraDefaultZoom,
  cameraZoomLevelsForDevice,
  clampCameraZoom,
  getScannerCopy,
} from "@/features/scans/components/newScanData";
import type { CameraFocusPoint, CameraTapPoint } from "@/features/scans/components/newScanData";
import { useScanUpload } from "@/features/scans/components/useScanUpload";
import { ScannerAppBar } from "@/features/scans/components/ScannerAppBar";
import { ScannerCamera } from "@/features/scans/components/ScannerCamera";
import { ThumbnailStrip } from "@/features/scans/components/ThumbnailStrip";
import { BottomBar, ProcessBar } from "@/features/scans/components/ScannerBars";
import { ImportSheet } from "@/features/scans/components/ImportSheet";
import { PdfPagePicker } from "@/features/scans/components/PdfPagePicker";
import { PreviewModal } from "@/features/scans/components/PreviewModal";
import { PermissionDeniedScreen } from "@/features/scans/components/PermissionDeniedScreen";

export function NewScanScreen() {
  const params = useLocalSearchParams<{ fresh?: string; pending?: string }>();
  const insets = useSafeAreaInsets();
  const copy = useMemo(() => getScannerCopy(getLocale()), []);
  const { scannerStyles } = useScannerTheme();

  // Document side (files, limits, PDF import, upload → SSE pipeline).
  const upload = useScanUpload({ fresh: params.fresh, pending: params.pending, copy });

  // Live-camera UI state. Stays in the screen because it drives the camera
  // preview, torch, and shutter directly; captures flow into `upload`.
  const cameraRef = useRef<Camera>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shutterFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraPermission = useCameraPermission();
  const cameraDevice = useCameraDevice("back", {
    physicalDevices: ["ultra-wide-angle-camera", "wide-angle-camera", "telephoto-camera"],
  });
  const { hasPermission, requestPermission } = cameraPermission;
  const defaultCameraZoom = useMemo(
    () => clampCameraZoom(cameraDefaultZoom(cameraDevice), cameraDevice),
    [cameraDevice],
  );
  const cameraZoomLevels = useMemo(
    () => cameraZoomLevelsForDevice(cameraDevice),
    [cameraDevice],
  );
  const defaultCameraZoomRef = useRef(defaultCameraZoom);
  const [torchOn, setTorchOn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [focusPoint, setFocusPoint] = useState<CameraFocusPoint | null>(null);
  const [shutterBlackout, setShutterBlackout] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    defaultCameraZoomRef.current = defaultCameraZoom;
  }, [defaultCameraZoom]);

  // Reset the camera UI on `fresh` entry (document state resets inside the hook).
  useEffect(() => {
    setCameraZoom(defaultCameraZoomRef.current);
    setFocusPoint(null);
    setShutterBlackout(false);
    setPermissionDenied(false);
  }, [params.fresh, params.pending]);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (shutterFlashTimerRef.current) clearTimeout(shutterFlashTimerRef.current);
    };
  }, []);

  // Ask for camera permission on entry so the live preview can show immediately.
  // If the user previously hard-denied it, the permission screen kicks in below.
  useEffect(() => {
    if (hasPermission) return;
    let alive = true;
    void requestPermission().then((granted) => {
      if (alive && !granted) setPermissionDenied(true);
    });
    return () => {
      alive = false;
    };
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    setCameraZoom((current) => clampCameraZoom(current, cameraDevice));
  }, [cameraDevice]);

  useEffect(() => {
    if (!cameraDevice) return;
    setCameraZoom(defaultCameraZoom);
  }, [cameraDevice, defaultCameraZoom]);

  function handleCameraTap(point: CameraTapPoint) {
    if (!cameraReady) return;
    triggerSelectionHaptic();
    setFocusPoint({ x: point.x, y: point.y, key: Date.now() });
    if (cameraDevice?.supportsFocus) {
      void cameraRef.current?.focus(point).catch(() => {});
    }
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
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
      upload.setError(null);

      // Ensure camera permission right before capturing.
      let granted = hasPermission;
      if (!granted) {
        granted = await requestPermission();
      }
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
      if (!cameraDevice) {
        upload.setError(t("scan.scannerUnavailable"));
        return;
      }

      const availableSlots = await upload.getAvailableSlots();
      if (availableSlots <= 0) return;

      setCapturing(true);
      const photo = await cameraRef.current?.takePhoto({ flash: "off", enableShutterSound: false });
      if (photo?.path) {
        const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
        upload.appendFiles(
          [{ uri, name: `scan-${Date.now()}.jpg`, mimeType: "image/jpeg" }],
          availableSlots,
        );
      }
    } catch (captureError) {
      upload.setError(captureError instanceof Error ? captureError.message : t("scan.scannerUnavailable"));
    } finally {
      setCapturing(false);
    }
  }

  const { files, maxPages, isPro, limitReached, nearLimit } = upload;
  const cameraReady = hasPermission && Boolean(cameraDevice);
  // VisionCamera v4 reports granted/not granted, so show the dedicated
  // permission screen after a concrete denied request.
  const showPermissionScreen = permissionDenied;
  const showPendingChat = upload.activePendingId !== null;

  if (showPermissionScreen) {
    return (
      <PermissionDeniedScreen
        copy={copy}
        error={upload.error}
        onClose={() => router.back()}
        onOpenSettings={() => void Linking.openSettings()}
        onPickGallery={() => {
          setPermissionDenied(false);
          void upload.addImage();
        }}
        topInset={insets.top}
      />
    );
  }

  if (showPendingChat && upload.activePendingId) return <ChatThreadScreen pendingLocalId={upload.activePendingId} />;

  return (
    <View style={scannerStyles.root}>
      <View style={scannerStyles.appBackground} />
      <ScannerAppBar
        copy={copy}
        count={files.length}
        maxPages={maxPages}
        isPro={isPro}
        limitReached={limitReached}
        torchOn={torchOn && Boolean(cameraDevice?.hasTorch)}
        onToggleTorch={() => {
          if (!cameraDevice?.hasTorch) return;
          setTorchOn((on) => !on);
        }}
        onClose={() => router.back()}
        topInset={insets.top}
      />

      <ScannerCamera
        copy={copy}
        isPro={isPro}
        files={files}
        limitReached={limitReached}
        cameraRef={cameraRef}
        cameraDevice={cameraDevice}
        cameraReady={cameraReady}
        zoom={cameraZoom}
        zoomLevels={cameraZoomLevels}
        focusPoint={focusPoint}
        shutterBlackout={shutterBlackout}
        torchOn={torchOn && Boolean(cameraDevice?.hasTorch)}
        flashPill={upload.pillFlash ? { label: upload.pillFlash.label, visible: true } : undefined}
        pdfRendering={upload.pdfRendering}
        onCameraTap={handleCameraTap}
        onZoomChange={(nextZoom) => setCameraZoom(clampCameraZoom(nextZoom, cameraDevice))}
      >
        {files.length > 0 ? (
          <ThumbnailStrip
            files={files}
            onRemove={upload.removeFile}
            onPreview={() => setPreviewOpen(true)}
            previewLabel={copy.preview}
          />
        ) : null}
      </ScannerCamera>

      {upload.error ? (
        <View style={scannerStyles.inlineError}>
          <Text style={scannerStyles.inlineErrorText}>{upload.error}</Text>
        </View>
      ) : null}

      {limitReached ? (
        <ProcessBar
          copy={copy}
          count={files.length}
          isPro={isPro}
          onProcess={upload.startScan}
          onUpgrade={() => setShowPaywall(true)}
          bottomInset={insets.bottom}
        />
      ) : (
        <BottomBar
          copy={copy}
          doneActive={files.length > 0}
          nearLimitLabel={nearLimit ? copy.onePageRemaining : undefined}
          onImport={() => upload.setImportSheetOpen(true)}
          onShutter={() => {
            triggerSelectionHaptic();
            triggerShutterBlackout();
            void addCameraScan();
          }}
          onDone={upload.startScan}
          bottomInset={insets.bottom}
        />
      )}

      <ImportSheet
        visible={upload.importSheetOpen}
        copy={copy}
        maxPages={maxPages}
        onClose={() => upload.setImportSheetOpen(false)}
        onPickPdf={() => void upload.addDocument()}
        onPickPhotos={() => void upload.addImage()}
      />
      <PdfPagePicker
        visible={Boolean(upload.pdfPicker)}
        pageCount={upload.pdfPicker?.pageCount ?? 0}
        available={upload.pdfPicker?.available ?? 0}
        thumbnails={upload.pdfPicker?.thumbnails ?? {}}
        converting={upload.pdfConverting}
        copy={copy}
        isPro={isPro}
        maxPages={maxPages}
        onCancel={() => {
          if (upload.pdfConverting) return;
          upload.setPdfPicker(null);
        }}
        onConfirm={(indices) => void upload.confirmPdfSelection(indices)}
        onUpgrade={() => setShowPaywall(true)}
      />
      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchase={() => upload.refreshLimits()}
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
