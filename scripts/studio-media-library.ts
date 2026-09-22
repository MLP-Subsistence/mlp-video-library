import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { applyMediaMatch } from "@/lib/studio/services/media-matches";
import { bestDistance, frameHashes, phash } from "@/lib/studio/services/phash";
import { buildStorageKey, storage } from "@/lib/studio/storage";

/**
 * Media library from the MLP Shutterstock account (user 367425665).
 *
 *   index   — read the exported licensed-assets list (JSON saved from the
 *             account's Downloads page), fetch each public 600 px preview,
 *             hash it. Writes storage/studio/shutterstock-index/index.json.
 *   match   — for every master segment frame (caption band cropped), find the
 *             closest licensed images by perceptual hash and store them as
 *             StudioMediaMatch candidates (best first). Prints a summary.
 *   ingest  — pick up files re-downloaded from Shutterstock
 *             (Downloads/shutterstock_<id>.jpg), store them as assets and
 *             attach each to the segments whose chosen/best match is that id.
 *
 *   npx tsx scripts/studio-media-library.ts index  --json "C:/Users/<you>/Downloads/shutterstock-library-367425665.json"
 *   npx tsx scripts/studio-media-library.ts match  [--max-distance 14] [--auto 8]
 *   npx tsx scripts/studio-media-library.ts ingest --downloads "C:/Users/<you>/Downloads"
 */
const INDEX_DIR = path.join(process.cwd(), "storage", "studio", "shutterstock-index");
const INDEX_FILE = path.join(INDEX_DIR, "index.json");

type LibraryEntry = { id: string; thumb: string | null; src: string; desc: string; aspect: number | null; gen: boolean; editorial: boolean; licensedAt: string | null };
type IndexEntry = LibraryEntry & { hash: string | null; file: string | null };

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function exists(file: string) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function buildIndex() {
  const jsonFile = arg("json");
  if (!jsonFile) throw new Error("--json <exported library json> is required");
  const entries = JSON.parse(await readFile(jsonFile, "utf8")) as LibraryEntry[];
  await mkdir(INDEX_DIR, { recursive: true });
  const existing: Record<string, IndexEntry> = (await exists(INDEX_FILE)) ? JSON.parse(await readFile(INDEX_FILE, "utf8")) : {};
  let done = 0;
  let failed = 0;
  const queue = [...entries];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const entry = queue.shift()!;
      if (existing[entry.id]?.hash) {
        done += 1;
        continue;
      }
      const url = entry.thumb || entry.src;
      if (!url) {
        existing[entry.id] = { ...entry, hash: null, file: null };
        failed += 1;
        continue;
      }
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        const bytes = Buffer.from(await response.arrayBuffer());
        const file = path.join(INDEX_DIR, `${entry.id}.jpg`);
        await writeFile(file, bytes);
        const hash = await phash(bytes);
        existing[entry.id] = { ...entry, hash: hash.toString(16), file };
        done += 1;
        if (done % 100 === 0) console.log(`  hashed ${done}/${entries.length}`);
      } catch (error) {
        existing[entry.id] = { ...entry, hash: null, file: null };
        failed += 1;
        console.warn(`  ${entry.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
  });
  await Promise.all(workers);
  await writeFile(INDEX_FILE, JSON.stringify(existing));
  console.log(`index: ${done} hashed, ${failed} failed → ${INDEX_FILE}`);
}

async function matchSegments() {
  const maxDistance = Number(arg("max-distance", "10"));
  const auto = Number(arg("auto", "8"));
  const index = JSON.parse(await readFile(INDEX_FILE, "utf8")) as Record<string, IndexEntry>;
  const library = Object.values(index).filter((entry) => entry.hash).map((entry) => ({ ...entry, hashValue: BigInt(`0x${entry.hash}`) }));
  console.log(`${library.length} licensed images in the index`);
  // Link poster frames imported before frameAssetId existed (matched by asset name).
  const unlinked = await prisma.studioSegment.findMany({ where: { frameAssetId: null }, include: { template: { select: { title: true } } } });
  for (const segment of unlinked) {
    const frame = await prisma.studioAsset.findFirst({ where: { kind: "image", tags: { contains: "master frame" }, name: { endsWith: `— ${segment.key} frame` }, AND: { name: { contains: segment.template.title } } }, orderBy: { createdAt: "desc" } });
    if (frame) await prisma.studioSegment.update({ where: { id: segment.id }, data: { frameAssetId: frame.id } });
  }
  const segments = await prisma.studioSegment.findMany({ where: { frameAssetId: { not: null } }, include: { template: { select: { title: true } } }, orderBy: [{ templateId: "asc" }, { orderIndex: "asc" }] });
  const crop = Number(process.env.STUDIO_CAPTION_CROP_FRACTION || 0.2);
  let matched = 0;
  let strong = 0;
  const perTemplate = new Map<string, { total: number; matched: number; strong: number }>();
  for (const segment of segments) {
    const frame = await prisma.studioAsset.findUnique({ where: { id: segment.frameAssetId! } });
    const bytes = frame ? await storage().get(frame.storageKey) : null;
    if (!bytes) continue;
    const meta = await sharp(bytes).metadata();
    const width = meta.width ?? 1280;
    const height = meta.height ?? 720;
    const cleaned = await sharp(bytes).extract({ left: 0, top: 0, width, height: Math.round(height * (1 - crop)) }).jpeg().toBuffer();
    const hashes = await frameHashes(cleaned);
    const scored = library
      .map((entry) => ({ entry, distance: bestDistance(hashes, entry.hashValue) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
    const stats = perTemplate.get(segment.template.title) ?? { total: 0, matched: 0, strong: 0 };
    stats.total += 1;
    const good = scored.filter((candidate) => candidate.distance <= maxDistance);
    if (good.length) {
      stats.matched += 1;
      matched += 1;
      if (good[0].distance <= auto) {
        stats.strong += 1;
        strong += 1;
      }
    }
    perTemplate.set(segment.template.title, stats);
    await prisma.studioMediaMatch.deleteMany({ where: { segmentId: segment.id, status: "candidate" } });
    for (const [rank, candidate] of good.entries()) {
      const similarity = Math.max(0, Math.round((1 - candidate.distance / 32) * 100));
      await prisma.studioMediaMatch.upsert({
        where: { segmentId_provider_externalId: { segmentId: segment.id, provider: "shutterstock", externalId: candidate.entry.id } },
        update: { rank, description: `${similarity}% match · ${candidate.entry.desc}`, previewUrl: candidate.entry.thumb || candidate.entry.src, pageUrl: `https://www.shutterstock.com/image-photo/-${candidate.entry.id}` },
        create: { segmentId: segment.id, provider: "shutterstock", externalId: candidate.entry.id, rank, description: `${similarity}% match · ${candidate.entry.desc}`, previewUrl: candidate.entry.thumb || candidate.entry.src, pageUrl: `https://www.shutterstock.com/image-photo/-${candidate.entry.id}` }
      });
    }
  }
  console.log(`\nmatched ${matched}/${segments.length} segments (${strong} strong, distance ≤ ${auto})`);
  for (const [title, stats] of perTemplate) console.log(`  ${title}: ${stats.matched}/${stats.total} matched, ${stats.strong} strong`);
  const ids = new Set<string>();
  const best = await prisma.studioMediaMatch.findMany({ where: { rank: 0, status: "candidate" } });
  for (const match of best) ids.add(match.externalId);
  await writeFile(path.join(INDEX_DIR, "needed-ids.json"), JSON.stringify([...ids]));
  console.log(`${ids.size} distinct images needed → ${path.join(INDEX_DIR, "needed-ids.json")}`);
}

