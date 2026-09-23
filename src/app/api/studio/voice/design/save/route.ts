import { ok, readJson, requireStudioApiUser, assertTemplateManager, studioRoute } from "@/lib/studio/access";
import { saveDesignedVoice } from "@/lib/studio/services/voice";

/** Save one Voice Design candidate to the account as a real, usable voice. */
export const POST = studioRoute(async (request: Request) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const body = await readJson<{ generatedVoiceId?: string; name?: string; description?: string }>(request);
  const voice = await saveDesignedVoice({
    generatedVoiceId: String(body.generatedVoiceId ?? ""),
    name: String(body.name ?? ""),
    description: String(body.description ?? "")
  });
  return ok({ voice });
});
