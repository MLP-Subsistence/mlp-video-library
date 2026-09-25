import assert from "node:assert/strict";
import { test } from "node:test";
import { findPauses, loudnessEnvelope, slicesAtBoundaries, snapCutsToPauses, voicedMask } from "../narration-split";
import { buildPhrases, buildPhrasesFromPauses, repairStarts } from "../services/voiceover-match";

const word = (text: string, start: number, end: number) => ({ word: text, start, end });

test("recognised words group into phrases at pauses and sentence ends", () => {
  const phrases = buildPhrases([
    word("مرحبا", 0.4, 0.9), word("بالجميع.", 0.95, 1.6),
    word("لدينا", 2.4, 2.8), word("عدد", 2.85, 3.1), word("من", 3.12, 3.25), word("الدروس", 3.3, 3.9),
    word("عن", 4.4, 4.6), word("السوق", 4.62, 5.1)
  ]);
  assert.deepEqual(phrases.map((phrase) => phrase.text), ["مرحبا بالجميع.", "لدينا عدد من الدروس", "عن السوق"]);
  assert.equal(phrases[1].start, 2.4);
  assert.equal(phrases[1].end, 3.9);
});

test("the AI's line starts are forced into one increasing phrase per line", () => {
  assert.deepEqual(repairStarts([0, 3, 3, 9], 4, 8), [0, 3, 4, 7]);
  assert.deepEqual(repairStarts([2, 1, Number.NaN], 3, 6), [2, 3, 4]);
  assert.equal(repairStarts([0, 1, 2], 3, 2), null);
});

const RATE = 8000;
function recording(parts: Array<["speech" | "quiet", number]>) {
  const total = parts.reduce((sum, [, sec]) => sum + sec, 0);
  const samples = new Float32Array(Math.round(total * RATE));
  let at = 0;
  for (const [kind, sec] of parts) {
    const count = Math.round(sec * RATE);
    if (kind === "speech") for (let i = 0; i < count; i++) samples[at + i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / RATE);
    at += count;
  }
  return samples;
}

test("a boundary that lands mid-word (or a late tap) moves into the pause, and an intro before line 1 is left out", () => {
  // intro 0.5–1.3 | line 1: 2.0–4.0 | pause | line 2: 4.8–6.8 | pause | line 3: 7.6–9.0
  const envelope = loudnessEnvelope(recording([["quiet", 0.5], ["speech", 0.8], ["quiet", 0.7], ["speech", 2], ["quiet", 0.8], ["speech", 2], ["quiet", 0.8], ["speech", 1.4], ["quiet", 0.4]]), RATE);
  const pauses = findPauses(voicedMask(envelope));
  // A tap 0.5 s after line 2 really started, and an estimate 0.3 s too early for line 3.
  assert.deepEqual(snapCutsToPauses([5.3, 7.3], pauses, 1.2, 0.3).map((value) => Math.round(value * 10) / 10), [4.4, 7.2]);
  const slices = slicesAtBoundaries(envelope, { firstStartSec: 1.9, cuts: [5.3, 7.3] }, { before: 1.2, after: 0.3 });
  assert.equal(slices.length, 3);
  assert.ok(Math.abs(slices[0].startSec - 1.92) < 0.1, `line 1 starts after the intro (${slices[0].startSec})`);
  assert.ok(Math.abs(slices[1].startSec - 4.72) < 0.1, `line 2 starts at its speech (${slices[1].startSec})`);
  assert.ok(Math.abs(slices[2].endSec - 9.08) < 0.1, `line 3 ends at its speech (${slices[2].endSec})`);
});

test("phrases follow the measured pauses even when the recognizer's word times run into them", () => {
  // Recognizer smears: "فهم" is reported from 10.12 although speech resumes at 10.80 after a pause.
  const words = [word("التعامل", 8.4, 8.9), word("فيه", 8.9, 10.12), word("فهم", 10.12, 11.04), word("السوق", 11.04, 11.5), word("هو", 11.5, 11.82)];
  const phrases = buildPhrasesFromPauses(words, [{ startSec: 9.26, endSec: 10.8 }, { startSec: 11.38, endSec: 11.64 }], 12.5);
  assert.deepEqual(phrases.map((phrase) => [phrase.start, phrase.text]), [[0, "التعامل فيه"], [10.8, "فهم السوق"], [11.64, "هو"]]);
});
