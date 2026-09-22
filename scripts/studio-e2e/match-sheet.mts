import path from "node:path";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

/** Side-by-side sheet: segment frame vs its top perceptual-hash candidate, to judge match quality. */
const prisma = new PrismaClient();
const title = process.argv[2] ?? "Types of Customers";
const out = process.argv[3] ?? "match-sheet.png";
const template = await prisma.studioTemplate.findFirst({ where: { title: { contains: title } }, include: { segments: { orderBy: { orderIndex: "asc" }, include: { mediaMatches: { orderBy: { rank: "asc" }, take: 1 } } } } });
if (!template) throw new Error("template not found");
const rows: Buffer[] = [];
for (const segment of template.segments.slice(0, 10)) {
  const frame = segment.frameAssetId ? await prisma.studioAsset.findUnique({ where: { id: segment.frameAssetId } }) : null;
  if (!frame) continue;
  const frameImg = await sharp(path.join("storage/studio", frame.storageKey)).resize(320, 200, { fit: "cover" }).toBuffer();
  const match = segment.mediaMatches[0];
  let candidate = await sharp({ create: { width: 320, height: 200, channels: 3, background: "#333" } }).jpeg().toBuffer();
  if (match) {
    const idx = JSON.parse(readFileSync("storage/studio/shutterstock-index/index.json", "utf8")); const file = idx[match.externalId]?.localFile || path.join("storage/studio/shutterstock-index", `${match.externalId}.jpg`);
    try {
      candidate = await sharp(file).resize(320, 200, { fit: "cover" }).toBuffer();
    } catch {
      /* missing thumb */
    }
  }
  const label = Buffer.from(`<svg width="640" height="24"><rect width="640" height="24" fill="#111"/><text x="4" y="17" font-size="13" fill="#fff" font-family="Arial">${segment.key} ${match ? match.description.replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 70) : "no match"}</text></svg>`);
  const row = await sharp({ create: { width: 640, height: 224, channels: 3, background: "#000" } })
    .composite([{ input: frameImg, left: 0, top: 24 }, { input: candidate, left: 320, top: 24 }, { input: label, left: 0, top: 0 }])
    .png()
    .toBuffer();
  rows.push(row);
}
await sharp({ create: { width: 640, height: 224 * rows.length, channels: 3, background: "#000" } })
  .composite(rows.map((row, index) => ({ input: row, left: 0, top: index * 224 })))
  .png()
  .toFile(out);
console.log(template.title, rows.length, "rows →", out);
await prisma.$disconnect();
