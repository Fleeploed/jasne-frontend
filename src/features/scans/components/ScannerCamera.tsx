import { useCallback, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { CameraView } from "expo-camera";
import { Icon } from "@/components/Icon";
import type { PickedUpload } from "@/features/scans/scansApi";
import { triggerSelectionHaptic } from "@/lib/haptics";
import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import { CAMERA_ZOOM_LEVELS, clampCameraZoom } from "@/features/scans/components/newScanData";
import type { CameraFocusPoint, CameraZoomLevel, ScannerCopy } from "@/features/scans/components/newScanData";

export function ScannerCamera({
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
