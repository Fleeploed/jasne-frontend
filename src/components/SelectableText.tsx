import type { ReactNode } from "react";
import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";

type SelectableTextProps = Omit<TextProps, "children" | "style"> & {
  children?: ReactNode;
  value?: string | null;
  style?: StyleProp<TextStyle>;
};

const DEFAULT_SELECTION_COLOR = "#6FA0E6";

// Telegram-style selection: a plain <Text selectable> instead of a no-keyboard
// TextInput. Long-press starts a selection with drag handles + the native
// "Copy" menu, and there's no caret/cursor so it never feels like an editable
// field (the old TextInput hack did, which is what users complained about).
export function SelectableText({
  children,
  value,
  style,
  selectionColor = DEFAULT_SELECTION_COLOR,
  ...props
}: SelectableTextProps) {
  const text = value ?? textFromChildren(children);

  return (
    <Text {...props} selectable selectionColor={selectionColor} style={style}>
      {text}
    </Text>
  );
}

function textFromChildren(children: ReactNode): string {
  if (children === null || children === undefined || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  return "";
}
