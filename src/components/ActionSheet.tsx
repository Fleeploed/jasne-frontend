import { useEffect, useMemo, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/components/Icon";
import { fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
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
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      damping: 22,
      stiffness: 260,
      mass: 0.8,
    }).start();
  }, [progress, visible]);

  const sheetTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const sheetOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — tap outside to dismiss */}
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 12) + 8 },
          { opacity: sheetOpacity, transform: [{ translateY: sheetTranslateY }] },
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
                accessibilityRole="button"
                accessibilityLabel={action.label}
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
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          onPress={onClose}
        >
          <Text style={styles.cancelText}>{t("common.cancel")}</Text>
        </Pressable>
      </Animated.View>
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
      ...typeStyles.rowSecondary,
      textAlign: "center",
    },
    subtitle: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
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
      ...typeStyles.callout,
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
      ...typeStyles.button,
    },
    pressed: { opacity: 0.65 },
  });
}
