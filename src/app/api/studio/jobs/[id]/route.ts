import { prisma } from "@/lib/prisma";
import { ok, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { cancelJob, jobToDto } from "@/lib/studio/services/jobs";

type Params = { params: Promise<{ id: string }> };

/** Polled by the "Generating Your Video" screen. Includes the project when the job is finished so the UI can refresh. */
export const GET = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  const job = await prisma.studioJob.findUnique({ where: { id } });
  if (!job) throw new StudioError("That job could not be found.", 404);
  await requireProjectAccess(user, job.projectId);
  const url = new URL(request.url);
  const done = !["queued", "preparing", "rendering", "finalizing"].includes(job.status);
  const includeProject = url.searchParams.get("project") === "1" && done;
  return ok({ job: await jobToDto(job), project: includeProject ? await loadProjectDto(job.projectId, user) : undefined });
});

export const DELETE = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  const job = await prisma.studioJob.findUnique({ where: { id } });
  if (!job) throw new StudioError("That job could not be found.", 404);
  await requireProjectAccess(user, job.projectId);
  const cancelled = await cancelJob(id);
  return ok({ job: cancelled ? await jobToDto(cancelled) : null });
});
