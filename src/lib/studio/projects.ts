import { prisma } from "@/lib/prisma";
import { normalizeRole } from "@/lib/roles";
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
  const projects = await prisma.studioProject.findMany({
    where: projectWhereForUser(user),
    include: { createdBy: { select: { name: true } }, segments: { select: { narrationStatus: true } } },
    orderBy: { updatedAt: "desc" }
  });
  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    targetLanguageName: project.targetLanguageName,
    region: project.region,
    status: project.status,
    narrationReady: project.segments.filter((segment) => segment.narrationStatus === "ready").length,
    segmentCount: project.segments.length,
    updatedAt: project.updatedAt.toISOString(),
    createdByName: project.createdBy.name
  }));
}
