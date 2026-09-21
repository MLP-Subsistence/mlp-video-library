import { prisma } from "@/lib/prisma";
import { assertTemplateManager, ok, readJson, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { cleanOptional, cleanText } from "@/lib/sanitize";
import { loadTemplateDto } from "@/lib/studio/templates";

type Params = { params: Promise<{ id: string }> };

export const GET = studioRoute(async (_request: Request, { params }: Params) => {
  await requireStudioApiUser();
  const { id } = await params;
  const template = await loadTemplateDto(id);
  if (!template) throw new StudioError("That master template could not be found.", 404);
  return ok({ template });
});

export const PATCH = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id } = await params;
  const body = await readJson<{
    title?: string;
    description?: string | null;
    status?: string;
    moduleId?: string | null;
    sourceVideoId?: string | null;
    musicAssetId?: string | null;
    musicVolume?: number;
    thumbnailAssetId?: string | null;
    fps?: number;
  }>(request);
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = cleanText(body.title).slice(0, 160);
    if (!title) throw new StudioError("The template needs a title.");
    data.title = title;
  }
  if (body.description !== undefined) data.description = cleanOptional(body.description);
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "ready") throw new StudioError("Unknown status.");
    if (body.status === "ready") {
      const count = await prisma.studioSegment.count({ where: { templateId: id } });
      if (count === 0) throw new StudioError("Add at least one segment before marking the template ready.");
    }
    data.status = body.status;
  }
  if (body.moduleId !== undefined) data.moduleId = body.moduleId ? cleanText(body.moduleId) : null;
  if (body.sourceVideoId !== undefined) data.sourceVideoId = body.sourceVideoId ? cleanText(body.sourceVideoId) : null;
  if (body.musicAssetId !== undefined) {
    if (body.musicAssetId) {
      const asset = await prisma.studioAsset.findUnique({ where: { id: body.musicAssetId } });
      if (!asset || asset.kind !== "audio") throw new StudioError("Choose an audio asset for the music bed.");
    }
    data.musicAssetId = body.musicAssetId || null;
  }
  if (body.thumbnailAssetId !== undefined) data.thumbnailAssetId = body.thumbnailAssetId || null;
  if (body.musicVolume !== undefined) data.musicVolume = Math.min(1, Math.max(0, Number(body.musicVolume) || 0));
  if (body.fps !== undefined) data.fps = [24, 25, 30].includes(Number(body.fps)) ? Number(body.fps) : 30;
  await prisma.studioTemplate.update({ where: { id }, data });
  return ok({ template: await loadTemplateDto(id) });
});

export const DELETE = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id } = await params;
  const projects = await prisma.studioProject.count({ where: { templateId: id } });
  if (projects > 0) throw new StudioError(`This template has ${projects} localization project${projects === 1 ? "" : "s"}. Delete those first.`, 409);
  await prisma.studioTemplate.delete({ where: { id } });
  return ok({ ok: true });
});
