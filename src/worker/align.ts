import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ALIGNMENT_READY_THRESHOLD, alignScriptToWords, type AlignmentResult, type TimedWord } from "@/lib/studio/services/alignment";
import { scriptHash } from "@/lib/studio/services/credits";
import { openAiConfigured, transcribeWithWords } from "@/lib/studio/services/openai";
import { getStudioSettings } from "@/lib/studio/settings";
import { cleanupWorkDir, makeWorkDir, materializeAsset, probe, run } from "@/worker/ffmpeg";

/**
 * Full-narration alignment job: one complete recording → per-segment start/end
 * times. Uses OpenAI word timestamps when configured; otherwise falls back to
 * a proportional split that flags every segment for review so nothing is
 * silently guessed.
 */
export async function alignFullNarration(options: { fullNarrationId: string; progress: (progress: number, stage: string) => Promise<void> }) {
  const narration = await prisma.studioFullNarration.findUnique({ where: { id: options.fullNarrationId }, include: { asset: true, project: true } });
  if (!narration) throw new Error("Full narration not found");
  const rows = await prisma.studioProjectSegment.findMany({
    where: { projectId: narration.projectId },
    include: { segment: true },
    orderBy: { segment: { orderIndex: "asc" } }
  });
  const scripted = rows.filter((row) => row.translation.trim().length > 0);
  if (scripted.length === 0) throw new Error("Translate the lesson before importing a full narration.");

  const workDir = await makeWorkDir("mlp-align");
  try {
    await options.progress(10, "Preparing audio");
    const source = await materializeAsset(narration.asset, workDir);
    const info = await probe(source);
    const audioDuration = info.durationSec || narration.asset.durationSec || 0;
    // 16 kHz mono MP3 keeps even hour-long recordings under the transcription upload limit.
    const compact = path.join(workDir, "narration-16k.mp3");
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", compact]);

    const settings = await getStudioSettings();
    const segmentsInput = scripted.map((row) => ({ segmentId: row.id, key: row.segment.key, text: row.translation }));
    let result: AlignmentResult;
    let method: "transcription" | "proportional";

    if (openAiConfigured()) {
      await options.progress(30, "Listening to the recording");
      const bytes = await readFile(compact);
      const prompt = scripted.map((row) => row.translation).join(" ").slice(0, 800);
      const languageHint = narration.project.targetLanguageCode.slice(0, 2).toLowerCase();
      let words: TimedWord[] = [];
      let transcribedDuration: number | null = null;
      try {
        const transcript = await transcribeWithWords({ model: settings.transcriptionModel, bytes, filename: "narration.mp3", mimeType: "audio/mpeg", language: languageHint, prompt });
        words = transcript.words;
        transcribedDuration = transcript.durationSec;
      } catch (error) {
        // Unsupported language hints return 400; retry letting the model detect the language.
        const message = String(error);
        if (!/400/.test(message)) throw error;
        const transcript = await transcribeWithWords({ model: settings.transcriptionModel, bytes, filename: "narration.mp3", mimeType: "audio/mpeg", prompt });
        words = transcript.words;
        transcribedDuration = transcript.durationSec;
      }
      await options.progress(70, "Matching the script to the audio");
      result = alignScriptToWords(segmentsInput, words, audioDuration || transcribedDuration);
      method = "transcription";
    } else {
      await options.progress(50, "Estimating segment boundaries");
      result = proportionalAlignment(segmentsInput, audioDuration);
      method = "proportional";
    }

    await options.progress(85, "Updating segments");
    const now = new Date();
    for (const aligned of result.segments) {
      const row = scripted.find((entry) => entry.id === aligned.segmentId)!;
      const duration = Math.max(0, aligned.endSec - aligned.startSec);
      await prisma.studioProjectSegment.update({
        where: { id: row.id },
        data: {
          narrationAssetId: narration.assetId,
          narrationSource: "full",
          narrationStartSec: aligned.startSec,
          narrationEndSec: aligned.endSec,
          narrationDurationSec: Math.round(duration * 1000) / 1000,
          narrationStatus: aligned.confidence >= ALIGNMENT_READY_THRESHOLD && method === "transcription" ? "ready" : "needs_review",
          narrationUpdatedAt: now,
          narrationScriptHash: scriptHash(row.translation),
          alignmentConfidence: aligned.confidence
        }
      });
    }
    await prisma.studioFullNarration.update({
      where: { id: narration.id },
      data: { status: "aligned", error: null, result: JSON.stringify({ method, audioDurationSec: result.audioDurationSec, transcriptWords: result.transcriptWords, segments: result.segments }) }
    });
    if (!narration.asset.durationSec && audioDuration) {
      await prisma.studioAsset.update({ where: { id: narration.assetId }, data: { durationSec: audioDuration } });
    }
    return result;
  } catch (error) {
    await prisma.studioFullNarration.update({ where: { id: narration.id }, data: { status: "failed", error: "The recording could not be aligned automatically. You can still record or upload each segment." } });
    throw error;
  } finally {
    await cleanupWorkDir(workDir);
  }
}

/** Without a transcription service, split the audio by script length. Everything is flagged for review. */
export function proportionalAlignment(segments: Array<{ segmentId: string; key: string; text: string }>, audioDuration: number): AlignmentResult {
  const weights = segments.map((segment) => Math.max(1, segment.text.trim().split(/\s+/).length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  const aligned = segments.map((segment, index) => {
    const share = (audioDuration * weights[index]) / total;
    const startSec = Math.round(cursor * 1000) / 1000;
    cursor += share;
    const endSec = Math.round(cursor * 1000) / 1000;
    return { segmentId: segment.segmentId, key: segment.key, startSec, endSec, confidence: 0.3, matchedTokens: 0, totalTokens: weights[index] };
  });
  return { segments: aligned, audioDurationSec: audioDuration, transcriptWords: 0 };
}
