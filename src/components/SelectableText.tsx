import type { ReactNode } from "react";
import { StyleSheet, TextInput, type StyleProp, type TextInputProps, type TextStyle } from "react-native";

type SelectableTextProps = Omit<TextInputProps, "children" | "editable" | "multiline" | "onChangeText" | "value"> & {
  children?: ReactNode;
  value?: string | null;
  style?: StyleProp<TextStyle>;
};

const DEFAULT_SELECTION_COLOR = "#6FA0E6";

// Telegram-style selection. A read-only TextInput (no keyboard, no caret) gives
// reliable long-press selection + the native Copy menu on BOTH iOS and Android.
// `<Text selectable>` is unreliable on iOS, and a plain editable TextInput shows
// a blinking caret that makes it feel like an input — `caretHidden` plus
// `showSoftInputOnFocus={false}` remove that while keeping selection working:
// a tap does nothing visible, a long-press selects with handles + Copy.
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
