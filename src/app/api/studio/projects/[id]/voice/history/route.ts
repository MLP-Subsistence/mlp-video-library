import { ok, requireProjectAccess, requireStudioApiUser, studioRoute } from "@/lib/studio/access";
import { voiceHistory } from "@/lib/studio/services/voice";

type Params = { params: Promise<{ id: string }> };

/** This localization's narration-generation history, newest first. Reading it is free. */
export const GET = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  return ok({ history: await voiceHistory(id) });
});
