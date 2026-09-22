import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import * as mod from "../../src/lib/studio/services/phash.ts";
const ph: any = (mod as any).default ?? mod;
const [video, original] = [process.argv[2], process.argv[3]];
const small = await sharp(original).rotate().resize(600, 600, { fit: "inside" }).jpeg().toBuffer();
const target = await ph.phash(small);
const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).toString());
let best = { t: 0, d: 99 };
for (let t = 0.5; t < dur; t += 1.5) {
  const frame = execFileSync("ffmpeg", ["-loglevel", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=640:-2", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], { maxBuffer: 50e6 });
  const meta = await sharp(frame).metadata();
  const cleaned = await sharp(frame).extract({ left: 0, top: 0, width: meta.width!, height: Math.round(meta.height! * 0.8) }).jpeg().toBuffer();
  const d = ph.bestDistance(await ph.frameHashes(cleaned), target);
  if (d < best.d) best = { t, d };
}
console.log("best distance", best.d, "at", best.t.toFixed(1), "s of", dur.toFixed(1));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(best.t), "-i", video, "-frames:v", "1", "-vf", "scale=640:-2", "C:/Users/uwish/AppData/Local/Temp/claude/studio-test/diag-video-frame.jpg"]);
