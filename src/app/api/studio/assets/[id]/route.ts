import { prisma } from "@/lib/prisma";
import { assertTemplateManager, ok, readJson, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { assetToDto } from "@/lib/studio/project-state";
import { cleanOptional, cleanText } from "@/lib/sanitize";
import { assetUsage, deleteAssetSafely } from "@/lib/studio/services/assets";
import { safeAssetTags } from "@/lib/studio/asset-folders";

type Params = { params: Promise<{ id: string }> };

export const GET = studioRoute(async (_request: Request, { params }: Params) => {
  await requireStudioApiUser();
  const { id } = await params;
  const asset = await prisma.studioAsset.findUnique({ where: { id } });
  if (!asset) throw new StudioError("That asset no longer exists.", 404);
  const usage = await assetUsage(id);
  return ok({ asset: assetToDto(asset, usage.segments), usage });
});

export const PATCH = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id } = await params;
  const body = await readJson<{ name?: string; tags?: string }>(request);
  const existing = await prisma.studioAsset.findUnique({ where: { id }, select: { tags: true } });
  if (!existing) throw new StudioError("That asset no longer exists.", 404);
  const asset = await prisma.studioAsset.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: cleanText(body.name).slice(0, 120) || "Untitled" } : {}),
      ...(body.tags !== undefined ? { tags: safeAssetTags(cleanOptional(body.tags), existing.tags) } : {})
    }
  });
  return ok({ asset: assetToDto(asset) });
});

export const DELETE = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id } = await params;
  await deleteAssetSafely(id);
  return ok({ ok: true });
});
