import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudioShell } from "@/components/studio/studio-shell";
import { canAccessAdmin, canManageTemplates, getCurrentUser, roleLabel } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "Educator Studio", template: "%s | Educator Studio" },
  robots: { index: false, follow: false }
};

export default async function ProtectedStudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/studio/login");
  return (
    <StudioShell user={{ name: user.name, roleLabel: roleLabel(user.role), canManageTemplates: canManageTemplates(user.role), canAccessAdmin: canAccessAdmin(user.role) }}>
      {children}
    </StudioShell>
  );
}
