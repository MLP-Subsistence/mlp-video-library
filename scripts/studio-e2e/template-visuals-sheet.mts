import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
/** Current visual of each segment (what the render will use) next to the original frame. */
const prisma = new PrismaClient();
const [title, out] = [process.argv[2], process.argv[3] ?? "visuals.png"];
const template = await prisma.studioTemplate.findFirst({ where: { title: { contains: title } }, include: { segments: { orderBy: { orderIndex: "asc" } } } });
if (!template) throw new Error("not found");
const rows: Buffer[] = [];
for (const segment of template.segments.slice(0, 12)) {
  const frame = segment.frameAssetId ? await prisma.studioAsset.findUnique({ where: { id: segment.frameAssetId } }) : null;
  const comp = JSON.parse(segment.composition);
  const first = comp.slots?.[0]?.items?.[0];
  const asset = first ? await prisma.studioAsset.findUnique({ where: { id: first.assetId } }) : null;
  const left = frame ? await sharp(path.join("storage/studio", frame.storageKey)).resize(320, 180, { fit: "cover" }).toBuffer() : await sharp({ create: { width: 320, height: 180, channels: 3, background: "#333" } }).jpeg().toBuffer();
  let right = await sharp({ create: { width: 320, height: 180, channels: 3, background: "#333" } }).jpeg().toBuffer();
  let label = `${segment.key} — no visual`;
  if (asset && asset.kind === "image") { right = await sharp(path.join("storage/studio", asset.storageKey)).resize(320, 180, { fit: "cover" }).toBuffer(); label = `${segment.key} — ${comp.layout} · ${asset.name}`; }
  else if (asset) label = `${segment.key} — still the master video (captioned)`;
  const svg = Buffer.from(`<svg width="640" height="20"><rect width="640" height="20" fill="#111"/><text x="4" y="14" font-size="12" fill="#fff" font-family="Arial">${label.replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 80)}</text></svg>`);
  rows.push(await sharp({ create: { width: 640, height: 200, channels: 3, background: "#000" } }).composite([{ input: left, left: 0, top: 20 }, { input: right, left: 320, top: 20 }, { input: svg, left: 0, top: 0 }]).png().toBuffer());
}
await sharp({ create: { width: 640, height: 200 * rows.length, channels: 3, background: "#000" } }).composite(rows.map((r, i) => ({ input: r, left: 0, top: i * 200 }))).png().toFile(out);
console.log(template.title, rows.length);
await prisma.$disconnect();
