"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { formatClock } from "@/lib/studio/timing";
import type { ProjectDto } from "@/lib/studio/types";

/** Left column: the segment navigator. Same active state as the timeline and panels. */
export function SegmentList({ project, activeSegmentId, onSelect }: { project: ProjectDto; activeSegmentId: string; onSelect: (segmentId: string) => void }) {
  const ready = project.segments.filter((segment) => segment.narration.status === "ready").length;
  const pct = project.segments.length ? Math.round((ready / project.segments.length) * 100) : 0;
  const listRef = useRef<HTMLDivElement | null>(null);

  // Scroll only the list itself; scrollIntoView would also drag the overflow-hidden workspace.
  useEffect(() => {
    const list = listRef.current;
    const element = list?.querySelector<HTMLElement>(`[data-segment="${activeSegmentId}"]`);
    if (!list || !element) return;
    const top = element.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top - 8;
    else if (top + element.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + element.offsetHeight - list.clientHeight + 8;
  }, [activeSegmentId]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#edf0f3] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wide text-[#243447]">Segments</span>
          <span className="text-xs font-extrabold text-[#a64026]">{ready}/{project.segments.length}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f2f4f7]">
          <div className="h-full rounded-full bg-[#a64026]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div ref={listRef} className="relative flex-1 overflow-y-auto p-2">
        {project.segments.map((segment, index) => {
          const block = project.timeline.blocks.find((entry) => entry.segmentId === segment.segmentId);
          const active = segment.segmentId === activeSegmentId;
          const problem = segment.warnings.length > 0;
          const done = !problem && (segment.approvedAt || segment.narration.status === "ready");
          const Icon = done ? CheckCircle2 : problem && (segment.narration.status === "needs_update" || segment.narration.status === "needs_review") ? AlertCircle : Circle;
          const iconClass = done ? "text-green-600" : problem && (segment.narration.status === "needs_update" || segment.narration.status === "needs_review") ? "text-red-500" : "text-[#c9d0da]";
          return (
            <button
              key={segment.segmentId}
              type="button"
              data-segment={segment.segmentId}
              onClick={() => onSelect(segment.segmentId)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${active ? "bg-[#fbeaea] font-extrabold text-[#243447] ring-1 ring-[#e5ccd0]" : "font-semibold text-[#526579] hover:bg-[#f7f8fa]"}`}
              aria-current={active ? "true" : undefined}
              title={segment.warnings.map((warning) => warning.message).join(", ") || segment.title}
            >
              <Icon className={`size-4 shrink-0 ${iconClass}`} />
              <span className="w-6 shrink-0 tabular-nums text-[#8b9bad]">{String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate">{segment.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-[#8b9bad]">{block && segment.narration.durationSec > 0 ? formatClock(block.durationSec) : "–:––"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
