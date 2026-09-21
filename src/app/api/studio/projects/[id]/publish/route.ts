import { prisma } from "@/lib/prisma";
import { canManageTemplates } from "@/lib/roles";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { formatClock } from "@/lib/studio/timing";
import { PROGRAM_NAME } from "@/lib/resource-taxonomy";

type Params = { params: Promise<{ id: string }> };

/**
 * Approve the rendered video (any educator) and, for content managers and
 * administrators, publish it into the existing library as a Video resource in
 * the target language. Publishing never happens automatically.
 */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  const project = await requireProjectAccess(user, id);
  const body = await readJson<{ action?: "approve" | "reopen" | "publish"; visibility?: string }>(request);
  const rendered = project.renderedAssetId ? await prisma.studioAsset.findUnique({ where: { id: project.renderedAssetId } }) : null;

  if (body.action === "reopen") {
    await prisma.studioProject.update({ where: { id }, data: { approvedAt: null, status: rendered ? "ready" : "in_progress" } });
    return ok({ project: await loadProjectDto(id, user) });
  }
  if (!rendered) throw new StudioError("Generate the video before approving it.");

  if (body.action === "approve") {
    await prisma.studioProject.update({ where: { id }, data: { approvedAt: new Date(), status: "approved" } });
    return ok({ project: await loadProjectDto(id, user) });
  }

  if (body.action === "publish") {
    if (!canManageTemplates(user.role)) throw new StudioError("Only content managers and administrators can publish to the library.", 403);
    const full = await loadProjectDto(id, user);
    const template = await prisma.studioTemplate.findUnique({ where: { id: project.templateId }, include: { module: true, sourceVideo: true } });
    if (!full || !template) throw new StudioError("That localization project could not be found.", 404);

    let language = await prisma.language.findFirst({ where: { OR: [{ code: project.targetLanguageCode }, { name: project.targetLanguageName }] } });
    if (!language) {
      const last = await prisma.language.findFirst({ orderBy: { sortOrder: "desc" } });
      language = await prisma.language.create({
        data: { name: project.targetLanguageName, displayName: project.targetLanguageName, code: project.targetLanguageCode, sortOrder: (last?.sortOrder ?? 0) + 1, isActive: true }
      });
    }
    const source = template.sourceVideo;
    const transcript = full.segments.map((segment) => `${segment.key} — ${segment.title}\n${segment.translation}`).join("\n\n");
    const visibility = body.visibility === "Draft" ? "Draft" : "Published";
    const data = {
      title: project.title,
      resourceTitle: project.title,
      description: source?.description ?? `${project.title} in ${project.targetLanguageName}${project.region ? ` (${project.region})` : ""}. Created with Educator Studio.`,
      youtubeUrl: "",
      youtubeVideoId: "",
      embedUrl: rendered.url,
      thumbnailUrl: rendered.thumbnailUrl ?? source?.thumbnailUrl ?? null,
      program: PROGRAM_NAME,
      category: template.module?.name ?? source?.category ?? "General Marketplace Literacy",
      resourceType: "Video",
      resourceFormat: source?.resourceFormat ?? "Global",
      resourceSubmenu: source?.resourceSubmenu ?? null,
      transcript,
      isPublished: visibility === "Published",
      languageId: language.id,
      moduleId: template.moduleId ?? source?.moduleId ?? null,
      region: project.region ?? "Global",
      audience: project.audience ?? source?.audience ?? "General",
      tags: [PROGRAM_NAME, project.targetLanguageName, "Educator Studio", template.module?.name].filter(Boolean).join(", "),
      duration: formatClock(rendered.durationSec ?? full.timeline.totalSec),
      visibility
    };
    const video = project.publishedVideoId
      ? await prisma.video.update({ where: { id: project.publishedVideoId }, data })
      : await prisma.video.create({ data });
    await prisma.studioProject.update({ where: { id }, data: { publishedVideoId: video.id, status: "published", approvedAt: project.approvedAt ?? new Date() } });
    return ok({ project: await loadProjectDto(id, user), videoId: video.id });
  }
  throw new StudioError("Unknown action.");
});
