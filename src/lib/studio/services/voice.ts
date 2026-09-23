import "server-only";
import { prisma } from "@/lib/prisma";
import { StudioError } from "@/lib/studio/access";
import { getStudioSettings } from "@/lib/studio/settings";
import { creditSummary, parseVoiceSettings, scriptHash } from "@/lib/studio/services/credits";
import { getVoiceProvider, type SharedVoiceQuery } from "@/lib/studio/services/voice-providers";
import { buildStorageKey, storage } from "@/lib/studio/storage";
import { readWavDurationSec } from "@/lib/studio/wav";

export { creditSummary, parseVoiceSettings, scriptHash };

/**
 * VoiceGenerationService: turns an approved translation into stored narration
 * while enforcing Marketplace Literacy's own AI Voice allowance. One credit is
 * one character sent to the provider.
 */

async function requireProvider() {
  const settings = await getStudioSettings();
  const provider = getVoiceProvider(settings.voiceProvider);
  if (!provider.configured()) throw new StudioError("AI Voice is not set up on this server yet. Please contact the MLP administrator.", 503);
  return { provider, settings };
}

export async function listVoices() {
  const { provider, settings } = await requireProvider();
  try {
    return { provider: provider.id, model: settings.voiceModel, voices: await provider.listVoices() };
  } catch (error) {
    throw new StudioError("The AI Voice service could not list voices right now. Please try again shortly.", 502, String(error));
  }
}

/**
 * Everything below is free of narration credits: browsing the provider's
 * public voice library, copying one into the account, cloning a voice from
 * recordings, removing a voice, and reading the account's own limits.
 */
export async function listSharedVoices(query: SharedVoiceQuery) {
  const { provider } = await requireProvider();
  if (!provider.listSharedVoices) throw new StudioError("The current voice provider has no voice library.", 501);
  try {
    return { provider: provider.id, voices: await provider.listSharedVoices({ ...query, pageSize: 24 }) };
  } catch (error) {
    throw new StudioError("The voice library could not be searched right now. Please try again shortly.", 502, String(error));
  }
}

export async function addSharedVoice(args: { publicOwnerId: string; voiceId: string; name: string }) {
  const { provider } = await requireProvider();
  if (!provider.addSharedVoice) throw new StudioError("The current voice provider cannot add library voices.", 501);
  const name = args.name.trim().slice(0, 60);
  if (!name) throw new StudioError("Give the voice a name first.");
  try {
    return await provider.addSharedVoice({ ...args, name });
  } catch (error) {
    const message = String(error);
    if (/voice_limit|slot/i.test(message)) throw new StudioError("The ElevenLabs account has no free voice slots. Remove a voice you no longer use first.", 409, message);
    throw new StudioError("That voice could not be added to the account. Please try again shortly.", 502, message);
  }
}

export async function cloneVoice(args: { name: string; description?: string; removeBackgroundNoise?: boolean; files: Array<{ filename: string; bytes: Buffer; contentType: string }> }) {
  const { provider } = await requireProvider();
  if (!provider.cloneVoice) throw new StudioError("The current voice provider cannot clone voices. Switch the provider to ElevenLabs in /admin/studio first.", 501);
  const name = args.name.trim().slice(0, 60);
  if (!name) throw new StudioError("Give the new voice a name.");
  if (args.files.length === 0) throw new StudioError("Add at least one recording of the voice (30 seconds to a few minutes of clear speech).");
  const totalBytes = args.files.reduce((sum, file) => sum + file.bytes.length, 0);
  if (totalBytes > 40 * 1024 * 1024) throw new StudioError("Those recordings are larger than 40 MB in total. Use shorter samples.");
  try {
    return await provider.cloneVoice({ ...args, name });
  } catch (error) {
    const message = String(error);
    if (/can_not_use_instant_voice_cloning|401|403/i.test(message)) throw new StudioError("This ElevenLabs plan does not allow instant voice cloning.", 403, message);
    if (/voice_limit|slot/i.test(message)) throw new StudioError("The ElevenLabs account has no free voice slots. Remove a voice you no longer use first.", 409, message);
    throw new StudioError("That voice could not be cloned. Check the recordings and try again.", 502, message);
  }
}

export async function deleteProviderVoice(voiceId: string) {
  const { provider } = await requireProvider();
  if (!provider.deleteVoice) throw new StudioError("The current voice provider cannot remove voices.", 501);
  const inUse = await prisma.studioProject.count({ where: { defaultVoiceId: voiceId } });
  if (inUse > 0) throw new StudioError(`That voice is still the project voice for ${inUse} localization${inUse === 1 ? "" : "s"}. Choose another voice there first.`, 409);
  try {
    await provider.deleteVoice(voiceId);
  } catch (error) {
    throw new StudioError("That voice could not be removed. Please try again shortly.", 502, String(error));
  }
  return { id: voiceId };
}

