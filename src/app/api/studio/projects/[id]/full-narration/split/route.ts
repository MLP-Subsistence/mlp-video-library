import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { scriptHash } from "@/lib/studio/services/credits";

type Params = { params: Promise<{ id: string }> };

/**
 * Save a full-lesson recording that was split into segments in the browser.
 * Unlike the automatic import, nothing is queued: the educator placed (or
 * confirmed) every boundary by ear, so each segment is ready straight away.
 * The translation is not required — the recording may exist before anyone
 * has typed the text.
 */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const body = await readJson<{ assetId?: string; slices?: Array<{ projectSegmentId?: string; startSec?: number; endSec?: number; heardText?: string }> }>(request);
  const asset = await prisma.studioAsset.findUnique({ where: { id: String(body.assetId || "") } });
  if (!asset || asset.kind !== "audio") throw new StudioError("Upload the recording first.");
  const slices = Array.isArray(body.slices) ? body.slices : [];
  if (slices.length === 0) throw new StudioError("Place at least one segment on the recording.");

  const rows = await prisma.studioProjectSegment.findMany({ where: { projectId: id } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const limit = asset.durationSec ? asset.durationSec + 0.5 : Number.POSITIVE_INFINITY;
  const cleaned = slices.map((slice) => {
    const row = byId.get(String(slice.projectSegmentId || ""));
    if (!row) throw new StudioError("One of the segments does not belong to this lesson.");
    const startSec = Math.max(0, Number(slice.startSec));
    const endSec = Math.min(limit, Number(slice.endSec));
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec - startSec < 0.2) throw new StudioError("Every segment needs at least 0.2 seconds of the recording.");
    const heardText = typeof slice.heardText === "string" ? slice.heardText.replace(/[<>]/g, "").trim().slice(0, 4000) : "";
    return { row, startSec: Math.round(startSec * 1000) / 1000, endSec: Math.round(endSec * 1000) / 1000, heardText };
  });
  if (new Set(cleaned.map((entry) => entry.row.id)).size !== cleaned.length) throw new StudioError("A segment was placed twice.");

  const now = new Date();
  await prisma.$transaction([
    prisma.studioFullNarration.create({
      data: { projectId: id, assetId: asset.id, status: "aligned", result: JSON.stringify({ method: "manual", segments: cleaned.map((entry) => ({ segmentId: entry.row.id, startSec: entry.startSec, endSec: entry.endSec })) }) }
    }),
    ...cleaned.map((entry) => {
      // What speech recognition heard fills in only a segment that has no text yet, as a draft to check.
      const fillText = !entry.row.translation.trim() && entry.heardText ? entry.heardText : null;
      const text = fillText ?? entry.row.translation;
      return prisma.studioProjectSegment.update({
        where: { id: entry.row.id },
        data: {
          ...(fillText ? { translation: fillText, translationSource: "ai", translationStatus: "draft", translationUpdatedAt: now, approvedAt: null } : {}),
          narrationAssetId: asset.id,
          narrationSource: "full",
          narrationStartSec: entry.startSec,
          narrationEndSec: entry.endSec,
          narrationDurationSec: Math.round((entry.endSec - entry.startSec) * 1000) / 1000,
          narrationStatus: "ready",
          narrationUpdatedAt: now,
          // No text yet means nothing to fall out of date with; typing it later must not flag the audio.
          narrationScriptHash: text.trim() ? scriptHash(text) : null,
          alignmentConfidence: 1
        }
      });
    })
  ]);
  return ok({ project: await loadProjectDto(id, user) });
});
