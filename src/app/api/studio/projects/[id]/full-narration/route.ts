import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { enqueueAlignJob, jobToDto } from "@/lib/studio/services/jobs";

type Params = { params: Promise<{ id: string }> };

/**
 * Import Full Narration: the audio asset was already uploaded; register it
 * for the project and queue the alignment job. Segments are updated by the
 * worker when alignment finishes.
 */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const body = await readJson<{ assetId?: string }>(request);
  const asset = await prisma.studioAsset.findUnique({ where: { id: String(body.assetId || "") } });
  if (!asset || asset.kind !== "audio") throw new StudioError("Upload the full narration audio first.");
  const translated = await prisma.studioProjectSegment.count({ where: { projectId: id, translation: { not: "" } } });
  if (translated === 0) throw new StudioError("Translate the lesson before importing a full narration, so the recording can be matched to the script.");
  const narration = await prisma.studioFullNarration.create({ data: { projectId: id, assetId: asset.id, status: "uploaded" } });
  const { job } = await enqueueAlignJob({ projectId: id, fullNarrationId: narration.id, userId: user.id });
  return ok({ job: await jobToDto(job), project: await loadProjectDto(id, user) }, { status: 201 });
});
