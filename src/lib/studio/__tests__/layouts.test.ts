import assert from "node:assert/strict";
import { test } from "node:test";
import { circleCountForLayout, compositionAssetIds, compositionHasVisual, emptyComposition, getLayout, layouts, normalizeComposition, parseComposition, replaceMainVisual } from "../layouts";

test("every layout has slot rectangles inside the frame", () => {
  for (const layout of layouts) {
    assert.ok(layout.slots.length > 0);
    for (const slot of layout.slots) {
      assert.ok(slot.x >= 0 && slot.y >= 0 && slot.x + slot.w <= 1.0001 && slot.y + slot.h <= 1.0001, layout.id);
    }
  }
  assert.equal(getLayout("does-not-exist").id, "full");
});

test("circle layouts retain their chosen number of media areas", () => {
  for (let count = 2; count <= 6; count += 1) {
    const layout = getLayout(`circles${count}`);
    assert.equal(layout.slots.length, count);
    assert.ok(layout.slots.every((slot) => slot.shape === "circle"));
    assert.equal(circleCountForLayout(layout.id), count);
    assert.equal(emptyComposition(layout.id).slots.length, count);
  }
  assert.equal(circleCountForLayout("grid4"), null);
});

test("parseComposition survives garbage and normalizes shares", () => {
  assert.equal(parseComposition("not json").layout, "full");
  assert.equal(parseComposition(null).slots.length, 1);
  const parsed = parseComposition(JSON.stringify({ layout: "split2", slots: [{ id: "x", fit: "weird", items: [{ assetId: "a", share: 3 }, { assetId: "b", share: 1 }] }] }));
  assert.equal(parsed.layout, "split2");
  assert.equal(parsed.slots.length, 2);
  assert.equal(parsed.slots[0].fit, "cover");
  const total = parsed.slots[0].items.reduce((sum, item) => sum + item.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.ok(parsed.slots[0].items[0].share > parsed.slots[0].items[1].share);
});

test("asset ids are collected across slots without duplicates", () => {
  const composition = normalizeComposition({ layout: "grid4", slots: [{ id: "1", fit: "cover", items: [{ assetId: "a", share: 1 }] }, { id: "2", fit: "cover", items: [{ assetId: "a", share: 1 }, { assetId: "b", share: 1 }] }] });
  assert.deepEqual(compositionAssetIds(composition).sort(), ["a", "b"]);
  assert.equal(compositionHasVisual(composition), true);
  assert.equal(compositionHasVisual(emptyComposition("grid6")), false);
});

test("replaceMainVisual swaps the first visual and keeps the layout", () => {
  const split = normalizeComposition({ layout: "split2", slots: [{ id: "slot_1", fit: "cover", items: [{ assetId: "master", share: 1, startSec: 12.5 }] }, { id: "slot_2", fit: "contain", items: [{ assetId: "b", share: 1 }] }] });
  const next = replaceMainVisual(split, "photo");
  assert.equal(next.layout, "split2");
  assert.deepEqual(next.slots[0].items, [{ assetId: "photo", share: 1 }]);
  assert.equal(next.slots[1].items[0].assetId, "b");
  assert.equal(next.slots[1].fit, "contain");
  const empty = replaceMainVisual(emptyComposition("full"), "photo");
  assert.equal(empty.slots[0].items[0].assetId, "photo");
});
