import { readFileSync } from "node:fs";
import sharp from "sharp";
import * as mod from "../../src/lib/studio/services/phash.ts";
const ph: any = (mod as any).default ?? mod;
const index = JSON.parse(readFileSync("storage/studio/shutterstock-index/index.json", "utf8"));
const locals = (Object.values(index) as any[]).filter((e) => e.localFile).map((e) => ({ ...e, hv: BigInt("0x" + e.hash), wv: (e.windows || []).map((w: string) => BigInt("0x" + w)) }));
const picks = locals.slice(10, 13);
const tiles = [];
for (const p of picks) tiles.push(await sharp(p.localFile).rotate().resize(640, 1080, { fit: "cover" }).toBuffer());
const collage = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#000" } }).composite(tiles.map((t, i) => ({ input: t, left: i * 640, top: 0 }))).jpeg().toBuffer();
const cleaned = await sharp(collage).extract({ left: 0, top: 0, width: 1920, height: 864 }).jpeg().toBuffer();
const out: string[] = [];
for (let i = 0; i < 3; i++) {
  const panel = await sharp(cleaned).extract({ left: i * 640, top: 0, width: 640, height: 864 }).jpeg().toBuffer();
  const hashes = await ph.frameHashes(panel); const h = await ph.phash(panel);
  let best = { id: "", d: 99 };
  for (const e of locals) { const d = Math.min(ph.bestDistance(hashes, e.hv), e.wv.length ? ph.minDistance(h, e.wv) : 64); if (d < best.d) best = { id: e.id, d }; }
  out.push(`${best.id}:${best.d} (expected ${picks[i].id})`);
}
console.log(out.join("\n"));
