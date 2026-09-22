import type { TextOverlay, TextStylePreset } from "@/lib/studio/types";

/** Fonts that exist on Windows/macOS browsers and on the render worker. */
export const TEXT_FONTS = ["Arial", "Georgia", "Verdana", "Trebuchet MS", "Tahoma", "Times New Roman", "Courier New", "Impact", "Comic Sans MS"] as const;

export const DEFAULT_TEXT_OVERLAY: TextOverlay = {
  text: "",
  x: 0.1,
  y: 0.73,
  w: 0.8,
  h: 0.18,
  fontFamily: "Arial",
  fontSize: 48,
  color: "#ffffff",
  opacity: 1,
  align: "center",
  verticalAlign: "middle",
  bold: true,
  italic: false,
  underline: false,
  uppercase: false,
  letterSpacing: 0,
  lineHeight: 1.15,
  rotation: 0,
  background: true,
  backgroundColor: "#000000",
  backgroundOpacity: 0.68,
  backgroundRadius: 8,
  strokeWidth: 0,
  strokeColor: "#000000",
  shadow: false,
  shadowColor: "#000000",
  shadowBlur: 6,
  shadowOffsetX: 0,
  shadowOffsetY: 4,
  shadowOpacity: 0.65
};

/** One-click looks, the way Resolve ships Text+ presets. */
export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  {
    id: "subtitle",
    label: "Subtitle",
    description: "White words on a dark band, bottom of the frame.",
    style: { x: 0.1, y: 0.73, w: 0.8, h: 0.18, fontFamily: "Arial", fontSize: 48, color: "#ffffff", bold: true, italic: false, uppercase: false, letterSpacing: 0, lineHeight: 1.15, align: "center", verticalAlign: "middle", background: true, backgroundColor: "#000000", backgroundOpacity: 0.68, backgroundRadius: 8, strokeWidth: 0, shadow: false, rotation: 0, opacity: 1 }
  },
  {
    id: "title",
    label: "Big title",
    description: "Large centred title with a soft shadow.",
    style: { x: 0.08, y: 0.32, w: 0.84, h: 0.3, fontFamily: "Georgia", fontSize: 96, color: "#ffffff", bold: true, italic: false, uppercase: false, letterSpacing: 1, lineHeight: 1.1, align: "center", verticalAlign: "middle", background: false, strokeWidth: 0, shadow: true, shadowColor: "#000000", shadowBlur: 14, shadowOffsetX: 0, shadowOffsetY: 6, shadowOpacity: 0.7, rotation: 0, opacity: 1 }
  },
  {
    id: "lower-third",
    label: "Lower third",
    description: "Left-aligned name strip over the lower left corner.",
    style: { x: 0.06, y: 0.7, w: 0.52, h: 0.16, fontFamily: "Trebuchet MS", fontSize: 44, color: "#ffffff", bold: true, italic: false, uppercase: true, letterSpacing: 2, lineHeight: 1.1, align: "left", verticalAlign: "middle", background: true, backgroundColor: "#a64026", backgroundOpacity: 0.92, backgroundRadius: 6, strokeWidth: 0, shadow: false, rotation: 0, opacity: 1 }
  },
  {
    id: "outline",
    label: "Outlined",
    description: "Bold words with a black outline — readable on any picture.",
    style: { x: 0.1, y: 0.68, w: 0.8, h: 0.22, fontFamily: "Impact", fontSize: 72, color: "#ffffff", bold: false, italic: false, uppercase: true, letterSpacing: 1, lineHeight: 1.1, align: "center", verticalAlign: "middle", background: false, strokeWidth: 6, strokeColor: "#000000", shadow: false, rotation: 0, opacity: 1 }
  },
  {
    id: "note",
    label: "Corner note",
    description: "Small italic note in the top-right corner.",
    style: { x: 0.55, y: 0.06, w: 0.39, h: 0.14, fontFamily: "Georgia", fontSize: 32, color: "#ffffff", bold: false, italic: true, uppercase: false, letterSpacing: 0, lineHeight: 1.2, align: "right", verticalAlign: "top", background: true, backgroundColor: "#0d1a2b", backgroundOpacity: 0.6, backgroundRadius: 10, strokeWidth: 0, shadow: false, rotation: 0, opacity: 1 }
  }
];

