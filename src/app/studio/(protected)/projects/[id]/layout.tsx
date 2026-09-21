import { notFound } from "next/navigation";
import { RegisterShellProject } from "@/components/studio/shell-project";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectWhereForUser } from "@/lib/studio/projects";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();
  const project = await prisma.studioProject.findFirst({ where: { id, ...projectWhereForUser(user) }, select: { id: true, title: true, targetLanguageName: true } });
  if (!project) notFound();
  return (
    <>
      <RegisterShellProject project={{ id: project.id, title: project.title, language: project.targetLanguageName }} />
      {children}
    </>
  );
}
