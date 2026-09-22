import { prisma } from "@/lib/prisma";
import { compositionAssetIds, parseComposition } from "@/lib/studio/layouts";
import { getStudioSettings } from "@/lib/studio/settings";
import type { StudioAssetFolderDto } from "@/lib/studio/types";
import verifiedOriginalVideoMap from "./verified-original-video-map.json";

/** Assets carrying this tag were verified against the owner's high-quality Shutterstock originals folder. */
export const HIGH_QUALITY_SHUTTERSTOCK_TAG = "source:high-quality-shutterstock";

/** Provenance is set only by the local source-verification importer, never by user-entered tags. */
export function safeAssetTags(input: string | null | undefined, existingTags = "") {
  const tags = (input ?? "").split(",").map((tag) => tag.trim()).filter((tag) => tag && !tag.toLowerCase().includes(HIGH_QUALITY_SHUTTERSTOCK_TAG));
  const editable = [...new Set(tags)].join(", ").slice(0, existingTags.includes(HIGH_QUALITY_SHUTTERSTOCK_TAG) ? 265 : 300).replace(/,\s*$/, "");
  return existingTags.includes(HIGH_QUALITY_SHUTTERSTOCK_TAG) ? [editable, HIGH_QUALITY_SHUTTERSTOCK_TAG].filter(Boolean).join(", ") : editable;
}

/** Folder labels follow the lesson name, not the source playlist's regional suffix. */
export function videoAssetFolderTitle(title: string) {
  return title.trim().replace(/\s+[—–-]\s+Youth Africa$/i, "").trim();
}

async function defaultLessonTemplates() {
  const settings = await getStudioSettings();
  const playlist = settings.defaultPlaylistId ? await prisma.playlist.findUnique({
    where: { id: settings.defaultPlaylistId },
    include: { videos: { orderBy: { sortOrder: "asc" }, select: { videoId: true } } }
  }) : null;
  const templates = await prisma.studioTemplate.findMany({
    where: { sourceVideoId: { not: null } },
    include: { sourceVideo: { select: { title: true, resourceTitle: true } }, segments: { select: { composition: true } } }
  });
  const order = new Map(playlist?.videos.map((entry, index) => [entry.videoId, index]) ?? []);
  return templates
    .map((template) => ({ ...template, folderTitle: videoAssetFolderTitle(template.sourceVideo?.resourceTitle || template.sourceVideo?.title || template.title) }))
    .sort((a, b) => (order.get(a.sourceVideoId ?? "") ?? Number.MAX_SAFE_INTEGER) - (order.get(b.sourceVideoId ?? "") ?? Number.MAX_SAFE_INTEGER) || a.folderTitle.localeCompare(b.folderTitle));
}

function compositionIds(segments: Array<{ composition: string }>) {
  const ids = new Set<string>();
  for (const segment of segments) for (const id of compositionAssetIds(parseComposition(segment.composition))) ids.add(id);
  return ids;
}

/** Source-video matches are audited by image features, not by theme or filename. */
export function sourceOriginalIdsForVideo(title: string): ReadonlySet<string> {
  return new Set((verifiedOriginalVideoMap as Record<string, string[]>)[videoAssetFolderTitle(title)] ?? []);
}

function originalShutterstockId(tags: string) {
  return /(?:^|,\s*)shutterstock,\s*(\d+)(?:,|$)/i.exec(tags)?.[1] ?? null;
}

function folderOriginals<T extends { id: string; tags: string }>(title: string, selectedIds: Set<string>, originals: T[]) {
  const sourceIds = sourceOriginalIdsForVideo(title);
  return originals.filter((asset) => selectedIds.has(asset.id) || sourceIds.has(originalShutterstockId(asset.tags) ?? ""));
}

/** One folder per Studio source video, including verified photos visible in its reference frames. */
export async function listOriginalAssetFolders(): Promise<StudioAssetFolderDto[]> {
  const templates = await defaultLessonTemplates();
  const idsByTemplate = new Map<string, Set<string>>();
  for (const template of templates) {
    const ids = compositionIds(template.segments);
    idsByTemplate.set(template.id, ids);
  }
  const originals = await prisma.studioAsset.findMany({ where: { kind: "image", tags: { contains: HIGH_QUALITY_SHUTTERSTOCK_TAG } }, select: { id: true, tags: true, url: true, thumbnailUrl: true } });
  return templates.map((template) => {
    const assets = folderOriginals(template.folderTitle, idsByTemplate.get(template.id) ?? new Set(), originals);
    return { id: template.id, title: template.folderTitle, assetCount: assets.length, thumbnailUrl: assets[0]?.thumbnailUrl || assets[0]?.url || null };
  }).filter((folder) => folder.assetCount > 0);
}

export async function originalAssetIdsForFolder(folderId: string) {
  if (folderId === "originals") {
    const rows = await prisma.studioAsset.findMany({ where: { kind: "image", tags: { contains: HIGH_QUALITY_SHUTTERSTOCK_TAG } }, select: { id: true } });
    return rows.map((row) => row.id);
  }
  const template = (await defaultLessonTemplates()).find((entry) => entry.id === folderId);
  if (!template) return [];
  const originals = await prisma.studioAsset.findMany({ where: { kind: "image", tags: { contains: HIGH_QUALITY_SHUTTERSTOCK_TAG } }, select: { id: true, tags: true } });
  return folderOriginals(template.folderTitle, compositionIds(template.segments), originals).map((asset) => asset.id);
}
