import type { SharedVoiceOption, VoiceAccountStatus, VoiceModelOption, VoiceOption, VoiceSettings } from "@/lib/studio/types";
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

/** Filters the provider's public voice library understands. Everything is optional. */
export type SharedVoiceQuery = {
  search?: string;
  language?: string;
  gender?: string;
  age?: string;
  accent?: string;
  useCase?: string;
  category?: string;
  pageSize?: number;
};

export type CloneRequest = {
  name: string;
  description?: string;
  removeBackgroundNoise?: boolean;
  files: Array<{ filename: string; bytes: Buffer; contentType: string }>;
};

/**
 * Everything below `synthesize` is optional and costs no narration credits:
 * browsing voices, copying one from the public library, cloning a voice from
 * recordings, removing a voice, and reading the account's own limits.
 */
export interface VoiceProvider {
  readonly id: "mock" | "elevenlabs";
  configured(): boolean;
  listVoices(): Promise<VoiceOption[]>;
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
  listSharedVoices?(query: SharedVoiceQuery): Promise<SharedVoiceOption[]>;
  addSharedVoice?(args: { publicOwnerId: string; voiceId: string; name: string }): Promise<VoiceOption>;
  cloneVoice?(request: CloneRequest): Promise<VoiceOption>;
  deleteVoice?(voiceId: string): Promise<void>;
  listModels?(): Promise<VoiceModelOption[]>;
  accountStatus?(): Promise<VoiceAccountStatus>;
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
  },
  async listSharedVoices() {
    return [];
  },
  async listModels() {
    return [{ id: "eleven_multilingual_v2", name: "Placeholder model", description: "Development only — no provider is connected.", costFactor: 1 }];
  },
  async accountStatus() {
    return { provider: "mock", tier: "development", characterCount: null, characterLimit: null, canCloneVoices: false, voicesUsed: null, voiceLimit: null };
  }
};

const ELEVENLABS_API = "https://api.elevenlabs.io";

function elevenLabsKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured");
  return key;
}

async function elevenLabs<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ELEVENLABS_API}${path}`, {
    ...init,
    headers: { "xi-api-key": elevenLabsKey(), ...(init.headers ?? {}) }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ElevenLabs ${path} ${response.status}: ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

/** Per-character cost relative to the standard models, as ElevenLabs bills them. */
function modelCostFactor(id: string) {
  return /flash|turbo/i.test(id) ? 0.5 : 1;
}

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
      category?: string;
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
      category: voice.category,
      languages: (voice.verified_languages ?? []).map((entry) => entry.language ?? "").filter(Boolean)
    }));
  },
  /** Public library browsing — free, and nothing is added to the account until `addSharedVoice`. */
  async listSharedVoices(query) {
    type SharedVoice = {
      voice_id: string;
      public_owner_id: string;
      name: string;
      description?: string;
      preview_url?: string;
      accent?: string;
      use_case?: string;
      language?: string;
      category?: string;
      gender?: string;
      age?: string;
    };
    const params = new URLSearchParams({ page_size: String(Math.min(60, Math.max(1, query.pageSize ?? 24))) });
    // The library's own filter names; empty values are simply left out.
    const filters: Array<[string, string | undefined]> = [
      ["search", query.search],
      ["language", query.language],
      ["gender", query.gender],
      ["age", query.age],
      ["accent", query.accent],
      ["use_cases", query.useCase],
      ["category", query.category]
    ];
    for (const [key, value] of filters) if (value?.trim()) params.set(key, value.trim());
    const data = await elevenLabs<{ voices?: SharedVoice[] }>(`/v1/shared-voices?${params.toString()}`);
    return (data.voices ?? []).map((voice) => ({
      id: voice.voice_id,
      publicOwnerId: voice.public_owner_id,
      name: voice.name,
      description: voice.description ?? undefined,
      previewUrl: voice.preview_url ?? null,
      accent: voice.accent ?? undefined,
      useCase: voice.use_case ?? undefined,
      category: voice.category ?? undefined,
      gender: voice.gender ?? undefined,
      age: voice.age ?? undefined,
      languages: voice.language ? [voice.language] : []
    }));
  },
  /** Copy a library voice into the account. Free; it only uses one voice slot. */
  async addSharedVoice({ publicOwnerId, voiceId, name }) {
    const data = await elevenLabs<{ voice_id: string }>(`/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ new_name: name })
    });
    return { id: data.voice_id, name, category: "library" };
  },
  /** Instant voice cloning from recordings. Free of narration credits; uses a voice slot. */
  async cloneVoice(request) {
    const form = new FormData();
    form.set("name", request.name);
    if (request.description) form.set("description", request.description);
    if (request.removeBackgroundNoise) form.set("remove_background_noise", "true");
    for (const file of request.files) {
      form.append("files", new Blob([new Uint8Array(file.bytes)], { type: file.contentType }), file.filename);
    }
    const response = await fetch(`${ELEVENLABS_API}/v1/voices/add`, { method: "POST", headers: { "xi-api-key": elevenLabsKey() }, body: form });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ElevenLabs clone ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = (await response.json()) as { voice_id: string; requires_verification?: boolean };
    return { id: data.voice_id, name: request.name, description: request.description, category: "cloned" };
  },
  async deleteVoice(voiceId) {
    const response = await fetch(`${ELEVENLABS_API}/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: { "xi-api-key": elevenLabsKey() } });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ElevenLabs delete voice ${response.status}: ${text.slice(0, 200)}`);
    }
  },
  async listModels() {
    type Model = { model_id: string; name?: string; description?: string; can_do_text_to_speech?: boolean; languages?: Array<{ language_id?: string; name?: string }> };
    const models = await elevenLabs<Model[]>("/v1/models");
    return models
      .filter((model) => model.can_do_text_to_speech !== false)
      .map((model) => ({
        id: model.model_id,
        name: model.name ?? model.model_id,
        description: model.description ?? undefined,
        costFactor: modelCostFactor(model.model_id),
        languages: (model.languages ?? []).map((entry) => entry.name ?? entry.language_id ?? "").filter(Boolean)
      }));
  },
  async accountStatus() {
    const data = await elevenLabs<{
      tier?: string;
      character_count?: number;
      character_limit?: number;
      can_use_instant_voice_cloning?: boolean;
      voice_limit?: number;
      voice_slots_used?: number;
    }>("/v1/user/subscription");
    return {
      provider: "elevenlabs",
      tier: data.tier ?? null,
      characterCount: data.character_count ?? null,
      characterLimit: data.character_limit ?? null,
      canCloneVoices: data.can_use_instant_voice_cloning ?? false,
      voicesUsed: data.voice_slots_used ?? null,
      voiceLimit: data.voice_limit ?? null
    };
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
