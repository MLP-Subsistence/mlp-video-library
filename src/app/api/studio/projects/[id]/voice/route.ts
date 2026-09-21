import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { generateSegmentVoice } from "@/lib/studio/services/voice";

type Params = { params: Promise<{ id: string }> };

/** Generate AI narration for one segment. "Generate All Missing" calls this once per segment. */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const body = await readJson<{ projectSegmentId?: string; force?: boolean }>(request);
  if (!body.projectSegmentId) throw new StudioError("Choose a segment to narrate.");
  const result = await generateSegmentVoice({ userId: user.id, projectId: id, projectSegmentId: String(body.projectSegmentId), force: Boolean(body.force) });
  return ok({ skipped: result.skipped, reason: result.skipped ? result.reason : null, project: await loadProjectDto(id, user) });
});
