import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { applyCleanFrame, applyMediaMatch } from "@/lib/studio/services/media-matches";
import { bestDistance, frameHashes, hamming, minDistance, phash, windowHashes } from "@/lib/studio/services/phash";
import { serializeComposition } from "@/lib/studio/layouts";
import { buildStorageKey, storage } from "@/lib/studio/storage";
import { HIGH_QUALITY_SHUTTERSTOCK_TAG, listOriginalAssetFolders } from "@/lib/studio/asset-folders";

/**
 * Media library from the MLP Shutterstock account (user 367425665).
 *
 *   index   — read the exported licensed-assets list (JSON saved from the
 *             account's Downloads page), fetch each public 600 px preview,
 *             hash it. Writes storage/studio/shutterstock-index/index.json.
 *   match   — for every master segment frame (caption band cropped), find the
 *             closest licensed images by perceptual hash and store them as
 *             StudioMediaMatch candidates (best first). Prints a summary.
 *   index-local — hash a folder of already-downloaded Shutterstock originals
 *             (shutterstock_<id>.jpg, recursive) into the same index; the
 *             full-size file is kept as the source for attaching.
 *   attach-local — after `match`, attach every strong best match whose
 *             original exists locally (stores the file as an asset).
 *             `--ids a,b` attaches exactly those reviewed matches (any
 *             distance); `--reject a,b` marks reviewed matches as rejected.
 *   clean-frames — for every segment of a playlist's templates that still
 *             shows the master video, use its caption-cropped poster frame as
 *             a still image, so no burnt-in captions remain in the template.
 *   ingest  — pick up files re-downloaded from Shutterstock
 *             (Downloads/shutterstock_<id>.jpg), store them as assets and
 *             attach each to the segments whose chosen/best match is that id.
 *   organize-source — mark assets that match one trusted originals folder,
 *             enabling per-video folders without including screengrabs.
 *
 *   npx tsx scripts/studio-media-library.ts index  --json "C:/Users/<you>/Downloads/shutterstock-library-367425665.json"
 *   npx tsx scripts/studio-media-library.ts match  [--max-distance 14] [--auto 8]
 *   npx tsx scripts/studio-media-library.ts ingest --downloads "C:/Users/<you>/Downloads"
 *   npx tsx scripts/studio-media-library.ts clean-frames --playlist "Marketplace Literacy Youth Africa" [--dry-run]
 */
const INDEX_DIR = path.join(process.cwd(), "storage", "studio", "shutterstock-index");
const INDEX_FILE = path.join(INDEX_DIR, "index.json");

type LibraryEntry = { id: string; thumb: string | null; src: string; desc: string; aspect: number | null; gen: boolean; editorial: boolean; licensedAt: string | null };
type IndexEntry = LibraryEntry & { hash: string | null; file: string | null; localFile?: string | null; windows?: string[] };

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

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function indexLocal() {
  const dir = arg("dir");
  if (!dir) throw new Error("--dir <folder of shutterstock_<id>.jpg files> is required");
  await mkdir(INDEX_DIR, { recursive: true });
  const existing: Record<string, IndexEntry> = (await exists(INDEX_FILE)) ? JSON.parse(await readFile(INDEX_FILE, "utf8")) : {};
  const includeAll = process.argv.includes("--all");
  // Only Shutterstock originals by default (shutterstock_<id>.jpg); --all hashes every image in the folder.
  const files = (await walk(dir)).filter((file) => includeAll || /shutterstock_\d+/i.test(path.basename(file)));
  let done = 0;
  for (const file of files) {
    const id = /shutterstock_(\d+)/i.exec(path.basename(file))?.[1] ?? path.basename(file).replace(/\.[^.]+$/, "");
    if (existing[id]?.localFile === file && existing[id]?.hash && existing[id]?.windows?.length) continue;
    try {
      // Downscale first: the originals are 30+ megapixel files.
      const small = await sharp(file).rotate().resize(800, 800, { fit: "inside" }).jpeg().toBuffer();
      const hash = await phash(small);
      const windows = (await windowHashes(small)).map((value) => value.toString(16));
      existing[id] = { ...(existing[id] ?? { id, thumb: null, src: "", desc: path.basename(file), aspect: null, gen: false, editorial: false, licensedAt: null }), hash: hash.toString(16), file: existing[id]?.file ?? null, localFile: file, windows };
      done += 1;
      if (done % 50 === 0) console.log(`  hashed ${done}/${files.length}`);
    } catch (error) {
      console.warn(`  ${file}: ${error instanceof Error ? error.message : error}`);
    }
  }
  await writeFile(INDEX_FILE, JSON.stringify(existing));
  console.log(`index-local: ${done} files hashed from ${dir}`);
}

