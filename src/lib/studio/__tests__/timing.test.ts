import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyComposition, normalizeComposition } from "../layouts";
import { blockAtTime, computeTimeline, type TimingInput } from "../timing";

function segment(key: string, orderIndex: number, narrationDurationSec: number, pauseAfterSec = 0): TimingInput {
  return { segmentId: key, key, title: key, orderIndex, narrationDurationSec, pauseAfterSec, composition: emptyComposition() };
}

test("V1 acceptance: narration change ripples through later segments", () => {
  const initial = computeTimeline([segment("s1", 0, 5), segment("s2", 1, 6), segment("s3", 2, 4), segment("s4", 3, 8)]);
  assert.deepEqual(initial.blocks.map((block) => [block.startSec, block.durationSec]), [[0, 5], [5, 6], [11, 4], [15, 8]]);
  assert.equal(initial.totalSec, 23);

  const updated = computeTimeline([segment("s1", 0, 5), segment("s2", 1, 6), segment("s3", 2, 7), segment("s4", 3, 8)]);
  assert.deepEqual(updated.blocks.map((block) => [block.startSec, block.durationSec]), [[0, 5], [5, 6], [11, 7], [18, 8]]);
  assert.equal(updated.totalSec, 26);
});

test("pause after narration extends the segment and shifts later segments", () => {
  const timeline = computeTimeline([segment("s1", 0, 7.2, 0.8), segment("s2", 1, 3)]);
  assert.equal(timeline.blocks[0].durationSec, 8);
  assert.equal(timeline.blocks[1].startSec, 8);
});

test("quiet before narration extends the visual and shifts later segments", () => {
  const timeline = computeTimeline([{ ...segment("s1", 0, 3.6, 0.5), pauseBeforeSec: 1 }, segment("s2", 1, 2)]);
  assert.equal(timeline.blocks[0].pauseBeforeSec, 1);
  assert.equal(timeline.blocks[0].narrationSec, 3.6);
  assert.equal(timeline.blocks[0].durationSec, 5.1);
  assert.equal(timeline.blocks[1].startSec, 5.1);
});

test("segments without narration keep a placeholder so the structure stays visible", () => {
  const timeline = computeTimeline([segment("s1", 0, 0), segment("s2", 1, 2)]);
  assert.ok(timeline.blocks[0].durationSec > 0);
  assert.equal(timeline.blocks[1].startSec, timeline.blocks[0].durationSec);
});

test("sequential visuals inside a slot follow the segment duration by share", () => {
  const composition = normalizeComposition({ layout: "full", slots: [{ id: "slot_1", fit: "cover", items: [{ assetId: "a", share: 0.5 }, { assetId: "b", share: 0.25 }, { assetId: "c", share: 0.25 }] }] });
  const timeline = computeTimeline([{ ...segment("s1", 0, 9, 1), composition }]);
  assert.deepEqual(timeline.blocks[0].items.map((item) => [item.assetId, item.startSec, item.durationSec]), [["a", 0, 5], ["b", 5, 2.5], ["c", 7.5, 2.5]]);
});

test("blockAtTime finds the segment under the playhead", () => {
  const timeline = computeTimeline([segment("s1", 0, 5), segment("s2", 1, 6)]);
  assert.equal(blockAtTime(timeline, 0)?.key, "s1");
  assert.equal(blockAtTime(timeline, 5)?.key, "s2");
  assert.equal(blockAtTime(timeline, 99)?.key, "s2");
});

test("order comes from orderIndex, not array position", () => {
  const timeline = computeTimeline([segment("second", 1, 2), segment("first", 0, 3)]);
  assert.deepEqual(timeline.blocks.map((block) => block.key), ["first", "second"]);
});
