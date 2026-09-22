import { prisma } from "@/lib/prisma";
import { assertTemplateManager, ok, readJson, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { mediaLibraryStatus, useMatch } from "@/lib/studio/services/media-matches";
import { loadTemplateDto } from "@/lib/studio/templates";

type Params = { params: Promise<{ id: string; segmentId: string; matchId: string }> };

/** Use this stock image for the segment: license via the API subscription, or attach the uploaded licensed file. */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id, segmentId, matchId } = await params;
  const match = await prisma.studioMediaMatch.findFirst({ where: { id: matchId, segmentId, segment: { templateId: id } } });
  if (!match) throw new StudioError("That match no longer exists.", 404);
  const body = await readJson<{ uploadedAssetId?: string | null }>(request);
  const matches = await useMatch(matchId, { uploadedAssetId: body.uploadedAssetId ?? null, userId: user.id });
  return ok({ matches, template: await loadTemplateDto(id), ...mediaLibraryStatus() });
});
