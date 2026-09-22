import { prisma } from "@/lib/prisma";
import { assertTemplateManager, ok, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { listMatches, mediaLibraryStatus, searchMatches } from "@/lib/studio/services/media-matches";

type Params = { params: Promise<{ id: string; segmentId: string }> };

async function guard(id: string, segmentId: string) {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const segment = await prisma.studioSegment.findFirst({ where: { id: segmentId, templateId: id } });
  if (!segment) throw new StudioError("That segment could not be found.", 404);
  return user;
}

/** Stock-image candidates already found for this segment. */
export const GET = studioRoute(async (_request: Request, { params }: Params) => {
  const { id, segmentId } = await params;
  await guard(id, segmentId);
  return ok({ matches: await listMatches(segmentId), ...mediaLibraryStatus() });
});

/** Reverse-image search the (caption-cropped) frame on Shutterstock. */
export const POST = studioRoute(async (_request: Request, { params }: Params) => {
  const { id, segmentId } = await params;
  await guard(id, segmentId);
  return ok({ matches: await searchMatches(segmentId), ...mediaLibraryStatus() });
});
