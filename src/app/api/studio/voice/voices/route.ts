import { ok, requireStudioApiUser, studioRoute } from "@/lib/studio/access";
import { creditSummary } from "@/lib/studio/services/credits";
import { listVoices } from "@/lib/studio/services/voice";

/** Voices available from the configured provider plus the caller's remaining allowance. */
export const GET = studioRoute(async () => {
  const user = await requireStudioApiUser();
  const [voices, credits] = await Promise.all([listVoices(), creditSummary(user.id)]);
  return ok({ ...voices, credits: { limit: credits.limit, used: credits.used, remaining: credits.remaining } });
});
