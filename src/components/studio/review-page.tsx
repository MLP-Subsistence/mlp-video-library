"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clapperboard, Download, FileText, Globe2, PlayCircle, RotateCcw } from "lucide-react";
import { RenderProgress, useJobPolling } from "@/components/studio/job-progress";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { InlineNotice, Spinner, StatusPill } from "@/components/studio/ui";
import { summarizeProject } from "@/components/studio/workspace/use-project";
import { api } from "@/lib/studio/client";
import { formatClock } from "@/lib/studio/timing";
import type { JobDto, ProjectDto } from "@/lib/studio/types";

/**
 * Review & Generate: "30 Ready / 2 Need Review", one-click links back to the
 * segment that needs attention, the two-option quality picker, Generate
 * Video, playback, approval and (for staff) publishing to the library.
 */
export function ReviewPage({ initial, activeJob }: { initial: ProjectDto; activeJob: JobDto | null }) {
  const [project, setProject] = useState(initial);
  const [quality, setQuality] = useState<"1080p" | "720p">(initial.renderQuality);
  const [jobId, setJobId] = useState<string | null>(activeJob?.id ?? null);
  const [showProgress, setShowProgress] = useState(Boolean(activeJob));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "warning" | "error"; text: string } | null>(null);
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);
  const summary = summarizeProject(project);
  const needReview = project.segments.filter((segment) => segment.warnings.length > 0);

  const job = useJobPolling(jobId, (finished, refreshed) => {
    if (refreshed) setProject(refreshed);
    if (finished.status === "complete") setNotice({ tone: "success", text: "Your video is ready. Watch it below, then approve it." });
  });

  const generate = async (allowIncomplete = false) => {
    setBusy("render");
    setNotice(null);
    try {
      const result = await api<{ job: JobDto; project: ProjectDto; reused: boolean }>(`/api/studio/projects/${project.id}/render`, { method: "POST", json: { quality, allowIncomplete } });
      setProject(result.project);
      setJobId(result.job.id);
      setShowProgress(true);
      setConfirmIncomplete(false);
    } catch (caught) {
      const error = caught as Error & { status?: number };
      if (error.status === 409 && needReview.length) setConfirmIncomplete(true);
      setNotice({ tone: "error", text: error.message });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!jobId) return;
    await api(`/api/studio/jobs/${jobId}`, { method: "DELETE" }).catch(() => undefined);
    setShowProgress(false);
    setJobId(null);
    const refreshed = await api<{ project: ProjectDto }>(`/api/studio/projects/${project.id}`).catch(() => null);
    if (refreshed) setProject(refreshed.project);
  };

  const act = async (action: "approve" | "reopen" | "publish") => {
    setBusy(action);
    setNotice(null);
    try {
      const result = await api<{ project: ProjectDto; videoId?: string }>(`/api/studio/projects/${project.id}/publish`, { method: "POST", json: { action } });
      setProject(result.project);
      if (action === "publish") setNotice({ tone: "success", text: "Published to the Marketplace Literacy library." });
      if (action === "approve") setNotice({ tone: "success", text: "Video approved." });
    } catch (caught) {
      setNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const rendering = job && ["queued", "preparing", "rendering", "finalizing"].includes(job.status);
  const videoReady = Boolean(project.renderedAssetUrl) && !rendering;
  const isApproved = Boolean(project.approvedAt);

  return (
    <>
      <StudioPageHeader
        title="Review & Generate"
        subtitle={`${project.title} · ${project.targetLanguageName} · ${formatClock(project.timeline.totalSec)} total`}
        actions={
          <Link href={`/studio/projects/${project.id}`} className="mlp-btn-outline h-10"><ArrowLeft className="size-4" /> Workspace</Link>
        }
      />
      <main className="space-y-6 px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        {notice && <InlineNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Ready" value={summary.total - summary.needReview} note="Segments with translation, narration and visuals" tone="ready" />
          <Stat label="Need Review" value={summary.needReview} note={summary.needReview ? "Click a segment below to fix it" : "All clear"} tone={summary.needReview ? "warning" : "ready"} />
          <Stat label="Total Duration" value={formatClock(project.timeline.totalSec)} note={`${summary.total} segments · narration leads timing`} tone="muted" />
        </div>

        {needReview.length > 0 && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#243447]"><AlertTriangle className="size-5 text-amber-600" /> Segments that need attention</h2>
            <ul className="mt-3 divide-y divide-[#f2f4f7]">
              {needReview.map((segment, index) => (
                <li key={segment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-extrabold text-[#243447]">{String(project.segments.indexOf(segment) + 1).padStart(2, "0")} {segment.title}</span>
                    <span className="ml-2 text-sm text-[#6b7c8f]">{segment.warnings.map((warning) => warning.message).join(" · ")}</span>
                  </span>
                  <Link href={`/studio/projects/${project.id}?segment=${segment.segmentId}`} className="mlp-btn-outline h-9 px-3 text-xs">Review Segment {index + 1 > 0 ? String(project.segments.indexOf(segment) + 1).padStart(2, "0") : ""}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            {videoReady && project.renderedAssetUrl ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#243447]"><CheckCircle2 className="size-5 text-green-700" /> Video Ready</h2>
                  <StatusPill tone={project.status === "published" ? "ready" : isApproved ? "ready" : "accent"}>{project.status === "published" ? "Published" : isApproved ? "Approved" : project.renderQuality}</StatusPill>
                </div>
                <video src={project.renderedAssetUrl} controls playsInline preload="metadata" className="mt-4 aspect-video w-full rounded-xl bg-black" />
                <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                  {!isApproved ? (
                    <button type="button" onClick={() => act("approve")} disabled={busy !== null} className="mlp-btn-primary">{busy === "approve" ? <Spinner /> : <Check className="size-4" />} Approve video</button>
                  ) : (
                    <button type="button" onClick={() => act("reopen")} disabled={busy !== null || project.status === "published"} className="mlp-btn-outline"><RotateCcw className="size-4" /> Return to editing</button>
                  )}
                  {project.permissions.canPublish && isApproved && project.status !== "published" && (
                    <button type="button" onClick={() => act("publish")} disabled={busy !== null} className="mlp-btn-dark min-h-11 rounded-lg px-5">{busy === "publish" ? <Spinner /> : <Globe2 className="size-4" />} Publish to library</button>
                  )}
                  {project.publishedVideoId && (
                    <Link href={`/videos/${project.publishedVideoId}`} className="mlp-btn-outline" target="_blank"><Globe2 className="size-4" /> View in library</Link>
                  )}
                  <a href={project.renderedAssetUrl} download className="mlp-btn-outline"><Download className="size-4" /> Download MP4</a>
                  <button type="button" onClick={() => generate(false)} disabled={busy !== null} className="mlp-btn-outline"><Clapperboard className="size-4" /> Generate again</button>
                </div>
                {project.status === "in_progress" && <p className="mt-3 text-xs text-[#6b7c8f]">Segments changed since this video was generated. Generate again before approving.</p>}
              </>
            ) : (
              <>
                <h2 className="text-lg font-extrabold text-[#243447]">Generate the video</h2>
                <p className="mt-1 text-sm text-[#6b7c8f]">The video is assembled from your approved narration and visuals. Nothing is published until you approve it.</p>
                <fieldset className="mt-5">
                  <legend className="text-sm font-extrabold text-[#243447]">Video Quality</legend>
                  {(
                    [
                      ["1080p", "Recommended"],
                      ["720p", "Smaller file"]
                    ] as const
                  ).map(([value, hint]) => (
                    <label key={value} className={`mt-2 flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${quality === value ? "border-[#a64026] bg-[#fbeaea]/60" : "border-[#d8dde5]"}`}>
                      <input type="radio" name="quality" value={value} checked={quality === value} onChange={() => setQuality(value)} className="accent-[#a64026]" />
                      <span>
                        <span className="block text-sm font-extrabold text-[#243447]">{value}</span>
                        <span className="block text-xs text-[#6b7c8f]">{hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {confirmIncomplete && (
                  <div className="mt-4"><InlineNotice tone="warning">Some segments are incomplete. You can still generate a draft video (missing visuals show as blank, missing narration as silence).</InlineNotice></div>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => generate(false)} disabled={busy !== null || Boolean(rendering)} className="mlp-btn-primary">
                    {busy === "render" ? <Spinner /> : <Clapperboard className="size-4" />} Generate Video
                  </button>
                  {confirmIncomplete && (
                    <button type="button" onClick={() => generate(true)} disabled={busy !== null} className="mlp-btn-outline">Generate anyway</button>
                  )}
                  {rendering && (
                    <button type="button" onClick={() => setShowProgress(true)} className="mlp-btn-outline"><PlayCircle className="size-4" /> Show progress</button>
                  )}
                </div>
                {job?.status === "failed" && <div className="mt-4"><InlineNotice tone="error">{job.error}</InlineNotice></div>}
              </>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#243447]"><FileText className="size-5 text-[#a64026]" /> Script export</h2>
              <p className="mt-1 text-xs text-[#6b7c8f]">Approved translations with segment structure.</p>
              <div className="mt-3 grid gap-2">
                <a href={`/api/studio/projects/${project.id}/export?format=docx`} className="mlp-btn-outline"><Download className="size-4" /> Download DOCX</a>
                <a href={`/api/studio/projects/${project.id}/export?format=html&print=1`} target="_blank" rel="noreferrer" className="mlp-btn-outline"><Download className="size-4" /> Print / Save as PDF</a>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] text-sm text-[#526579]">
              <h2 className="text-lg font-extrabold text-[#243447]">Checklist</h2>
              <ul className="mt-3 space-y-2">
                <Item ok={summary.translationApproved === summary.total}>Translations approved ({summary.translationApproved}/{summary.total})</Item>
                <Item ok={summary.narrationReady === summary.total}>Narration ready ({summary.narrationReady}/{summary.total})</Item>
                <Item ok={!project.segments.some((segment) => segment.warnings.some((warning) => warning.code === "visual_missing"))}>Every segment has a visual</Item>
                <Item ok={videoReady}>Video generated</Item>
                <Item ok={isApproved}>Video approved</Item>
                {project.permissions.canPublish && <Item ok={project.status === "published"}>Published to library</Item>}
              </ul>
            </div>
          </aside>
        </div>
      </main>
      {showProgress && (
        <RenderProgress
          job={job}
          project={project}
          onCancel={cancel}
          onClose={() => {
            setShowProgress(false);
            if (job?.status !== "complete") setJobId(null);
          }}
        />
      )}
    </>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: number | string; note: string; tone: "ready" | "warning" | "muted" }) {
  const color = tone === "ready" ? "text-green-700" : tone === "warning" ? "text-amber-700" : "text-[#243447]";
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
      <div className="text-sm font-bold text-[#526579]">{label}</div>
      <div className={`mt-2 text-3xl font-extrabold ${color}`}>{value}</div>
      <div className="mt-2 text-xs text-[#6b7c8f]">{note}</div>
    </div>
  );
}

function Item({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 grid size-4 place-items-center rounded-full ${ok ? "bg-green-600 text-white" : "border border-[#c9d0da]"}`}>{ok && <Check className="size-3" />}</span>
      <span className={ok ? "text-[#243447]" : ""}>{children}</span>
    </li>
  );
}
