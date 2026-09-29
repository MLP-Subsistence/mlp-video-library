import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { enqueueRenderJob, JOB_ACTIVE_STATUSES, jobToDto } from "@/lib/studio/services/jobs";
import { getStudioSettings } from "@/lib/studio/settings";
import { TRANSLATION_BATCH_SIZE, translateSegments, translationModel } from "@/lib/studio/services/translation";
import type { RenderSubtitles } from "@/lib/studio/types";

type Params = { params: Promise<{ id: string }> };

/** Generate Video. Refuses when segments are incomplete so educators are not surprised by a broken render. */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const body = await readJson<{ quality?: string; allowIncomplete?: boolean; subtitleMode?: string; subtitleLanguageCode?: string; subtitleLanguageName?: string }>(request);
  const quality = body.quality === "720p" ? "720p" : "1080p";
  const project = await loadProjectDto(id, user);
  if (!project) throw new StudioError("That localization project could not be found.", 404);
  const blocking = project.segments.filter((segment) => segment.warnings.some((warning) => warning.code === "narration_missing" || warning.code === "visual_missing" || warning.code === "translation_missing"));
  if (blocking.length && !body.allowIncomplete) {
    throw new StudioError(`${blocking.length} segment${blocking.length === 1 ? " is" : "s are"} not ready: ${blocking.slice(0, 3).map((segment) => segment.title).join(", ")}${blocking.length > 3 ? "…" : ""}. Fix them or choose "Generate anyway".`, 409);
  }
  const subtitles: RenderSubtitles = { mode: body.subtitleMode === "source" || body.subtitleMode === "target" || body.subtitleMode === "custom" ? body.subtitleMode : "none" };
  if (subtitles.mode === "source") {
    subtitles.languageCode = project.template.sourceLanguageCode;
    subtitles.languageName = "English";
    subtitles.lines = Object.fromEntries(project.segments.map((segment) => [segment.id, segment.sourceScript]));
  } else if (subtitles.mode === "target") {
    subtitles.languageCode = project.targetLanguageCode;
    subtitles.languageName = project.targetLanguageName;
    subtitles.lines = Object.fromEntries(project.segments.map((segment) => [segment.id, segment.translation]));
  } else if (subtitles.mode === "custom") {
    const languageName = String(body.subtitleLanguageName || "").trim().slice(0, 60);
    if (!languageName) throw new StudioError("Choose the subtitle language.");
    subtitles.languageCode = String(body.subtitleLanguageCode || "xx").trim().slice(0, 12);
    subtitles.languageName = languageName;
    if (languageName.toLowerCase() === project.targetLanguageName.toLowerCase()) {
      subtitles.lines = Object.fromEntries(project.segments.map((segment) => [segment.id, segment.translation]));
    } else {
      const settings = await getStudioSettings();
      const results = [];
      for (let start = 0; start < project.segments.length; start += TRANSLATION_BATCH_SIZE) {
        const batch = project.segments.slice(start, start + TRANSLATION_BATCH_SIZE);
        results.push(...await translateSegments({
          lessonTitle: project.title,
          moduleName: project.template.moduleName,
          sourceLanguage: "English",
          targetLanguage: languageName,
          region: null,
          variety: null,
          audience: project.audience,
          register: project.register,
          glossary: project.glossary,
          model: translationModel(settings.translationModel),
          lessonScript: project.segments.map((segment) => ({ key: segment.key, text: segment.sourceScript }))
        }, batch.map((segment) => {
          const index = project.segments.indexOf(segment);
          return { key: segment.key, title: segment.title, sourceScript: segment.sourceScript, before: project.segments[index - 1]?.sourceScript ?? null, after: project.segments[index + 1]?.sourceScript ?? null };
        })));
      }
      const byKey = new Map(results.map((result) => [result.key, result.translation]));
      subtitles.lines = Object.fromEntries(project.segments.map((segment) => [segment.id, byKey.get(segment.key) ?? ""]));
    }
  }
  const { job, reused } = await enqueueRenderJob({ projectId: id, userId: user.id, quality, subtitles });
  return ok({ job: await jobToDto(job), reused, project: await loadProjectDto(id, user) }, { status: reused ? 200 : 201 });
});

export const GET = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const jobs = await prisma.studioJob.findMany({ where: { projectId: id, type: "render" }, orderBy: { createdAt: "desc" }, take: 5 });
  const active = jobs.find((job) => JOB_ACTIVE_STATUSES.includes(job.status as (typeof JOB_ACTIVE_STATUSES)[number]));
  return ok({ jobs: await Promise.all(jobs.map(jobToDto)), active: active ? await jobToDto(active) : null });
});
