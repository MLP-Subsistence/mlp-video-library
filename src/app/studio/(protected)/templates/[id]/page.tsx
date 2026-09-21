import { notFound, redirect } from "next/navigation";
import { TemplateEditor } from "@/components/studio/template-editor";
import { canManageTemplates, getCurrentUser } from "@/lib/auth";
import { loadTemplateDto } from "@/lib/studio/templates";

export const dynamic = "force-dynamic";

export default async function TemplateRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/studio/login");
  if (!canManageTemplates(user.role)) redirect("/studio");
  const template = await loadTemplateDto(id);
  if (!template) notFound();
  return <TemplateEditor initial={template} />;
}
