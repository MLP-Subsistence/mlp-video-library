import type { Composition, CompositionSlot, LayoutDefinition, LayoutSlotRect } from "@/lib/studio/types";

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
 * Friendly circle collages. The stored layout id includes the number of
 * circles, so the user's choice survives without adding another database
 * field. The rectangles are sized for a 16:9 lesson frame and render as
 * near-perfect circles in both the browser and FFmpeg.
 */
function circleLayout(count: number): LayoutDefinition {
  const definitions: Record<number, LayoutSlotRect[]> = {
    2: [
      { x: 0.08, y: 0.16, w: 0.38, h: 0.68, shape: "circle" },
      { x: 0.54, y: 0.16, w: 0.38, h: 0.68, shape: "circle" }
    ],
    3: [
      { x: 0.03, y: 0.24, w: 0.29, h: 0.52, shape: "circle" },
      { x: 0.355, y: 0.24, w: 0.29, h: 0.52, shape: "circle" },
      { x: 0.68, y: 0.24, w: 0.29, h: 0.52, shape: "circle" }
    ],
    4: [
      { x: 0.205, y: 0.02, w: 0.27, h: 0.48, shape: "circle" },
      { x: 0.525, y: 0.02, w: 0.27, h: 0.48, shape: "circle" },
      { x: 0.205, y: 0.5, w: 0.27, h: 0.48, shape: "circle" },
      { x: 0.525, y: 0.5, w: 0.27, h: 0.48, shape: "circle" }
    ],
    5: [
      { x: 0.22, y: 0.04, w: 0.24, h: 0.43, shape: "circle" },
      { x: 0.54, y: 0.04, w: 0.24, h: 0.43, shape: "circle" },
      { x: 0.05, y: 0.53, w: 0.24, h: 0.43, shape: "circle" },
      { x: 0.38, y: 0.53, w: 0.24, h: 0.43, shape: "circle" },
      { x: 0.71, y: 0.53, w: 0.24, h: 0.43, shape: "circle" }
    ],
    6: [
      { x: 0.05, y: 0.04, w: 0.24, h: 0.43, shape: "circle" },
      { x: 0.38, y: 0.04, w: 0.24, h: 0.43, shape: "circle" },
      { x: 0.71, y: 0.04, w: 0.24, h: 0.43, shape: "circle" },
      { x: 0.05, y: 0.53, w: 0.24, h: 0.43, shape: "circle" },
      { x: 0.38, y: 0.53, w: 0.24, h: 0.43, shape: "circle" },
      { x: 0.71, y: 0.53, w: 0.24, h: 0.43, shape: "circle" }
    ]
  };
  const safeCount = Math.min(6, Math.max(2, Math.round(count)));
  return {
    id: `circles${safeCount}`,
    label: `${safeCount} Circles`,
    description: `${safeCount} circular media areas.`,
    slots: definitions[safeCount]
  };
}

export const circleLayouts = [2, 3, 4, 5, 6].map(circleLayout);
export const layouts: LayoutDefinition[] = [...standardLayouts, ...circleLayouts];

export function circleCountForLayout(id: string | null | undefined) {
  const match = /^circles([2-6])$/.exec(id ?? "");
  return match ? Number(match[1]) : null;
}

export function getLayout(id: string | null | undefined): LayoutDefinition {
  return layouts.find((layout) => layout.id === id) ?? layouts[0];
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
  return { layout: layout.id, slots };
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
    return next;
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
