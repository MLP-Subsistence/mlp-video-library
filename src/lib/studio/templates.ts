import { prisma } from "@/lib/prisma";
import { compositionAssetIds, parseComposition } from "@/lib/studio/layouts";
import { assetToDto } from "@/lib/studio/project-state";
import type { Composition, StudioAssetDto, TemplateSummaryDto } from "@/lib/studio/types";

export type TemplateSegmentDto = {
  id: string;
  key: string;
  orderIndex: number;
  title: string;
  sourceScript: string;
  pauseAfterSec: number;
  composition: Composition;
  notes: string | null;
};

export type TemplateDto = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sourceLanguageCode: string;
  sourceVideo: { id: string; title: string; youtubeUrl: string; thumbnailUrl: string | null } | null;
  moduleId: string | null;
  moduleName: string | null;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  musicAssetId: string | null;
  musicVolume: number;
  thumbnailAssetId: string | null;
  segments: TemplateSegmentDto[];
  assets: Record<string, StudioAssetDto>;
  projects: Array<{ id: string; targetLanguageName: string; status: string }>;
  updatedAt: string;
};

export function nextSegmentKey(existingKeys: string[]) {
  const numbers = existingKeys.map((key) => Number(/^seg_(\d+)$/.exec(key)?.[1] ?? 0));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `seg_${String(next).padStart(3, "0")}`;
}

export async function loadTemplateDto(templateId: string): Promise<TemplateDto | null> {
  const template = await prisma.studioTemplate.findUnique({
    where: { id: templateId },
    include: {
      module: true,
      sourceVideo: { select: { id: true, title: true, youtubeUrl: true, thumbnailUrl: true, uploadedThumbnailPath: true } },
      segments: { orderBy: { orderIndex: "asc" } },
      projects: { select: { id: true, targetLanguageName: true, status: true }, orderBy: { createdAt: "asc" } }
    }
  });
  if (!template) return null;
  const segments: TemplateSegmentDto[] = template.segments.map((segment) => ({
    id: segment.id,
    key: segment.key,
    orderIndex: segment.orderIndex,
    title: segment.title,
    sourceScript: segment.sourceScript,
    pauseAfterSec: segment.pauseAfterSec,
    composition: parseComposition(segment.composition),
    notes: segment.notes
  }));
  const ids = new Set<string>();
  for (const segment of segments) for (const id of compositionAssetIds(segment.composition)) ids.add(id);
  if (template.musicAssetId) ids.add(template.musicAssetId);
  if (template.thumbnailAssetId) ids.add(template.thumbnailAssetId);
  const assetRows = ids.size ? await prisma.studioAsset.findMany({ where: { id: { in: [...ids] } } }) : [];
  const assets: Record<string, StudioAssetDto> = {};
  for (const asset of assetRows) assets[asset.id] = assetToDto(asset);
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    status: template.status,
    sourceLanguageCode: template.sourceLanguageCode,
    sourceVideo: template.sourceVideo
      ? { id: template.sourceVideo.id, title: template.sourceVideo.title, youtubeUrl: template.sourceVideo.youtubeUrl, thumbnailUrl: template.sourceVideo.uploadedThumbnailPath || template.sourceVideo.thumbnailUrl }
      : null,
    moduleId: template.moduleId,
    moduleName: template.module?.name ?? null,
    frameWidth: template.frameWidth,
    frameHeight: template.frameHeight,
    fps: template.fps,
    musicAssetId: template.musicAssetId,
    musicVolume: template.musicVolume,
    thumbnailAssetId: template.thumbnailAssetId,
    segments,
    assets,
    projects: template.projects,
    updatedAt: template.updatedAt.toISOString()
  };
}

export async function listTemplateSummaries(options: { readyOnly?: boolean } = {}): Promise<TemplateSummaryDto[]> {
  const templates = await prisma.studioTemplate.findMany({
    where: options.readyOnly ? { status: "ready" } : {},
    include: {
      module: true,
      sourceVideo: { select: { id: true, thumbnailUrl: true, uploadedThumbnailPath: true } },
      _count: { select: { segments: true } },
      projects: { select: { targetLanguageName: true } }
    },
    orderBy: { updatedAt: "desc" }
  });
  const thumbIds = templates.map((template) => template.thumbnailAssetId).filter((id): id is string => Boolean(id));
  const thumbs = thumbIds.length ? await prisma.studioAsset.findMany({ where: { id: { in: thumbIds } } }) : [];
  const thumbById = new Map(thumbs.map((asset) => [asset.id, asset.thumbnailUrl || asset.url]));
  return templates.map((template) => ({
    id: template.id,
    title: template.title,
    moduleName: template.module?.name ?? null,
    status: template.status,
    segmentCount: template._count.segments,
    thumbnailUrl: (template.thumbnailAssetId && thumbById.get(template.thumbnailAssetId)) || template.sourceVideo?.uploadedThumbnailPath || template.sourceVideo?.thumbnailUrl || null,
    languages: [...new Set(template.projects.map((project) => project.targetLanguageName))],
    sourceVideoId: template.sourceVideoId
  }));
}

/** Paragraphs first; long paragraphs are split into ~2-sentence groups suited to narration. */
export function splitTranscript(transcript: string) {
  const paragraphs = transcript
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= 320) {
      chunks.push(paragraph);
      continue;
    }
    const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [paragraph];
    let current = "";
    let count = 0;
    for (const sentence of sentences) {
      current += sentence;
      count += 1;
      if (count >= 2 || current.length > 260) {
        chunks.push(current.trim());
        current = "";
        count = 0;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }
  return chunks.slice(0, 200);
}
