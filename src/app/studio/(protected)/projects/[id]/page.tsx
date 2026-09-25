import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/studio/workspace/workspace";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectDto } from "@/lib/studio/project-state";
import { projectWhereForUser } from "@/lib/studio/projects";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ segment?: string; voiceover?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  if (!user) redirect("/studio/login");
  const allowed = await prisma.studioProject.findFirst({ where: { id, ...projectWhereForUser(user) }, select: { id: true } });
  if (!allowed) notFound();
  const project = await loadProjectDto(id, user);
  if (!project) notFound();
  return <Workspace initial={project} initialSegmentId={query.segment ?? null} openVoiceover={query.voiceover === "1"} />;
}
