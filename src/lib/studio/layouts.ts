import type { Composition, CompositionSlot, LayoutDefinition, LayoutSlotRect } from "@/lib/studio/types";
import { normalizeTextOverlay } from "@/lib/studio/text-overlay";

/**
 * Visual layouts are data. Slot rectangles are expressed in 0..1 frame units
 * so the same definition drives the browser preview, the timeline detail
 * and the FFmpeg render.
 */
const standardLayouts: LayoutDefinition[] = [
  {
    id: "full",
    label: "Full Screen",
    description: "One image or video fills the frame.",
    slots: [{ x: 0, y: 0, w: 1, h: 1 }]
  },
  {
    id: "split2",
    label: "2 Split",
    description: "Two visuals side by side.",
    slots: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 }
    ]
  },
  {
    id: "columns3",
    label: "3 Columns",
    description: "Three visuals side by side.",
    slots: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 }
    ]
  },
  {
    id: "panel3",
    label: "3 Panel",
    description: "One large visual with two stacked beside it.",
    slots: [
      { x: 0, y: 0, w: 2 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 },
      { x: 2 / 3, y: 0.5, w: 1 / 3, h: 0.5 }
    ]
  },
  {
    id: "grid4",
    label: "4 Grid",
    description: "Four equal visuals.",
    slots: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
    ]
  },
  {
    id: "grid5",
    label: "5 Grid",
    description: "Two on top, three below.",
    slots: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
      { x: 1 / 3, y: 0.5, w: 1 / 3, h: 0.5 },
      { x: 2 / 3, y: 0.5, w: 1 / 3, h: 0.5 }
    ]
  },
  {
    id: "grid6",
    label: "6 Grid",
    description: "Three by two.",
    slots: [
      { x: 0, y: 0, w: 1 / 3, h: 0.5 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 0.5 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 },
      { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
      { x: 1 / 3, y: 0.5, w: 1 / 3, h: 0.5 },
      { x: 2 / 3, y: 0.5, w: 1 / 3, h: 0.5 }
    ]
  }
];

/**
 * One circle cut into equal slices, like a pie chart: each slice is its own
 * media slot. The stored layout id carries the number of slices (`pie5`), so
 * the choice survives without another database field.
 *
 * A slice is described by the bounding box of its wedge (so the media is
 * scaled and cropped to that area) plus a polygon in the box's own 0..1
 * coordinates, which the preview applies as a CSS clip-path and the renderer
 * bakes into an alpha mask. The frame is 16:9, so the horizontal radius is
 * the vertical one divided by the aspect ratio to keep the pie round.
 */
const FRAME_ASPECT = 16 / 9;
const PIE_RADIUS_Y = 0.47;
/**
 * Half of the space left between two neighbouring slices, as a fraction of the
 * radius. Each slice is inset by this much along both of its straight edges,
 * which also trims its point — so the gap stays the same width from the rim to
 * the middle and the slices never touch.
 */
const PIE_GAP = 0.03;

export const PIE_MIN_SLICES = 2;
export const PIE_MAX_SLICES = 8;

