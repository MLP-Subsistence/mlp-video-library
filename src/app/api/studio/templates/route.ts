import { prisma } from "@/lib/prisma";
import { assertTemplateManager, ok, readJson, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { cleanOptional, cleanText } from "@/lib/sanitize";
import { listTemplateSummaries, splitTranscript } from "@/lib/studio/templates";

export const GET = studioRoute(async (request: Request) => {
  await requireStudioApiUser();
  const url = new URL(request.url);
  const templates = await listTemplateSummaries({ readyOnly: url.searchParams.get("ready") === "1" });
  return ok({ templates });
});

/**
 * Create a master template. When `sourceVideoId` points at an existing
 * library resource with a transcript, the transcript is split into starter
 * segments (one per paragraph/sentence group) so content managers do not
 * start from a blank page.
 */
export const POST = studioRoute(async (request: Request) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const body = await readJson<{ title?: string; sourceVideoId?: string | null; moduleId?: string | null; description?: string; sourceLanguageCode?: string; importTranscript?: boolean }>(request);
  const sourceVideo = body.sourceVideoId ? await prisma.video.findUnique({ where: { id: body.sourceVideoId }, include: { language: true, module: true } }) : null;
  if (body.sourceVideoId && !sourceVideo) throw new StudioError("That library resource could not be found.", 404);
  const title = cleanText(body.title) || sourceVideo?.resourceTitle || sourceVideo?.title;
  if (!title) throw new StudioError("Give the master template a title.");

  const starterSegments = body.importTranscript !== false && sourceVideo?.transcript ? splitTranscript(sourceVideo.transcript) : [];
  const template = await prisma.studioTemplate.create({
    data: {
      title: title.slice(0, 160),
      description: cleanOptional(body.description),
      sourceVideoId: sourceVideo?.id ?? null,
      moduleId: body.moduleId ? cleanText(body.moduleId) : sourceVideo?.moduleId ?? null,
      sourceLanguageCode: cleanText(body.sourceLanguageCode) || sourceVideo?.language?.code || "en",
      createdById: user.id,
      segments: {
        create: starterSegments.map((script, index) => ({
          key: `seg_${String(index + 1).padStart(3, "0")}`,
          orderIndex: index,
          title: `Segment ${index + 1}`,
          sourceScript: script
        }))
      }
    }
  });
  return ok({ id: template.id }, { status: 201 });
});
