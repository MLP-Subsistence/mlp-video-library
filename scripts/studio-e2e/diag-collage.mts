import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import * as mod from "../../src/lib/studio/services/phash.ts";
const ph: any = (mod as any).default ?? mod;
const prisma = new PrismaClient();
const [title, key] = [process.argv[2], process.argv[3]];
const seg = await prisma.studioSegment.findFirst({ where: { key, template: { title: { contains: title } } } });
const frame = await prisma.studioAsset.findUnique({ where: { id: seg!.frameAssetId! } });
const bytes = readFileSync(path.join("storage/studio", frame!.storageKey));
const meta = await sharp(bytes).metadata();
const cleaned = await sharp(bytes).extract({ left: 0, top: 0, width: meta.width!, height: Math.round(meta.height! * 0.8) }).jpeg().toBuffer();
const index = JSON.parse(readFileSync("storage/studio/shutterstock-index/index.json", "utf8"));
const locals = (Object.values(index) as any[]).filter((e) => e.localFile).map((e) => ({ ...e, hv: BigInt("0x" + e.hash), wv: (e.windows || []).map((w: string) => BigInt("0x" + w)) }));
for (const columns of [3, 2]) {
  const out: string[] = [];
  for (let i = 0; i < columns; i++) {
    const left = Math.round((meta.width! * i) / columns);
    const w = Math.round(meta.width! / columns);
    const panel = await sharp(cleaned).extract({ left, top: 0, width: Math.min(w, meta.width! - left), height: Math.round(meta.height! * 0.8) }).jpeg().toBuffer();
    const hashes = await ph.frameHashes(panel);
    const h = await ph.phash(panel);
    let best = { id: "", d: 99 };
    for (const e of locals) { const d = Math.min(ph.bestDistance(hashes, e.hv), e.wv.length ? ph.minDistance(h, e.wv) : 64); if (d < best.d) best = { id: e.id, d }; }
    out.push(`${best.id}:${best.d}`);
  }
  console.log(columns, "columns →", out.join("  "));
}
await prisma.$disconnect();
