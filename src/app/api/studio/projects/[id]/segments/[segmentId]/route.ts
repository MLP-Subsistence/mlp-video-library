import { prisma } from "@/lib/prisma";
import { canManageTemplates } from "@/lib/roles";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { cleanOptional } from "@/lib/sanitize";
import { normalizeComposition, serializeComposition } from "@/lib/studio/layouts";
import { loadProjectDto } from "@/lib/studio/project-state";
import { scriptHash } from "@/lib/studio/services/credits";
import type { Composition, NarrationSource } from "@/lib/studio/types";

type Params = { params: Promise<{ id: string; segmentId: string }> };

/**
 * Every per-segment edit in the workspace lands here (autosave). `segmentId`
 * is the StudioProjectSegment id. Each field is optional; only the provided
 * ones change. Returns the refreshed project DTO so the timeline recalculates.
 */
export const PATCH = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id, segmentId } = await params;
  await requireProjectAccess(user, id);
  const row = await prisma.studioProjectSegment.findFirst({ where: { id: segmentId, projectId: id }, include: { segment: true } });
  if (!row) throw new StudioError("That segment could not be found.", 404);

  const body = await readJson<{
    translation?: string;
    translationAction?: "approve" | "unapprove";
    pauseBeforeSec?: number;
    pauseAfterSec?: number | null;
    composition?: Composition | null;
    narration?: { assetId: string; durationSec: number; source: NarrationSource } | null;
    alignment?: { startSec: number; endSec: number };
    voiceIdOverride?: string | null;
    reviewNote?: string | null;
    approve?: boolean;
    markNarrationReady?: boolean;
  }>(request);

  const data: Record<string, unknown> = {};
  const now = new Date();

  // --- Translation -------------------------------------------------------
  if (body.translation !== undefined) {
    const translation = String(body.translation).replace(/\r/g, "").slice(0, 6000);
    if (translation !== row.translation) {
      data.translation = translation;
      data.translationSource = "human";
      data.translationUpdatedAt = now;
      data.translationStatus = translation.trim() ? "draft" : "missing";
      // Narration made for the old text is now stale — never keep it silently approved.
      if (row.narrationAssetId && row.narrationScriptHash && row.narrationScriptHash !== scriptHash(translation)) {
        data.narrationStatus = "needs_update";
      }
      if (row.approvedAt) data.approvedAt = null;
    }
  }
  if (body.translationAction === "approve") {
    const text = (data.translation as string | undefined) ?? row.translation;
    if (!text.trim()) throw new StudioError("Write or generate a translation before approving it.");
    data.translationStatus = "approved";
  }
  if (body.translationAction === "unapprove") data.translationStatus = row.translation.trim() ? "draft" : "missing";

  // --- Timing / composition ------------------------------------------------
  if (body.pauseBeforeSec !== undefined) {
    const seconds = Number(body.pauseBeforeSec);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10) throw new StudioError("Choose a lead-in between 0 and 10 seconds.");
    data.pauseBeforeSec = Math.round(seconds * 10) / 10;
  }
  if (body.pauseAfterSec !== undefined) {
    data.pauseAfterSecOverride = body.pauseAfterSec === null ? null : Math.min(10, Math.max(0, Number(body.pauseAfterSec) || 0));
  }
  if (body.composition !== undefined) {
    if (body.composition === null) data.compositionOverride = null;
    else {
      const composition = normalizeComposition(body.composition);
      const assetIds = [...new Set(composition.slots.flatMap((slot) => slot.items.map((item) => item.assetId)))];
      if (assetIds.length) {
        const found = await prisma.studioAsset.count({ where: { id: { in: assetIds }, kind: { in: ["image", "video"] } } });
        if (found !== assetIds.length) throw new StudioError("One of the selected visuals no longer exists.");
      }
      data.compositionOverride = serializeComposition(composition);
    }
  }

  // --- Narration -----------------------------------------------------------
  if (body.narration !== undefined) {
    if (body.narration === null) {
      Object.assign(data, {
        narrationAssetId: null,
        narrationSource: "none",
        narrationStartSec: null,
        narrationEndSec: null,
        narrationDurationSec: 0,
        narrationStatus: "missing",
        narrationUpdatedAt: now,
        narrationScriptHash: null,
        alignmentConfidence: null,
        approvedAt: null
      });
    } else {
      const asset = await prisma.studioAsset.findUnique({ where: { id: String(body.narration.assetId) } });
      if (!asset || asset.kind !== "audio") throw new StudioError("That audio file could not be found.");
      const source: NarrationSource = body.narration.source === "record" || body.narration.source === "upload" ? body.narration.source : "upload";
      const duration = Number(body.narration.durationSec) || asset.durationSec || 0;
      if (duration <= 0) throw new StudioError("The audio duration could not be measured. Please try a different file.");
      const text = (data.translation as string | undefined) ?? row.translation;
      Object.assign(data, {
        narrationAssetId: asset.id,
        narrationSource: source,
        narrationStartSec: null,
        narrationEndSec: null,
        narrationDurationSec: Math.round(duration * 1000) / 1000,
        narrationStatus: "ready",
        narrationUpdatedAt: now,
        narrationScriptHash: scriptHash(text),
        alignmentConfidence: null
      });
      if (!asset.durationSec) await prisma.studioAsset.update({ where: { id: asset.id }, data: { durationSec: duration } });
    }
  }
  if (body.alignment !== undefined) {
    if (row.narrationSource !== "full" || !row.narrationAssetId) throw new StudioError("Only segments taken from a full narration recording have alignment boundaries.");
    const asset = await prisma.studioAsset.findUnique({ where: { id: row.narrationAssetId } });
    const maxEnd = asset?.durationSec ?? Number.POSITIVE_INFINITY;
    const startSec = Math.max(0, Number(body.alignment.startSec) || 0);
    const endSec = Math.min(maxEnd, Number(body.alignment.endSec) || 0);
    if (endSec - startSec < 0.2) throw new StudioError("The narration slice must be at least 0.2 seconds long.");
    Object.assign(data, {
      narrationStartSec: Math.round(startSec * 1000) / 1000,
      narrationEndSec: Math.round(endSec * 1000) / 1000,
      narrationDurationSec: Math.round((endSec - startSec) * 1000) / 1000,
      narrationStatus: "ready",
      narrationUpdatedAt: now,
      alignmentConfidence: 1
    });
  }
  if (body.markNarrationReady && row.narrationAssetId) {
    data.narrationStatus = "ready";
    if (row.narrationSource === "full") data.alignmentConfidence = 1;
  }
  if (body.voiceIdOverride !== undefined) data.voiceIdOverride = cleanOptional(body.voiceIdOverride)?.slice(0, 120) ?? null;
  if (body.reviewNote !== undefined) {
    if (!canManageTemplates(user.role) && body.reviewNote) throw new StudioError("Only content managers can leave review notes.", 403);
    data.reviewNote = cleanOptional(body.reviewNote)?.slice(0, 500) ?? null;
  }

  // --- Approve & Next --------------------------------------------------------
  if (body.approve !== undefined) {
    if (body.approve) {
      const translationStatus = (data.translationStatus as string | undefined) ?? row.translationStatus;
      const narrationStatus = (data.narrationStatus as string | undefined) ?? row.narrationStatus;
      if (translationStatus !== "approved") data.translationStatus = "approved";
      if (!((data.translation as string | undefined) ?? row.translation).trim()) throw new StudioError("This segment has no translation yet.");
      if (narrationStatus === "missing") throw new StudioError("Add narration before approving this segment.");
      if (narrationStatus === "needs_update") throw new StudioError("The narration no longer matches the translation. Re-record or regenerate it first.");
      if (narrationStatus === "needs_review") data.narrationStatus = "ready";
      data.approvedAt = now;
    } else {
      data.approvedAt = null;
    }
  }

  if (Object.keys(data).length) {
    await prisma.studioProjectSegment.update({ where: { id: row.id }, data });
    await prisma.studioProject.update({ where: { id }, data: { updatedAt: now, ...(await shouldReopen(id) ? { status: "in_progress" } : {}) } });
  }
  return ok({ project: await loadProjectDto(id, user) });
});

/** Any edit after a render invalidates "ready" so the review page asks for a new video. */
async function shouldReopen(projectId: string) {
  const project = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { status: true } });
  return project?.status === "ready";
}
