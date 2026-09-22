import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import * as textOverlayModule from "@/lib/studio/text-overlay";
import * as workerTextModule from "@/worker/text-overlay";

const { DEFAULT_TEXT_OVERLAY, TEXT_STYLE_PRESETS, normalizeTextOverlay } = (textOverlayModule as any).default ?? textOverlayModule;
const { writeTextOverlay } = (workerTextModule as any).default ?? workerTextModule;

/** Render each preset over a real lesson photo so the new text engine can be eyeballed. */
const prisma = new PrismaClient();
const out = process.argv[2] ?? "text-demo.png";
const asset = await prisma.studioAsset.findFirst({ where: { kind: "image", tags: { contains: "shutterstock" } }, orderBy: { createdAt: "desc" } });
if (!asset) throw new Error("no photo in the library");
const photo = await sharp(path.join("storage/studio", asset.storageKey)).resize(960, 540, { fit: "cover" }).toBuffer();
const tiles: Buffer[] = [];
for (const preset of TEXT_STYLE_PRESETS) {
  const overlay = normalizeTextOverlay({ ...DEFAULT_TEXT_OVERLAY, ...preset.style, text: preset.id === "lower-third" ? "Marie · Vendeuse" : "Menya umuguzi wawe" })!;
  const file = path.join(process.env.TMPDIR ?? ".", `overlay-${preset.id}.png`);
  await writeTextOverlay(overlay, 960, 540, file);
  const label = Buffer.from(`<svg width="960" height="26"><rect width="960" height="26" fill="#0d1a2b"/><text x="8" y="18" font-size="14" fill="#fff" font-family="Arial">${preset.label} — ${preset.description}</text></svg>`);
  tiles.push(await sharp({ create: { width: 960, height: 566, channels: 4, background: "#000" } })
    .composite([{ input: photo, top: 26, left: 0 }, { input: await sharp(file).png().toBuffer(), top: 26, left: 0 }, { input: label, top: 0, left: 0 }])
    .png().toBuffer());
}
await sharp({ create: { width: 960, height: 566 * tiles.length, channels: 4, background: "#000" } })
  .composite(tiles.map((tile, index) => ({ input: tile, top: index * 566, left: 0 })))
  .png().toFile(out);
console.log(`${tiles.length} presets rendered → ${out}`);
await prisma.$disconnect();
