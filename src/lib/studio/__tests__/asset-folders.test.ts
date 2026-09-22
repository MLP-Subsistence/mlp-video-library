import assert from "node:assert/strict";
import test from "node:test";
import { HIGH_QUALITY_SHUTTERSTOCK_TAG, safeAssetTags, sourceOriginalIdsForVideo, videoAssetFolderTitle } from "../asset-folders";

test("ordinary uploads cannot claim verified-source provenance", () => {
  assert.equal(safeAssetTags(`screengrab, ${HIGH_QUALITY_SHUTTERSTOCK_TAG}`), "screengrab");
  assert.equal(safeAssetTags(`screengrab, fake-${HIGH_QUALITY_SHUTTERSTOCK_TAG}`), "screengrab");
});

test("tag edits preserve provenance of a verified original", () => {
  assert.equal(safeAssetTags("lesson one", `stock, ${HIGH_QUALITY_SHUTTERSTOCK_TAG}`), `lesson one, ${HIGH_QUALITY_SHUTTERSTOCK_TAG}`);
});

test("video folders use the actual lesson title without a regional suffix", () => {
  assert.equal(videoAssetFolderTitle("1-Introduction to Marketplace Literacy — Youth Africa"), "1-Introduction to Marketplace Literacy");
  assert.equal(videoAssetFolderTitle("3-1-Generic Marketplace Literacy - Prioritizing Elements of a Business Clip-1 — Youth Africa"), "3-1-Generic Marketplace Literacy - Prioritizing Elements of a Business Clip-1");
});

test("audited source-video matches include the introduction's omitted originals", () => {
  const intro = sourceOriginalIdsForVideo("1-Introduction to Marketplace Literacy — Youth Africa");
  assert.equal(intro.has("1142898902"), true);
  assert.equal(intro.has("1866006859"), true);
  assert.equal(intro.size, 11);
  assert.equal(sourceOriginalIdsForVideo("unrelated lesson").size, 0);
});