export async function voiceAccountStatus() {
  const { provider, settings } = await requireProvider();
  const [status, models] = await Promise.all([
    provider.accountStatus ? provider.accountStatus().catch(() => null) : Promise.resolve(null),
    provider.listModels ? provider.listModels().catch(() => []) : Promise.resolve([])
  ]);
  return { provider: provider.id, defaultModel: settings.voiceModel, status, models };
}

/**
 * Voice Design: describe a voice in words, listen to a few generated
 * candidates, then save the one you want. Generating previews uses a small
 * amount of the provider's own quota but never this project's narration
 * credits — only `generateSegmentVoice` charges those.
 */
export async function designVoicePreviews(args: { voiceDescription: string; text?: string }) {
  const { provider } = await requireProvider();
  if (!provider.designVoice) throw new StudioError("The current voice provider cannot design voices. Switch the provider to ElevenLabs in /admin/studio first.", 501);
  const voiceDescription = args.voiceDescription.trim().slice(0, 1000);
  if (voiceDescription.length < 20) throw new StudioError("Describe the voice in a bit more detail (at least 20 characters) — for example the speaker's age, tone and accent.");
  try {
    return await provider.designVoice({ voiceDescription, text: args.text?.trim().slice(0, 1000) || undefined });
  } catch (error) {
    throw new StudioError("Those voices could not be generated right now. Please try again shortly.", 502, String(error));
  }
}

export async function saveDesignedVoice(args: { generatedVoiceId: string; name: string; description: string }) {
  const { provider } = await requireProvider();
  if (!provider.saveDesignedVoice) throw new StudioError("The current voice provider cannot save designed voices.", 501);
  const name = args.name.trim().slice(0, 60);
  if (!name) throw new StudioError("Give the new voice a name.");
  try {
    return await provider.saveDesignedVoice({ generatedVoiceId: args.generatedVoiceId, name, description: args.description.trim().slice(0, 400) });
  } catch (error) {
    const message = String(error);
    if (/voice_limit|slot/i.test(message)) throw new StudioError("The ElevenLabs account has no free voice slots. Remove a voice you no longer use first.", 409, message);
    throw new StudioError("That voice could not be saved. Please try again shortly.", 502, message);
  }
}

/** This project's narration-generation history, newest first — the ledger already records every attempt. */
export async function voiceHistory(projectId: string, options: { limit?: number } = {}) {
  const rows = await prisma.studioVoiceUsage.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, options.limit ?? 100))
  });
  // `segmentId` on the ledger is the StudioProjectSegment id (this project's copy), not the
  // master StudioSegment id — it has no Prisma relation because a segment can be removed from
  // the template after it was billed, so the lookup is manual and tolerant of misses.
  const projectSegmentIds = [...new Set(rows.map((row) => row.segmentId).filter((id): id is string => Boolean(id)))];
  const [projectSegments, assets] = await Promise.all([
    prisma.studioProjectSegment.findMany({ where: { id: { in: projectSegmentIds } }, select: { id: true, translation: true, segment: { select: { key: true, title: true, sourceScript: true } } } }),
    prisma.studioAsset.findMany({ where: { id: { in: rows.map((row) => row.outputAssetId).filter((id): id is string => Boolean(id)) } }, select: { id: true, url: true } })
  ]);
  const projectSegmentById = new Map(projectSegments.map((row) => [row.id, row]));
  const assetUrlById = new Map(assets.map((asset) => [asset.id, asset.url]));
  return rows.map((row) => {
    const projectSegment = row.segmentId ? projectSegmentById.get(row.segmentId) : undefined;
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      status: row.status,
      characters: row.characters,
      voiceId: row.voiceId,
      model: row.model,
      segmentId: row.segmentId,
      segmentTitle: projectSegment?.segment.title ?? null,
      segmentKey: projectSegment?.segment.key ?? null,
      textSnippet: projectSegment?.translation || projectSegment?.segment.sourceScript || null,
      outputAssetUrl: row.outputAssetId ? assetUrlById.get(row.outputAssetId) ?? null : null,
      isRetry: row.isRetry
    };
  });
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

  const projectSettings = parseVoiceSettings(project.voiceSettings);
  const model = projectSettings.model?.trim() || settings.voiceModel;
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
  const requestKey = `${segment.id}:${voiceId}:${model}:${hash}${options.force ? `:${Date.now()}` : ""}`;
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
      model,
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
      model,
      languageCode: project.targetLanguageCode,
      settings: projectSettings
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
