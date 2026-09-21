import { notFound, redirect } from "next/navigation";
import { ReviewPage } from "@/components/studio/review-page";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadProjectDto } from "@/lib/studio/project-state";
import { projectWhereForUser } from "@/lib/studio/projects";
import { JOB_ACTIVE_STATUSES, jobToDto } from "@/lib/studio/services/jobs";

export const dynamic = "force-dynamic";

export default async function ReviewRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/studio/login");
  const allowed = await prisma.studioProject.findFirst({ where: { id, ...projectWhereForUser(user) }, select: { id: true } });
  if (!allowed) notFound();
  const [project, active] = await Promise.all([
    loadProjectDto(id, user),
    prisma.studioJob.findFirst({ where: { projectId: id, type: "render", status: { in: [...JOB_ACTIVE_STATUSES] } }, orderBy: { createdAt: "desc" } })
  ]);
  if (!project) notFound();
  return <ReviewPage initial={project} activeJob={active ? await jobToDto(active) : null} />;
}
