"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clapperboard, HelpCircle, RefreshCw } from "lucide-react";
import { InlineNotice } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import type { JobDto, ProjectDto } from "@/lib/studio/types";

const ACTIVE = ["queued", "preparing", "rendering", "finalizing"];

export function useJobPolling(jobId: string | null, onFinished?: (job: JobDto, project?: ProjectDto) => void) {
  const [state, setState] = useState<{ jobId: string | null; job: JobDto | null }>({ jobId: null, job: null });
  const finished = useRef(false);
  useEffect(() => {
    if (!jobId) return;
    finished.current = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const data = await api<{ job: JobDto; project?: ProjectDto }>(`/api/studio/jobs/${jobId}?project=1`);
        if (cancelled) return;
        setState({ jobId, job: data.job });
        if (!ACTIVE.includes(data.job.status)) {
          if (!finished.current) {
            finished.current = true;
            onFinished?.(data.job, data.project);
          }
          return;
        }
      } catch {
        // transient — keep polling
      }
      timer = setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  return state.jobId === jobId ? state.job : null;
}

/** "Generating Your Video" screen: three friendly stages, an estimate, and Cancel. */
export function RenderProgress({ job, project, onCancel, onClose }: { job: JobDto | null; project: ProjectDto; onCancel: () => void; onClose: () => void }) {
  const progress = job?.progress ?? 0;
  const stages = [
    { label: "Preparing Media Assets", detail: "Optimizing images and video clips", done: progress > 5, active: progress > 0 && progress <= 5 },
    { label: "Building Video Composition", detail: "Synchronizing visuals with narration", done: progress >= 90, active: progress > 5 && progress < 90 },
    { label: "Finalizing Render", detail: `Encoding high-quality ${project.renderQuality} video`, done: job?.status === "complete", active: progress >= 90 && job?.status !== "complete" }
  ];
  const remainingMin = Math.max(1, Math.ceil(((100 - progress) / 100) * Math.max(1, project.timeline.totalSec / 30)));
  const failed = job?.status === "failed" || job?.status === "cancelled";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#f7f8fa]/95 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-[0_20px_45px_rgba(36,52,71,0.10)] ring-1 ring-[#edf0f3] sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-16 place-items-center rounded-full bg-[#fbeaea] text-[#243447]"><Clapperboard className="size-7" /></span>
          <h2 className="mt-4 text-2xl font-extrabold text-[#243447]">{failed ? (job?.status === "cancelled" ? "Generation cancelled" : "Video could not be generated") : job?.status === "complete" ? "Video Ready" : "Generating Your Video"}</h2>
          <p className="mt-1 text-sm text-[#6b7c8f]">{project.title}</p>
          <p className="text-xs font-bold text-[#a64026]">{project.targetLanguageName}{project.region ? ` · ${project.region}` : ""}</p>
        </div>
        <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-[#f2f4f7]">
          <div className={`h-full rounded-full transition-all ${failed ? "bg-red-400" : "bg-[#c47a5a]"}`} style={{ width: `${Math.max(3, progress)}%` }} />
        </div>
        <ul className="mt-5 space-y-3">
          {stages.map((stage) => (
            <li key={stage.label} className="flex items-center gap-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${stage.done ? "bg-green-700 text-white" : stage.active ? "bg-[#c47a5a] text-white" : "bg-[#f2f4f7] text-[#8b9bad]"}`}>
                {stage.done ? <Check className="size-4" /> : stage.active ? <RefreshCw className="size-4 animate-spin" /> : <HelpCircle className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${stage.active ? "font-extrabold text-[#243447]" : "font-semibold text-[#526579]"}`}>{stage.label}</span>
                <span className="block text-xs text-[#6b7c8f]">{stage.active && job?.stage ? job.stage : stage.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {failed && job?.error && (
          <div className="mt-5">
            <InlineNotice tone="error">{job.error}</InlineNotice>
          </div>
        )}
        <div className="mt-6 flex items-center justify-between border-t border-[#edf0f3] pt-4">
          <div>
            {!failed && job?.status !== "complete" && (
              <>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#6b7c8f]">Estimated remaining</div>
                <div className="text-lg font-extrabold text-[#243447]">{remainingMin} minute{remainingMin === 1 ? "" : "s"}</div>
              </>
            )}
          </div>
          {failed || job?.status === "complete" ? (
            <button type="button" onClick={onClose} className="mlp-btn-primary">{job?.status === "complete" ? "Watch video" : "Back to review"}</button>
          ) : (
            <button type="button" onClick={onCancel} className="text-sm font-bold text-[#a64026]">Cancel</button>
          )}
        </div>
        {!failed && job?.status !== "complete" && (
          <p className="mt-4 text-center text-xs text-[#6b7c8f]">You can leave this page — the video keeps generating and will be waiting under Review &amp; Generate.</p>
        )}
      </div>
    </div>
  );
}
