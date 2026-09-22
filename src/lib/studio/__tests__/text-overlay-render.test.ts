import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { DEFAULT_TEXT_OVERLAY, displayText, normalizeTextOverlay } from "../text-overlay";
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

test("rich styling survives normalization and reaches the raster", async () => {
  const styled = normalizeTextOverlay({
    ...DEFAULT_TEXT_OVERLAY,
    text: "Menya umuguzi wawe",
    fontFamily: "Impact",
    fontSize: 300,
    italic: true,
    underline: true,
    uppercase: true,
    letterSpacing: 4,
    lineHeight: 1.4,
    rotation: 400,
    opacity: 2,
    strokeWidth: 6,
    strokeColor: "#112233",
    shadow: true,
    shadowBlur: 12,
    backgroundColor: "not-a-colour",
    backgroundOpacity: 0.4
  })!;
  assert.equal(styled.fontSize, 200, "font size is clamped");
  assert.equal(styled.rotation, 180, "rotation is clamped");
  assert.equal(styled.opacity, 1, "opacity is clamped");
  assert.equal(styled.backgroundColor, DEFAULT_TEXT_OVERLAY.backgroundColor, "a bad colour falls back");
  assert.equal(styled.uppercase, true);
  assert.equal(displayText(styled), "MENYA UMUGUZI WAWE");

  const dir = await mkdtemp(path.join(os.tmpdir(), "mlp-text-style-"));
  try {
    const file = path.join(dir, "styled.png");
    const result = await writeTextOverlay(styled, 1920, 1080, file);
    assert.ok(result.lines >= 1);
    const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.ok(data.some((value, index) => index % 4 === 3 && value > 0), "something was drawn");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("old segments without the new fields still render", async () => {
  const legacy = normalizeTextOverlay({ text: "Hello", x: 0.1, y: 0.7, w: 0.8, h: 0.2, fontFamily: "Arial", fontSize: 48, color: "#ffffff", align: "center", bold: true, background: true })!;
  assert.equal(legacy.lineHeight, DEFAULT_TEXT_OVERLAY.lineHeight);
  assert.equal(legacy.verticalAlign, "middle");
  assert.equal(legacy.shadow, false);
  const dir = await mkdtemp(path.join(os.tmpdir(), "mlp-text-legacy-"));
  try {
    const file = path.join(dir, "legacy.png");
    await writeTextOverlay(legacy, 1280, 720, file);
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, 1280);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
