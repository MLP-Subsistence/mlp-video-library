"use client";

import { useEffect, useRef } from "react";
import { ImageOff } from "lucide-react";
import { getLayout } from "@/lib/studio/layouts";
import type { Composition, StudioAssetDto, TimelineBlock } from "@/lib/studio/types";

/**
 * Live preview of a segment's visual composition at a point in time. Uses the
 * same layout definitions as the render worker, so what educators see is what
 * FFmpeg will produce (minus encoding).
 */
export function CompositionPreview({
  composition,
  assets,
  block,
  timeSec,
  playing,
  caption,
  className = ""
}: {
  composition: Composition;
  assets: Record<string, StudioAssetDto>;
  block: TimelineBlock | null;
  timeSec: number;
  playing: boolean;
  caption?: string;
  className?: string;
}) {
  const layout = getLayout(composition.layout);
  const localTime = block ? Math.max(0, timeSec - block.startSec) : 0;
  const duration = block?.durationSec ?? 1;
  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-xl bg-black ${className}`}>
      {composition.slots.map((slot, index) => {
        const rect = layout.slots[index];
        if (!rect) return null;
        // Which sequential item is on screen right now?
        let offset = 0;
        let active = slot.items[0] ?? null;
        let activeStart = 0;
        for (const item of slot.items) {
          const itemDuration = duration * item.share;
          if (localTime >= offset && localTime < offset + itemDuration) {
            active = item;
            activeStart = offset;
            break;
          }
          offset += itemDuration;
          active = item;
          activeStart = offset - itemDuration;
        }
        const asset = active ? assets[active.assetId] : null;
        return (
          <div key={slot.id} className="absolute overflow-hidden bg-[#0d1a2b]" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, borderRadius: rect.shape === "circle" ? "9999px" : undefined }}>
            {asset ? (
              asset.kind === "video" ? (
                <SlotVideo url={asset.url} fit={slot.fit} timeSec={(active?.startSec ?? 0) + (localTime - activeStart)} playing={playing} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.url} alt="" className="h-full w-full" style={{ objectFit: slot.fit === "contain" ? "contain" : "cover" }} draggable={false} />
              )
            ) : (
              <div className="grid h-full w-full place-items-center text-white/40">
                <ImageOff className="size-6" />
              </div>
            )}
            {composition.slots.length > 1 && <span className="absolute inset-0 ring-1 ring-inset ring-white/10" />}
          </div>
        );
      })}
      {caption && <div className="absolute bottom-3 left-3 rounded bg-black/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white/90">{caption}</div>}
    </div>
  );
}

function SlotVideo({ url, fit, timeSec, playing }: { url: string; fit: "cover" | "contain"; timeSec: number; playing: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    const target = Math.min(timeSec, duration > 0 ? Math.max(0, duration - 0.05) : timeSec);
    if (!playing || video.paused || Math.abs(video.currentTime - target) > 0.5) {
      if (Math.abs(video.currentTime - target) > 0.2) video.currentTime = target;
    }
    if (playing && video.paused && timeSec < duration) void video.play().catch(() => undefined);
    if (!playing && !video.paused) video.pause();
  }, [timeSec, playing]);
  return <video ref={ref} src={url} muted playsInline preload="auto" className="h-full w-full" style={{ objectFit: fit === "contain" ? "contain" : "cover" }} />;
}
