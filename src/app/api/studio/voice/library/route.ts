import { ok, readJson, requireStudioApiUser, assertTemplateManager, studioRoute } from "@/lib/studio/access";
import { addSharedVoice, listSharedVoices } from "@/lib/studio/services/voice";

/** The provider's public voice library. Browsing and adding cost no narration credits. */
export const GET = studioRoute(async (request: Request) => {
  await requireStudioApiUser();
  const url = new URL(request.url);
  return ok(await listSharedVoices({ search: url.searchParams.get("q")?.slice(0, 80) ?? undefined, language: url.searchParams.get("language")?.slice(0, 10) ?? undefined }));
});

export const POST = studioRoute(async (request: Request) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const body = await readJson<{ publicOwnerId?: string; voiceId?: string; name?: string }>(request);
  const voice = await addSharedVoice({
    publicOwnerId: String(body.publicOwnerId ?? ""),
    voiceId: String(body.voiceId ?? ""),
    name: String(body.name ?? "")
  });
  return ok({ voice });
});
