import { redirect } from "next/navigation";
import { VoiceLibraryPage } from "@/components/studio/voice-library-page";
import { canManageTemplates, getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VoicesRoute() {
  const user = await getCurrentUser();
  if (!user) redirect("/studio/login");
  if (!canManageTemplates(user.role)) redirect("/studio");
  return <VoiceLibraryPage />;
}