const clamp = (n: unknown, min: number, max: number, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);
const hex = (value: unknown, fallback: string) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

/**
 * Validate client/stored styling so the preview and the renderer see the same
 * bounded values. Every field beyond the original five is optional in stored
 * data, so older segments keep working and simply get the defaults.
 */
export function normalizeTextOverlay(input: unknown): TextOverlay | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Partial<TextOverlay>;
  const d = DEFAULT_TEXT_OVERLAY;
  const w = clamp(raw.w, 0.12, 1, d.w);
  const h = clamp(raw.h, 0.06, 1, d.h);
  return {
    text: typeof raw.text === "string" ? raw.text.replace(/\r/g, "").slice(0, 1200) : "",
    x: clamp(raw.x, 0, 1 - w, d.x),
    y: clamp(raw.y, 0, 1 - h, d.y),
    w,
    h,
    fontFamily: TEXT_FONTS.includes(raw.fontFamily as TextOverlay["fontFamily"]) ? raw.fontFamily! : d.fontFamily,
    fontSize: Math.round(clamp(raw.fontSize, 8, 200, d.fontSize)),
    color: hex(raw.color, d.color),
    opacity: clamp(raw.opacity, 0.05, 1, d.opacity),
    align: raw.align === "left" || raw.align === "right" ? raw.align : "center",
    verticalAlign: raw.verticalAlign === "top" || raw.verticalAlign === "bottom" ? raw.verticalAlign : "middle",
    bold: raw.bold === true,
    italic: raw.italic === true,
    underline: raw.underline === true,
    uppercase: raw.uppercase === true,
    letterSpacing: Math.round(clamp(raw.letterSpacing, -5, 30, d.letterSpacing) * 10) / 10,
    lineHeight: Math.round(clamp(raw.lineHeight, 0.8, 2.5, d.lineHeight) * 100) / 100,
    rotation: Math.round(clamp(raw.rotation, -180, 180, d.rotation) * 10) / 10,
    background: raw.background === true,
    backgroundColor: hex(raw.backgroundColor, d.backgroundColor),
    backgroundOpacity: clamp(raw.backgroundOpacity, 0, 1, d.backgroundOpacity),
    backgroundRadius: Math.round(clamp(raw.backgroundRadius, 0, 80, d.backgroundRadius)),
    strokeWidth: Math.round(clamp(raw.strokeWidth, 0, 20, d.strokeWidth) * 10) / 10,
    strokeColor: hex(raw.strokeColor, d.strokeColor),
    shadow: raw.shadow === true,
    shadowColor: hex(raw.shadowColor, d.shadowColor),
    shadowBlur: Math.round(clamp(raw.shadowBlur, 0, 40, d.shadowBlur)),
    shadowOffsetX: Math.round(clamp(raw.shadowOffsetX, -40, 40, d.shadowOffsetX)),
    shadowOffsetY: Math.round(clamp(raw.shadowOffsetY, -40, 40, d.shadowOffsetY)),
    shadowOpacity: clamp(raw.shadowOpacity, 0, 1, d.shadowOpacity)
  };
}

/** `#ff8800` + 0.5 → `rgba(255,136,0,0.5)` — shared by the preview and the SVG renderer. */
export function rgba(color: string, opacity: number) {
  const value = /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.round(Math.min(1, Math.max(0, opacity)) * 1000) / 1000})`;
}

/** The text as it is drawn (uppercase is a display transform, the stored words keep their case). */
export function displayText(overlay: TextOverlay) {
  return overlay.uppercase ? overlay.text.toUpperCase() : overlay.text;
}

/** Apply a preset while keeping the words the educator already wrote. */
export function applyTextPreset(overlay: TextOverlay, preset: TextStylePreset): TextOverlay {
  return normalizeTextOverlay({ ...DEFAULT_TEXT_OVERLAY, ...preset.style, text: overlay.text })!;
}
