"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { getLayout } from "@/lib/studio/layouts";
import { normalizeTextOverlay } from "@/lib/studio/text-overlay";
import type { Composition, StudioAssetDto, TextOverlay, TimelineBlock } from "@/lib/studio/types";

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
  editText = false,
  onTextMove,
  className = ""
}: {
  composition: Composition;
  assets: Record<string, StudioAssetDto>;
  block: TimelineBlock | null;
  timeSec: number;
  playing: boolean;
  caption?: string;
  editText?: boolean;
  onTextMove?: (overlay: TextOverlay) => void;
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
      {composition.textOverlay?.text.trim() && <OnScreenText overlay={composition.textOverlay} editable={editText} onChange={onTextMove} />}
      {caption && <div className="absolute bottom-3 left-3 rounded bg-black/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white/90">{caption}</div>}
    </div>
  );
}

function OnScreenText({ overlay, editable, onChange }: { overlay: TextOverlay; editable: boolean; onChange?: (overlay: TextOverlay) => void }) {
  const [draft, setDraft] = useState(overlay);
  const [frameHeight, setFrameHeight] = useState(540);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; start: TextOverlay; kind: "move" | "resize" } | null>(null);
  useEffect(() => setDraft(overlay), [overlay]);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => setFrameHeight(frame.clientHeight));
    observer.observe(frame);
    setFrameHeight(frame.clientHeight);
    return () => observer.disconnect();
  }, []);

  const start = (event: React.PointerEvent<HTMLDivElement>, kind: "move" | "resize") => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: draft, kind };
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const frame = frameRef.current;
    if (!state || !frame) return;
    const dx = (event.clientX - state.x) / frame.clientWidth;
    const dy = (event.clientY - state.y) / frame.clientHeight;
    const next = state.kind === "move"
      ? { ...state.start, x: state.start.x + dx, y: state.start.y + dy }
      : { ...state.start, w: state.start.w + dx, h: state.start.h + dy };
    setDraft(normalizeTextOverlay(next)!);
  };
  const finish = () => {
    if (!drag.current) return;
    drag.current = null;
    onChange?.(draft);
  };
  const px = frameHeight / 1080;
  return (
    <div ref={frameRef} className="pointer-events-none absolute inset-0 z-10" aria-label="Video text overlay">
      <div
        className={`pointer-events-auto absolute whitespace-pre-wrap break-words ${editable ? "cursor-move touch-none outline outline-2 outline-[#e86943]" : ""}`}
        style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%`, padding: `${Math.max(3, 12 * px)}px`, fontFamily: draft.fontFamily, fontSize: `${Math.max(8, draft.fontSize * px)}px`, lineHeight: 1.15, fontWeight: draft.bold ? 700 : 400, textAlign: draft.align, color: draft.color, backgroundColor: draft.background ? "rgba(0,0,0,.68)" : "transparent", borderRadius: `${8 * px}px`, overflow: "hidden", userSelect: "none" }}
        onPointerDown={(event) => { if ((event.target as HTMLElement).dataset.resize) start(event, "resize"); else start(event, "move"); }}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        title={editable ? "Drag to move. Drag the bottom-right corner to resize." : undefined}
      >
        {draft.text}
        {editable && <span data-resize="true" className="absolute bottom-0 right-0 grid size-5 cursor-nwse-resize place-items-center rounded-tl bg-[#e86943] text-xs font-bold text-white" aria-label="Resize text box">↘</span>}
      </div>
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
