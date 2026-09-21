import "server-only";
import { prisma } from "@/lib/prisma";
import { StudioError } from "@/lib/studio/access";
import { getStudioSettings } from "@/lib/studio/settings";
import { creditSummary, parseVoiceSettings, scriptHash } from "@/lib/studio/services/credits";
import { getVoiceProvider } from "@/lib/studio/services/voice-providers";
import { buildStorageKey, storage } from "@/lib/studio/storage";
import { readWavDurationSec } from "@/lib/studio/wav";

export { creditSummary, parseVoiceSettings, scriptHash };

/**
 * VoiceGenerationService: turns an approved translation into stored narration
 * while enforcing Marketplace Literacy's own AI Voice allowance. One credit is
 * one character sent to the provider.
 */

export async function listVoices() {
  const settings = await getStudioSettings();
  const provider = getVoiceProvider(settings.voiceProvider);
  if (!provider.configured()) throw new StudioError("AI Voice is not set up on this server yet. Please contact the MLP administrator.", 503);
  try {
    return { provider: provider.id, model: settings.voiceModel, voices: await provider.listVoices() };
  } catch (error) {
    throw new StudioError("The AI Voice service could not list voices right now. Please try again shortly.", 502, String(error));
  }
}

export async function generateSegmentVoice(options: { userId: string; projectId: string; projectSegmentId: string; force?: boolean }) {
  const settings = await getStudioSettings();
  const provider = getVoiceProvider(settings.voiceProvider);
  if (!provider.configured()) throw new StudioError("AI Voice is not set up on this server yet. Please contact the MLP administrator.", 503);

  const [project, segment] = await Promise.all([
    prisma.studioProject.findUnique({ where: { id: options.projectId } }),
    prisma.studioProjectSegment.findUnique({ where: { id: options.projectSegmentId }, include: { segment: true } })
  ]);
  if (!project || !segment || segment.projectId !== project.id) throw new StudioError("That segment could not be found.", 404);

  const text = segment.translation.trim();
  if (!text) throw new StudioError(`Segment ${segment.segment.key} has no translation yet.`);
  if (segment.translationStatus !== "approved") throw new StudioError(`Approve the translation for "${segment.segment.title}" before generating narration.`);

  const voiceId = segment.voiceIdOverride || project.defaultVoiceId;
  if (!voiceId) throw new StudioError("Choose a voice for this project on the AI Voice page first.");

  const hash = scriptHash(text);
  const alreadyCurrent = segment.narrationSource === "ai" && segment.narrationScriptHash === hash && segment.narrationStatus === "ready" && segment.narrationAssetId;
  if (alreadyCurrent && !options.force) {
    return { skipped: true as const, reason: "Narration is already up to date for this translation." };
  }

  const characters = text.length;
  const credits = await creditSummary(options.userId);
  if (credits.remaining < characters) {
    throw new StudioError(`Not enough AI Voice credits: this segment needs ${characters.toLocaleString()} and ${credits.remaining.toLocaleString()} remain. Ask the MLP administrator for more.`, 402);
  }

  // Idempotency: the same script + voice + model for the same segment is one request.
  const requestKey = `${segment.id}:${voiceId}:${settings.voiceModel}:${hash}${options.force ? `:${Date.now()}` : ""}`;
  const existing = await prisma.studioVoiceUsage.findUnique({ where: { requestKey } });
  if (existing && existing.status === "reserved") throw new StudioError("This narration is already being generated. Please wait a moment.", 409);

  const isRetry = Boolean(await prisma.studioVoiceUsage.findFirst({ where: { projectId: project.id, segmentId: segment.id, status: "charged" } }));
  const ledger = await prisma.studioVoiceUsage.upsert({
    where: { requestKey },
    update: { status: "reserved", characters, credits: characters, isRetry },
    create: {
      requestKey,
      userId: options.userId,
      projectId: project.id,
      segmentId: segment.id,
      languageCode: project.targetLanguageCode,
      provider: provider.id,
      model: settings.voiceModel,
      voiceId,
      characters,
      credits: characters,
      status: "reserved",
      isRetry
    }
  });

  try {
    const result = await provider.synthesize({
      text,
      voiceId,
      model: settings.voiceModel,
      languageCode: project.targetLanguageCode,
      settings: parseVoiceSettings(project.voiceSettings)
    });
    const key = buildStorageKey(`projects/${project.id}/narration`, `${segment.segment.key}-ai${result.extension}`);
    await storage().put(key, result.bytes, result.mimeType);
    const durationSec = result.durationSec ?? (result.mimeType === "audio/wav" ? readWavDurationSec(result.bytes) : null) ?? 0;
    const asset = await prisma.studioAsset.create({
      data: {
        kind: "audio",
        name: `${project.title} — ${segment.segment.key} (AI voice)`,
        storageKey: key,
        url: storage().publicUrl(key),
        mimeType: result.mimeType,
        sizeBytes: result.bytes.length,
        durationSec,
        tags: `narration, ai-voice, ${project.targetLanguageCode}`,
        uploadedById: options.userId
      }
    });
    const [updated] = await Promise.all([
      prisma.studioProjectSegment.update({
        where: { id: segment.id },
        data: {
          narrationAssetId: asset.id,
          narrationSource: "ai",
          narrationStartSec: null,
          narrationEndSec: null,
          narrationDurationSec: durationSec,
          narrationStatus: durationSec > 0 ? "ready" : "needs_review",
          narrationUpdatedAt: new Date(),
          narrationScriptHash: hash,
          alignmentConfidence: null
        }
      }),
      prisma.studioVoiceUsage.update({
        where: { id: ledger.id },
        data: { status: "charged", credits: result.billedCharacters ?? characters, characters: result.billedCharacters ?? characters, outputAssetId: asset.id }
      })
    ]);
    return { skipped: false as const, asset, segment: updated, durationSec };
  } catch (error) {
    await prisma.studioVoiceUsage.update({ where: { id: ledger.id }, data: { status: "failed", credits: 0 } });
    throw new StudioError("The AI Voice service could not generate this narration. Please try again in a moment.", 502, String(error));
  }
}
