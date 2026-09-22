import type { TextOverlay } from "@/lib/studio/types";

export const TEXT_FONTS = ["Arial", "Georgia", "Verdana", "Trebuchet MS"] as const;
export const DEFAULT_TEXT_OVERLAY: TextOverlay = {
  text: "", x: .1, y: .73, w: .8, h: .18,
  fontFamily: "Arial", fontSize: 48, color: "#ffffff", align: "center", bold: true, background: true
};

const clamp = (n: unknown, min: number, max: number, fallback: number) => typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

/** Validate client/stored styling so the preview and renderer see bounded geometry. */
export function normalizeTextOverlay(input: unknown): TextOverlay | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Partial<TextOverlay>;
  const w = clamp(raw.w, .12, 1, DEFAULT_TEXT_OVERLAY.w);
  const h = clamp(raw.h, .06, 1, DEFAULT_TEXT_OVERLAY.h);
  return {
    text: typeof raw.text === "string" ? raw.text.replace(/\r/g, "").slice(0, 1200) : "",
    x: clamp(raw.x, 0, 1 - w, DEFAULT_TEXT_OVERLAY.x),
    y: clamp(raw.y, 0, 1 - h, DEFAULT_TEXT_OVERLAY.y),
    w, h,
    fontFamily: TEXT_FONTS.includes(raw.fontFamily as TextOverlay["fontFamily"]) ? raw.fontFamily! : DEFAULT_TEXT_OVERLAY.fontFamily,
    fontSize: Math.round(clamp(raw.fontSize, 16, 120, DEFAULT_TEXT_OVERLAY.fontSize)),
    color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_TEXT_OVERLAY.color,
    align: raw.align === "left" || raw.align === "right" ? raw.align : "center",
    bold: raw.bold === true,
    background: raw.background === true
  };
}
