import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/** Contact sheet of one frame per segment for a master template, to eyeball boundary quality. */
const prisma = new PrismaClient();
const number = process.argv[2] ?? "5";
const out = process.argv[3] ?? "sheet.png";
const template = await prisma.studioTemplate.findFirst({ where: { title: { contains: "" }, segments: { some: {} } }, include: { segments: { orderBy: { orderIndex: "asc" } } }, orderBy: { createdAt: "asc" }, skip: 0, take: 1,
  ...(process.env.TEMPLATE_ID ? { where: { id: process.env.TEMPLATE_ID } } : {}) });
const master = template?.masterAssetId ? await prisma.studioAsset.findUnique({ where: { id: template.masterAssetId } }) : null;
if (!template || !master) throw new Error("template/master not found");
const file = `storage/studio/${master.storageKey}`;
const picks = template.segments.slice(0, 12);
const inputs: string[] = [];
const filters: string[] = [];
picks.forEach((segment, index) => {
  inputs.push("-ss", String((segment.sourceStartSec ?? 0) + 0.4), "-i", file);
  filters.push(`[${index}:v]scale=320:-2,drawtext=text='${String(index + 1).padStart(2, "0")}':fontcolor=white:fontsize=28:box=1:boxcolor=black@0.6:x=8:y=8[v${index}]`);
});
const graph = `${filters.join(";")};${picks.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${picks.length}:layout=${picks.map((_, i) => `${(i % 4) * 320}_${Math.floor(i / 4) * 200}`).join("|")}:fill=black[out]`;
const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", out], { encoding: "utf8" });
if (result.status !== 0) console.error(result.stderr);
console.log(template.title, "—", picks.map((s, i) => `${i + 1}: ${s.sourceScript.slice(0, 50)}`).join("\n"));
await prisma.$disconnect();
