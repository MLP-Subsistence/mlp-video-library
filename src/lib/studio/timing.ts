import type { Composition, Timeline, TimelineBlock } from "@/lib/studio/types";

/**
 * Audio is the timing authority. Every segment's duration is its narration
 * length plus the educational pause that follows it; visuals stretch to fit.
 * This function is pure so the browser timeline, the review page and the
 * render worker all agree on the same numbers.
 */
export type TimingInput = {
  segmentId: string;
  key: string;
  title: string;
  orderIndex: number;
  narrationDurationSec: number;
  pauseAfterSec: number;
  composition: Composition;
};

/** Segments without narration still occupy a placeholder so the structure stays visible. */
export const PLACEHOLDER_SEGMENT_SEC = 4;

export function computeTimeline(segments: TimingInput[]): Timeline {
  const ordered = [...segments].sort((a, b) => a.orderIndex - b.orderIndex);
  const blocks: TimelineBlock[] = [];
  let cursor = 0;
  ordered.forEach((segment, index) => {
    const narrationSec = round(Math.max(0, segment.narrationDurationSec));
    const pauseSec = round(Math.max(0, segment.pauseAfterSec));
    const effectiveNarration = narrationSec > 0 ? narrationSec : PLACEHOLDER_SEGMENT_SEC;
    const durationSec = round(effectiveNarration + pauseSec);
    const items: TimelineBlock["items"] = [];
    for (const slot of segment.composition.slots) {
      let offset = 0;
      for (const item of slot.items) {
        const itemSec = round(durationSec * item.share);
        items.push({ slotId: slot.id, assetId: item.assetId, startSec: round(cursor + offset), durationSec: itemSec });
        offset += itemSec;
      }
    }
    blocks.push({
      segmentId: segment.segmentId,
      key: segment.key,
      index,
      title: segment.title,
      startSec: round(cursor),
      narrationSec,
      pauseSec,
      durationSec,
      endSec: round(cursor + durationSec),
      items
    });
    cursor += durationSec;
  });
  return { totalSec: round(cursor), blocks };
}

export function blockAtTime(timeline: Timeline, timeSec: number) {
  if (timeline.blocks.length === 0) return null;
  const found = timeline.blocks.find((block) => timeSec >= block.startSec && timeSec < block.endSec);
  return found ?? timeline.blocks[timeline.blocks.length - 1];
}

export function formatClock(totalSec: number) {
  const safe = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatSeconds(value: number) {
  return `${(Math.round(value * 10) / 10).toFixed(1)} sec`;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
