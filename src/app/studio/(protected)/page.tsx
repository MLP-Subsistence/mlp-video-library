import { redirect } from "next/navigation";
import { ProjectsPage } from "@/components/studio/projects-page";
import { canManageTemplates, getCurrentUser } from "@/lib/auth";
import { listProjectSummaries } from "@/lib/studio/projects";

export const dynamic = "force-dynamic";

export default async function StudioHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/studio/login");
  const projects = await listProjectSummaries(user);
  return <ProjectsPage initialProjects={projects} canManageTemplates={canManageTemplates(user.role)} />;
}
