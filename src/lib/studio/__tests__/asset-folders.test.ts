import assert from "node:assert/strict";
import test from "node:test";
import { HIGH_QUALITY_SHUTTERSTOCK_TAG, safeAssetTags } from "../asset-folders";

test("ordinary uploads cannot claim verified-source provenance", () => {
  assert.equal(safeAssetTags(`screengrab, ${HIGH_QUALITY_SHUTTERSTOCK_TAG}`), "screengrab");
  assert.equal(safeAssetTags(`screengrab, fake-${HIGH_QUALITY_SHUTTERSTOCK_TAG}`), "screengrab");
});

test("tag edits preserve provenance of a verified original", () => {
  assert.equal(safeAssetTags("lesson one", `stock, ${HIGH_QUALITY_SHUTTERSTOCK_TAG}`), `lesson one, ${HIGH_QUALITY_SHUTTERSTOCK_TAG}`);
});
