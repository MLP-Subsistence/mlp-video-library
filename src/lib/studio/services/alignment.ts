/**
 * SpeechAlignmentService (pure part).
 *
 * Given word-level timestamps for one complete narration recording and the
 * ordered, approved translated scripts, find where each segment starts and
 * ends. The transcription itself is unconstrained, so we do not trust its
 * text; we only use it as a timed word stream and align the *approved script*
 * against it with a monotonic edit-distance alignment. Fuzzy token matching
 * absorbs spelling differences between the recognizer and the script, which
 * matters for languages the recognizer knows less well (Kinyarwanda, Darija…).
 */

export type TimedWord = { word: string; start: number; end: number };

export type AlignmentSegmentInput = { segmentId: string; key: string; text: string };

export type AlignedSegment = {
  segmentId: string;
  key: string;
  startSec: number;
  endSec: number;
  /** 0..1 — share of script tokens found in the audio, penalised for gaps. */
  confidence: number;
  matchedTokens: number;
  totalTokens: number;
};

export type AlignmentResult = {
  segments: AlignedSegment[];
  audioDurationSec: number;
  transcriptWords: number;
};

export const ALIGNMENT_READY_THRESHOLD = 0.75;
const PAD_SEC = 0.15;

export function normalizeToken(raw: string) {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function tokenize(text: string) {
  return text
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0);
}

function bigrams(token: string) {
  if (token.length < 2) return [token];
  const grams: string[] = [];
  for (let i = 0; i < token.length - 1; i++) grams.push(token.slice(i, i + 2));
  return grams;
}

