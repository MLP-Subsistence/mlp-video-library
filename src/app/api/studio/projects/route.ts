import { prisma } from "@/lib/prisma";
import { ok, readJson, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { cleanOptional, cleanText } from "@/lib/sanitize";
import { ensureProjectSegments } from "@/lib/studio/project-state";
import { defaultGlossaryTerms } from "@/lib/studio/settings";
import { listProjectSummaries } from "@/lib/studio/projects";

export const GET = studioRoute(async () => {
  const user = await requireStudioApiUser();
  return ok({ projects: await listProjectSummaries(user) });
});

/** New Localization: pick a ready master template and a target language. */
export const POST = studioRoute(async (request: Request) => {
  const user = await requireStudioApiUser();
  const body = await readJson<{ templateId?: string; languageCode?: string; languageName?: string; region?: string; variety?: string; audience?: string; register?: string }>(request);
  const template = await prisma.studioTemplate.findUnique({ where: { id: String(body.templateId || "") }, include: { _count: { select: { segments: true } } } });
  if (!template) throw new StudioError("Choose a lesson to localize.");
  if (template.status !== "ready" || template._count.segments === 0) throw new StudioError("That lesson is not ready for localization yet. A content manager needs to finish its master template.");
  const languageName = cleanText(body.languageName).slice(0, 80);
  const languageCode = cleanText(body.languageCode).toLowerCase().replace(/[^a-z-]/g, "").slice(0, 12);
  if (!languageName || !languageCode) throw new StudioError("Choose a target language.");
  const project = await prisma.studioProject.create({
    data: {
      templateId: template.id,
      title: template.title,
      targetLanguageCode: languageCode,
      targetLanguageName: languageName,
      region: cleanOptional(body.region)?.slice(0, 80) ?? null,
      variety: cleanOptional(body.variety)?.slice(0, 80) ?? null,
      audience: cleanOptional(body.audience)?.slice(0, 80) ?? null,
      register: cleanOptional(body.register)?.slice(0, 160) ?? null,
      glossary: defaultGlossaryTerms.join("\n"),
      createdById: user.id
    }
  });
  await ensureProjectSegments(project.id, template.id);
  return ok({ id: project.id }, { status: 201 });
});
