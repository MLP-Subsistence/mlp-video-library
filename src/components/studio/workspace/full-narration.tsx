"use client";

import { useState } from "react";
import { FileAudio, Upload } from "lucide-react";
import { useJobPolling } from "@/components/studio/job-progress";
import { InlineNotice, Modal, Spinner } from "@/components/studio/ui";
import { api, kindForFile, uploadAsset } from "@/lib/studio/client";
import type { JobDto, ProjectDto } from "@/lib/studio/types";

/**
 * Import Full Narration: upload one complete recording; the worker aligns it
 * to the approved script and fills in every segment's boundaries.
 */
export function FullNarrationModal({ open, onClose, project, onProject }: { open: boolean; onClose: () => void; project: ProjectDto; onProject: (project: ProjectDto) => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const translated = project.segments.filter((segment) => segment.translation.trim()).length;
  const approved = project.segments.filter((segment) => segment.translationStatus === "approved").length;

  const job = useJobPolling(jobId, (finished: JobDto, refreshed?: ProjectDto) => {
    if (refreshed) onProject(refreshed);
    if (finished.status === "complete") {
      setJobId(null);
      onClose();
    }
  });

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (kindForFile(file) !== "audio") {
      setError("Please choose a WAV, MP3, M4A, OGG or WebM audio file.");
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const asset = await uploadAsset(file, { kind: "audio", folder: `projects/${project.id}/narration`, tags: "narration, full", onProgress: setProgress });
      const result = await api<{ job: JobDto; project: ProjectDto }>(`/api/studio/projects/${project.id}/full-narration`, { method: "POST", json: { assetId: asset.id } });
      onProject(result.project);
      setJobId(result.job.id);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setProgress(null);
    }
  }

  const aligning = job && ["queued", "preparing", "rendering", "finalizing"].includes(job.status);

  return (
    <Modal open={open} onClose={onClose} title="Import Full Narration" description="Upload one recording of the whole lesson. We split it into segments for you.">
      {error && (
        <div className="mb-4">
          <InlineNotice tone="error" onDismiss={() => setError(null)}>{error}</InlineNotice>
        </div>
      )}
      {translated === 0 ? (
        <InlineNotice tone="warning">Translate the lesson first so the recording can be matched to the script.</InlineNotice>
      ) : (
        <p className="text-sm text-[#6b7c8f]">
          {approved < translated ? `${translated - approved} translation${translated - approved === 1 ? " is" : "s are"} not approved yet — the recording will still be matched against the current text.` : "All translations are approved."} Read the segments in order, in one take, with a short pause between them.
        </p>
      )}
      <div className="mt-4">
        {aligning ? (
          <div className="rounded-xl border border-[#d8dde5] bg-[#f7f8fa] p-6 text-center">
            <Spinner className="mx-auto size-6 text-[#a64026]" />
            <p className="mt-3 text-sm font-extrabold text-[#243447]">{job?.stage || "Aligning the recording…"}</p>
            <p className="mt-1 text-xs text-[#6b7c8f]">This can take a few minutes for long lessons. You can close this window; segments update automatically when it finishes.</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5e7eb]"><div className="h-full bg-[#a64026] transition-all" style={{ width: `${job?.progress ?? 0}%` }} /></div>
          </div>
        ) : job?.status === "failed" ? (
          <InlineNotice tone="error">{job.error || "The recording could not be aligned."}</InlineNotice>
        ) : (
          <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#d8dde5] bg-[#f7f8fa] p-8 text-center ${progress !== null || translated === 0 ? "opacity-60" : "hover:border-[#a64026]/50"}`}>
            {progress !== null ? <Spinner className="size-6" /> : <FileAudio className="size-7 text-[#a64026]" />}
            <span className="text-sm font-bold text-[#243447]">{progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : "Choose the full narration recording"}</span>
            <span className="text-xs text-[#6b7c8f]">WAV, MP3, M4A, OGG or WebM · up to 512 MB</span>
            <input type="file" accept="audio/*" className="hidden" disabled={progress !== null || translated === 0} onChange={(event) => void handleFile(event.target.files)} />
          </label>
        )}
      </div>
      {project.fullNarration && !aligning && (
        <p className="mt-4 text-xs text-[#6b7c8f]">
          <Upload className="mr-1 inline size-3" /> Last import: {new Date(project.fullNarration.createdAt).toLocaleString()} · {project.fullNarration.status === "aligned" ? "aligned" : project.fullNarration.status}
        </p>
      )}
    </Modal>
  );
}
