import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/components/Icon";
import { fonts, useColors, type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";

export type ActionSheetAction = {
  key: string;
  label: string;
  icon?: IconName;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — tap outside to dismiss */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View
        style={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 12) + 8 },
        ]}
        // Stop tap propagation so backdrop doesn't fire when tapping sheet
        onStartShouldSetResponder={() => true}
      >
        {/* Sheet card with actions */}
        <View style={styles.sheet}>
          {(title || subtitle) && (
            <View style={styles.headerBlock}>
              {title ? (
                <Text style={styles.title} numberOfLines={2}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          )}

          {actions.map((action, index) => {
            const isLast = index === actions.length - 1;
            const labelColor = action.disabled
              ? colors.muted3
              : action.destructive
                ? colors.danger
                : colors.text;
            const iconColor = action.disabled
              ? colors.muted3
              : action.destructive
                ? colors.danger
                : colors.primary;

            return (
              <Pressable
                key={action.key}
                disabled={action.disabled}
                onPress={() => {
                  onClose();
                  // Defer the action to after the modal close animation
                  // so the next screen (e.g. edit modal) doesn't fight the slide-out.
                  requestAnimationFrame(action.onPress);
                }}
                style={({ pressed }) => [
                  styles.actionRow,
                  !isLast && styles.actionRowDivider,
                  pressed && !action.disabled && styles.pressed,
                ]}
              >
                {action.icon ? (
                  <View style={styles.actionIcon}>
                    <Icon name={action.icon} size={20} color={iconColor} />
                  </View>
                ) : (
                  <View style={styles.actionIcon} />
                )}
                <Text style={[styles.actionLabel, { color: labelColor }]}>
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Separate Cancel card (iOS-style) */}
        <Pressable
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          onPress={onClose}
        >
          <Text style={styles.cancelText}>{t("common.cancel")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    container: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 10,
      gap: 8,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    headerBlock: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      alignItems: "center",
      gap: 4,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      fontSize: 15,
      lineHeight: 20,
      textAlign: "center",
    },
    subtitle: {
      color: colors.muted2,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 17,
      textAlign: "center",
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 16,
      minHeight: 56,
      gap: 14,
    },
    actionRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    actionIcon: {
      width: 22,
      textAlign: "center",
    },
    actionLabel: {
      flex: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: 16,
      lineHeight: 20,
    },
    cancel: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      minHeight: 56,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    cancelText: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      fontSize: 17,
      lineHeight: 22,
    },
    pressed: { opacity: 0.65 },
  });
}
