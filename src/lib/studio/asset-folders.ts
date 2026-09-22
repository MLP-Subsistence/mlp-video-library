import { prisma } from "@/lib/prisma";
import { compositionAssetIds, parseComposition } from "@/lib/studio/layouts";
import { getStudioSettings } from "@/lib/studio/settings";
import type { StudioAssetFolderDto } from "@/lib/studio/types";

/** Assets carrying this tag were verified against the owner's high-quality Shutterstock originals folder. */
export const HIGH_QUALITY_SHUTTERSTOCK_TAG = "source:high-quality-shutterstock";

/** Provenance is set only by the local source-verification importer, never by user-entered tags. */
export function safeAssetTags(input: string | null | undefined, existingTags = "") {
  const tags = (input ?? "").split(",").map((tag) => tag.trim()).filter((tag) => tag && !tag.toLowerCase().includes(HIGH_QUALITY_SHUTTERSTOCK_TAG));
  const editable = [...new Set(tags)].join(", ").slice(0, existingTags.includes(HIGH_QUALITY_SHUTTERSTOCK_TAG) ? 265 : 300).replace(/,\s*$/, "");
  return existingTags.includes(HIGH_QUALITY_SHUTTERSTOCK_TAG) ? [editable, HIGH_QUALITY_SHUTTERSTOCK_TAG].filter(Boolean).join(", ") : editable;
}

async function defaultLessonTemplates() {
  const settings = await getStudioSettings();
  if (!settings.defaultPlaylistId) return [];
  const playlist = await prisma.playlist.findUnique({
    where: { id: settings.defaultPlaylistId },
    include: { videos: { orderBy: { sortOrder: "asc" }, select: { videoId: true, video: { select: { title: true, resourceTitle: true } } } } }
  });
  if (!playlist) return [];
  const templates = await prisma.studioTemplate.findMany({
    where: { sourceVideoId: { in: playlist.videos.map((entry) => entry.videoId) } },
    include: { segments: { select: { composition: true } } }
  });
  const byVideo = new Map(templates.map((template) => [template.sourceVideoId, template]));
  return playlist.videos.flatMap((entry) => {
    const template = byVideo.get(entry.videoId);
    return template ? [{ ...template, folderTitle: entry.video.resourceTitle || entry.video.title }] : [];
  });
}

function compositionIds(segments: Array<{ composition: string }>) {
  const ids = new Set<string>();
  for (const segment of segments) for (const id of compositionAssetIds(parseComposition(segment.composition))) ids.add(id);
  return ids;
}

/** One virtual folder per lesson in the main playlist. Folder contents stay in sync with each template. */
export async function listOriginalAssetFolders(): Promise<StudioAssetFolderDto[]> {
  const templates = await defaultLessonTemplates();
  const usedIds = new Set<string>();
  const idsByTemplate = new Map<string, Set<string>>();
  for (const template of templates) {
    const ids = compositionIds(template.segments);
    idsByTemplate.set(template.id, ids);
    for (const id of ids) usedIds.add(id);
  }
  const originals = usedIds.size
    ? await prisma.studioAsset.findMany({ where: { id: { in: [...usedIds] }, kind: "image", tags: { contains: HIGH_QUALITY_SHUTTERSTOCK_TAG } }, select: { id: true, url: true, thumbnailUrl: true } })
    : [];
  const originalById = new Map(originals.map((asset) => [asset.id, asset]));
  return templates.map((template) => {
    const assets = [...(idsByTemplate.get(template.id) ?? [])].map((id) => originalById.get(id)).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
    return { id: template.id, title: template.folderTitle, assetCount: assets.length, thumbnailUrl: assets[0]?.thumbnailUrl || assets[0]?.url || null };
  });
}

export async function originalAssetIdsForFolder(folderId: string) {
  if (folderId === "originals") {
    const rows = await prisma.studioAsset.findMany({ where: { kind: "image", tags: { contains: HIGH_QUALITY_SHUTTERSTOCK_TAG } }, select: { id: true } });
    return rows.map((row) => row.id);
  }
  const template = (await defaultLessonTemplates()).find((entry) => entry.id === folderId);
  if (!template) return [];
  const ids = [...compositionIds(template.segments)];
  if (!ids.length) return [];
  const originals = await prisma.studioAsset.findMany({ where: { id: { in: ids }, kind: "image", tags: { contains: HIGH_QUALITY_SHUTTERSTOCK_TAG } }, select: { id: true } });
  return originals.map((asset) => asset.id);
}
