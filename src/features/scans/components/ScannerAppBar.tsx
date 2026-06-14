import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { t } from "@/lib/i18n";
import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import { subtitleForState } from "@/features/scans/components/newScanData";
import type { ScannerCopy } from "@/features/scans/components/newScanData";

export function ScannerAppBar({
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
