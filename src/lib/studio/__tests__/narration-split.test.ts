import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedCutsFromOriginal, expectedCutsFromWeights, loudnessEnvelope, suggestSlices, voicedMask } from "../narration-split";

const RATE = 8000;

/** Tone bursts ("speech") and silence, with a little noise so silence isn't perfectly zero. */
function recording(parts: Array<["speech" | "quiet", number]>) {
  const total = parts.reduce((sum, [, sec]) => sum + sec, 0);
  const samples = new Float32Array(Math.round(total * RATE));
  let at = 0;
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.004;
  for (const [kind, sec] of parts) {
    const count = Math.round(sec * RATE);
    for (let i = 0; i < count; i++) samples[at + i] = (kind === "speech" ? 0.4 * Math.sin((2 * Math.PI * 220 * i) / RATE) : 0) + noise();
    at += count;
  }
  return samples;
}

const near = (actual: number, expected: number, tolerance = 0.15) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance}s of ${expected}`);

test("splits at the real pauses, not at a breath inside a segment", () => {
  // 0.5 quiet | seg1 2.0 | 0.8 pause | seg2 1.4 + 0.25 breath + 1.6 | 0.8 pause | seg3 1.5 | 0.5 quiet
  const audio = recording([["quiet", 0.5], ["speech", 2.0], ["quiet", 0.8], ["speech", 1.4], ["quiet", 0.25], ["speech", 1.6], ["quiet", 0.8], ["speech", 1.5], ["quiet", 0.5]]);
  const envelope = loudnessEnvelope(audio, RATE);
  const voiced = voicedMask(envelope);
  const speechStart = voiced.indexOf(true) * 0.02;
  const speechEnd = (voiced.lastIndexOf(true) + 1) * 0.02;
  const slices = suggestSlices(envelope, expectedCutsFromWeights([2, 3, 1.5], speechStart, speechEnd));
  assert.equal(slices.length, 3);
  near(slices[0].startSec, 0.42);
  near(slices[0].endSec, 2.58);
  near(slices[1].startSec, 3.22);
  near(slices[1].endSec, 6.63);
  near(slices[2].startSec, 7.27);
  near(slices[2].endSec, 8.93);
});

test("a dub of the whole video splits where the original video's segments change", () => {
  const audio = recording([["speech", 1.2], ["quiet", 0.6], ["speech", 1.2], ["quiet", 0.6], ["speech", 1.2], ["quiet", 0.6], ["speech", 1.2]]);
  const envelope = loudnessEnvelope(audio, RATE);
  // Original video: four segments, same rhythm but 10% faster.
  const sources = [0, 1.62, 3.24, 4.86].map((start) => ({ startSec: start, endSec: start + 1.08 }));
  const slices = suggestSlices(envelope, expectedCutsFromOriginal(sources, 6.6, 5.94), 10);
  assert.equal(slices.length, 4);
  near(slices[1].startSec, 1.72);
  near(slices[2].startSec, 3.52);
  near(slices[3].startSec, 5.32);
});

test("a recording with no pauses still gets one slice per segment", () => {
  const envelope = loudnessEnvelope(recording([["speech", 6]]), RATE);
  const slices = suggestSlices(envelope, [2, 4]);
  assert.equal(slices.length, 3);
  assert.ok(slices.every((slice) => slice.endSec > slice.startSec));
  near(slices[1].startSec, 2, 0.2);
});
