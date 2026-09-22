import type { VoiceOption, VoiceSettings } from "@/lib/studio/types";
import { buildPlaceholderSpeech, estimateSpeechSeconds } from "@/lib/studio/wav";

/**
 * VoiceProvider is the only thing the rest of the studio knows about text to
 * speech. Add a provider by implementing this interface and registering it in
 * `getVoiceProvider()`.
 */
export type SynthesisRequest = {
  text: string;
  voiceId: string;
  model: string;
  languageCode: string;
  settings: VoiceSettings;
};

export type SynthesisResult = {
  bytes: Buffer;
  mimeType: string;
  extension: string;
  /** Duration when the provider knows it; otherwise measured downstream. */
  durationSec: number | null;
  /** Characters the provider actually billed, when reported. */
  billedCharacters: number | null;
};

export interface VoiceProvider {
  readonly id: "mock" | "elevenlabs";
  configured(): boolean;
  listVoices(): Promise<VoiceOption[]>;
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
}

/** Placeholder provider so the whole narration → timeline → render pipeline runs without ElevenLabs. */
export const mockVoiceProvider: VoiceProvider = {
  id: "mock",
  configured: () => true,
  async listVoices() {
    return [
      { id: "mock-female", name: "Placeholder Voice A", description: "Silent placeholder audio timed to the script (development only).", languages: ["*"] },
      { id: "mock-male", name: "Placeholder Voice B", description: "Silent placeholder audio timed to the script (development only).", languages: ["*"] }
    ];
  },
  async synthesize(request) {
    const durationSec = estimateSpeechSeconds(request.text);
    return {
      bytes: buildPlaceholderSpeech(durationSec),
      mimeType: "audio/wav",
      extension: ".wav",
      durationSec,
      billedCharacters: request.text.length
    };
  }
};

/**
 * ElevenLabs adapter.
 *
 * Credits, ledger, storage, timeline and rendering are provider-independent;
 * this adapter supplies the live ElevenLabs implementation.
 *
 * Expected environment: ELEVENLABS_API_KEY (server/worker only).
 * Endpoints verified against the ElevenLabs API reference:
 *   GET  https://api.elevenlabs.io/v2/voices
 *   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
 *        body: { text, model_id, voice_settings: { stability, similarity_boost, style, speed } }
 *        response: audio/mpeg bytes; header `x-character-count` reports billed characters when present.
 */
export const elevenLabsVoiceProvider: VoiceProvider = {
  id: "elevenlabs",
  configured: () => Boolean(process.env.ELEVENLABS_API_KEY),
  async listVoices() {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");
    type ElevenLabsVoice = {
      voice_id: string;
      name: string;
      description?: string;
      preview_url?: string;
      labels?: Record<string, string>;
      verified_languages?: Array<{ language?: string }>;
    };
    const voices: ElevenLabsVoice[] = [];
    let nextPageToken: string | null = null;
    do {
      const url = new URL("https://api.elevenlabs.io/v2/voices");
      url.searchParams.set("page_size", "100");
      url.searchParams.set("include_total_count", "false");
      if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
      const response = await fetch(url, {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }
      });
      if (!response.ok) throw new Error(`ElevenLabs voices ${response.status}`);
      const data = (await response.json()) as {
        voices?: ElevenLabsVoice[];
        has_more?: boolean;
        next_page_token?: string | null;
      };
      voices.push(...(data.voices ?? []));
      nextPageToken = data.has_more ? data.next_page_token ?? null : null;
    } while (nextPageToken);

    return voices.map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      description: voice.description ?? undefined,
      previewUrl: voice.preview_url ?? null,
      labels: voice.labels,
      languages: (voice.verified_languages ?? []).map((entry) => entry.language ?? "").filter(Boolean)
    }));
  },
  async synthesize(request) {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");
    const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(request.voiceId)}`);
    url.searchParams.set("output_format", "mp3_44100_128");
    const response = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text: request.text,
        model_id: request.model,
        voice_settings: {
          stability: request.settings.stability ?? 0.5,
          similarity_boost: request.settings.similarity ?? 0.75,
          style: request.settings.style ?? 0,
          speed: request.settings.speed ?? 1
        }
      })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ElevenLabs synthesis ${response.status}: ${text.slice(0, 300)}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const billed = Number(response.headers.get("x-character-count") || "");
    return { bytes, mimeType: "audio/mpeg", extension: ".mp3", durationSec: null, billedCharacters: Number.isFinite(billed) && billed > 0 ? billed : null };
  }
};

export function getVoiceProvider(id: string | null | undefined): VoiceProvider {
  if (id === "elevenlabs") return elevenLabsVoiceProvider;
  return mockVoiceProvider;
}
