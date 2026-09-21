import type { StudioJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JobDto } from "@/lib/studio/types";

/**
 * RenderService / job queue. Jobs are rows in StudioJob; a separate worker
 * (src/worker) claims and runs them because Netlify functions cannot run
 * FFmpeg or long transcriptions. In development, STUDIO_INLINE_WORKER=true
 * runs the worker inside the Next process right after a job is created.
 */

export const JOB_ACTIVE_STATUSES = ["queued", "preparing", "rendering", "finalizing"] as const;

export async function jobToDto(job: StudioJob): Promise<JobDto> {
  const output = job.outputAssetId ? await prisma.studioAsset.findUnique({ where: { id: job.outputAssetId } }) : null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
    outputAssetUrl: output?.url ?? null,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null
  };
}

export async function enqueueRenderJob(options: { projectId: string; userId: string; quality: "1080p" | "720p" }) {
  // Duplicate protection: reuse an active render for the same project.
  const active = await prisma.studioJob.findFirst({
    where: { projectId: options.projectId, type: "render", status: { in: [...JOB_ACTIVE_STATUSES] } },
    orderBy: { createdAt: "desc" }
  });
  if (active) return { job: active, reused: true };
  const job = await prisma.studioJob.create({
    data: {
      type: "render",
      status: "queued",
      projectId: options.projectId,
      payload: JSON.stringify({ quality: options.quality }),
      createdById: options.userId,
      stage: "Waiting for the render worker"
    }
  });
  await prisma.studioProject.update({ where: { id: options.projectId }, data: { latestRenderJobId: job.id, renderQuality: options.quality, status: "rendering" } });
  void kickInlineWorker(job.id);
  return { job, reused: false };
}

export async function enqueueAlignJob(options: { projectId: string; fullNarrationId: string; userId: string }) {
  const active = await prisma.studioJob.findFirst({
    where: { projectId: options.projectId, type: "align", status: { in: [...JOB_ACTIVE_STATUSES] } }
  });
  if (active) return { job: active, reused: true };
  const job = await prisma.studioJob.create({
    data: {
      type: "align",
      status: "queued",
      projectId: options.projectId,
      payload: JSON.stringify({ fullNarrationId: options.fullNarrationId }),
      createdById: options.userId,
      stage: "Waiting for the alignment worker"
    }
  });
  await prisma.studioFullNarration.update({ where: { id: options.fullNarrationId }, data: { status: "aligning", error: null } });
  void kickInlineWorker(job.id);
  return { job, reused: false };
}

export async function cancelJob(jobId: string) {
  const job = await prisma.studioJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (!JOB_ACTIVE_STATUSES.includes(job.status as (typeof JOB_ACTIVE_STATUSES)[number])) return job;
  const updated = await prisma.studioJob.update({ where: { id: jobId }, data: { status: "cancelled", finishedAt: new Date(), stage: "Cancelled" } });
  if (job.type === "render") {
    await prisma.studioProject.updateMany({ where: { id: job.projectId, status: "rendering" }, data: { status: "in_progress" } });
  }
  return updated;
}

/** Development convenience: run the worker in-process so no second terminal is needed. */
async function kickInlineWorker(jobId: string) {
  if (process.env.STUDIO_INLINE_WORKER !== "true") return;
  try {
    const worker = await import("@/worker/process-job");
    void worker.processJob(jobId, `inline-${process.pid}`).catch((error) => console.error("[studio] inline job failed", error));
  } catch (error) {
    console.error("[studio] inline worker unavailable", error);
  }
}