/** Sørensen–Dice similarity on character bigrams; cheap and tolerant of small spelling drift. */
export function tokenSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.length < 3 || b.length < 3) return a === b ? 1 : 0;
  const ga = bigrams(a);
  const gb = new Map<string, number>();
  for (const gram of bigrams(b)) gb.set(gram, (gb.get(gram) ?? 0) + 1);
  let overlap = 0;
  for (const gram of ga) {
    const count = gb.get(gram);
    if (count) {
      overlap += 1;
      gb.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (ga.length + b.length - 1);
}

const MATCH = 1;
const FUZZY_MIN = 0.7;
const MISMATCH = -0.5;
const GAP = -0.35;

export function alignScriptToWords(segments: AlignmentSegmentInput[], words: TimedWord[], audioDurationSec: number | null): AlignmentResult {
  const scriptTokens: Array<{ token: string; segmentIndex: number }> = [];
  segments.forEach((segment, segmentIndex) => {
    for (const token of tokenize(segment.text)) scriptTokens.push({ token, segmentIndex });
  });
  const audioTokens = words
    .map((word) => ({ token: normalizeToken(word.word), start: word.start, end: word.end }))
    .filter((word) => word.token.length > 0);

  const lastWordEnd = audioTokens.length ? audioTokens[audioTokens.length - 1].end : 0;
  const totalAudio = audioDurationSec && audioDurationSec > 0 ? audioDurationSec : lastWordEnd;

  const n = scriptTokens.length;
  const m = audioTokens.length;
  // Matched audio index per script token (-1 = unmatched).
  const matchIndex = new Int32Array(n).fill(-1);

  if (n > 0 && m > 0) {
    // Needleman–Wunsch with typed arrays. Rows = script tokens, cols = audio tokens.
    const width = m + 1;
    const score = new Float32Array((n + 1) * width);
    const back = new Uint8Array((n + 1) * width); // 0 diag, 1 up (skip script), 2 left (skip audio)
    for (let i = 1; i <= n; i++) {
      score[i * width] = i * GAP;
      back[i * width] = 1;
    }
    for (let j = 1; j <= m; j++) {
      score[j] = j * GAP;
      back[j] = 2;
    }
    for (let i = 1; i <= n; i++) {
      const s = scriptTokens[i - 1].token;
      const row = i * width;
      const prevRow = (i - 1) * width;
      for (let j = 1; j <= m; j++) {
        const sim = tokenSimilarity(s, audioTokens[j - 1].token);
        const pair = sim >= 1 ? MATCH : sim >= FUZZY_MIN ? MATCH * sim : MISMATCH;
        const diag = score[prevRow + j - 1] + pair;
        const up = score[prevRow + j] + GAP;
        const left = score[row + j - 1] + GAP;
        if (diag >= up && diag >= left) {
          score[row + j] = diag;
          back[row + j] = 0;
        } else if (up >= left) {
          score[row + j] = up;
          back[row + j] = 1;
        } else {
          score[row + j] = left;
          back[row + j] = 2;
        }
      }
    }
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      const direction = back[i * width + j];
      if (direction === 0) {
        const sim = tokenSimilarity(scriptTokens[i - 1].token, audioTokens[j - 1].token);
        if (sim >= FUZZY_MIN) matchIndex[i - 1] = j - 1;
        i -= 1;
        j -= 1;
      } else if (direction === 1) {
        i -= 1;
      } else {
        j -= 1;
      }
    }
  }

  // Collect per-segment matched spans.
  const perSegment = segments.map(() => ({ total: 0, matched: 0, firstStart: null as number | null, lastEnd: null as number | null }));
  scriptTokens.forEach((entry, index) => {
    const bucket = perSegment[entry.segmentIndex];
    bucket.total += 1;
    const audioIndex = matchIndex[index];
    if (audioIndex >= 0) {
      bucket.matched += 1;
      const word = audioTokens[audioIndex];
      if (bucket.firstStart === null || word.start < bucket.firstStart) bucket.firstStart = word.start;
      if (bucket.lastEnd === null || word.end > bucket.lastEnd) bucket.lastEnd = word.end;
    }
  });

  // Fill unmatched segments by splitting the surrounding gap proportionally to their script length.
  const starts: Array<number | null> = perSegment.map((bucket) => bucket.firstStart);
  const ends: Array<number | null> = perSegment.map((bucket) => bucket.lastEnd);
  for (let index = 0; index < segments.length; index++) {
    if (starts[index] !== null && ends[index] !== null) continue;
    let prev = index - 1;
    while (prev >= 0 && ends[prev] === null) prev -= 1;
    let next = index + 1;
    while (next < segments.length && starts[next] === null) next += 1;
    const gapStart = prev >= 0 ? (ends[prev] as number) : 0;
    const gapEnd = next < segments.length ? (starts[next] as number) : totalAudio;
    const run = [] as number[];
    for (let k = prev + 1; k < next; k++) run.push(k);
    const weights = run.map((k) => Math.max(1, perSegment[k].total));
    const weightSum = weights.reduce((sum, w) => sum + w, 0);
    let cursor = gapStart;
    run.forEach((k, position) => {
      const share = ((gapEnd - gapStart) * weights[position]) / weightSum;
      starts[k] = cursor;
      ends[k] = cursor + share;
      cursor += share;
    });
  }

  // Enforce monotonic, non-overlapping boundaries with small padding into natural gaps.
  const aligned: AlignedSegment[] = [];
  for (let index = 0; index < segments.length; index++) {
    const bucket = perSegment[index];
    let start = starts[index] as number;
    let end = ends[index] as number;
    const prevEnd = index > 0 ? aligned[index - 1].endSec : 0;
    const nextStart = index + 1 < segments.length ? (starts[index + 1] as number) : totalAudio;
    // Lead-in: take up to PAD_SEC of the preceding silence, never overlapping the previous slice.
    start = Math.max(prevEnd, index === 0 ? Math.max(0, start - PAD_SEC) : start - Math.min(PAD_SEC, Math.max(0, (start - prevEnd) / 2)));
    // Tail: take up to PAD_SEC of the following silence.
    const gapAfter = Math.max(0, nextStart - end);
    end = Math.min(totalAudio || end, end + Math.min(PAD_SEC, gapAfter / 2));
    if (end <= start) end = Math.min(totalAudio || start + 0.5, start + 0.5);
    const coverage = bucket.total > 0 ? bucket.matched / bucket.total : 0;
    const unmatchedPenalty = bucket.total > 0 && bucket.matched === 0 ? 0 : 1;
    const confidence = Math.round(Math.min(1, coverage) * unmatchedPenalty * 100) / 100;
    aligned.push({
      segmentId: segments[index].segmentId,
      key: segments[index].key,
      startSec: round(start),
      endSec: round(end),
      confidence,
      matchedTokens: bucket.matched,
      totalTokens: bucket.total
    });
  }

  return { segments: aligned, audioDurationSec: round(totalAudio), transcriptWords: audioTokens.length };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
