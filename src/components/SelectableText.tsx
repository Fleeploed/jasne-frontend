import type { ReactNode } from "react";
import { Platform, StyleSheet, Text, TextInput, type StyleProp, type TextInputProps, type TextStyle } from "react-native";

type SelectableTextProps = Omit<TextInputProps, "children" | "editable" | "multiline" | "onChangeText" | "value"> & {
  children?: ReactNode;
  value?: string | null;
  style?: StyleProp<TextStyle>;
};

const DEFAULT_SELECTION_COLOR = "#6FA0E6";

// Telegram-style selection, split by platform because no single primitive is
// reliable on both:
// - Android: a plain <Text selectable> gives native long-press word selection
//   + the floating Copy toolbar, with no input feel.
// - iOS: <Text selectable> is flaky, so use a read-only TextInput with
//   caretHidden + no keyboard — long-press selects, a tap shows nothing.
export function SelectableText({
  children,
  value,
  style,
  scrollEnabled = false,
  selectTextOnFocus = false,
  selectionColor = DEFAULT_SELECTION_COLOR,
  ...props
}: SelectableTextProps) {
  const text = value ?? textFromChildren(children);

  if (Platform.OS === "android") {
    return (
      <Text
        selectable
        selectionColor={selectionColor}
        maxFontSizeMultiplier={props.maxFontSizeMultiplier}
        numberOfLines={props.numberOfLines}
        style={style}
      >
        {text}
      </Text>
    );
  }

  return (
    <TextInput
      {...props}
      value={text}
      multiline
      editable
      caretHidden
      showSoftInputOnFocus={false}
      contextMenuHidden={false}
      scrollEnabled={scrollEnabled}
      selectionColor={selectionColor}
      selectTextOnFocus={selectTextOnFocus}
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      importantForAutofill="no"
      underlineColorAndroid="transparent"
      onChangeText={() => undefined}
      style={[styles.base, style]}
    />
  );
}

function textFromChildren(children: ReactNode): string {
  if (children === null || children === undefined || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  return "";
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: "transparent",
    borderWidth: 0,
    margin: 0,
    padding: 0,
    textAlignVertical: "top",
  },
});
