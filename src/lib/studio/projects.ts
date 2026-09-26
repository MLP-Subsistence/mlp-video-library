import { prisma } from "@/lib/prisma";
import { normalizeRole } from "@/lib/roles";
import { getStudioSettings } from "@/lib/studio/settings";
import type { ProjectSummaryDto } from "@/lib/studio/types";

/**
 * Master templates are shared samples that everyone can localize, but the work
 * itself is personal: a signed-in account sees only the localization projects
 * it created. Administrators keep full visibility so they can support the team
 * (and they already manage users, jobs and credits in /admin).
 */
export function projectWhereForUser(user: { id: string; role: string }) {
  return normalizeRole(user.role) === "admin" ? {} : { createdById: user.id };
}

export async function listProjectSummaries(user: { id: string; role: string }): Promise<ProjectSummaryDto[]> {
  const [projects, settings] = await Promise.all([
    prisma.studioProject.findMany({
      where: projectWhereForUser(user),
      include: {
        createdBy: { select: { name: true } },
        segments: { select: { narrationStatus: true } },
        template: {
          select: {
            sourceVideo: {
              select: {
                playlists: {
                  select: {
                    sortOrder: true,
                    playlist: { select: { id: true, title: true, _count: { select: { videos: true } } } }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    }),
    getStudioSettings()
  ]);
  return projects.map((project) => {
    // Some lessons appear in more than one library playlist. Use the playlist
    // selected by MLP as the main course first, otherwise the largest course.
    const memberships = [...(project.template.sourceVideo?.playlists ?? [])].sort(
      (a, b) => b.playlist._count.videos - a.playlist._count.videos
    );
    const membership = memberships.find((entry) => entry.playlist.id === settings.defaultPlaylistId) ?? memberships[0] ?? null;
    return {
      id: project.id,
      title: project.title,
      targetLanguageName: project.targetLanguageName,
      region: project.region,
      playlistId: membership?.playlist.id ?? null,
      playlistTitle: membership?.playlist.title ?? null,
      playlistOrder: membership?.sortOrder ?? null,
      status: project.status,
      narrationReady: project.segments.filter((segment) => segment.narrationStatus === "ready").length,
      segmentCount: project.segments.length,
      updatedAt: project.updatedAt.toISOString(),
      createdByName: project.createdBy.name
    };
  });
}
