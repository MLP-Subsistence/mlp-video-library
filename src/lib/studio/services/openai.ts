/**
 * Minimal server-side OpenAI client (fetch only, no SDK). Used by the
 * TranslationService and, in the worker, by the SpeechAlignmentService.
 * The key never leaves the server.
 */

export function openAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function baseUrl() {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
}

function headers(extra: Record<string, string> = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  return { authorization: `Bearer ${key}`, ...extra };
}

export type JsonSchema = Record<string, unknown>;

export async function chatJson<T>(options: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<T> {
  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature ?? 0.2,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user }
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: options.schemaName, strict: true, schema: options.schema }
      }
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${text.slice(0, 400)}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string; refusal?: string } }> };
  const message = data.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI refused: ${message.refusal}`);
  const content = message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");
  return JSON.parse(content) as T;
}

export type TranscriptionWord = { word: string; start: number; end: number };

/**
 * Word-level transcription used for full-narration alignment. `language` is an
 * ISO-639-1 hint; the prompt biases recognition toward the approved script.
 */
export async function transcribeWithWords(options: {
  model: string;
  bytes: Buffer;
  filename: string;
  mimeType: string;
  language?: string;
  prompt?: string;
}): Promise<{ text: string; words: TranscriptionWord[]; durationSec: number | null }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(options.bytes)], { type: options.mimeType }), options.filename);
  form.append("model", options.model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (options.language) form.append("language", options.language);
  if (options.prompt) form.append("prompt", options.prompt.slice(0, 800));
  const response = await fetch(`${baseUrl()}/audio/transcriptions`, { method: "POST", headers: headers(), body: form });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI transcription ${response.status}: ${text.slice(0, 400)}`);
  }
  const data = (await response.json()) as { text?: string; duration?: number; words?: TranscriptionWord[] };
  return { text: data.text ?? "", words: data.words ?? [], durationSec: typeof data.duration === "number" ? data.duration : null };
}
