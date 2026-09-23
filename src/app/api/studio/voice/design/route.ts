import { ok, readJson, requireStudioApiUser, assertTemplateManager, studioRoute } from "@/lib/studio/access";
import { designVoicePreviews } from "@/lib/studio/services/voice";

/** Voice Design: generate a few candidate voices from a text description. Nothing is saved to the account yet. */
export const POST = studioRoute(async (request: Request) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const body = await readJson<{ voiceDescription?: string; text?: string }>(request);
  const result = await designVoicePreviews({ voiceDescription: String(body.voiceDescription ?? ""), text: body.text ? String(body.text) : undefined });
  return ok(result);
});
