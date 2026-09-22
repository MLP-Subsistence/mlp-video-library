import { prisma } from "@/lib/prisma";
import { StudioError } from "@/lib/studio/access";
import { storage } from "@/lib/studio/storage";

/**
 * Asset reference counting. Compositions are JSON strings, so a `contains`
 * search on the asset id is enough to find them; ids are cuids and never
 * substrings of one another.
 */
/**
 * Usage counts for many assets at once. One query per table instead of five
 * per asset: the library lists up to 200 assets and a per-asset fan-out took
 * well over the 10 s a serverless function is allowed.
 */
export async function assetUsageMap(assetIds: string[]) {
  const wanted = new Set(assetIds);
  const empty = () => ({ segments: 0, narrations: 0, templates: 0, total: 0 });
  const usage = new Map(assetIds.map((id) => [id, empty()]));
  if (assetIds.length === 0) return usage;
  const [segments, overrides, narrations, fullNarrations, templates] = await Promise.all([
    prisma.studioSegment.findMany({ select: { composition: true } }),
    prisma.studioProjectSegment.findMany({ select: { compositionOverride: true } }),
    prisma.studioProjectSegment.groupBy({ by: ["narrationAssetId"], where: { narrationAssetId: { in: assetIds } }, _count: { _all: true } }),
    prisma.studioFullNarration.groupBy({ by: ["assetId"], where: { assetId: { in: assetIds } }, _count: { _all: true } }),
    prisma.studioTemplate.findMany({ select: { musicAssetId: true, thumbnailAssetId: true } })
  ]);
  // Compositions are JSON strings; ids are cuids and never substrings of one another.
  const countInJson = (value: string | null) => {
    if (!value) return;
    for (const id of wanted) if (value.includes(id)) usage.get(id)!.segments += 1;
  };
  for (const segment of segments) countInJson(segment.composition);
  for (const row of overrides) countInJson(row.compositionOverride);
  for (const row of narrations) if (row.narrationAssetId) usage.get(row.narrationAssetId)!.narrations += row._count._all;
  for (const row of fullNarrations) if (row.assetId && usage.has(row.assetId)) usage.get(row.assetId)!.narrations += row._count._all;
  for (const template of templates) {
    for (const id of new Set([template.musicAssetId, template.thumbnailAssetId])) if (id && usage.has(id)) usage.get(id)!.templates += 1;
  }
  for (const entry of usage.values()) entry.total = entry.segments + entry.narrations + entry.templates;
  return usage;
}

export async function assetUsage(assetId: string) {
  const [segments, overrides, narrations, fullNarrations, templates] = await Promise.all([
    prisma.studioSegment.count({ where: { composition: { contains: assetId } } }),
    prisma.studioProjectSegment.count({ where: { compositionOverride: { contains: assetId } } }),
    prisma.studioProjectSegment.count({ where: { narrationAssetId: assetId } }),
    prisma.studioFullNarration.count({ where: { assetId } }),
    prisma.studioTemplate.count({ where: { OR: [{ musicAssetId: assetId }, { thumbnailAssetId: assetId }] } })
  ]);
  return { segments: segments + overrides, narrations: narrations + fullNarrations, templates, total: segments + overrides + narrations + fullNarrations + templates };
}

export async function deleteAssetSafely(assetId: string) {
  const asset = await prisma.studioAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new StudioError("That asset no longer exists.", 404);
  const usage = await assetUsage(assetId);
  if (usage.total > 0) {
    const parts = [
      usage.segments ? `${usage.segments} segment${usage.segments === 1 ? "" : "s"}` : null,
      usage.narrations ? `${usage.narrations} narration${usage.narrations === 1 ? "" : "s"}` : null,
      usage.templates ? `${usage.templates} template${usage.templates === 1 ? "" : "s"}` : null
    ].filter(Boolean);
    throw new StudioError(`This asset is currently used in ${parts.join(" and ")}. Replace it there first.`, 409);
  }
  await prisma.studioAsset.delete({ where: { id: assetId } });
  await storage().delete(asset.storageKey).catch((error) => console.error("[studio] storage delete failed", error));
  return asset;
}
