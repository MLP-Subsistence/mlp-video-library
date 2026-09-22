import type { StudioAsset } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { studioPermissions } from "@/lib/studio/permissions";
import { compositionAssetIds, compositionHasVisual, parseComposition } from "@/lib/studio/layouts";
import { creditSummary, parseVoiceSettings } from "@/lib/studio/services/credits";
import { computeTimeline } from "@/lib/studio/timing";
import type { NarrationSource, NarrationStatus, ProjectDto, ProjectSegmentDto, SegmentWarning, StudioAssetDto, TranslationSource, TranslationStatus } from "@/lib/studio/types";

export function assetToDto(asset: StudioAsset, usedIn?: number): StudioAssetDto {
  return {
    id: asset.id,
    kind: asset.kind as StudioAssetDto["kind"],
    name: asset.name,
    url: asset.url,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    durationSec: asset.durationSec,
    thumbnailUrl: asset.thumbnailUrl,
    tags: asset.tags,
    createdAt: asset.createdAt.toISOString(),
    usedIn
  };
}

/** Make sure every master segment has a project row (templates can grow after a project starts). */
export async function ensureProjectSegments(projectId: string, templateId: string) {
  const [segments, existing] = await Promise.all([
    prisma.studioSegment.findMany({ where: { templateId }, select: { id: true } }),
    prisma.studioProjectSegment.findMany({ where: { projectId }, select: { segmentId: true } })
  ]);
  const have = new Set(existing.map((row) => row.segmentId));
  const missing = segments.filter((segment) => !have.has(segment.id));
  if (missing.length === 0) return;
  await prisma.studioProjectSegment.createMany({ data: missing.map((segment) => ({ projectId, segmentId: segment.id })) });
}

