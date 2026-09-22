import assert from "node:assert/strict";
import { test } from "node:test";
import { ALIGNMENT_READY_THRESHOLD, alignScriptToWords, tokenSimilarity, tokenize, type TimedWord } from "../services/alignment";

/** Build a timed word stream: each word 0.3 s, with a gap between "sentences". */
function words(sentences: string[], gapSec = 0.6): TimedWord[] {
  const out: TimedWord[] = [];
  let t = 0.5;
  for (const sentence of sentences) {
    for (const word of sentence.split(/\s+/)) {
      out.push({ word, start: t, end: t + 0.3 });
      t += 0.32;
    }
    t += gapSec;
  }
  return out;
}

test("tokenize strips punctuation and diacritics", () => {
  assert.deepEqual(tokenize("Ubwikorezi, bufasha… Abantu!"), ["ubwikorezi", "bufasha", "abantu"]);
  assert.deepEqual(tokenize("Café à côté"), ["cafe", "a", "cote"]);
});

test("tokenSimilarity tolerates small spelling drift", () => {
  assert.equal(tokenSimilarity("marketplace", "marketplace"), 1);
  assert.ok(tokenSimilarity("marketplace", "marketplaces") > 0.8);
  assert.ok(tokenSimilarity("marketplace", "banana") < 0.3);
});

test("V1 full-narration test: 3 confident segments + 1 uncertain one", () => {
  const scripts = [
    "Transportation helps people reach different marketplaces efficiently",
    "A marketplace is where buyers and sellers meet to exchange goods",
    "Consumers compare prices before choosing what to buy",
    "Entrepreneurs plan their business around what customers need and want"
  ];
  // The recognizer garbles most of segment 3.
  const spoken = [scripts[0], scripts[1], "xylophone zebra quantum before choosing zzz", scripts[3]];
  const stream = words(spoken);
  const result = alignScriptToWords(
    scripts.map((text, index) => ({ segmentId: `s${index + 1}`, key: `seg_00${index + 1}`, text })),
    stream,
    stream[stream.length - 1].end + 0.5
  );
  assert.equal(result.segments.length, 4);
  const [s1, s2, s3, s4] = result.segments;
  assert.ok(s1.confidence >= ALIGNMENT_READY_THRESHOLD, `s1 ${s1.confidence}`);
  assert.ok(s2.confidence >= ALIGNMENT_READY_THRESHOLD, `s2 ${s2.confidence}`);
  assert.ok(s3.confidence < ALIGNMENT_READY_THRESHOLD, `s3 ${s3.confidence}`);
  assert.ok(s4.confidence >= ALIGNMENT_READY_THRESHOLD, `s4 ${s4.confidence}`);
  // Boundaries are monotonic and non-overlapping.
  for (let i = 1; i < result.segments.length; i++) assert.ok(result.segments[i].startSec >= result.segments[i - 1].endSec - 0.001);
  // Segment 2 starts where the second sentence starts (±0.2 s lead-in).
  const secondStart = stream[scripts[0].split(" ").length].start;
  assert.ok(Math.abs(s2.startSec - secondStart) <= 0.25, `s2 start ${s2.startSec} vs ${secondStart}`);
});

test("segments the recognizer missed entirely are still given a slice between their neighbours", () => {
  const scripts = ["one two three four", "five six seven eight", "nine ten eleven twelve"];
  const stream = words([scripts[0], "mumble mumble", scripts[2]]);
  const result = alignScriptToWords(
    scripts.map((text, index) => ({ segmentId: `s${index}`, key: `k${index}`, text })),
    stream,
    null
  );
  assert.ok(result.segments[1].endSec > result.segments[1].startSec);
  assert.ok(result.segments[1].startSec >= result.segments[0].endSec);
  assert.ok(result.segments[2].startSec >= result.segments[1].endSec);
});

test("empty transcript falls back to proportional slices without throwing", () => {
  const result = alignScriptToWords([{ segmentId: "a", key: "a", text: "hello world" }, { segmentId: "b", key: "b", text: "again" }], [], 10);
  assert.equal(result.segments.length, 2);
  assert.ok(result.segments.every((segment) => segment.confidence === 0));
  assert.ok(result.segments[1].endSec <= 10.001);
});
