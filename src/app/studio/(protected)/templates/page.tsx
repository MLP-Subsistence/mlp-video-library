import { redirect } from "next/navigation";
import { TemplatesPage } from "@/components/studio/templates-page";
import { canManageTemplates, getCurrentUser } from "@/lib/auth";
import { listTemplateSummaries } from "@/lib/studio/templates";

export const dynamic = "force-dynamic";

export default async function TemplatesRoute() {
  const user = await getCurrentUser();
  if (!user) redirect("/studio/login");
  if (!canManageTemplates(user.role)) redirect("/studio");
  return <TemplatesPage initialTemplates={await listTemplateSummaries()} />;
}
