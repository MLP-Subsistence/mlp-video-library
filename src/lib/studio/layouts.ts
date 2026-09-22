import type { Composition, CompositionSlot, LayoutDefinition } from "@/lib/studio/types";

/**
 * Visual layouts are data. Slot rectangles are expressed in 0..1 frame units
 * so the same definition drives the browser preview, the timeline detail
 * and the FFmpeg render.
 */
export const layouts: LayoutDefinition[] = [
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
          .map((item) => ({ assetId: item.assetId, share: clampShare(item.share) }))
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
export function balanceShares(items: Array<{ assetId: string; share: number }>) {
  if (items.length === 0) return items;
  const total = items.reduce((sum, item) => sum + item.share, 0) || 1;
  return items.map((item) => ({ assetId: item.assetId, share: item.share / total }));
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