type LibraryHashed = IndexEntry & { hashValue: bigint; windowValues: bigint[] };

/** Split the frame into 2 or 3 equal columns and match each column on its own. */
async function matchCollage(cleaned: Buffer, library: LibraryHashed[], auto: number) {
  const meta = await sharp(cleaned).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  for (const columns of [3, 2]) {
    const panels: Array<{ entry: LibraryHashed; distance: number }> = [];
    for (let i = 0; i < columns; i++) {
      const left = Math.round((width * i) / columns);
      const panelWidth = Math.round(width / columns);
      const panel = await sharp(cleaned).extract({ left, top: 0, width: Math.min(panelWidth, width - left), height }).jpeg().toBuffer();
      const hashes = await frameHashes(panel);
      const panelHash = await phash(panel);
      let best: { entry: LibraryHashed; distance: number } | null = null;
      for (const entry of library) {
        const distance = Math.min(bestDistance(hashes, entry.hashValue), entry.windowValues.length ? minDistance(panelHash, entry.windowValues) : 64);
        if (!best || distance < best.distance) best = { entry, distance };
      }
      if (!best || best.distance > auto) break;
      panels.push(best);
    }
    if (panels.length === columns) return { panels };
  }
  return null;
}

async function storeOriginal(index: Record<string, IndexEntry>, externalId: string, userId: string | null) {
  const entry = index[externalId];
  if (!entry?.localFile) return null;
  const existing = await prisma.studioAsset.findFirst({ where: { tags: { contains: `shutterstock, ${externalId},` } } });
  if (existing) return existing;
  // Store a web-friendly copy (max 2560 px) rather than the 30 MP original.
  const bytes = await sharp(entry.localFile).rotate().resize(2560, 2560, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const meta = await sharp(bytes).metadata();
  const key = buildStorageKey("stock/shutterstock/library", `${externalId}.jpg`);
  await storage().put(key, bytes, "image/jpeg");
  return prisma.studioAsset.create({
    data: { kind: "image", name: `Shutterstock ${externalId}`, storageKey: key, url: storage().publicUrl(key), mimeType: "image/jpeg", sizeBytes: bytes.length, width: meta.width ?? null, height: meta.height ?? null, tags: `shutterstock, ${externalId}, licensed, local`, uploadedById: userId }
  });
}

async function attachCollages(index: Record<string, IndexEntry>, userId: string | null) {
  const panelMatches = await prisma.studioMediaMatch.findMany({ where: { status: "candidate", description: { startsWith: "panel " } }, orderBy: [{ segmentId: "asc" }, { rank: "asc" }] });
  const bySegment = new Map<string, typeof panelMatches>();
  for (const match of panelMatches) bySegment.set(match.segmentId, [...(bySegment.get(match.segmentId) ?? []), match]);
  let attached = 0;
  for (const [segmentId, matches] of bySegment) {
    const total = Number(/panel \d+\/(\d+)/.exec(matches[0].description)?.[1] ?? 0);
    if (matches.length !== total || (total !== 2 && total !== 3)) continue;
    const assets = [];
    for (const match of matches) {
      const asset = await storeOriginal(index, match.externalId, userId);
      if (!asset) break;
      assets.push(asset);
    }
    if (assets.length !== total) continue;
    const layout = total === 2 ? "split2" : "columns3";
    await prisma.studioSegment.update({
      where: { id: segmentId },
      data: { composition: serializeComposition({ layout, slots: assets.map((asset, i) => ({ id: `slot_${i + 1}`, fit: "cover", items: [{ assetId: asset.id, share: 1 }] })) }) }
    });
    await prisma.studioMediaMatch.updateMany({ where: { id: { in: matches.map((match) => match.id) } }, data: { status: "chosen" } });
    for (const [i, match] of matches.entries()) await prisma.studioMediaMatch.update({ where: { id: match.id }, data: { assetId: assets[i].id } });
    attached += 1;
  }
  return attached;
}

async function attachLocal() {
  const auto = Number(arg("auto", "8"));
  const index = JSON.parse(await readFile(INDEX_FILE, "utf8")) as Record<string, IndexEntry>;
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  const collages = await attachCollages(index, admin?.id ?? null);
  console.log(`attach-local: ${collages} collage segments rebuilt as split layouts`);
  const reviewedIds = (arg("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const rejectIds = (arg("reject") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (rejectIds.length) {
    const rejected = await prisma.studioMediaMatch.updateMany({ where: { id: { in: rejectIds }, status: "candidate" }, data: { status: "rejected" } });
    console.log(`attach-local: ${rejected.count} candidates rejected after review`);
  }
  const best = await prisma.studioMediaMatch.findMany({
    where: reviewedIds.length ? { id: { in: reviewedIds } } : { rank: 0, status: "candidate", NOT: { description: { startsWith: "panel " } } },
    include: { segment: { select: { key: true, template: { select: { title: true } } } } }
  });
  let attached = 0;
  let skipped = 0;
  for (const match of best) {
    const pct = Number(/^(\d+)% match/.exec(match.description)?.[1] ?? 0);
    const distance = Math.round((1 - pct / 100) * 32);
    const entry = index[match.externalId];
    if ((distance > auto && !reviewedIds.length) || !entry?.localFile) {
      skipped += 1;
      continue;
    }
    let asset = await prisma.studioAsset.findFirst({ where: { tags: { contains: `shutterstock, ${match.externalId},` } } });
    if (!asset) {
      // Store a web-friendly copy (max 2560 px) rather than the 30 MP original.
      const bytes = await sharp(entry.localFile).rotate().resize(2560, 2560, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      const meta = await sharp(bytes).metadata();
      const key = buildStorageKey("stock/shutterstock/library", `${match.externalId}.jpg`);
      await storage().put(key, bytes, "image/jpeg");
      asset = await prisma.studioAsset.create({
        data: { kind: "image", name: `Shutterstock ${match.externalId}`, storageKey: key, url: storage().publicUrl(key), mimeType: "image/jpeg", sizeBytes: bytes.length, width: meta.width ?? null, height: meta.height ?? null, tags: `shutterstock, ${match.externalId}, licensed, local`, uploadedById: admin?.id ?? null }
      });
    }
    await applyMediaMatch(match.id, { uploadedAssetId: asset.id, userId: admin?.id ?? null });
    attached += 1;
    console.log(`  ✓ ${match.segment.template.title} / ${match.segment.key} ← ${match.externalId} (${pct}%)`);
  }
  console.log(`attach-local: ${attached} attached, ${skipped} left for review`);
}

/** Segments of a playlist's templates that still show the master video get their caption-cropped poster frame instead. */
async function cleanFrames() {
  const playlistTitle = arg("playlist");
  const dryRun = process.argv.includes("--dry-run");
  if (!playlistTitle) throw new Error("--playlist <title> is required");
  const playlist = await prisma.playlist.findFirst({ where: { title: playlistTitle }, include: { videos: { orderBy: { sortOrder: "asc" }, select: { videoId: true } } } });
  if (!playlist) throw new Error(`playlist "${playlistTitle}" not found`);
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  const templates = await prisma.studioTemplate.findMany({ where: { sourceVideoId: { in: playlist.videos.map((entry) => entry.videoId) } }, include: { segments: { orderBy: { orderIndex: "asc" } } } });
  let replaced = 0;
  let failed = 0;
  for (const template of templates) {
    if (!template.masterAssetId) continue;
    for (const segment of template.segments) {
      const composition = JSON.parse(segment.composition || "{}") as { slots?: Array<{ items: Array<{ assetId: string }> }> };
      const usesMaster = (composition.slots ?? []).some((slot) => slot.items.some((item) => item.assetId === template.masterAssetId));
      if (!usesMaster) continue;
      if (dryRun) {
        replaced += 1;
        continue;
      }
      try {
        await applyCleanFrame(segment.id, admin?.id ?? null);
        replaced += 1;
      } catch (error) {
        failed += 1;
        console.warn(`  ✗ ${template.title} / ${segment.key}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  console.log(`clean-frames: ${dryRun ? "would replace" : "replaced"} ${replaced} master-video segments with caption-free stills${failed ? `, ${failed} failed` : ""}`);
}

async function matchSegments() {
  const maxDistance = Number(arg("max-distance", "10"));
  const auto = Number(arg("auto", "8"));
  const index = JSON.parse(await readFile(INDEX_FILE, "utf8")) as Record<string, IndexEntry>;
  const library = Object.values(index).filter((entry) => entry.hash).map((entry) => ({ ...entry, hashValue: BigInt(`0x${entry.hash}`), windowValues: (entry.windows ?? []).map((value) => BigInt(`0x${value}`)) }));
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
    const cleanedHash = await phash(cleaned);
    const scored = library
      .map((entry) => ({ entry, distance: Math.min(bestDistance(hashes, entry.hashValue), entry.windowValues.length ? minDistance(cleanedHash, entry.windowValues) : 64) }))
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
    // No single photo behind this frame? Try 2- and 3-photo side-by-side collages.
    if (good.length === 0 || good[0].distance > auto) {
      const collage = await matchCollage(cleaned, library, auto);
      if (collage) {
        stats.matched += good.length ? 0 : 1;
        stats.strong += 1;
        if (!good.length) matched += 1;
        strong += 1;
        for (const [panel, hit] of collage.panels.entries()) {
          const similarity = Math.max(0, Math.round((1 - hit.distance / 32) * 100));
          await prisma.studioMediaMatch.upsert({
            where: { segmentId_provider_externalId: { segmentId: segment.id, provider: "shutterstock", externalId: hit.entry.id } },
            update: { rank: panel, description: `panel ${panel + 1}/${collage.panels.length} · ${similarity}% match · ${hit.entry.desc}`, previewUrl: hit.entry.thumb || hit.entry.src, pageUrl: `https://www.shutterstock.com/image-photo/-${hit.entry.id}` },
            create: { segmentId: segment.id, provider: "shutterstock", externalId: hit.entry.id, rank: panel, description: `panel ${panel + 1}/${collage.panels.length} · ${similarity}% match · ${hit.entry.desc}`, previewUrl: hit.entry.thumb || hit.entry.src, pageUrl: `https://www.shutterstock.com/image-photo/-${hit.entry.id}` }
          });
        }
        continue;
      }
    }
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

async function organizeSource() {
  const dir = arg("dir");
  if (!dir) throw new Error("--dir <folder of Shutterstock originals> is required");
  if (storage().name !== "local") throw new Error("organize-source requires local Studio storage.");
  const dryRun = process.argv.includes("--dry-run");
  const files = (await walk(dir)).filter((file) => /^shutterstock_\d+\.jpe?g$/i.test(path.basename(file))).sort();
  const sources = new Map<string, string[]>();
  for (const file of files) {
    const id = /^shutterstock_(\d+)\./i.exec(path.basename(file))![1];
    sources.set(id, [...(sources.get(id) ?? []), file]);
  }
  const assets = await prisma.studioAsset.findMany({ where: { kind: "image", tags: { contains: "shutterstock" } } });
  const assetsById = new Map<string, typeof assets>();
  for (const asset of assets) {
    const id = /^shutterstock,\s*(\d+),/i.exec(asset.tags)?.[1];
    if (id) assetsById.set(id, [...(assetsById.get(id) ?? []), asset]);
  }
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  let verified = 0;
  let imported = 0;
  let conflicts = 0;
  let failed = 0;
  for (const [id, copies] of sources) {
    try {
      const source = copies[0];
      const reference = await phash(await sharp(source).rotate().resize(800, 800, { fit: "inside" }).jpeg().toBuffer());
      let conflict = false;
      for (const copy of copies.slice(1)) {
        const hash = await phash(await sharp(copy).rotate().resize(800, 800, { fit: "inside" }).jpeg().toBuffer());
        if (hamming(reference, hash) > 4) conflict = true;
      }
      if (conflict) {
        conflicts += 1;
        console.warn(`  ${id}: duplicate source files differ; skipped`);
        continue;
      }
      let matchingAsset: (typeof assets)[number] | null = null;
      for (const asset of assetsById.get(id) ?? []) {
        const stored = await storage().get(asset.storageKey);
        if (!stored) continue;
        const hash = await phash(await sharp(stored).rotate().resize(800, 800, { fit: "inside" }).jpeg().toBuffer());
        if (hamming(reference, hash) <= 4) { matchingAsset = asset; break; }
      }
      if (matchingAsset) {
        verified += 1;
        if (!dryRun && !matchingAsset.tags.includes(HIGH_QUALITY_SHUTTERSTOCK_TAG)) {
          await prisma.studioAsset.update({ where: { id: matchingAsset.id }, data: { tags: `${matchingAsset.tags}, ${HIGH_QUALITY_SHUTTERSTOCK_TAG}` } });
        }
      } else {
        imported += 1;
        if (!dryRun) {
          const bytes = await sharp(source).rotate().resize(2560, 2560, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
          const meta = await sharp(bytes).metadata();
          const key = buildStorageKey("stock/shutterstock/library", `${id}.jpg`);
          await storage().put(key, bytes, "image/jpeg");
          await prisma.studioAsset.create({ data: { kind: "image", name: `Shutterstock ${id}`, storageKey: key, url: storage().publicUrl(key), mimeType: "image/jpeg", sizeBytes: bytes.length, width: meta.width ?? null, height: meta.height ?? null, tags: `shutterstock, ${id}, licensed, local, original, ${HIGH_QUALITY_SHUTTERSTOCK_TAG}`, uploadedById: admin?.id ?? null } });
        }
      }
    } catch (error) {
      failed += 1;
      console.warn(`  ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  const folders = await listOriginalAssetFolders();
  console.log(`organize-source${dryRun ? " (dry run)" : ""}: ${files.length} files, ${sources.size} unique IDs, ${verified} verified existing, ${imported} to import, ${conflicts} conflicting duplicates, ${failed} failed`);
  console.log(`organize-source: ${folders.length} video folders, ${folders.reduce((sum, folder) => sum + folder.assetCount, 0)} photo placements`);
  for (const folder of folders) console.log(`  ${folder.assetCount.toString().padStart(2)}  ${folder.title}`);
}

async function main() {
  const command = process.argv[2];
  if (command === "index") await buildIndex();
  else if (command === "index-local") await indexLocal();
  else if (command === "attach-local") await attachLocal();
  else if (command === "match") await matchSegments();
  else if (command === "ingest") await ingestDownloads();
  else if (command === "clean-frames") await cleanFrames();
  else if (command === "organize-source") await organizeSource();
  else throw new Error("usage: index | index-local | match | attach-local | clean-frames | organize-source | ingest");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
