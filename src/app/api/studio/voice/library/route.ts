import { ok, readJson, requireStudioApiUser, assertTemplateManager, studioRoute } from "@/lib/studio/access";
import { addSharedVoice, listSharedVoices } from "@/lib/studio/services/voice";

/** The provider's public voice library. Browsing and adding cost no narration credits. */
export const GET = studioRoute(async (request: Request) => {
  await requireStudioApiUser();
  const url = new URL(request.url);
  const param = (name: string, max = 40) => url.searchParams.get(name)?.slice(0, max) || undefined;
  return ok(
    await listSharedVoices({
      search: param("q", 80),
      language: param("language", 10),
      gender: param("gender"),
      age: param("age"),
      accent: param("accent"),
      useCase: param("useCase"),
      category: param("category")
    })
  );
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
