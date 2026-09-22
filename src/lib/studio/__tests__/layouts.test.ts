import assert from "node:assert/strict";
import { test } from "node:test";
import { clipPathForSlot, pieCountForLayout, compositionAssetIds, compositionHasVisual, emptyComposition, getLayout, layouts, normalizeComposition, parseComposition, replaceMainVisual } from "../layouts";
import { DEFAULT_TEXT_OVERLAY } from "../text-overlay";

test("every layout has slot rectangles inside the frame", () => {
  for (const layout of layouts) {
    assert.ok(layout.slots.length > 0);
    for (const slot of layout.slots) {
      assert.ok(slot.x >= 0 && slot.y >= 0 && slot.x + slot.w <= 1.0001 && slot.y + slot.h <= 1.0001, layout.id);
    }
  }
  assert.equal(getLayout("does-not-exist").id, "full");
});

test("a pie layout cuts the circle into the chosen number of slices", () => {
  for (let count = 2; count <= 8; count += 1) {
    const layout = getLayout(`pie${count}`);
    assert.equal(layout.slots.length, count);
    assert.ok(layout.slots.every((slot) => slot.shape === "wedge"), layout.id);
    assert.equal(pieCountForLayout(layout.id), count);
    assert.equal(emptyComposition(layout.id).slots.length, count);
    for (const slot of layout.slots) {
      // Every slice stays inside the frame and carries a polygon in its own box.
      assert.ok(slot.x >= 0 && slot.y >= 0 && slot.x + slot.w <= 1.0001 && slot.y + slot.h <= 1.0001, `${layout.id} bounds`);
      assert.ok((slot.clip?.length ?? 0) >= 8, `${layout.id} clip points`);
      assert.ok(slot.clip!.every(([x, y]) => x >= -0.0001 && x <= 1.0001 && y >= -0.0001 && y <= 1.0001), `${layout.id} clip range`);
      assert.ok(clipPathForSlot(slot)!.startsWith("polygon("));
    }
  }
  assert.equal(pieCountForLayout("grid4"), null);
  assert.equal(clipPathForSlot(getLayout("split2").slots[0]), undefined);
  // The slices together cover the circle: two opposite slices are mirror images.
  const [first, second] = getLayout("pie2").slots;
  assert.ok(Math.abs(first.w - second.w) < 0.001 && Math.abs(first.h - second.h) < 0.001);
});

test("segments saved with the old circle collage still render", () => {
  const legacy = getLayout("circles3");
  assert.equal(legacy.slots.length, 3);
  assert.ok(legacy.slots.every((slot) => slot.shape === "circle"));
  assert.equal(pieCountForLayout(legacy.id), null);
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

test("on-screen text survives saved layout normalization and visual changes", () => {
  const composition = normalizeComposition({ ...emptyComposition(), textOverlay: { ...DEFAULT_TEXT_OVERLAY, text: "Murakaza neza", x: .95, y: .96, w: .4, h: .15 } });
  assert.equal(composition.textOverlay?.text, "Murakaza neza");
  assert.ok((composition.textOverlay!.x + composition.textOverlay!.w) <= 1);
  assert.ok((composition.textOverlay!.y + composition.textOverlay!.h) <= 1);
  const saved = parseComposition(JSON.stringify(composition));
  assert.equal(replaceMainVisual(saved, "photo").textOverlay?.text, "Murakaza neza");
  const hostile = normalizeComposition({ ...emptyComposition(), textOverlay: { ...DEFAULT_TEXT_OVERLAY, fontFamily: "made-up" as "Arial", color: "expression(alert())", fontSize: 10000 } });
  assert.equal(hostile.textOverlay?.fontFamily, "Arial");
  assert.equal(hostile.textOverlay?.color, "#ffffff");
  assert.equal(hostile.textOverlay?.fontSize, 200, "font size is clamped to the largest the renderer supports");
});
