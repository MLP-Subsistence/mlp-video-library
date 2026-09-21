import { prisma } from "@/lib/prisma";
import { normalizeRole } from "@/lib/roles";
import type { ProjectSummaryDto } from "@/lib/studio/types";

/** Educators see only their own projects; staff see everything. */
export function projectWhereForUser(user: { id: string; role: string }) {
  return normalizeRole(user.role) === "educator" ? { createdById: user.id } : {};
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
