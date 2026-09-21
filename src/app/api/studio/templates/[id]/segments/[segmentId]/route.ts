import { prisma } from "@/lib/prisma";
import { assertTemplateManager, ok, readJson, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { cleanOptional, cleanText } from "@/lib/sanitize";
import { normalizeComposition, serializeComposition } from "@/lib/studio/layouts";
import { loadTemplateDto } from "@/lib/studio/templates";
import type { Composition } from "@/lib/studio/types";

type Params = { params: Promise<{ id: string; segmentId: string }> };

export const PATCH = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id, segmentId } = await params;
  const segment = await prisma.studioSegment.findFirst({ where: { id: segmentId, templateId: id } });
  if (!segment) throw new StudioError("That segment could not be found.", 404);
  const body = await readJson<{ title?: string; sourceScript?: string; pauseAfterSec?: number; composition?: Composition; notes?: string | null }>(request);
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = cleanText(body.title).slice(0, 120) || segment.title;
  if (body.sourceScript !== undefined) data.sourceScript = String(body.sourceScript).trim().slice(0, 4000);
  if (body.pauseAfterSec !== undefined) data.pauseAfterSec = Math.min(10, Math.max(0, Number(body.pauseAfterSec) || 0));
  if (body.notes !== undefined) data.notes = cleanOptional(body.notes);
  if (body.composition !== undefined) {
    const composition = normalizeComposition(body.composition);
    const assetIds = [...new Set(composition.slots.flatMap((slot) => slot.items.map((item) => item.assetId)))];
    if (assetIds.length) {
      const found = await prisma.studioAsset.count({ where: { id: { in: assetIds }, kind: { in: ["image", "video"] } } });
      if (found !== assetIds.length) throw new StudioError("One of the selected visuals no longer exists.");
    }
    data.composition = serializeComposition(composition);
  }
  await prisma.studioSegment.update({ where: { id: segmentId }, data });
  return ok({ template: await loadTemplateDto(id) });
});

export const DELETE = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id, segmentId } = await params;
  const segment = await prisma.studioSegment.findFirst({ where: { id: segmentId, templateId: id } });
  if (!segment) throw new StudioError("That segment could not be found.", 404);
  const localized = await prisma.studioProjectSegment.count({ where: { segmentId, OR: [{ translation: { not: "" } }, { narrationAssetId: { not: null } }] } });
  if (localized > 0) throw new StudioError(`This segment already has translations or narration in ${localized} project${localized === 1 ? "" : "s"}. Remove those first.`, 409);
  await prisma.studioSegment.delete({ where: { id: segmentId } });
  const remaining = await prisma.studioSegment.findMany({ where: { templateId: id }, orderBy: { orderIndex: "asc" } });
  await prisma.$transaction(remaining.map((entry, index) => prisma.studioSegment.update({ where: { id: entry.id }, data: { orderIndex: index } })));
  return ok({ template: await loadTemplateDto(id) });
});