async function ingestDownloads() {
  const downloads = arg("downloads", path.join(process.env.USERPROFILE || process.env.HOME || "", "Downloads"))!;
  const files = (await readdir(downloads)).filter((file) => /^shutterstock_(\d+)\.(jpe?g|png)$/i.test(file));
  console.log(`${files.length} shutterstock files in ${downloads}`);
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  let attached = 0;
  for (const file of files) {
    const id = /^shutterstock_(\d+)\./i.exec(file)![1];
    const matches = await prisma.studioMediaMatch.findMany({ where: { externalId: id, OR: [{ status: "candidate", rank: 0 }, { status: "chosen" }] }, include: { asset: true } });
    if (matches.length === 0) continue;
    let asset = matches.find((match) => match.asset)?.asset ?? (await prisma.studioAsset.findFirst({ where: { tags: { contains: `shutterstock, ${id},` } } }));
    if (!asset) {
      const bytes = await readFile(path.join(downloads, file));
      const meta = await sharp(bytes).metadata();
      const key = buildStorageKey("stock/shutterstock/library", `${id}.jpg`);
      await storage().put(key, bytes, "image/jpeg");
      asset = await prisma.studioAsset.create({
        data: { kind: "image", name: `Shutterstock ${id}`, storageKey: key, url: storage().publicUrl(key), mimeType: "image/jpeg", sizeBytes: bytes.length, width: meta.width ?? null, height: meta.height ?? null, tags: `shutterstock, ${id}, licensed, redownload`, uploadedById: admin?.id ?? null }
      });
    }
    for (const match of matches) {
      if (match.status === "chosen" && match.assetId === asset.id) continue;
      await applyMediaMatch(match.id, { uploadedAssetId: asset.id, userId: admin?.id ?? null });
      attached += 1;
    }
  }
  console.log(`attached ${attached} segment visuals`);
}

async function main() {
  const command = process.argv[2];
  if (command === "index") await buildIndex();
  else if (command === "match") await matchSegments();
  else if (command === "ingest") await ingestDownloads();
  else throw new Error("usage: index | match | ingest");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
