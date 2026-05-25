import Svg, { Circle, Path, Rect } from "react-native-svg";

export type AppIconName =
  | "alert"
  | "arrow-right"
  | "arrow-up-right"
  | "bell"
  | "calendar"
  | "calendar-plus"
  | "camera"
  | "check"
  | "chevron-left"
  | "chevron-right"
  | "doc"
  | "doc-text"
  | "globe"
  | "info"
  | "languages"
  | "lock"
  | "log-out"
  | "pages"
  | "pin"
  | "plus"
  | "restore"
  | "search"
  | "shield"
  | "sliders"
  | "sparkles"
  | "star"
  | "user"
  | "trash"
  | "x"
  | "zap";

export function AppIcon({
  name,
  size = 24,
  color = "currentColor",
  strokeWidth = 1.6,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <IconPaths name={name} color={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

function IconPaths({ name, color, strokeWidth }: { name: AppIconName; color: string; strokeWidth: number }) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "alert":
      return <Path {...stroke} d="M12 3 2.5 20h19L12 3ZM12 9v5M12 17h.01" />;
    case "arrow-right":
      return <Path {...stroke} d="M5 12h14M13 6l6 6-6 6" />;
    case "arrow-up-right":
      return <Path {...stroke} d="M7 17 17 7M9 7h8v8" />;
    case "bell":
      return (
        <>
          <Path {...stroke} d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
          <Path {...stroke} d="M10 19a2 2 0 0 0 4 0" />
        </>
      );
    case "calendar":
      return (
        <>
          <Rect {...stroke} x="3.5" y="5" width="17" height="16" rx="2.5" />
          <Path {...stroke} d="M8 3v4M16 3v4M3.5 10h17" />
        </>
      );
    case "calendar-plus":
      return (
        <>
          <Rect {...stroke} x="3.5" y="5" width="17" height="16" rx="2.5" />
          <Path {...stroke} d="M8 3v4M16 3v4M3.5 10h17M12 14v5M9.5 16.5h5" />
        </>
      );
    case "camera":
      return (
        <>
          <Path {...stroke} d="M4 8.5A2.5 2.5 0 0 1 6.5 6H9l1.5-2h3L15 6h2.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
          <Circle {...stroke} cx="12" cy="12.5" r="3.5" />
        </>
      );
    case "check":
      return <Path {...stroke} d="m4.5 12.5 5 5 10-11" />;
    case "chevron-left":
      return <Path {...stroke} d="m15 6-6 6 6 6" />;
    case "chevron-right":
      return <Path {...stroke} d="m9 6 6 6-6 6" />;
    case "doc":
      return (
        <>
          <Path {...stroke} d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <Path {...stroke} d="M14 3v4h4" />
        </>
      );
    case "doc-text":
      return (
        <>
          <Path {...stroke} d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <Path {...stroke} d="M14 3v4h4M9 13h7M9 17h5" />
        </>
      );
    case "globe":
      return (
        <>
          <Circle {...stroke} cx="12" cy="12" r="9" />
          <Path {...stroke} d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </>
      );
    case "info":
      return (
        <>
          <Circle {...stroke} cx="12" cy="12" r="9" />
          <Path {...stroke} d="M12 10v7M12 7h.01" />
        </>
      );
    case "languages":
      return <Path {...stroke} d="M3 5h11M8.5 4v2c0 4-2.5 8-5.5 9M5 11c0 2 2.5 4 6 4M14 21l4-9 4 9M15.5 17.5h5" />;
    case "lock":
      return (
        <>
          <Rect {...stroke} x="4.5" y="11" width="15" height="10" rx="2.5" />
          <Path {...stroke} d="M8 11V7.5a4 4 0 0 1 8 0V11" />
        </>
      );
    case "log-out":
      return <Path {...stroke} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H10" />;
    case "pages":
      return (
        <>
          <Rect {...stroke} x="4" y="3" width="13" height="16" rx="2" />
          <Path {...stroke} d="M8 7h5M8 11h5M8 15h3M19 6v14a1 1 0 0 1-1 1H8" />
        </>
      );
    case "pin":
      return (
        <>
          <Path {...stroke} d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z" />
          <Circle {...stroke} cx="12" cy="9" r="2.5" />
        </>
      );
    case "plus":
      return <Path {...stroke} d="M12 5v14M5 12h14" />;
    case "restore":
      return <Path {...stroke} d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />;
    case "search":
      return (
        <>
          <Circle {...stroke} cx="11" cy="11" r="7" />
          <Path {...stroke} d="m16 16 4 4" />
        </>
      );
    case "shield":
      return <Path {...stroke} d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />;
    case "sliders":
      return (
        <>
          <Path {...stroke} d="M4 6h12M20 6h0M4 12h6M14 12h6M4 18h10M18 18h2" />
          <Circle {...stroke} cx="18" cy="6" r="1.6" />
          <Circle {...stroke} cx="12" cy="12" r="1.6" />
          <Circle {...stroke} cx="16" cy="18" r="1.6" />
        </>
      );
    case "sparkles":
      return <Path {...stroke} d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.5 2.5M16 16l2.5 2.5M18.5 5.5 16 8M8 16l-2.5 2.5" />;
    case "star":
      return <Path {...stroke} d="M12 3.5 14.6 9l5.9.9-4.3 4.1 1 5.9L12 17l-5.3 2.9 1-5.9L3.5 9.9 9.4 9 12 3.5Z" />;
    case "user":
      return (
        <>
          <Circle {...stroke} cx="12" cy="8" r="4" />
          <Path {...stroke} d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      );
    case "trash":
      return (
        <>
          <Path {...stroke} d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          <Path {...stroke} d="M10 11v6M14 11v6" />
        </>
      );
    case "x":
      return <Path {...stroke} d="M6 6l12 12M18 6 6 18" />;
    case "zap":
      return <Path {...stroke} d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />;
  }
}
