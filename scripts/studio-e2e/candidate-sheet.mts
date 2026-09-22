import path from "node:path";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

/** All Youth Africa segments still on the master video that have a stock candidate: frame vs candidate, numbered for review. */
const prisma = new PrismaClient();
const out = process.argv[2] ?? "candidate-sheet.png";
const idx = JSON.parse(readFileSync("storage/studio/shutterstock-index/index.json", "utf8"));
const templates = await prisma.studioTemplate.findMany({ where: { title: { contains: "Youth Africa" } }, include: { segments: { orderBy: { orderIndex: "asc" }, include: { mediaMatches: { orderBy: { rank: "asc" }, take: 1 } } } }, orderBy: { title: "asc" } });
const rows: Buffer[] = [];
const list: string[] = [];
for (const t of templates) {
  for (const s of t.segments) {
    const comp = JSON.parse(s.composition || "{}");
    const ids = (comp.slots ?? []).flatMap((sl: any) => sl.items.map((it: any) => it.assetId));
    if (!ids.includes(t.masterAssetId)) continue;
    const match = s.mediaMatches[0];
    if (!match || match.status !== "candidate" || !s.frameAssetId) continue;
    const frame = await prisma.studioAsset.findUnique({ where: { id: s.frameAssetId } });
    if (!frame) continue;
    const n = rows.length + 1;
    list.push(`${n}\t${match.id}\t${t.title.slice(0, 40)}\t${s.key}\t${match.description}`);
    const frameImg = await sharp(path.join("storage/studio", frame.storageKey)).resize(320, 180, { fit: "cover" }).toBuffer();
    const file = idx[match.externalId]?.localFile || path.join("storage/studio/shutterstock-index", `${match.externalId}.jpg`);
    let cand = await sharp({ create: { width: 320, height: 180, channels: 3, background: "#333" } }).jpeg().toBuffer();
    try { cand = await sharp(file).resize(320, 180, { fit: "cover" }).toBuffer(); } catch {}
    const text = `#${n} ${t.title.slice(0, 28)} ${s.key} ${match.description.slice(0, 40)}`.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const label = Buffer.from(`<svg width="640" height="20"><rect width="640" height="20" fill="#111"/><text x="4" y="14" font-size="12" fill="#fff" font-family="Arial">${text}</text></svg>`);
    rows.push(await sharp({ create: { width: 640, height: 200, channels: 3, background: "#000" } }).composite([{ input: frameImg, left: 0, top: 20 }, { input: cand, left: 320, top: 20 }, { input: label, left: 0, top: 0 }]).png().toBuffer());
  }
}
const cols = 2;
const rowsPerCol = Math.ceil(rows.length / cols);
await sharp({ create: { width: 640 * cols, height: 200 * rowsPerCol, channels: 3, background: "#000" } })
  .composite(rows.map((row, i) => ({ input: row, left: Math.floor(i / rowsPerCol) * 640, top: (i % rowsPerCol) * 200 })))
  .png().toFile(out);
console.log(list.join("\n"));
console.log(rows.length, "→", out);
await prisma.$disconnect();
