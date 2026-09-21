import { chatJson, openAiConfigured } from "@/lib/studio/services/openai";
import { parseGlossary } from "@/lib/studio/settings";

/**
 * TranslationService. Provider-specific calls stay here; UI code only ever
 * sees `translateSegments`.
 */

export type TranslationContext = {
  lessonTitle: string;
  moduleName: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  region: string | null;
  variety: string | null;
  audience: string | null;
  register: string | null;
  glossary: string;
  model: string;
};

export type TranslationRequestSegment = {
  key: string;
  title: string;
  sourceScript: string;
  /** Neighbouring segments give the model discourse context without being translated again. */
  before: string | null;
  after: string | null;
};

export type TranslationResult = { key: string; translation: string };

export const TRANSLATION_BATCH_SIZE = 8;

export function translationConfigured() {
  return openAiConfigured();
}

export async function translateSegments(context: TranslationContext, segments: TranslationRequestSegment[]): Promise<TranslationResult[]> {
  if (segments.length === 0) return [];
  if (!openAiConfigured()) throw new Error("Translation is not configured on this server (OPENAI_API_KEY missing).");

  const glossary = parseGlossary(context.glossary);
  const glossaryText = glossary.length
    ? glossary.map((entry) => (entry.preferred ? `- "${entry.term}" → "${entry.preferred}"` : `- keep "${entry.term}" consistent`)).join("\n")
    : "- (none)";

  const system = [
    "You translate short narration scripts for Marketplace Literacy educational videos.",
    "Each segment is narrated aloud by an educator, so write natural spoken language that a narrator can read comfortably.",
    "Preserve meaning, numbers, names and the teaching intent. Do not add or remove information. Do not add commentary.",
    "Keep each translation roughly the same speaking length as the source so the video timing stays reasonable.",
    "Return only the JSON described by the schema."
  ].join(" ");

  const audienceLines = [
    `Lesson: ${context.lessonTitle}`,
    context.moduleName ? `Module: ${context.moduleName}` : null,
    `Source language: ${context.sourceLanguage}`,
    `Target language: ${context.targetLanguage}`,
    context.region ? `Region / country: ${context.region}` : null,
    context.variety ? `Language variety / dialect: ${context.variety}` : null,
    context.audience ? `Audience: ${context.audience}` : null,
    context.register ? `Register: ${context.register}` : "Register: simple spoken educational language",
    "Glossary (preferred terminology):",
    glossaryText
  ].filter(Boolean);

  const segmentText = segments
    .map((segment) =>
      [
        `### ${segment.key} — ${segment.title}`,
        segment.before ? `(previous segment, context only): ${segment.before}` : null,
        `TEXT TO TRANSLATE: ${segment.sourceScript}`,
        segment.after ? `(next segment, context only): ${segment.after}` : null
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  const user = `${audienceLines.join("\n")}\n\nTranslate the TEXT TO TRANSLATE of each segment below into ${context.targetLanguage}. Return one entry per segment key.\n\n${segmentText}`;

  const result = await chatJson<{ segments: TranslationResult[] }>({
    model: context.model,
    system,
    user,
    schemaName: "segment_translations",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        segments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              key: { type: "string" },
              translation: { type: "string" }
            },
            required: ["key", "translation"]
          }
        }
      },
      required: ["segments"]
    }
  });

  const wanted = new Set(segments.map((segment) => segment.key));
  const seen = new Set<string>();
  const cleaned: TranslationResult[] = [];
  for (const entry of result.segments) {
    if (!wanted.has(entry.key) || seen.has(entry.key)) continue;
    seen.add(entry.key);
    cleaned.push({ key: entry.key, translation: entry.translation.trim() });
  }
  const missing = segments.filter((segment) => !seen.has(segment.key));
  if (missing.length) throw new Error(`Translation response was missing segments: ${missing.map((segment) => segment.key).join(", ")}`);
  return cleaned;
}
