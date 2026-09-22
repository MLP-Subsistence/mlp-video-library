import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { projectSnapshot, segmentRestoreData, segmentSnapshot, snapshotsEqual, verifyUndoToken } from "@/lib/studio/undo";

type Params = { params: Promise<{ id: string }> };

/** Restore one signed, last-known edit. A changed row cannot be overwritten by a stale Undo. */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const { token } = await readJson<{ token?: string }>(request);
  const entry = verifyUndoToken(String(token || ""));
  if (entry.projectId !== id || entry.userId !== user.id) throw new StudioError("That change cannot be undone from this project.", 403);

  await prisma.$transaction(async (tx) => {
    if (entry.scope === "segment") {
      const current = await tx.studioProjectSegment.findFirst({ where: { id: entry.recordId, projectId: id } });
      if (!current) throw new StudioError("That segment no longer exists.", 404);
      if (!snapshotsEqual(segmentSnapshot(current), entry.after)) throw new StudioError("This segment changed again. Refresh before trying another edit.", 409);
      const updated = await tx.studioProjectSegment.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data: segmentRestoreData(entry.before) });
      if (updated.count !== 1) throw new StudioError("This segment changed again. Refresh before trying another edit.", 409);
      await tx.studioProject.update({ where: { id }, data: { updatedAt: new Date() } });
    } else {
      const current = await tx.studioProject.findUnique({ where: { id } });
      if (!current) throw new StudioError("That localization project no longer exists.", 404);
      if (!snapshotsEqual(projectSnapshot(current), entry.after)) throw new StudioError("Project settings changed again. Refresh before trying another edit.", 409);
      const updated = await tx.studioProject.updateMany({ where: { id, updatedAt: current.updatedAt }, data: entry.before });
      if (updated.count !== 1) throw new StudioError("Project settings changed again. Refresh before trying another edit.", 409);
    }
  });

  return ok({ project: await loadProjectDto(id, user) });
});
