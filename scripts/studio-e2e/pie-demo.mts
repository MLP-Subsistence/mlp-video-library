import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import * as layoutsModule from "@/lib/studio/layouts";

/** Draw a pie layout with real photos, the way the renderer masks it, to eyeball the geometry. */
const { getLayout } = (layoutsModule as any).default ?? layoutsModule;
const prisma = new PrismaClient();
const slices = Number(process.argv[2] ?? 6);
const out = process.argv[3] ?? "pie-demo.png";
const W = 960, H = 540;
const assets = await prisma.studioAsset.findMany({ where: { kind: "image", tags: { contains: "shutterstock" } }, take: slices, orderBy: { createdAt: "desc" } });
const layout = getLayout(`pie${slices}`);
const layers: sharp.OverlayOptions[] = [];
for (const [index, rect] of layout.slots.entries()) {
  const asset = assets[index % assets.length];
  const w = Math.max(2, Math.round(rect.w * W));
  const h = Math.max(2, Math.round(rect.h * H));
  const photo = await sharp(path.join("storage/studio", asset.storageKey)).resize(w, h, { fit: "cover" }).ensureAlpha().raw().toBuffer();
  const points = rect.clip!.map(([x, y]: [number, number], i: number) => `${i === 0 ? "M" : "L"}${(x * w).toFixed(2)},${(y * h).toFixed(2)}`).join(" ");
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000"/><path d="${points} Z" fill="#fff"/></svg>`)).greyscale().raw().toBuffer();
  const rgba = Buffer.from(photo);
  for (let i = 0; i < mask.length; i += 1) rgba[i * 4 + 3] = mask[i];
  const slice = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  layers.push({ input: slice, left: Math.round(rect.x * W), top: Math.round(rect.y * H) });
}
await sharp({ create: { width: W, height: H, channels: 4, background: "#0d1a2b" } }).composite(layers).png().toFile(out);
console.log(`${layout.id}: ${layout.slots.length} slices → ${out}`);
await prisma.$disconnect();
