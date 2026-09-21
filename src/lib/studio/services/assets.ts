import { prisma } from "@/lib/prisma";
import { StudioError } from "@/lib/studio/access";
import { storage } from "@/lib/studio/storage";

/**
 * Asset reference counting. Compositions are JSON strings, so a `contains`
 * search on the asset id is enough to find them; ids are cuids and never
 * substrings of one another.
 */
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
