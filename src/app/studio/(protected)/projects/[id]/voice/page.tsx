import { notFound, redirect } from "next/navigation";
import { VoicePage } from "@/components/studio/voice-page";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadProjectDto } from "@/lib/studio/project-state";
import { projectWhereForUser } from "@/lib/studio/projects";

export const dynamic = "force-dynamic";

export default async function VoiceRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/studio/login");
  const allowed = await prisma.studioProject.findFirst({ where: { id, ...projectWhereForUser(user) }, select: { id: true } });
  if (!allowed) notFound();
  const project = await loadProjectDto(id, user);
  if (!project) notFound();
  return <VoicePage initial={project} />;
}
