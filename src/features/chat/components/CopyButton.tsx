import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text } from "react-native";
import type { ColorPalette } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { triggerSelectionHaptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { ChatStyles } from "@/features/chat/components/chatStyles";

export function CopyButton({ text, colors, styles, compact = false }: {
  text: string;
  colors: ColorPalette;
  styles: ChatStyles;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    const value = text.trim();
    if (!value) return;
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      return;
    }
    triggerSelectionHaptic();
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [text]);

  const tint = copied ? colors.green : colors.muted2;

  return (
    <Pressable
      onPress={handleCopy}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t(copied ? "chat.copied" : "chat.copy")}
      style={({ pressed }) => [compact ? styles.copyIconBtn : styles.copyChip, pressed && styles.copyPressed]}
    >
      <Icon name={copied ? "check" : "copy"} size={14} color={tint} />
      {compact ? null : (
        <Text style={[styles.copyChipText, { color: tint }]}>{t(copied ? "chat.copied" : "chat.copy")}</Text>
      )}
    </Pressable>
  );
}

