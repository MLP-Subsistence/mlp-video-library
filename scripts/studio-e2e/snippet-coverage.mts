import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import * as mod from "../../src/lib/studio/services/phash.ts";
const ph: any = (mod as any).default ?? mod;
const root = process.argv[2];
const index = JSON.parse(readFileSync("storage/studio/shutterstock-index/index.json", "utf8"));
const entries = Object.values(index).filter((e: any) => e.hash) as any[];
const locals = entries.filter((e) => e.localFile);
const remote = entries.filter((e) => !e.localFile);
const summary: Record<string, { n: number; local: number; account: number; none: number }> = {};
for (const folder of readdirSync(root)) {
  const dir = path.join(root, folder);
  if (!statSync(dir).isDirectory()) continue;
  const s = { n: 0, local: 0, account: 0, none: 0 };
  for (const file of readdirSync(dir)) {
    if (!/\.png$/i.test(file)) continue;
    s.n += 1;
    try {
      const small = await sharp(path.join(dir, file)).resize(600, 600, { fit: "inside" }).jpeg().toBuffer();
      const hashes = await ph.frameHashes(small);
      const dl = Math.min(...locals.map((e) => ph.bestDistance(hashes, BigInt("0x" + e.hash))));
      const dr = Math.min(...remote.map((e) => ph.bestDistance(hashes, BigInt("0x" + e.hash))));
      if (dl <= 10) s.local += 1; else if (dr <= 10) s.account += 1; else s.none += 1;
    } catch { s.none += 1; }
  }
  summary[folder] = s;
}
for (const [k, v] of Object.entries(summary)) console.log(`${k.padEnd(34)} snippets ${String(v.n).padStart(3)}  local ${String(v.local).padStart(3)}  account ${String(v.account).padStart(3)}  none ${String(v.none).padStart(3)}`);
