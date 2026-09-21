import { prisma } from "@/lib/prisma";
import { assertTemplateManager, ok, readJson, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { cleanText } from "@/lib/sanitize";
import { loadTemplateDto, nextSegmentKey } from "@/lib/studio/templates";

type Params = { params: Promise<{ id: string }> };

/** Add a segment (at the end, or after `afterSegmentId`). Keys are stable and never reused. */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id } = await params;
  const body = await readJson<{ title?: string; sourceScript?: string; afterSegmentId?: string | null }>(request);
  const segments = await prisma.studioSegment.findMany({ where: { templateId: id }, orderBy: { orderIndex: "asc" } });
  const key = nextSegmentKey(segments.map((segment) => segment.key));
  const afterIndex = body.afterSegmentId ? segments.findIndex((segment) => segment.id === body.afterSegmentId) : segments.length - 1;
  const insertAt = afterIndex + 1;
  await prisma.$transaction([
    ...segments.slice(insertAt).map((segment) => prisma.studioSegment.update({ where: { id: segment.id }, data: { orderIndex: segment.orderIndex + 1 } })),
    prisma.studioSegment.create({
      data: {
        templateId: id,
        key,
        orderIndex: insertAt,
        title: cleanText(body.title).slice(0, 120) || `Segment ${insertAt + 1}`,
        sourceScript: String(body.sourceScript || "").trim().slice(0, 4000)
      }
    })
  ]);
  return ok({ template: await loadTemplateDto(id) }, { status: 201 });
});

/** Reorder: body.order is the full list of segment ids in the new order. */
export const PUT = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const { id } = await params;
  const body = await readJson<{ order?: string[] }>(request);
  const segments = await prisma.studioSegment.findMany({ where: { templateId: id } });
  const ids = new Set(segments.map((segment) => segment.id));
  const order = Array.isArray(body.order) ? body.order.filter((entry) => ids.has(entry)) : [];
  if (order.length !== segments.length) throw new StudioError("The new order does not include every segment.");
  await prisma.$transaction(order.map((segmentId, index) => prisma.studioSegment.update({ where: { id: segmentId }, data: { orderIndex: index } })));
  return ok({ template: await loadTemplateDto(id) });
});
