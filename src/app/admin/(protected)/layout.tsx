import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { canAccessAdmin, getCurrentUser } from "@/lib/auth";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  // Educators use Educator Studio; the administration portal is for staff.
  if (!canAccessAdmin(user.role)) redirect("/studio");
  return <AdminShell>{children}</AdminShell>;
}
