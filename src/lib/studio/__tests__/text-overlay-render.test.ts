import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { DEFAULT_TEXT_OVERLAY } from "../text-overlay";
import { writeTextOverlay } from "@/worker/text-overlay";

test("on-screen text raster is transparent and scales to 720p", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mlp-text-test-"));
  try {
    const file = path.join(dir, "text.png");
    await writeTextOverlay({ ...DEFAULT_TEXT_OVERLAY, text: "Murakaza neza & bienvenue", fontSize: 52 }, 1280, 720, file);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1280);
    assert.equal(info.height, 720);
    assert.equal(data[3], 0);
    assert.ok(data.some((value, index) => index % 4 === 3 && value > 0));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
