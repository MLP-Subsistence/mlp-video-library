import { chatJson } from "@/lib/studio/services/openai";
import type { TranscriptionWord } from "@/lib/studio/services/openai";

/**
 * Splitting a whole-lesson voice-over by what is said. Speech recognition
 * gives timed words in the voice-over's language; they're grouped into short
 * phrases, and an AI decides which phrase each script line starts at, by
 * meaning — so it works whatever the pacing, and the voice-over doesn't have
 * to match our translation word for word.
 */

export type Phrase = { start: number; end: number; text: string };

const SENTENCE_END = /[.!?؟۔।。…]$/;

/** Words → short timed phrases, breaking at pauses and sentence ends so a script line can start at any phrase. */
export function buildPhrases(words: TranscriptionWord[], gapSec = 0.25, maxWords = 16): Phrase[] {
  const sorted = [...words].filter((word) => word.word.trim()).sort((a, b) => a.start - b.start);
  const phrases: Phrase[] = [];
  let current: TranscriptionWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    phrases.push({ start: current[0].start, end: current[current.length - 1].end, text: current.map((word) => word.word.trim()).join(" ") });
    current = [];
  };
  for (const word of sorted) {
    const previous = current[current.length - 1];
    if (previous && (word.start - previous.end >= gapSec || SENTENCE_END.test(previous.word.trim()) || current.length >= maxWords)) flush();
    current.push(word);
  }
  flush();
  return phrases;
}

/**
 * Phrases cut at the pauses measured in the audio itself. Speech recognition's
 * word times smear across pauses (it rarely leaves gaps or punctuation), so its
 * phrases can straddle two script lines; the measured pauses can't. Each word
 * goes to the stretch of speech its end falls in (a word ending inside a pause
 * belongs before it); a long stretch is split again at sentence punctuation.
 */
export function buildPhrasesFromPauses(words: TranscriptionWord[], pauses: Array<{ startSec: number; endSec: number }>, durationSec: number): Phrase[] {
  const sortedPauses = [...pauses].filter((pause) => pause.endSec > pause.startSec).sort((a, b) => a.startSec - b.startSec);
  const stretches: Array<{ start: number; end: number; words: TranscriptionWord[] }> = [];
  let cursor = 0;
  for (const pause of sortedPauses) {
    if (pause.startSec - cursor > 0.15) stretches.push({ start: cursor, end: pause.startSec, words: [] });
    cursor = pause.endSec;
  }
  if (durationSec - cursor > 0.15) stretches.push({ start: cursor, end: durationSec, words: [] });
  if (stretches.length === 0) return buildPhrases(words);
  let index = 0;
  for (const word of [...words].filter((entry) => entry.word.trim()).sort((a, b) => a.end - b.end)) {
    while (index < stretches.length - 1 && word.end > stretches[index + 1].start + 0.05) index += 1;
    stretches[index].words.push(word);
  }
  const phrases: Phrase[] = [];
  for (const stretch of stretches) {
    if (stretch.words.length === 0) continue;
    let from = 0;
    stretch.words.forEach((word, i) => {
      const last = i === stretch.words.length - 1;
      if (!last && !SENTENCE_END.test(word.word.trim())) return;
      const part = stretch.words.slice(from, i + 1);
      phrases.push({
        start: from === 0 ? stretch.start : part[0].start,
        end: last ? stretch.end : word.end,
        text: part.map((entry) => entry.word.trim()).join(" ")
      });
      from = i + 1;
    });
  }
  return phrases;
}

/**
 * Make the AI's answer usable: one strictly increasing phrase index per line
 * (an intro the script doesn't have may come before line 1). Returns null
 * when there are fewer phrases than lines (nothing sensible to split).
 */
export function repairStarts(starts: number[], lineCount: number, phraseCount: number): number[] | null {
  if (lineCount === 0 || phraseCount < lineCount) return null;
  const fixed: number[] = [];
  for (let i = 0; i < lineCount; i++) {
    const wanted = Number.isFinite(starts[i]) ? Math.round(starts[i]) : (fixed[i - 1] ?? -1) + 1;
    const lowest = i === 0 ? 0 : fixed[i - 1] + 1;
    const highest = phraseCount - (lineCount - i);
    fixed.push(Math.min(highest, Math.max(lowest, wanted)));
  }
  return fixed;
}

export async function matchLinesToPhrases(options: { model: string; language: string; lines: Array<{ english: string; target: string }>; phrases: Phrase[] }) {
  const lines = options.lines.map((line, index) => `L${index + 1}: ${line.english}${line.target.trim() ? `\n    (${options.language} script: ${line.target.trim()})` : ""}`).join("\n");
  const phrases = options.phrases
    .map((phrase, index) => {
      const gap = index === 0 ? phrase.start : phrase.start - options.phrases[index - 1].end;
      return `P${index + 1} [${phrase.start.toFixed(1)}s, after ${gap.toFixed(1)}s of silence]: ${phrase.text}`;
    })
    .join("\n");
  const result = await chatJson<{ lines: Array<{ line: number; firstPhrase: number }> }>({
    model: options.model,
    system: [
      "You line up a narrated voice-over with the script it was recorded from.",
      `The voice-over is in ${options.language}; the script lines are in English (sometimes with the ${options.language} wording too). The narrator reads the lines in order, but the wording may differ, some words may be misheard by speech recognition, and the pacing is different from the English.`,
      "The transcript is split into numbered phrases at the pauses in the recording, each with its start time and the silence before it. For every script line, give the number of the phrase where that line begins, judging by meaning. Narrators usually pause longer between lines than inside a line, so when a short phrase could belong to either the end of one line or the start of the next, a longer silence before it means it starts the next line. Line 1 begins at the first phrase that belongs to it (a spoken introduction that isn't in the script comes before it). Line numbers must map to increasing phrase numbers. Every line gets exactly one entry, even if you have to estimate.",
      "Return only the JSON described by the schema."
    ].join(" "),
    user: `Script lines:\n${lines}\n\nTranscript phrases:\n${phrases}`,
    schemaName: "voiceover_alignment",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { line: { type: "integer" }, firstPhrase: { type: "integer" } },
            required: ["line", "firstPhrase"]
          }
        }
      },
      required: ["lines"]
    }
  });
  const byLine = new Map(result.lines.map((entry) => [entry.line, entry.firstPhrase - 1]));
  return repairStarts(options.lines.map((_, index) => byLine.get(index + 1) ?? Number.NaN), options.lines.length, options.phrases.length);
}
