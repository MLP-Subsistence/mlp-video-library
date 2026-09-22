"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Film, ImageIcon, Maximize2, Minus, Music2, Pause, Play, Plus } from "lucide-react";
import { Waveform } from "@/components/studio/workspace/waveform";
import { formatClock } from "@/lib/studio/timing";
import type { ProjectDto, ProjectSegmentDto, TimelineBlock } from "@/lib/studio/types";

/**
 * Interactive, synchronized timeline. It visualizes the timing computed on
 * the server (audio-led); it never edits durations itself. Clicking a block
 * selects the segment everywhere; clicking the ruler seeks the preview.
 */
export function Timeline({
  project,
  activeSegmentId,
  timeSec,
  playing,
  onSelect,
  onSeek,
  onPlayPause,
  collapsed,
  onToggleCollapsed,
  mobile = false
}: {
  project: ProjectDto;
  activeSegmentId: string;
  timeSec: number;
  playing: boolean;
  onSelect: (segmentId: string) => void;
  onSeek: (timeSec: number) => void;
  onPlayPause: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobile?: boolean;
}) {
  const { timeline, segments, assets } = project;
  const scroller = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(!mobile);
  const dragging = useRef(false);
  const LABEL_WIDTH = 64;

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [collapsed]);

  const total = Math.max(timeline.totalSec, 1);
  const fitPxPerSec = Math.max(2, (viewportWidth - LABEL_WIDTH - 16) / total);
  const pxPerSec = fitPxPerSec * zoom;
  const trackWidth = total * pxPerSec;
  const segmentById = useMemo(() => new Map(segments.map((segment) => [segment.segmentId, segment])), [segments]);

  // Keep the selected segment visible (auto-scroll) without fighting the user mid-drag.
  useEffect(() => {
    const element = scroller.current;
    const block = timeline.blocks.find((entry) => entry.segmentId === activeSegmentId);
    if (!element || !block || dragging.current) return;
    const left = block.startSec * pxPerSec + LABEL_WIDTH;
    const right = block.endSec * pxPerSec + LABEL_WIDTH;
    const viewLeft = element.scrollLeft;
    const viewRight = viewLeft + element.clientWidth;
    if (left < viewLeft + LABEL_WIDTH || right > viewRight) {
      element.scrollTo({ left: Math.max(0, left - LABEL_WIDTH - 24), behavior: "smooth" });
    }
  }, [activeSegmentId, pxPerSec, timeline.blocks]);

  // Follow the playhead during playback.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !playing) return;
    const x = timeSec * pxPerSec + LABEL_WIDTH;
    if (x < element.scrollLeft + LABEL_WIDTH || x > element.scrollLeft + element.clientWidth - 40) {
      element.scrollTo({ left: Math.max(0, x - element.clientWidth / 3) });
    }
  }, [timeSec, playing, pxPerSec]);

  const timeFromEvent = useCallback(
    (event: { clientX: number }) => {
      const element = scroller.current;
      if (!element) return 0;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left + element.scrollLeft - LABEL_WIDTH;
      return Math.max(0, Math.min(total, x / pxPerSec));
    },
    [pxPerSec, total]
  );

  const onRulerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    onSeek(timeFromEvent(event));
  };
  const onRulerPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onSeek(timeFromEvent(event));
  };
  const onRulerPointerUp = () => {
    dragging.current = false;
  };

  const ticks = useMemo(() => {
    const step = pxPerSec >= 60 ? 1 : pxPerSec >= 25 ? 5 : pxPerSec >= 8 ? 10 : pxPerSec >= 3 ? 30 : 60;
    const out: number[] = [];
    for (let t = 0; t <= total; t += step) out.push(t);
    return out;
  }, [pxPerSec, total]);

  const activeBlock = timeline.blocks.find((entry) => entry.segmentId === activeSegmentId) ?? null;

  return (
    <section className="border-t border-[#e5e7eb] bg-white" aria-label="Timeline">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onToggleCollapsed} className="inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide text-[#243447]">
            Timeline {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <button type="button" onClick={onPlayPause} className="grid size-8 place-items-center rounded-md border border-[#d8dde5] text-[#243447]" aria-label={playing ? "Pause preview" : "Play preview"}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <span className="text-sm font-bold tabular-nums text-[#526579]">
            {formatClock(timeSec)} / {formatClock(timeline.totalSec)}
          </span>
          <span className="hidden text-xs text-[#6b7c8f] sm:inline">Total Duration: {formatClock(timeline.totalSec)}</span>
        </div>
        {!collapsed && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setExpanded((value) => !value)} className="mr-2 hidden text-xs font-bold text-[#a64026] sm:inline" title="Show the visuals inside the selected segment">
              {expanded ? "Compact" : "Detail"}
            </button>
            <button type="button" onClick={() => setZoom((value) => Math.max(1, value / 1.5))} className="grid size-8 place-items-center rounded-md border border-[#d8dde5] text-[#243447]" aria-label="Zoom out"><Minus className="size-4" /></button>
            <span className="w-12 text-center text-xs font-bold tabular-nums text-[#526579]">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(16, value * 1.5))} className="grid size-8 place-items-center rounded-md border border-[#d8dde5] text-[#243447]" aria-label="Zoom in"><Plus className="size-4" /></button>
            <button type="button" onClick={() => setZoom(1)} className="ml-1 inline-flex h-8 items-center gap-1 rounded-md border border-[#d8dde5] px-2 text-xs font-bold text-[#243447]" title="Fit Lesson"><Maximize2 className="size-3.5" /> Fit</button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div ref={scroller} className="relative overflow-x-auto overflow-y-hidden pb-3 select-none" style={{ scrollbarWidth: "thin" }}>
          <div className="relative" style={{ width: trackWidth + LABEL_WIDTH + 16 }}>
            {/* Ruler */}
            <div
              className="relative h-6 cursor-pointer border-b border-[#edf0f3]"
              style={{ marginLeft: LABEL_WIDTH }}
              onPointerDown={onRulerPointerDown}
              onPointerMove={onRulerPointerMove}
              onPointerUp={onRulerPointerUp}
              onPointerCancel={onRulerPointerUp}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(total)}
              aria-valuenow={Math.round(timeSec)}
            >
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 text-[10px] tabular-nums text-[#8b9bad]" style={{ left: t * pxPerSec }}>
                  <span className="absolute left-0 top-4 h-2 w-px bg-[#c9d0da]" />
                  <span className="pl-1">{formatClock(t)}</span>
                </span>
              ))}
            </div>

            {/* Video track */}
            <Track label="Video" icon={Film} labelWidth={LABEL_WIDTH}>
              {timeline.blocks.map((block) => {
                const segment = segmentById.get(block.segmentId);
                if (!segment) return null;
                const isActive = block.segmentId === activeSegmentId;
                const showItems = expanded && isActive && block.items.length > 1;
                return (
                  <Block key={block.segmentId} block={block} pxPerSec={pxPerSec} active={isActive} onClick={() => onSelect(block.segmentId)} warnings={segment.warnings.filter((warning) => warning.code === "visual_missing" || warning.code === "video_timing")}>
                    {showItems ? (
                      <div className="flex h-full w-full">
                        {block.items.map((item, index) => {
                          const asset = assets[item.assetId];
                          return (
                            <div key={`${item.slotId}-${index}`} className="relative h-full overflow-hidden border-r border-white/60 last:border-r-0" style={{ width: `${(item.durationSec / block.durationSec) * 100}%` }} title={asset?.name}>
                              {asset && <Thumb asset={asset} atSec={item.sourceStartSec} />}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <BlockFace segment={segment} block={block} assets={assets} />
                    )}
                  </Block>
                );
              })}
            </Track>

            {/* Audio track */}
            <Track label="Audio" icon={Music2} labelWidth={LABEL_WIDTH}>
              {timeline.blocks.map((block) => {
                const segment = segmentById.get(block.segmentId);
                if (!segment) return null;
                const isActive = block.segmentId === activeSegmentId;
                const narration = segment.narration;
                const audioWarnings = segment.warnings.filter((warning) => warning.code.startsWith("narration") || warning.code.startsWith("translation"));
                return (
                  <Block key={block.segmentId} block={block} pxPerSec={pxPerSec} active={isActive} onClick={() => onSelect(block.segmentId)} warnings={audioWarnings}>
                    <div className="flex h-full w-full items-stretch">
                      {block.pauseBeforeSec > 0 && (
                        <div className="h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(36,52,71,0.08)_3px,rgba(36,52,71,0.08)_6px)]" style={{ width: `${(block.pauseBeforeSec / block.durationSec) * 100}%` }} title={`Quiet before voice ${block.pauseBeforeSec.toFixed(1)} sec`} />
                      )}
                      <div className={`h-full ${narration.url ? (isActive ? "text-[#a64026]" : "text-[#8a5a4c]") : "text-[#c9d0da]"}`} style={{ width: `${(block.narrationSec > 0 ? block.narrationSec : block.durationSec - block.pauseBeforeSec - block.pauseSec) / block.durationSec * 100}%` }} title={narration.url ? `${narration.source === "ai" ? "AI voice" : narration.source === "record" ? "Recording" : narration.source === "full" ? "Full narration" : "Uploaded audio"} · ${block.narrationSec.toFixed(1)} s` : "Narration missing"}>
                        {narration.url ? (
                          <Waveform url={narration.url} startSec={narration.startSec ?? 0} endSec={(narration.startSec ?? 0) + narration.durationSec} seed={segment.key} />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] font-bold uppercase tracking-wide text-[#8b9bad]">No narration</div>
                        )}
                      </div>
                      {block.pauseSec > 0 && (
                        <div className="h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(36,52,71,0.08)_3px,rgba(36,52,71,0.08)_6px)]" style={{ width: `${(block.pauseSec / block.durationSec) * 100}%` }} title={`Quiet after voice ${block.pauseSec.toFixed(1)} sec`} />
                      )}
                    </div>
                  </Block>
                );
              })}
            </Track>

            {/* Playhead */}
            <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-[#a64026]" style={{ left: LABEL_WIDTH + timeSec * pxPerSec }}>
              <span className="absolute -left-[5px] top-0 size-[11px] rounded-full bg-[#a64026]" />
            </div>
          </div>
        </div>
      )}
      {!collapsed && activeBlock && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#edf0f3] px-3 py-1.5 text-xs text-[#6b7c8f] sm:px-4">
          <span className="font-bold text-[#243447]">{activeBlock.title}</span>
          <span>Starts {formatClock(activeBlock.startSec)}</span>
          {activeBlock.pauseBeforeSec > 0 && <span>Before voice {activeBlock.pauseBeforeSec.toFixed(1)} s</span>}
          <span>Narration {activeBlock.narrationSec.toFixed(1)} s</span>
          <span>After voice {activeBlock.pauseSec.toFixed(1)} s</span>
          <span>Segment {activeBlock.durationSec.toFixed(1)} s</span>
        </div>
      )}
    </section>
  );
}

