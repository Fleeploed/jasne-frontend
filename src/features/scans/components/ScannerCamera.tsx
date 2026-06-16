import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, Ref, RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Reanimated, { runOnJS, useAnimatedProps, useSharedValue } from "react-native-reanimated";
import { Camera, type CameraDevice, type CameraProps } from "react-native-vision-camera";
import { Icon } from "@/components/Icon";
import type { PickedUpload } from "@/features/scans/scansApi";
import { triggerSelectionHaptic } from "@/lib/haptics";
import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import {
  CAMERA_ZOOM_HIDE_DELAY_MS,
  CAMERA_ZOOM_SWIPE_ACTIVATE_DX,
  CAMERA_ZOOM_SWIPE_DISTANCE,
  cameraDefaultZoom,
  cameraDisplayZoomForNative,
  cameraZoomBounds,
  clampCameraZoom,
  formatCameraZoomLabel,
  nearestCameraZoomLevel,
} from "@/features/scans/components/newScanData";
import type { CameraFocusPoint, CameraTapPoint, CameraZoomLevel, ScannerCopy } from "@/features/scans/components/newScanData";

Reanimated.addWhitelistedNativeProps({ zoom: true });
const ReanimatedCamera = Reanimated.createAnimatedComponent(Camera);

export function ScannerCamera({
  copy,
  files,
  cameraRef,
  cameraDevice,
  cameraReady,
  zoom,
  zoomLevels,
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
  cameraRef: RefObject<Camera | null>;
  cameraDevice?: CameraDevice;
  cameraReady: boolean;
  zoom: number;
  zoomLevels: CameraZoomLevel[];
  focusPoint: CameraFocusPoint | null;
  shutterBlackout: boolean;
  torchOn: boolean;
  flashPill?: { label: string; visible: boolean };
  pdfRendering?: boolean;
  onCameraTap: (point: CameraTapPoint) => void;
  onZoomChange: (zoom: number) => void;
  children?: ReactNode;
}) {
  const { scanner, scannerStyles } = useScannerTheme();
  const zoomHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zoomGestureActive, setZoomGestureActive] = useState(false);
  const [gestureZoomDisplay, setGestureZoomDisplay] = useState(() => cameraDisplayZoomForNative(zoom, cameraDevice));
  const zoomBounds = useMemo(
    () => cameraZoomBounds(cameraDevice),
    [cameraDevice],
  );
  const zoomValue = useSharedValue(zoom);
  const zoomStartValue = useSharedValue(zoom);
  const zoomMinValue = useSharedValue(zoomBounds.minZoom);
  const zoomMaxValue = useSharedValue(zoomBounds.maxZoom);
  const zoomNeutralValue = useSharedValue(cameraDefaultZoom(cameraDevice));
  const zoomReadoutValue = useSharedValue(cameraDisplayZoomForNative(zoom, cameraDevice));

  useEffect(() => {
    const clamped = clampCameraZoom(zoom, cameraDevice);
    const displayZoom = cameraDisplayZoomForNative(clamped, cameraDevice);
    zoomValue.value = clamped;
    zoomNeutralValue.value = cameraDefaultZoom(cameraDevice);
    zoomReadoutValue.value = displayZoom;
    setGestureZoomDisplay(displayZoom);
  }, [cameraDevice, zoom, zoomNeutralValue, zoomReadoutValue, zoomValue]);

  useEffect(() => {
    zoomMinValue.value = zoomBounds.minZoom;
    zoomMaxValue.value = zoomBounds.maxZoom;
    const clamped = Math.max(zoomBounds.minZoom, Math.min(zoomBounds.maxZoom, zoomValue.value));
    const displayZoom = cameraDisplayZoomForNative(clamped, cameraDevice);
    zoomValue.value = clamped;
    zoomNeutralValue.value = cameraDefaultZoom(cameraDevice);
    zoomReadoutValue.value = displayZoom;
    setGestureZoomDisplay(displayZoom);
  }, [cameraDevice, zoomBounds.maxZoom, zoomBounds.minZoom, zoomMaxValue, zoomMinValue, zoomNeutralValue, zoomReadoutValue, zoomValue]);

  useEffect(() => () => {
    if (zoomHideTimerRef.current) clearTimeout(zoomHideTimerRef.current);
  }, []);

  const animatedCameraProps = useAnimatedProps<CameraProps>(() => ({
    zoom: zoomValue.value,
  }));

  const showZoomReadout = useCallback(() => {
    if (zoomHideTimerRef.current) {
      clearTimeout(zoomHideTimerRef.current);
      zoomHideTimerRef.current = null;
    }
    setZoomGestureActive(true);
  }, []);

  const hideZoomReadoutSoon = useCallback(() => {
    if (zoomHideTimerRef.current) clearTimeout(zoomHideTimerRef.current);
    zoomHideTimerRef.current = setTimeout(() => {
      setZoomGestureActive(false);
      zoomHideTimerRef.current = null;
    }, CAMERA_ZOOM_HIDE_DELAY_MS);
  }, []);

  const updateGestureZoomReadout = useCallback((nextZoom: number) => {
    setGestureZoomDisplay(nextZoom);
  }, []);

  const settleGestureZoom = useCallback((nextZoom: number) => {
    const clamped = clampCameraZoom(nextZoom, cameraDevice);
    const nearest = nearestCameraZoomLevel(clamped, zoomLevels);
    const settled = Math.abs(nearest.value - clamped) < 0.08 ? nearest.value : clamped;
    const displayZoom = cameraDisplayZoomForNative(settled, cameraDevice);
    zoomValue.value = settled;
    zoomNeutralValue.value = cameraDefaultZoom(cameraDevice);
    zoomReadoutValue.value = displayZoom;
    setGestureZoomDisplay(displayZoom);
    if (Math.abs(settled - zoom) >= 0.006) {
      onZoomChange(settled);
    }
    hideZoomReadoutSoon();
  }, [cameraDevice, hideZoomReadoutSoon, onZoomChange, zoom, zoomLevels, zoomNeutralValue, zoomReadoutValue, zoomValue]);

  const createHorizontalZoomGesture = useCallback(() =>
    Gesture.Pan()
      .activeOffsetX([-CAMERA_ZOOM_SWIPE_ACTIVATE_DX, CAMERA_ZOOM_SWIPE_ACTIVATE_DX])
      .failOffsetY([-28, 28])
      .onBegin(() => {
        zoomStartValue.value = zoomValue.value;
      })
      .onStart(() => {
        runOnJS(showZoomReadout)();
      })
      .onUpdate((event) => {
        const range = zoomMaxValue.value - zoomMinValue.value;
        const nextZoom = Math.max(
          zoomMinValue.value,
          Math.min(zoomMaxValue.value, zoomStartValue.value + (event.translationX / CAMERA_ZOOM_SWIPE_DISTANCE) * range),
        );
        const displayZoom = nextZoom / Math.max(zoomNeutralValue.value, 0.1);
        const readoutZoom = Math.round(displayZoom * 10) / 10;
        zoomValue.value = nextZoom;
        if (Math.abs(readoutZoom - zoomReadoutValue.value) >= 0.05) {
          zoomReadoutValue.value = readoutZoom;
          runOnJS(updateGestureZoomReadout)(readoutZoom);
        }
      })
      .onFinalize(() => {
        runOnJS(settleGestureZoom)(zoomValue.value);
      }),
    [settleGestureZoom, showZoomReadout, updateGestureZoomReadout, zoomMaxValue, zoomMinValue, zoomNeutralValue, zoomReadoutValue, zoomStartValue, zoomValue],
  );

  const cameraTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(CAMERA_ZOOM_SWIPE_ACTIVATE_DX)
        .onEnd((event, success) => {
          if (!success) return;
          runOnJS(onCameraTap)({ x: event.x, y: event.y });
        }),
    [onCameraTap],
  );

  const cameraGesture = useMemo(
    () => Gesture.Exclusive(createHorizontalZoomGesture(), cameraTapGesture),
    [cameraTapGesture, createHorizontalZoomGesture],
  );

  const zoomControlGesture = useMemo(
    () => createHorizontalZoomGesture(),
    [createHorizontalZoomGesture],
  );

  return (
    <View style={scannerStyles.camera}>
      {cameraReady && cameraDevice ? (
        <ReanimatedCamera
          ref={cameraRef as Ref<Camera>}
          style={StyleSheet.absoluteFill}
          device={cameraDevice}
          isActive={cameraReady}
          photo
          photoQualityBalance="balanced"
          animatedProps={animatedCameraProps}
          torch={torchOn ? "on" : "off"}
          lowLightBoost={cameraDevice.supportsLowLightBoost}
        />
      ) : (
        <View style={scannerStyles.emptyState}>
          <Icon name="doc-text" size={48} color={scanner.stageInk3} />
          <Text style={scannerStyles.emptyHint}>{copy.pointCamera}</Text>
        </View>
      )}

      {cameraReady ? (
        <>
          <GestureDetector gesture={cameraGesture}>
            <View
              collapsable={false}
              accessibilityRole="button"
              accessibilityLabel={copy.pointCamera}
              style={StyleSheet.absoluteFill}
            />
          </GestureDetector>
          {focusPoint ? <FocusMarker point={focusPoint} /> : null}
          <ZoomControls
            levels={zoomLevels}
            value={zoom}
            hasFiles={files.length > 0}
            gesture={zoomControlGesture}
            onChange={onZoomChange}
          />
          {zoomGestureActive ? (
            <View pointerEvents="none" style={[scannerStyles.zoomReadout, files.length > 0 && scannerStyles.zoomReadoutRaised]}>
              <Text style={scannerStyles.zoomReadoutText}>{formatCameraZoomLabel(gestureZoomDisplay)}</Text>
            </View>
          ) : null}
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

export function FocusMarker({ point }: { point: CameraFocusPoint }) {
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

export function ZoomControls({
  levels,
  value,
  hasFiles,
  gesture,
  onChange,
}: {
  levels: CameraZoomLevel[];
  value: number;
  hasFiles: boolean;
  gesture?: GestureType;
  onChange: (zoom: number) => void;
}) {
  const { scannerStyles } = useScannerTheme();
  const controls = (
    <View collapsable={false} style={[scannerStyles.zoomControls, hasFiles && scannerStyles.zoomControlsRaised]}>
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
  return gesture ? <GestureDetector gesture={gesture}>{controls}</GestureDetector> : controls;
}
