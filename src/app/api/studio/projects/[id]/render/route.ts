import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { enqueueRenderJob, JOB_ACTIVE_STATUSES, jobToDto } from "@/lib/studio/services/jobs";

type Params = { params: Promise<{ id: string }> };

/** Generate Video. Refuses when segments are incomplete so educators are not surprised by a broken render. */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const body = await readJson<{ quality?: string; allowIncomplete?: boolean }>(request);
  const quality = body.quality === "720p" ? "720p" : "1080p";
  const project = await loadProjectDto(id, user);
  if (!project) throw new StudioError("That localization project could not be found.", 404);
  const blocking = project.segments.filter((segment) => segment.warnings.some((warning) => warning.code === "narration_missing" || warning.code === "visual_missing" || warning.code === "translation_missing"));
  if (blocking.length && !body.allowIncomplete) {
    throw new StudioError(`${blocking.length} segment${blocking.length === 1 ? " is" : "s are"} not ready: ${blocking.slice(0, 3).map((segment) => segment.title).join(", ")}${blocking.length > 3 ? "…" : ""}. Fix them or choose "Generate anyway".`, 409);
  }
  const { job, reused } = await enqueueRenderJob({ projectId: id, userId: user.id, quality });
  return ok({ job: await jobToDto(job), reused, project: await loadProjectDto(id, user) }, { status: reused ? 200 : 201 });
});

export const GET = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const jobs = await prisma.studioJob.findMany({ where: { projectId: id, type: "render" }, orderBy: { createdAt: "desc" }, take: 5 });
  const active = jobs.find((job) => JOB_ACTIVE_STATUSES.includes(job.status as (typeof JOB_ACTIVE_STATUSES)[number]));
  return ok({ jobs: await Promise.all(jobs.map(jobToDto)), active: active ? await jobToDto(active) : null });
});