export async function loadProjectDto(projectId: string, user: { id: string; role: string }): Promise<ProjectDto | null> {
  const project = await prisma.studioProject.findUnique({
    where: { id: projectId },
    include: { template: { include: { module: true } } }
  });
  if (!project) return null;
  await ensureProjectSegments(project.id, project.templateId);

  const [rows, fullNarration, credits, renderedAsset, musicAsset, masterAsset] = await Promise.all([
    prisma.studioProjectSegment.findMany({
      where: { projectId: project.id },
      include: { segment: true, narrationAsset: true },
      orderBy: { segment: { orderIndex: "asc" } }
    }),
    prisma.studioFullNarration.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, include: { asset: true } }),
    creditSummary(user.id),
    project.renderedAssetId ? prisma.studioAsset.findUnique({ where: { id: project.renderedAssetId } }) : null,
    project.template.musicAssetId ? prisma.studioAsset.findUnique({ where: { id: project.template.musicAssetId } }) : null,
    project.template.masterAssetId ? prisma.studioAsset.findUnique({ where: { id: project.template.masterAssetId } }) : null
  ]);

  const assetIds = new Set<string>();
  const segments: ProjectSegmentDto[] = rows.map((row) => {
    const baseComposition = parseComposition(row.segment.composition);
    const composition = row.compositionOverride ? parseComposition(row.compositionOverride) : baseComposition;
    for (const id of compositionAssetIds(composition)) assetIds.add(id);
    const warnings: SegmentWarning[] = [];
    const translationStatus = row.translationStatus as TranslationStatus;
    const narrationStatus = row.narrationStatus as NarrationStatus;
    if (translationStatus === "missing" || !row.translation.trim()) warnings.push({ code: "translation_missing", message: "Translation missing" });
    else if (translationStatus === "draft") warnings.push({ code: "translation_draft", message: "Translation not approved" });
    if (narrationStatus === "missing") warnings.push({ code: "narration_missing", message: "Narration missing" });
    if (narrationStatus === "needs_update") warnings.push({ code: "narration_needs_update", message: "Translation changed — narration needs updating" });
    if (narrationStatus === "needs_review") warnings.push({ code: "narration_needs_review", message: "Narration timing needs review" });
    if (!compositionHasVisual(composition)) warnings.push({ code: "visual_missing", message: "No visual selected" });
    return {
      id: row.id,
      segmentId: row.segmentId,
      key: row.segment.key,
      orderIndex: row.segment.orderIndex,
      title: row.segment.title,
      sourceScript: row.segment.sourceScript,
      translation: row.translation,
      translationStatus,
      translationSource: row.translationSource as TranslationSource,
      narration: {
        assetId: row.narrationAssetId,
        url: row.narrationAsset?.url ?? null,
        source: row.narrationSource as NarrationSource,
        startSec: row.narrationStartSec,
        endSec: row.narrationEndSec,
        durationSec: row.narrationDurationSec,
        status: narrationStatus,
        confidence: row.alignmentConfidence
      },
      pauseBeforeSec: row.pauseBeforeSec,
      pauseAfterSec: row.pauseAfterSecOverride ?? row.segment.pauseAfterSec,
      pauseIsOverride: row.pauseAfterSecOverride !== null,
      source: row.segment.sourceStartSec !== null && row.segment.sourceEndSec !== null ? { startSec: row.segment.sourceStartSec, endSec: row.segment.sourceEndSec } : null,
      composition,
      templateComposition: baseComposition,
      compositionIsOverride: Boolean(row.compositionOverride),
      voiceIdOverride: row.voiceIdOverride,
      reviewNote: row.reviewNote,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      warnings
    };
  });

  const assetRows = assetIds.size ? await prisma.studioAsset.findMany({ where: { id: { in: [...assetIds] } } }) : [];
  const assets: Record<string, StudioAssetDto> = {};
  for (const asset of assetRows) assets[asset.id] = assetToDto(asset);

  // Video clips that are much shorter than their slot get a gentle "timing" warning.
  for (const segment of segments) {
    const narration = segment.narration.durationSec || 0;
    if (narration <= 0) continue;
    const segmentSec = segment.pauseBeforeSec + narration + segment.pauseAfterSec;
    for (const slot of segment.composition.slots) {
      for (const item of slot.items) {
        const asset = assets[item.assetId];
        if (asset?.kind === "video" && asset.durationSec && asset.durationSec < segmentSec * item.share * 0.6) {
          segment.warnings.push({ code: "video_timing", message: `"${asset.name}" is shorter than its slot — the last frame will hold` });
          break;
        }
      }
    }
  }

  const timeline = computeTimeline(
    segments.map((segment) => ({
      segmentId: segment.segmentId,
      key: segment.key,
      title: segment.title,
      orderIndex: segment.orderIndex,
      narrationDurationSec: segment.narration.durationSec,
      pauseBeforeSec: segment.pauseBeforeSec,
      pauseAfterSec: segment.pauseAfterSec,
      composition: segment.composition,
      placeholderSec: segment.source ? segment.source.endSec - segment.source.startSec : undefined
    }))
  );

  return {
    id: project.id,
    title: project.title,
    status: project.status,
    targetLanguageCode: project.targetLanguageCode,
    targetLanguageName: project.targetLanguageName,
    region: project.region,
    variety: project.variety,
    audience: project.audience,
    register: project.register,
    glossary: project.glossary,
    defaultVoiceId: project.defaultVoiceId,
    defaultVoiceName: project.defaultVoiceName,
    voiceSettings: parseVoiceSettings(project.voiceSettings),
    renderQuality: project.renderQuality === "720p" ? "720p" : "1080p",
    latestRenderJobId: project.latestRenderJobId,
    renderedAssetUrl: renderedAsset?.url ?? null,
    publishedVideoId: project.publishedVideoId,
    approvedAt: project.approvedAt?.toISOString() ?? null,
    template: {
      id: project.template.id,
      title: project.template.title,
      sourceLanguageCode: project.template.sourceLanguageCode,
      moduleName: project.template.module?.name ?? null,
      frameWidth: project.template.frameWidth,
      frameHeight: project.template.frameHeight,
      fps: project.template.fps,
      musicAssetId: project.template.musicAssetId,
      musicAssetUrl: musicAsset?.url ?? null,
      musicVolume: project.template.musicVolume,
      masterAssetUrl: masterAsset?.url ?? null
    },
    segments,
    assets,
    timeline,
    fullNarration: fullNarration
      ? { id: fullNarration.id, status: fullNarration.status, assetUrl: fullNarration.asset.url, error: fullNarration.error, createdAt: fullNarration.createdAt.toISOString() }
      : null,
    permissions: studioPermissions(user),
    credits: { limit: credits.limit, used: credits.used, remaining: credits.remaining },
    updatedAt: project.updatedAt.toISOString()
  };
}

export function projectProgress(segments: Array<{ narrationStatus: string }>) {
  const ready = segments.filter((segment) => segment.narrationStatus === "ready").length;
  return { ready, total: segments.length };
}
