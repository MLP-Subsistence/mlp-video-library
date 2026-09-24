import { chatJson, openAiConfigured } from "@/lib/studio/services/openai";
import { parseGlossary } from "@/lib/studio/settings";

/**
 * TranslationService. Provider-specific calls stay here; UI code only ever
 * sees `translateSegments` and `backTranslate`.
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
  /** The whole lesson's source script, in order, so terms stay consistent across batches. */
  lessonScript: Array<{ key: string; text: string }>;
};

export type TranslationRequestSegment = {
  key: string;
  title: string;
  sourceScript: string;
  /** Neighbouring segments give the model discourse context without being translated again. */
  before: string | null;
  after: string | null;
};

export type TranslationResult = { key: string; translation: string; backTranslation: string };

/** Small enough that one request (with the draft-then-polish output) stays inside a serverless time limit. */
export const TRANSLATION_BATCH_SIZE = 5;

/**
 * The model the Studio used before the translation-quality work. Too weak for
 * lower-resource languages (it left words like "marketplace" in English in
 * Kinyarwanda), so a stored value equal to it is upgraded; any other model an
 * administrator types in is used as given.
 */
const ORIGINAL_DEFAULT_MODEL = "gpt-4.1-mini";
export const RECOMMENDED_TRANSLATION_MODEL = "gpt-4.1";

export function translationModel(configured: string | null | undefined) {
  const model = configured?.trim();
  return !model || model === ORIGINAL_DEFAULT_MODEL ? RECOMMENDED_TRANSLATION_MODEL : model;
}

export function translationConfigured() {
  return openAiConfigured();
}

function contextLines(context: TranslationContext) {
  const glossary = parseGlossary(context.glossary);
  const glossaryText = glossary.length
    ? glossary.map((entry) => (entry.preferred ? `- "${entry.term}" → "${entry.preferred}"` : `- keep "${entry.term}" consistent`)).join("\n")
    : "- (none)";
  return [
    `Lesson: ${context.lessonTitle}`,
    context.moduleName ? `Module: ${context.moduleName}` : null,
    `Source language: ${context.sourceLanguage}`,
    `Target language: ${context.targetLanguage}`,
    context.region ? `Region / country: ${context.region}` : null,
    context.variety ? `Language variety / dialect: ${context.variety}` : null,
    context.audience ? `Audience: ${context.audience}` : null,
    context.register ? `Register: ${context.register}` : "Register: simple, warm spoken language, as a respected local teacher would speak to adult learners",
    "Glossary (preferred terminology, always follow it):",
    glossaryText
  ].filter(Boolean) as string[];
}

const SYSTEM = [
  "You are a professional translator and native speaker of the target language, localizing narration for Marketplace Literacy educational videos.",
  "Marketplace Literacy teaches people living in poverty — often with little formal schooling — to understand buying, selling and running small businesses, starting from their own everyday experience.",
  "The text is read aloud by a narrator, so it must sound natural when spoken: idiomatic, everyday wording that the audience actually uses, never a word-for-word rendering of English sentence structure.",
  "Translate every word into the target language. Everyday concepts such as marketplace, market, buyer, seller, customer, entrepreneur, business, product, price, profit and savings must use the words local speakers use in daily life — never leave them in English.",
  "\"Marketplace literacy\" is an idea, not a brand name: express it in natural target-language words (roughly \"understanding the marketplace\" / \"knowing how markets work\"). The only English allowed is a proper name of a person or organisation (such as \"Marketplace Literacy Project\" when the project itself is named), unless the glossary says otherwise.",
  "Before answering, read your final translation and list any English words still in it; if any are not proper names, rewrite it without them.",
  "Preserve the meaning, numbers, names and teaching intent exactly. Do not add, drop or explain information. Keep each translation roughly as long to say aloud as the source.",
  "Use the full lesson script for context so terms and tone stay consistent from segment to segment.",
  "For each segment: first write a quick literal draft, then write the final natural translation a native speaker would say, then list the English words left in the final (normally none), then translate your final version back into plain English (literally enough that an English speaker can check its meaning).",
  "Return only the JSON described by the schema."
].join(" ");

export async function translateSegments(context: TranslationContext, segments: TranslationRequestSegment[]): Promise<TranslationResult[]> {
  if (segments.length === 0) return [];
  if (!openAiConfigured()) throw new Error("Translation is not configured on this server (OPENAI_API_KEY missing).");

  const lessonScript = context.lessonScript.map((line) => `${line.key}: ${line.text}`).join("\n");
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

  const user = `${contextLines(context).join("\n")}\n\nFull lesson script (context only, in order):\n${lessonScript}\n\nTranslate the TEXT TO TRANSLATE of each segment below into ${context.targetLanguage}. Return one entry per segment key.\n\n${segmentText}`;

  const result = await chatJson<{ segments: Array<{ key: string; literalDraft: string; translation: string; englishWordsLeft: string[]; backTranslation: string }> }>({
    model: context.model,
    system: SYSTEM,
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
              literalDraft: { type: "string" },
              translation: { type: "string" },
              englishWordsLeft: { type: "array", items: { type: "string" } },
              backTranslation: { type: "string" }
            },
            required: ["key", "literalDraft", "translation", "englishWordsLeft", "backTranslation"]
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
    cleaned.push({ key: entry.key, translation: entry.translation.trim(), backTranslation: entry.backTranslation.trim() });
  }
  const missing = segments.filter((segment) => !seen.has(segment.key));
  if (missing.length) throw new Error(`Translation response was missing segments: ${missing.map((segment) => segment.key).join(", ")}`);
  return cleaned;
}

/**
 * Plain-English meaning of a narration the educator may not be able to read,
 * so someone who only speaks English can check it says the right thing.
 */
export async function backTranslate(options: { model: string; targetLanguage: string; text: string; sourceScript: string }) {
  if (!openAiConfigured()) throw new Error("Translation is not configured on this server (OPENAI_API_KEY missing).");
  const result = await chatJson<{ english: string; matchesOriginal: boolean; differences: string }>({
    model: options.model,
    system:
      "You help English-speaking educators check narration written in a language they may not read. Translate the narration into plain English, literally enough to judge its meaning. Then compare it with the original English script and say briefly whether the meaning matches; list any meaning that was added, lost or changed (ignore normal differences in wording). Return only the JSON described by the schema.",
    user: `Narration language: ${options.targetLanguage}\n\nNarration:\n${options.text}\n\nOriginal English script:\n${options.sourceScript}`,
    schemaName: "back_translation",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        english: { type: "string" },
        matchesOriginal: { type: "boolean" },
        differences: { type: "string" }
      },
      required: ["english", "matchesOriginal", "differences"]
    }
  });
  return { english: result.english.trim(), matchesOriginal: result.matchesOriginal, differences: result.differences.trim() };
}
