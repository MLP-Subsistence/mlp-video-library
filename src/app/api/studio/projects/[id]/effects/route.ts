import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { parseComposition, serializeComposition } from "@/lib/studio/layouts";
import { loadProjectDto } from "@/lib/studio/project-state";

type Params = { params: Promise<{ id: string }> };

/** One-click lesson-wide visual effects. Individual clips remain editable afterwards. */
export const PATCH = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const body = await readJson<{ effect?: string; enabled?: boolean }>(request);
  if (body.effect !== "transition" && body.effect !== "motion") throw new StudioError("Choose transitions or photo motion.");
  const rows = await prisma.studioProjectSegment.findMany({ where: { projectId: id }, include: { segment: true } });
  await prisma.$transaction([
    ...rows.map((row) => {
      const composition = parseComposition(row.compositionOverride ?? row.segment.composition);
      if (body.effect === "transition") composition.transition = body.enabled ? "fade" : "none";
      else composition.motion = body.enabled ? "zoom-in" : "none";
      return prisma.studioProjectSegment.update({ where: { id: row.id }, data: { compositionOverride: serializeComposition(composition) } });
    }),
    prisma.studioProject.update({ where: { id }, data: { status: "in_progress", approvedAt: null } })
  ]);
  return ok({ project: await loadProjectDto(id, user) });
});
