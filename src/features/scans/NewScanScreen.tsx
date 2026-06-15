import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Text, View } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PaywallSheet } from "@/components/PaywallSheet";
import { ChatThreadScreen } from "@/features/chat/ChatThreadScreen";
import { getLocale, t } from "@/lib/i18n";
import { triggerSelectionHaptic } from "@/lib/haptics";

import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import { SHUTTER_BLACKOUT_MS, getScannerCopy } from "@/features/scans/components/newScanData";
import type { CameraFocusPoint } from "@/features/scans/components/newScanData";
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
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Reset the camera UI on `fresh` entry (document state resets inside the hook).
  useEffect(() => {
    setCameraZoom(0);
    setFocusPoint(null);
    setFocusPulse(false);
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
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      void requestCameraPermission();
    }
    // Intentionally keyed only on the permission fields, not the whole object or
    // the stable requestCameraPermission, so this fires once per actual status
    // change and never re-prompts in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraPermission?.granted, cameraPermission?.canAskAgain]);

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
      upload.setError(null);

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

      const availableSlots = await upload.getAvailableSlots();
      if (availableSlots <= 0) return;

      setCapturing(true);
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        upload.appendFiles(
          [{ uri: photo.uri, name: `scan-${Date.now()}.jpg`, mimeType: "image/jpeg" }],
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
  const cameraReady = cameraPermission?.granted ?? false;
  // Show the dedicated permission screen when access was hard-denied (can't ask again)
  // or the user explicitly hit a denial while capturing.
  const showPermissionScreen =
    permissionDenied || (!!cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain);
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
        flashPill={upload.pillFlash ? { label: upload.pillFlash.label, visible: true } : undefined}
        pdfRendering={upload.pdfRendering}
        onCameraTap={handleCameraTap}
        onZoomChange={setCameraZoom}
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
