import { readFileSync } from "node:fs";
import * as mod from "../../src/lib/studio/services/phash.ts";
const ph: any = (mod as any).default?.phash ? (mod as any).default : mod;
console.log(Object.keys(mod), Object.keys((mod as any).default || {}));
const full = readFileSync("C:/Users/uwish/Downloads/shutterstock_2727785083.jpg");
const thumb = readFileSync("storage/studio/shutterstock-index/2727785083.jpg");
const a = await ph.phash(full); const b = await ph.phash(thumb);
console.log("full vs thumb distance:", ph.hamming(a, b), "| crops:", ph.bestDistance(await ph.frameHashes(full), b));
