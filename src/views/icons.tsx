/**
 * Inline SVG icon set (Lucide-style geometry, 24x24 grid, stroke-based).
 *
 * Icons are inlined rather than sprited so a fragment swapped in by htmx never
 * depends on markup that lives outside it.
 */

const PATHS = {
  // Navigation
  home: "M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5",
  inbox: "M4 13h4l1.5 3h5L16 13h4M4 13 6.5 5h11L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
  board: "M4 5h5v14H4zM10.5 5h4v9h-4zM16 5h4v11h-4z",
  backlog: "M4 6h16M4 12h16M4 18h10",
  sprint: "M6 20V10M12 20V4M18 20v-7",
  whiteboard: "M3 4h18v11H3zM12 15v5M8 20h8",
  log: "M12 7v5l3 2M21 12a9 9 0 1 1-3.5-7.1M21 3v5h-5",
  users: "M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 20v-1.5a4 4 0 0 0-3-3.87M16 3.6a4 4 0 0 1 0 7.75",
  settings:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.32a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.68 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.68a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09c.24.58.8.96 1.43.97H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03z",
  calendar: "M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",

  // Actions
  plus: "M12 5v14M5 12h14",
  x: "M18 6 6 18M6 6l12 12",
  check: "m5 12 5 5L20 6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  archive: "M3 8h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 4h18v4H3zM10 12h4",

  // Chevrons / arrows
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 6 6 6-6 6",
  chevronLeft: "m15 6-6 6 6 6",
  chevronUp: "m6 15 6-6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 18l-6-6 6-6",

  // Misc UI
  menu: "M4 6h16M4 12h16M4 18h16",
  more: "M12 12h.01M19 12h.01M5 12h.01",
  grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  flag: "M4 21V4M4 5h12l-2 4 2 4H4",
  message: "M21 11.5a8 8 0 0 1-11.6 7.1L3 20.5l1.9-6.4A8 8 0 1 1 21 11.5z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  sparkle: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z",

  // Whiteboard tools
  pointer: "m4 3 7 17 2.5-6.5L20 11z",
  pen: "M12 19l7-7a2.8 2.8 0 0 0-4-4l-7 7-1 5z",
  square: "M4 4h16v16H4z",
  circle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  arrowTool: "M4 20 20 4M20 4h-7M20 4v7",
  sticky: "M4 4h16v10l-6 6H4zM20 14h-6v6",
  text: "M5 5h14M12 5v14M9 19h6",
  eraser: "m19 20-9 .01M20 13 13 20 4 11l7-7z",
  hand: "M18 11V7a1.5 1.5 0 0 0-3 0M15 10.5V5a1.5 1.5 0 0 0-3 0v5.5M12 10.5V6a1.5 1.5 0 0 0-3 0v8M9 11.5 7.4 9.7A1.6 1.6 0 0 0 5 11.9l3.4 5.3A6 6 0 0 0 13.5 20h.5a5 5 0 0 0 5-5v-4",
  undo: "M3 8h11a5 5 0 0 1 0 10H8M3 8l4-4M3 8l4 4",
  redo: "M21 8H10a5 5 0 0 0 0 10h6M21 8l-4-4M21 8l-4 4",
  zoomIn: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6",
  zoomOut: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M8 11h6",
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  class?: string;
  /** Set when the icon is the only content of a control. */
  label?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, class: className, label, strokeWidth = 1.75 }: IconProps) {
  const d = PATHS[name];
  return (
    <svg
      class={`icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      <path d={d} />
    </svg>
  );
}

/** Google's four-colour mark. Solid fills, so it does not use the stroke set above. */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5.1-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.6z"
      />
      <path
        fill="#EA4335"
        d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 13.8l7.3 5.7c1.7-5.2 6.5-8.8 12.2-8.8z"
      />
    </svg>
  );
}
