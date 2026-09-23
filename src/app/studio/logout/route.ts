import { redirect } from "next/navigation";
import { clearAdminSession } from "@/lib/auth";

export async function GET() {
  await clearAdminSession();
  redirect("/studio/login");
}
