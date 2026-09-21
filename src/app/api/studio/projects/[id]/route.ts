import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { cleanOptional, cleanText } from "@/lib/sanitize";
import { loadProjectDto } from "@/lib/studio/project-state";
import { parseVoiceSettings } from "@/lib/studio/services/credits";
import type { VoiceSettings } from "@/lib/studio/types";

type Params = { params: Promise<{ id: string }> };

export const GET = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const project = await loadProjectDto(id, user);
  if (!project) throw new StudioError("That localization project could not be found.", 404);
  return ok({ project });
});

/** Project-level settings: language context, glossary, voice defaults, render quality. */
export const PATCH = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const body = await readJson<{
    region?: string | null;
    variety?: string | null;
    audience?: string | null;
    register?: string | null;
    glossary?: string;
    defaultVoiceId?: string | null;
    defaultVoiceName?: string | null;
    voiceSettings?: VoiceSettings;
    renderQuality?: string;
  }>(request);
  const data: Record<string, unknown> = {};
  if (body.region !== undefined) data.region = cleanOptional(body.region)?.slice(0, 80) ?? null;
  if (body.variety !== undefined) data.variety = cleanOptional(body.variety)?.slice(0, 80) ?? null;
  if (body.audience !== undefined) data.audience = cleanOptional(body.audience)?.slice(0, 80) ?? null;
  if (body.register !== undefined) data.register = cleanOptional(body.register)?.slice(0, 160) ?? null;
  if (body.glossary !== undefined) data.glossary = String(body.glossary).replace(/[<>]/g, "").slice(0, 4000);
  if (body.defaultVoiceId !== undefined) {
    data.defaultVoiceId = cleanOptional(body.defaultVoiceId)?.slice(0, 120) ?? null;
    data.defaultVoiceName = cleanOptional(body.defaultVoiceName)?.slice(0, 120) ?? null;
  }
  if (body.voiceSettings !== undefined) data.voiceSettings = JSON.stringify(parseVoiceSettings(JSON.stringify(body.voiceSettings)));
  if (body.renderQuality !== undefined) data.renderQuality = cleanText(body.renderQuality) === "720p" ? "720p" : "1080p";
  await prisma.studioProject.update({ where: { id }, data });
  return ok({ project: await loadProjectDto(id, user) });
});

export const DELETE = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  const project = await requireProjectAccess(user, id);
  if (project.publishedVideoId) throw new StudioError("This localization has been published to the library. Ask an administrator to unpublish it first.", 409);
  await prisma.studioProject.delete({ where: { id } });
  return ok({ ok: true });
});
