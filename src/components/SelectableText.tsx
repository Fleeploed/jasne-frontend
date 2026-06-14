import type { ReactNode } from "react";
import { Platform, StyleSheet, TextInput, type StyleProp, type TextInputProps, type TextStyle } from "react-native";

type SelectableTextProps = Omit<TextInputProps, "children" | "editable" | "multiline" | "onChangeText" | "value"> & {
  children?: ReactNode;
  value?: string | null;
  style?: StyleProp<TextStyle>;
};

export function SelectableText({ children, value, style, scrollEnabled = false, ...props }: SelectableTextProps) {
  const text = value ?? textFromChildren(children);
  const { onPressIn, ...inputProps } = props;

  return (
    <TextInput
      {...inputProps}
      value={text}
      multiline
      editable={Platform.OS !== "ios"}
      caretHidden
      showSoftInputOnFocus={false}
      inputMode="none"
      contextMenuHidden={false}
      scrollEnabled={scrollEnabled}
      selectTextOnFocus={false}
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      importantForAutofill="no"
      underlineColorAndroid="transparent"
      onChangeText={() => undefined}
      onPressIn={(event) => {
        event.stopPropagation();
        onPressIn?.(event);
      }}
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
