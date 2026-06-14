import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { t } from "@/lib/i18n";
import { useScannerTheme } from "@/features/scans/components/scannerStyles";
import type { ScannerCopy } from "@/features/scans/components/newScanData";

export function PermissionDeniedScreen({
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
