import { redirect } from "next/navigation";
import { AssetsPage } from "@/components/studio/assets-page";
import { canManageTemplates, getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AssetsRoute() {
  const user = await getCurrentUser();
  if (!user) redirect("/studio/login");
  if (!canManageTemplates(user.role)) redirect("/studio");
  return <AssetsPage />;
}
