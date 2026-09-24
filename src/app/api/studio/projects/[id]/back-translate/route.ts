import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { backTranslate, translationConfigured, translationModel } from "@/lib/studio/services/translation";
import { getStudioSettings } from "@/lib/studio/settings";

type Params = { params: Promise<{ id: string }> };

/**
 * "What does this say in English?" for one segment's narration text, so an
 * educator working in a language they don't read can check its meaning.
 * Nothing is stored: the answer belongs to the exact text sent.
 */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  const project = await requireProjectAccess(user, id);
  if (!translationConfigured()) throw new StudioError("Translation is not set up on this server yet. Please contact the MLP administrator.", 503);
  const body = await readJson<{ segmentId?: string; text?: string }>(request);
  const row = await prisma.studioProjectSegment.findFirst({ where: { id: String(body.segmentId || ""), projectId: id }, include: { segment: true } });
  if (!row) throw new StudioError("That segment could not be found.", 404);
  const text = (typeof body.text === "string" ? body.text : row.translation).trim().slice(0, 4000);
  if (!text) throw new StudioError("There is no narration text to check yet.");
  const settings = await getStudioSettings();
  const result = await backTranslate({ model: translationModel(settings.translationModel), targetLanguage: project.targetLanguageName, text, sourceScript: row.segment.sourceScript }).catch((error) => {
    throw new StudioError("The meaning check isn't available right now. Please try again in a moment.", 502, String(error));
  });
  return ok({ text, ...result });
});