function wedgeSlot(index: number, count: number): LayoutSlotRect {
  const cx = 0.5;
  const cy = 0.5;
  const ry = PIE_RADIUS_Y;
  const rx = ry / FRAME_ASPECT;
  const sweep = (Math.PI * 2) / count;
  const start = -Math.PI / 2 + index * sweep;
  const half = sweep / 2;
  const middle = start + half;
  // Inset both straight edges by PIE_GAP: the arc starts a little later and the
  // point is cut off where the two inset edges would cross.
  const edgeInset = Math.min(Math.asin(Math.min(0.9, PIE_GAP)), half * 0.6);
  const apexRadius = Math.min(0.9, PIE_GAP / Math.max(0.05, Math.sin(half)));
  const arcStart = start + edgeInset;
  const arcEnd = start + sweep - edgeInset;
  const steps = Math.max(6, Math.ceil(((arcEnd - arcStart) / (Math.PI * 2)) * 96));
  const points: Array<[number, number]> = [[cx + rx * apexRadius * Math.cos(middle), cy + ry * apexRadius * Math.sin(middle)]];
  for (let step = 0; step <= steps; step += 1) {
    const angle = arcStart + ((arcEnd - arcStart) * step) / steps;
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(0.02, maxX - minX);
  const h = Math.max(0.02, maxY - minY);
  return {
    x: minX,
    y: minY,
    w,
    h,
    shape: "wedge",
    clip: points.map(([px, py]) => [(px - minX) / w, (py - minY) / h] as [number, number])
  };
}

function pieLayout(count: number): LayoutDefinition {
  const slices = Math.min(PIE_MAX_SLICES, Math.max(PIE_MIN_SLICES, Math.round(count)));
  return {
    id: `pie${slices}`,
    label: `Pie — ${slices} slices`,
    description: `One circle split into ${slices} slices, each with its own image or video.`,
    slots: Array.from({ length: slices }, (_, index) => wedgeSlot(index, slices))
  };
}

export const pieLayouts = Array.from({ length: PIE_MAX_SLICES - PIE_MIN_SLICES + 1 }, (_, index) => pieLayout(index + PIE_MIN_SLICES));

/** Circle collages from before the pie layout; kept so saved segments still render. */
const legacyCircleLayouts: LayoutDefinition[] = [2, 3, 4, 5, 6].map((count) => ({
  id: `circles${count}`,
  label: `${count} Circles`,
  description: `${count} circular media areas.`,
  slots: Array.from({ length: count }, (_, index) => {
    const columns = count <= 3 ? count : Math.ceil(count / 2);
    const rows = count <= 3 ? 1 : 2;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const h = rows === 1 ? 0.6 : 0.44;
    const w = h / FRAME_ASPECT;
    const gapX = (1 - columns * w) / (columns + 1);
    const gapY = (1 - rows * h) / (rows + 1);
    return { x: gapX + column * (w + gapX), y: gapY + row * (h + gapY), w, h, shape: "circle" as const };
  })
}));

export const layouts: LayoutDefinition[] = [...standardLayouts, ...pieLayouts];
const allLayouts: LayoutDefinition[] = [...layouts, ...legacyCircleLayouts];

/** Number of slices for a pie layout id, or null for every other layout. */
export function pieCountForLayout(id: string | null | undefined) {
  const match = /^pie([2-8])$/.exec(id ?? "");
  return match ? Number(match[1]) : null;
}

/** CSS `clip-path` for a slot, or undefined when the slot is a plain rectangle. */
export function clipPathForSlot(rect: LayoutSlotRect) {
  if (!rect.clip?.length) return undefined;
  return `polygon(${rect.clip.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(", ")})`;
}

export function getLayout(id: string | null | undefined): LayoutDefinition {
  return allLayouts.find((layout) => layout.id === id) ?? allLayouts[0];
}

export function emptyComposition(layoutId = "full"): Composition {
  const layout = getLayout(layoutId);
  return {
    layout: layout.id,
    slots: layout.slots.map((_, index) => ({ id: `slot_${index + 1}`, fit: "cover", items: [] }))
  };
}

/**
 * Parse a stored composition string. Invalid or missing data falls back to an
 * empty full-screen composition so nothing downstream has to special-case it.
 */
export function parseComposition(raw: string | null | undefined): Composition {
  if (!raw) return emptyComposition();
  try {
    const parsed = JSON.parse(raw) as Partial<Composition>;
    return normalizeComposition(parsed);
  } catch {
    return emptyComposition();
  }
}

export function normalizeComposition(input: Partial<Composition> | null | undefined): Composition {
  const layout = getLayout(input?.layout);
  const providedSlots = Array.isArray(input?.slots) ? input!.slots : [];
  const slots: CompositionSlot[] = layout.slots.map((_, index) => {
    const provided = providedSlots[index];
    const items = Array.isArray(provided?.items)
      ? provided!.items
          .filter((item) => item && typeof item.assetId === "string" && item.assetId.length > 0)
          .map((item) => ({ assetId: item.assetId, share: clampShare(item.share), ...(typeof item.startSec === "number" && item.startSec > 0 ? { startSec: Math.round(item.startSec * 1000) / 1000 } : {}) }))
      : [];
    return {
      id: provided?.id || `slot_${index + 1}`,
      fit: provided?.fit === "contain" ? "contain" : "cover",
      items: balanceShares(items)
    };
  });
  const textOverlay = normalizeTextOverlay(input?.textOverlay);
  return { layout: layout.id, slots, ...(textOverlay ? { textOverlay } : {}) };
}

function clampShare(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.max(n, 0.01);
}

/** Make sequential item shares sum to 1 while keeping their relative proportions. */
export function balanceShares<T extends { assetId: string; share: number }>(items: T[]): T[] {
  if (items.length === 0) return items;
  const total = items.reduce((sum, item) => sum + item.share, 0) || 1;
  return items.map((item) => ({ ...item, share: item.share / total }));
}

/**
 * Swap the segment's main visual for another asset, keeping the layout. The
 * first visual of the first filled slot is replaced (a plain still or the
 * master video); an empty composition becomes a full-screen visual. A
 * `startSec` offset of the old visual is dropped because it belonged to that media.
 */
export function replaceMainVisual(composition: Composition, assetId: string): Composition {
  const base = normalizeComposition(composition);
  if (!compositionHasVisual(base)) {
    const next = emptyComposition("full");
    next.slots[0].items = [{ assetId, share: 1 }];
    return { ...next, ...(base.textOverlay ? { textOverlay: base.textOverlay } : {}) };
  }
  const slotIndex = base.slots.findIndex((slot) => slot.items.length > 0);
  return {
    ...base,
    slots: base.slots.map((slot, index) => (index === slotIndex ? { ...slot, items: slot.items.map((item, i) => (i === 0 ? { assetId, share: item.share } : item)) } : slot))
  };
}

export function compositionAssetIds(composition: Composition) {
  const ids = new Set<string>();
  for (const slot of composition.slots) for (const item of slot.items) ids.add(item.assetId);
  return [...ids];
}

export function compositionHasVisual(composition: Composition) {
  return composition.slots.some((slot) => slot.items.length > 0);
}

export function serializeComposition(composition: Composition) {
  return JSON.stringify(normalizeComposition(composition));
}
