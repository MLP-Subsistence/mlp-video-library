import { prisma } from "@/lib/prisma";
import { ok, requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { openAiConfigured, transcribeWithWords } from "@/lib/studio/services/openai";
import { getStudioSettings } from "@/lib/studio/settings";
import { speechLanguage } from "@/lib/studio/speech-languages";

type Params = { params: Promise<{ id: string }> };

/** Chunks arrive as 16 kHz mono WAV (~2 min ≈ 3.8 MB), under Netlify's request body limit. */
const MAX_CHUNK_BYTES = 5 * 1024 * 1024;

/** Can this lesson's voice-over be split by listening to the words? */
export const GET = studioRoute(async (_request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  const project = await requireProjectAccess(user, id);
  return ok({ available: openAiConfigured(), language: speechLanguage(project.targetLanguageCode) });
});

/**
 * Speech recognition for one chunk of a whole-lesson voice-over. The browser
 * sends the voice-over in short chunks so each request stays small and fast;
 * `offset` places this chunk's word times on the whole recording.
 */
export const POST = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  const project = await requireProjectAccess(user, id);
  if (!openAiConfigured()) throw new StudioError("Listening to the voice-over isn't set up on this server. Split it at the pauses instead.", 503);
  const offset = Math.max(0, Number(new URL(request.url).searchParams.get("offset")) || 0);
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length < 1000) throw new StudioError("That piece of the voice-over was empty.");
  if (bytes.length > MAX_CHUNK_BYTES) throw new StudioError("That piece of the voice-over is too large to send at once.", 413);
  const [settings, rows] = await Promise.all([
    getStudioSettings(),
    prisma.studioProjectSegment.findMany({ where: { projectId: id }, select: { translation: true }, orderBy: { segment: { orderIndex: "asc" } } })
  ]);
  // The lesson's own wording, when it exists, helps the recognizer spell names and terms the same way.
  const prompt = rows.map((row) => row.translation.trim()).filter(Boolean).join(" ").slice(0, 800) || undefined;
  const language = speechLanguage(project.targetLanguageCode) ?? undefined;
  const result = await transcribeWithWords({ model: settings.transcriptionModel || "whisper-1", bytes, filename: "voiceover.wav", mimeType: "audio/wav", language, prompt }).catch((error) => {
    throw new StudioError("The voice-over couldn't be listened to right now. Try again, or split it at the pauses.", 502, String(error));
  });
  return ok({ words: result.words.map((word) => ({ word: word.word, start: Math.round((word.start + offset) * 1000) / 1000, end: Math.round((word.end + offset) * 1000) / 1000 })) });
});
