import { prisma } from "@/lib/prisma";
import { ok, requireStudioApiUser, studioRoute } from "@/lib/studio/access";
import { resourceImage } from "@/lib/resource-taxonomy";
import type { LibraryPlaylistDto } from "@/lib/studio/types";

/**
 * Playlist → video → segments. Every library playlist with its videos and,
 * for each video, whether a master template (segments) has been prepared.
 * Educators start a localization from here; content managers see which
 * lessons still need preparing.
 */
export const GET = studioRoute(async () => {
  await requireStudioApiUser();
  const [playlists, templates] = await Promise.all([
    prisma.playlist.findMany({
      where: { visibility: { not: "Hidden" } },
      include: { language: true, videos: { include: { video: { include: { language: true } } }, orderBy: { sortOrder: "asc" } } },
      orderBy: [{ language: { sortOrder: "asc" } }, { sortOrder: "asc" }, { title: "asc" }]
    }),
    prisma.studioTemplate.findMany({
      where: { sourceVideoId: { not: null } },
      include: { _count: { select: { segments: true } }, projects: { select: { targetLanguageName: true } } }
    })
  ]);
  const templateByVideo = new Map(templates.map((template) => [template.sourceVideoId as string, template]));
  const result: LibraryPlaylistDto[] = playlists
    .filter((playlist) => playlist.videos.length > 0)
    .map((playlist) => {
      const videos = playlist.videos.map(({ video }) => {
        const template = templateByVideo.get(video.id);
        return {
          id: video.id,
          title: video.resourceTitle || video.title,
          category: video.category,
          resourceFormat: video.resourceFormat,
          thumbnailUrl: resourceImage(video),
          duration: video.duration,
          hasTranscript: Boolean(video.transcript && video.transcript.trim().length > 40),
          templateId: template?.id ?? null,
          templateStatus: template ? (template.status === "ready" ? ("ready" as const) : ("draft" as const)) : null,
          segmentCount: template?._count.segments ?? 0,
          localizedInto: [...new Set((template?.projects ?? []).map((project) => project.targetLanguageName))]
        };
      });
      return {
        id: playlist.id,
        title: playlist.title,
        language: playlist.language?.name ?? null,
        languageCode: playlist.language?.code ?? null,
        videoCount: videos.length,
        readyCount: videos.filter((video) => video.templateStatus === "ready").length,
        videos
      };
    });
  // Playlists with prepared lessons first so educators find them immediately.
  result.sort((a, b) => b.readyCount - a.readyCount || a.title.localeCompare(b.title));
  return ok({ playlists: result });
});
