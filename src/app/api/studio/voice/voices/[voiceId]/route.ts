import { ok, requireStudioApiUser, assertTemplateManager, studioRoute } from "@/lib/studio/access";
import { deleteProviderVoice } from "@/lib/studio/services/voice";

type Params = { params: Promise<{ voiceId: string }> };

/** Remove a voice from the provider account (refused while a localization still uses it). */
export const DELETE = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { voiceId } = await params;
  return ok(await deleteProviderVoice(voiceId));
});
