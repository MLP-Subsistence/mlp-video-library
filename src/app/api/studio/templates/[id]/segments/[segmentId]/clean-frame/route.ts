import { prisma } from "@/lib/prisma";
import { assertTemplateManager, ok, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { cleanFrameBytes, useCleanFrame } from "@/lib/studio/services/media-matches";
import { loadTemplateDto } from "@/lib/studio/templates";

type Params = { params: Promise<{ id: string; segmentId: string }> };

/** Preview of the caption-cropped frame. */
export const GET = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id, segmentId } = await params;
  const segment = await prisma.studioSegment.findFirst({ where: { id: segmentId, templateId: id } });
  if (!segment) throw new StudioError("That segment could not be found.", 404);
  const { bytes } = await cleanFrameBytes(segmentId);
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=300" } });
});

/** Make the caption-cropped frame the segment's visual (no stock licensing needed). */
export const POST = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id, segmentId } = await params;
  const segment = await prisma.studioSegment.findFirst({ where: { id: segmentId, templateId: id } });
  if (!segment) throw new StudioError("That segment could not be found.", 404);
  await useCleanFrame(segmentId, user.id);
  return ok({ template: await loadTemplateDto(id) });
});
