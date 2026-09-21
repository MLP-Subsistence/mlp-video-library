import { prisma } from "@/lib/prisma";
import { assertTemplateManager, ok, requireStudioApiUser, studioRoute } from "@/lib/studio/access";
import { resourceImage } from "@/lib/resource-taxonomy";

/** Existing library resources and modules, for building master templates. */
export const GET = studioRoute(async (request: Request) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const [videos, modules] = await Promise.all([
    prisma.video.findMany({
      where: q ? { OR: [{ title: { contains: q } }, { resourceTitle: { contains: q } }, { category: { contains: q } }] } : {},
      include: { language: true },
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }, { title: "asc" }],
      take: 80
    }),
    prisma.module.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })
  ]);
  return ok({
    videos: videos.map((video) => ({
      id: video.id,
      title: video.resourceTitle || video.title,
      category: video.category,
      resourceFormat: video.resourceFormat,
      language: video.language?.name ?? null,
      languageCode: video.language?.code ?? "en",
      moduleId: video.moduleId,
      thumbnailUrl: resourceImage(video),
      hasTranscript: Boolean(video.transcript && video.transcript.trim().length > 40),
      duration: video.duration
    })),
    modules: modules.map((module) => ({ id: module.id, name: module.name }))
  });
});
