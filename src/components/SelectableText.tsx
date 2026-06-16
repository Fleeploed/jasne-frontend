import type { ReactNode } from "react";
import { StyleSheet, TextInput, type StyleProp, type TextInputProps, type TextStyle } from "react-native";

type SelectableTextProps = Omit<TextInputProps, "children" | "editable" | "multiline" | "onChangeText" | "value"> & {
  children?: ReactNode;
  value?: string | null;
  style?: StyleProp<TextStyle>;
};

const DEFAULT_SELECTION_COLOR = "#6FA0E6";

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
