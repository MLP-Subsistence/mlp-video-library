import { prisma } from "@/lib/prisma";
import { ok, readJson, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { openAiConfigured } from "@/lib/studio/services/openai";
import { translationModel } from "@/lib/studio/services/translation";
import { buildPhrases, buildPhrasesFromPauses, matchLinesToPhrases } from "@/lib/studio/services/voiceover-match";
import { getStudioSettings } from "@/lib/studio/settings";

type Params = { params: Promise<{ id: string }> };

/**
 * Where does each script line start in the voice-over? Takes the recognised
 * words (from /listen) and returns, per segment in lesson order, the time it
 * starts and what was heard in it.
 */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  const project = await requireProjectAccess(user, id);
  if (!openAiConfigured()) throw new StudioError("Matching the voice-over to the script isn't set up on this server. Split it at the pauses instead.", 503);
  const body = await readJson<{ words?: Array<{ word?: string; start?: number; end?: number }>; pauses?: Array<{ startSec?: number; endSec?: number }>; durationSec?: number }>(request);
  const words = (Array.isArray(body.words) ? body.words : [])
    .slice(0, 20_000)
    .map((word) => ({ word: String(word.word ?? "").slice(0, 60), start: Number(word.start), end: Number(word.end) }))
    .filter((word) => word.word.trim() && Number.isFinite(word.start) && Number.isFinite(word.end));
  const rows = await prisma.studioProjectSegment.findMany({ where: { projectId: id }, include: { segment: true }, orderBy: { segment: { orderIndex: "asc" } } });
  // Pauses measured in the browser from the audio itself are far more precise than the recognizer's word times.
  const pauses = (Array.isArray(body.pauses) ? body.pauses : [])
    .slice(0, 5000)
    .map((pause) => ({ startSec: Number(pause.startSec), endSec: Number(pause.endSec) }))
    .filter((pause) => Number.isFinite(pause.startSec) && Number.isFinite(pause.endSec) && pause.endSec > pause.startSec);
  const durationSec = Number(body.durationSec);
  const phrases = pauses.length && Number.isFinite(durationSec) && durationSec > 0 ? buildPhrasesFromPauses(words, pauses, durationSec) : buildPhrases(words);
  if (phrases.length < rows.length) throw new StudioError("Not enough speech was recognised to place every segment. Split it at the pauses, or mark the segments while listening.", 422);
  const settings = await getStudioSettings();
  const starts = await matchLinesToPhrases({
    model: translationModel(settings.translationModel),
    language: project.targetLanguageName,
    lines: rows.map((row) => ({ english: row.segment.sourceScript || row.segment.title, target: row.translation })),
    phrases
  }).catch((error) => {
    throw new StudioError("The voice-over couldn't be matched to the script right now. Try again, or split it at the pauses.", 502, String(error));
  });
  if (!starts) throw new StudioError("Not enough speech was recognised to place every segment.", 422);
  const segments = rows.map((row, index) => {
    const from = starts[index];
    const to = index + 1 < starts.length ? starts[index + 1] : phrases.length;
    return {
      projectSegmentId: row.id,
      startSec: phrases[from].start,
      endSec: phrases[to - 1].end,
      heard: phrases.slice(from, to).map((phrase) => phrase.text).join(" ")
    };
  });
  return ok({ segments });
});
