import { prisma } from "@/lib/prisma";
import { alignFullNarration } from "@/worker/align";
import { renderProject, type RenderQuality } from "@/worker/render";

/**
 * Claim and run one StudioJob. Safe to call from the standalone worker loop
 * or inline from the web app in development. Raw errors are kept in
 * `errorDetail` for administrators; educators only see `error`.
 */
export async function processJob(jobId: string, workerId: string) {
  const claimed = await prisma.studioJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "preparing", lockedBy: workerId, lockedAt: new Date(), startedAt: new Date(), attempts: { increment: 1 }, progress: 1, stage: "Starting" }
  });
  if (claimed.count === 0) return null;
  const job = await prisma.studioJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const progress = async (value: number, stage: string) => {
    const current = await prisma.studioJob.findUnique({ where: { id: job.id }, select: { status: true } });
    if (current?.status === "cancelled") throw new JobCancelled();
    const status = value >= 90 ? "finalizing" : value >= 5 ? "rendering" : "preparing";
    await prisma.studioJob.update({ where: { id: job.id }, data: { progress: Math.min(99, Math.max(1, Math.round(value))), stage, status } });
  };

  try {
    const payload = JSON.parse(job.payload || "{}") as Record<string, unknown>;
    if (job.type === "render") {
      const quality: RenderQuality = payload.quality === "720p" ? "720p" : "1080p";
      const asset = await renderProject({ projectId: job.projectId, userId: job.createdById, quality, progress });
      await prisma.$transaction([
        prisma.studioJob.update({ where: { id: job.id }, data: { status: "complete", progress: 100, stage: "Video ready", outputAssetId: asset.id, finishedAt: new Date(), error: null, errorDetail: null } }),
        prisma.studioProject.update({ where: { id: job.projectId }, data: { renderedAssetId: asset.id, status: "ready", renderQuality: quality } })
      ]);
    } else if (job.type === "align") {
      const fullNarrationId = String(payload.fullNarrationId || "");
      await alignFullNarration({ fullNarrationId, progress });
      await prisma.studioJob.update({ where: { id: job.id }, data: { status: "complete", progress: 100, stage: "Narration aligned", finishedAt: new Date(), error: null, errorDetail: null } });
    } else {
      throw new Error(`Unknown job type ${job.type}`);
    }
    return await prisma.studioJob.findUnique({ where: { id: job.id } });
  } catch (error) {
    if (error instanceof JobCancelled) {
      return prisma.studioJob.findUnique({ where: { id: job.id } });
    }
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    console.error(`[worker] job ${job.id} (${job.type}) failed:`, detail.slice(0, 2000));
    const friendly = job.type === "render"
      ? "The video could not be generated. Please check that every segment has a visual and narration, then try again."
      : "The recording could not be aligned automatically. You can still record or upload each segment.";
    await prisma.studioJob.update({ where: { id: job.id }, data: { status: "failed", stage: "Failed", error: friendly, errorDetail: detail.slice(0, 8000), finishedAt: new Date() } });
    if (job.type === "render") {
      await prisma.studioProject.updateMany({ where: { id: job.projectId, status: "rendering" }, data: { status: "in_progress" } });
    }
    return prisma.studioJob.findUnique({ where: { id: job.id } });
  }
}

class JobCancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

/** Requeue jobs whose worker disappeared mid-run. */
export async function recoverStaleJobs(staleAfterMs: number) {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const stale = await prisma.studioJob.updateMany({
    where: { status: { in: ["preparing", "rendering", "finalizing"] }, lockedAt: { lt: cutoff }, attempts: { lt: 3 } },
    data: { status: "queued", lockedBy: null, lockedAt: null, stage: "Waiting for the render worker" }
  });
  const abandoned = await prisma.studioJob.updateMany({
    where: { status: { in: ["preparing", "rendering", "finalizing"] }, lockedAt: { lt: cutoff }, attempts: { gte: 3 } },
    data: { status: "failed", stage: "Failed", error: "The job stopped unexpectedly more than once. Please try again or contact MLP support.", finishedAt: new Date() }
  });
  return { requeued: stale.count, abandoned: abandoned.count };
}
