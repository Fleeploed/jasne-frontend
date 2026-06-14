import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import type { ScannerCopy } from "@/features/scans/components/newScanData";

export function BottomBar({
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

export function ProcessBar({
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
