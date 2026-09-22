import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { bestDistance, frameHashes, minDistance, phash } from "@/lib/studio/services/phash";
import sharp from "sharp";

// Read-only audit. Results are written to ignored sync/ for human review.
async function main() {
  const index = JSON.parse(await readFile("storage/studio/shutterstock-index/index.json", "utf8")) as Record<string, { hash?: string; windows?: string[] }>;
  const templates = await prisma.studioTemplate.findMany({
    where: { sourceVideo: { title: { contains: "Youth Africa" } } },
    select: { id: true, title: true, segments: { select: { key: true, frameAssetId: true, composition: true } } }
  });
  const ids = new Set<string>();
  for (const template of templates) for (const segment of template.segments) if (segment.frameAssetId) ids.add(segment.frameAssetId);
  const assets = await prisma.studioAsset.findMany({ where: { id: { in: [...ids] } }, select: { id: true, storageKey: true } });
  const paths = new Map(assets.map((a) => [a.id, path.join("storage/studio", a.storageKey)]));
  await writeFile("sync/frame-manifest.json", JSON.stringify(templates.flatMap((template) => template.segments.map((segment) => ({
    title: template.title,
    key: segment.key,
    file: paths.has(segment.frameAssetId ?? "") ? path.resolve(paths.get(segment.frameAssetId!)!) : null
  })).filter((entry) => entry.file))));
  const source = "C:/Users/uwish/Documents/MLP AFRICA PROJECTS/MLP AFRICA ASSETS/High Quality Shutterstock";
  const { readdir } = await import("node:fs/promises");
  const originals = (await readdir(source)).map((f) => /^shutterstock_(\d+)\.jpe?g$/i.exec(f)?.[1]).filter((x): x is string => Boolean(x));
  const library = [...new Set(originals)].filter((id) => index[id]?.hash).map((id) => ({ id, hash: BigInt(`0x${index[id].hash}`), windows: (index[id].windows ?? []).map((h) => BigInt(`0x${h}`)) }));
  const rows: Array<{ title: string; key: string; top: Array<{ id: string; distance: number }> }> = [];
  for (const template of templates) {
    for (const segment of template.segments) {
      const file = paths.get(segment.frameAssetId ?? "");
      if (!file) continue;
      let bytes: Buffer;
      try { bytes = await readFile(file); } catch { continue; }
      const meta = await sharp(bytes).metadata();
      const cleaned = await sharp(bytes).extract({ left: 0, top: 0, width: meta.width!, height: Math.round(meta.height! * .8) }).jpeg().toBuffer();
      const hashes = await frameHashes(cleaned);
      const full = await phash(cleaned);
      const top = library.map((item) => ({ id: item.id, distance: Math.min(bestDistance(hashes, item.hash), minDistance(full, item.windows)) })).sort((a, b) => a.distance - b.distance).slice(0, 5);
      rows.push({ title: template.title, key: segment.key, top });
    }
    console.log(`${template.title}: ${rows.filter((r) => r.title === template.title).length} frames`);
  }
  await writeFile("sync/original-folder-audit.json", JSON.stringify(rows, null, 2));
  for (const target of ["1142898902", "1866006859"]) console.log(target, rows.flatMap((row) => row.top.filter((x) => x.id === target).map((x) => ({ title: row.title, key: row.key, ...x }))));
  console.log(`${library.length} originals, ${rows.length} reference frames`);
}

main().finally(() => prisma.$disconnect());