function Track({ label, icon: Icon, labelWidth, children }: { label: string; icon: typeof Film; labelWidth: number; children: React.ReactNode }) {
  return (
    <div className="relative flex h-14 items-stretch border-b border-[#edf0f3] last:border-b-0">
      <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1 bg-white pl-3 text-[10px] font-extrabold uppercase tracking-wide text-[#6b7c8f]" style={{ width: labelWidth }}>
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

function Block({ block, pxPerSec, active, onClick, warnings, children }: { block: TimelineBlock; pxPerSec: number; active: boolean; onClick: () => void; warnings: ProjectSegmentDto["warnings"]; children: React.ReactNode }) {
  const width = Math.max(6, block.durationSec * pxPerSec - 2);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute inset-y-1 overflow-hidden rounded-md border text-left transition ${active ? "border-[#a64026] bg-[#fbeaea] ring-2 ring-[#a64026]/25" : block.index % 2 === 0 ? "border-[#d8dde5] bg-[#f7f8fa] hover:border-[#c9d0da]" : "border-[#d8dde5] bg-[#f2f4f7] hover:border-[#c9d0da]"}`}
      style={{ left: block.startSec * pxPerSec, width }}
      title={`${block.title} · ${block.durationSec.toFixed(1)} s${warnings.length ? ` · ${warnings.map((warning) => warning.message).join("; ")}` : ""}`}
      aria-pressed={active}
    >
      {children}
      {warnings.length > 0 && (
        <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-amber-500 text-white" aria-label={warnings.map((warning) => warning.message).join(", ")}>
          <AlertTriangle className="size-2.5" />
        </span>
      )}
    </button>
  );
}

function BlockFace({ segment, block, assets }: { segment: ProjectSegmentDto; block: TimelineBlock; assets: Record<string, import("@/lib/studio/types").StudioAssetDto> }) {
  const first = block.items[0] ? assets[block.items[0].assetId] : null;
  const mixed = block.items.length > 1;
  return (
    <div className="flex h-full w-full items-center gap-2 pl-1 pr-5">
      <span className="relative h-full w-12 shrink-0 overflow-hidden rounded-sm bg-[#e5e7eb]">
        {first ? <Thumb asset={first} atSec={block.items[0]?.sourceStartSec ?? 0} /> : <span className="grid h-full w-full place-items-center text-[#8b9bad]"><ImageIcon className="size-3.5" /></span>}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-extrabold text-[#243447]">
          {String(block.index + 1).padStart(2, "0")} {segment.title}
        </span>
        <span className="block truncate text-[10px] text-[#6b7c8f]">
          {mixed ? `${block.items.length} visuals` : first ? first.kind === "video" ? "Video" : "Image" : "No visual"} · {block.durationSec.toFixed(1)} s
        </span>
      </span>
    </div>
  );
}

function Thumb({ asset, atSec = 0 }: { asset: import("@/lib/studio/types").StudioAssetDto; atSec?: number }) {
  // A master video reused per segment shows the frame at that segment's own offset (media fragment).
  if (asset.kind === "video" && atSec > 0) return <video src={`${asset.url}#t=${atSec.toFixed(2)}`} muted preload="metadata" className="h-full w-full object-cover" />;
  const src = asset.thumbnailUrl || (asset.kind === "image" ? asset.url : null);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />;
  }
  return <video src={asset.url} muted preload="metadata" className="h-full w-full object-cover" />;
}
