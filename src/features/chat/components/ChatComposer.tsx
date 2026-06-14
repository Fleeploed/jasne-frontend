import { Pressable, Text, TextInput, View } from "react-native";
import type { ColorPalette } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { t } from "@/lib/i18n";
import type { ChatStyles } from "@/features/chat/components/chatStyles";

export function LockedChatComposer({
  styles,
  colors,
  plan,
  questionsUsed,
  questionsMax,
  onPress
}: {
  styles: ChatStyles;
  colors: ColorPalette;
  plan: string;
  questionsUsed: number;
  questionsMax: number;
  onPress?: () => void;
}) {
  // Free user — never had access → show upgrade CTA
  if (plan !== "pro") {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.lockedInputPill, pressed && { opacity: 0.75 }]}
      >
        <Icon name="lock-small" size={18} color={colors.muted3} />
        <Text style={styles.lockedInputText} numberOfLines={1}>
          {t("chat.proWarning")}
        </Text>
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>Pro</Text>
        </View>
      </Pressable>
    );
  }

  // Pro user exhausted quota → show counter + label
  return (
    <View style={styles.lockedComposer}>
      <Text style={styles.lockedComposerLabel}>{t("chat.questionLimitTitle")}</Text>
      <View style={[styles.lockedInputPill, { opacity: 0.72 }]}>
        <Icon name="lock-small" size={18} color={colors.muted3} />
        <Text style={styles.lockedInputText} numberOfLines={1}>
          {t("chat.questionLimitUsed", { used: questionsUsed, max: questionsMax })}
        </Text>
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>{t("chat.questionLimitBadge")}</Text>
        </View>
      </View>
    </View>
  );
}


export function ChatComposer({
  value,
  onChangeText,
  placeholder,
  editable,
  streaming,
  disabled,
  muted,
  questionsUsed,
  questionsMax,
  onSend,
  colors,
  styles,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  editable: boolean;
  streaming: boolean;
  disabled: boolean;
  muted: boolean;
  questionsUsed: number;
  questionsMax: number;
  onSend: () => void;
  colors: ColorPalette;
  styles: ChatStyles;
}) {
  const showCounter = questionsMax > 0;

  return (
    <View style={styles.composerPill}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted2}
        editable={editable}
        autoCapitalize="sentences"
        returnKeyType="send"
        onSubmitEditing={() => {
          if (!disabled && !streaming) onSend();
        }}
        style={styles.composerInput}
      />
      {showCounter ? (
        <Text style={styles.composerCounter}>{questionsUsed}/{questionsMax}</Text>
      ) : null}
      <SendButton
        streaming={streaming}
        disabled={disabled}
        muted={muted}
        onPress={onSend}
        colors={colors}
      />
    </View>
  );
}

export function SendButton({ streaming, disabled, muted = false, onPress, colors }: {
  streaming: boolean;
  disabled: boolean;
  muted?: boolean;
  onPress: () => void;
  colors: ColorPalette;
}) {
  const backgroundColor = streaming && muted ? colors.surface2 : disabled ? colors.surface2 : colors.primary;
  const iconColor = streaming && muted ? colors.muted3 : disabled ? colors.muted3 : colors.textOnAccent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || streaming}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        opacity: pressed ? 0.86 : 1,
      })}
    >
      {streaming ? (
        // Square = stop / loading indicator
        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: iconColor }} />
      ) : (
        <Text style={{ color: iconColor, fontSize: 18, lineHeight: 20, transform: [{ rotate: "-22deg" }] }}>➤</Text>
      )}
    </Pressable>
  );
}

