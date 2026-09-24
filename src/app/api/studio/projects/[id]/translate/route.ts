import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { scriptHash } from "@/lib/studio/services/credits";
import { TRANSLATION_BATCH_SIZE, translateSegments, translationConfigured, translationModel } from "@/lib/studio/services/translation";
import { getStudioSettings } from "@/lib/studio/settings";

type Params = { params: Promise<{ id: string }> };

const languageNames: Record<string, string> = { en: "English", fr: "French", es: "Spanish", hi: "Hindi", sw: "Swahili", te: "Telugu" };

/**
 * Translate a batch of segments. The client calls this repeatedly (one batch
 * at a time) for "Translate Entire Lesson" so no single request outlives a
 * serverless function.
 *
 * mode "missing": only segments without an AI/human translation.
 * mode "regenerate": the given segments, even when they already have text —
 *   this is the explicit "Regenerate" action, so human edits are replaced
 *   only when the educator asked for exactly that segment.
 * englishOverride: with one segment, translate this English wording instead of
 *   the master script — how someone who can't read the target language edits.
 */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  const project = await requireProjectAccess(user, id);
  if (!translationConfigured()) throw new StudioError("Translation is not set up on this server yet. Please contact the MLP administrator.", 503);
  const body = await readJson<{ segmentIds?: string[]; mode?: "missing" | "regenerate"; englishOverride?: string }>(request);
  const englishOverride = typeof body.englishOverride === "string" ? body.englishOverride.replace(/[<>]/g, "").trim().slice(0, 2000) : "";
  if (englishOverride && (!Array.isArray(body.segmentIds) || body.segmentIds.length !== 1)) throw new StudioError("Rewrite from English works on one segment at a time.");
  const mode = body.mode === "regenerate" ? "regenerate" : "missing";

  const rows = await prisma.studioProjectSegment.findMany({
    where: { projectId: id },
    include: { segment: true },
    orderBy: { segment: { orderIndex: "asc" } }
  });
  const requested = new Set(Array.isArray(body.segmentIds) ? body.segmentIds : []);
  const candidates = rows.filter((row) => {
    if (!row.segment.sourceScript.trim() && !englishOverride) return false;
    if (requested.size && !requested.has(row.id)) return false;
    if (mode === "regenerate") return true;
    // Never overwrite a human edit or an existing AI translation in "missing" mode.
    return row.translationSource === "none" || !row.translation.trim();
  });
  const batch = candidates.slice(0, TRANSLATION_BATCH_SIZE);
  if (batch.length === 0) return ok({ translated: 0, remaining: 0, project: await loadProjectDto(id, user) });

  const [settings, template] = await Promise.all([getStudioSettings(), prisma.studioTemplate.findUnique({ where: { id: project.templateId }, include: { module: true } })]);
  const combinedGlossary = [settings.glossary, project.glossary].filter(Boolean).join("\n");
  const byIndex = new Map(rows.map((row, index) => [row.id, index]));
  const results = await translateSegments(
    {
      lessonTitle: project.title,
      moduleName: template?.module?.name ?? null,
      sourceLanguage: languageNames[template?.sourceLanguageCode ?? "en"] ?? template?.sourceLanguageCode ?? "English",
      targetLanguage: project.targetLanguageName,
      region: project.region,
      variety: project.variety,
      audience: project.audience,
      register: project.register,
      glossary: combinedGlossary,
      model: translationModel(settings.translationModel),
      lessonScript: rows.filter((row) => row.segment.sourceScript.trim()).map((row) => ({ key: row.segment.key, text: row.segment.sourceScript }))
    },
    batch.map((row) => {
      const index = byIndex.get(row.id)!;
      return {
        key: row.segment.key,
        title: row.segment.title,
        sourceScript: englishOverride || row.segment.sourceScript,
        before: rows[index - 1]?.segment.sourceScript ?? null,
        after: rows[index + 1]?.segment.sourceScript ?? null
      };
    })
  ).catch((error) => {
    throw new StudioError("The translation service could not translate these segments right now. Please try again in a moment.", 502, String(error));
  });

  const now = new Date();
  await prisma.$transaction(
    results.map((result) => {
      const row = batch.find((entry) => entry.segment.key === result.key)!;
      const stale = row.narrationAssetId && row.narrationScriptHash && row.narrationScriptHash !== scriptHash(result.translation);
      return prisma.studioProjectSegment.update({
        where: { id: row.id },
        data: {
          translation: result.translation,
          translationSource: "ai",
          translationStatus: "draft",
          translationUpdatedAt: now,
          approvedAt: null,
          ...(stale ? { narrationStatus: "needs_update" } : {})
        }
      });
    })
  );
  // Keyed by project segment, so the workspace can show "what this says in English" straight away.
  const backTranslations = Object.fromEntries(results.map((result) => [batch.find((entry) => entry.segment.key === result.key)!.id, { text: result.translation, english: result.backTranslation }]));
  return ok({ translated: results.length, remaining: Math.max(0, candidates.length - batch.length), backTranslations, project: await loadProjectDto(id, user) });
});
