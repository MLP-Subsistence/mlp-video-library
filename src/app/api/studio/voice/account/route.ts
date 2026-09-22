import { ok, requireStudioApiUser, studioRoute } from "@/lib/studio/access";
import { voiceAccountStatus } from "@/lib/studio/services/voice";

/** Provider account limits and the models it offers — a free call, shown so nobody opens the provider dashboard. */
export const GET = studioRoute(async () => {
  await requireStudioApiUser();
  return ok(await voiceAccountStatus());
});
