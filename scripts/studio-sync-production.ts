import { spawnSync } from "child_process";
import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

/**
 * Ship prepared lessons (playlist → videos → master templates → segments →
 * assets + files) from the local Studio database to the production site.
 *
 * Two steps, because the local app runs on SQLite and production on Postgres
 * (two Prisma clients that cannot both be `@prisma/client`):
 *
 *   1. export  — with the local database (the normal .env), writes a bundle
 *                folder: bundle.json + every referenced file.
 *        npx tsx scripts/studio-sync-production.ts export --playlist "Marketplace Literacy Youth Africa" --out sync/youth-africa
 *
 *   2. import  — against production: DATABASE_URL/DIRECT_URL of the site's
 *                Postgres and the STUDIO_STORAGE_DRIVER=s3 + STUDIO_S3_* bucket
 *                settings (copy them from the Netlify site). Generates a
 *                Postgres client into node_modules/.prisma/client-postgres (the
 *                local SQLite client is untouched), uploads the files to the
 *                bucket and upserts every row **with the same ids**, so
 *                segment compositions keep pointing at the right assets.
 *        npx tsx scripts/studio-sync-production.ts import --bundle sync/youth-africa [--dry-run] [--set-main]
 *
 * Re-runnable: rows are upserted and files that already exist in the bucket
 * with the same size are skipped. Languages, modules and users are matched by
 * code / name / email and never created (except the language, when missing).
 * Localization projects, jobs and narration are not copied — they belong to
 * the site where educators make them.
 */
type Bundle = {
  exportedAt: string;
  playlist: Record<string, unknown> & { id: string; languageCode: string | null; moduleName: string | null };
  videos: Array<Record<string, unknown> & { id: string; languageCode: string | null; moduleName: string | null; sortOrder: number }>;
  templates: Array<Record<string, unknown> & { id: string; moduleName: string | null; createdByEmail: string | null }>;
  segments: Array<Record<string, unknown> & { id: string }>;
  mediaMatches: Array<Record<string, unknown> & { id: string }>;
  assets: Array<Record<string, unknown> & { id: string; storageKey: string; thumbnailKey: string | null; uploadedByEmail: string | null }>;
};

type OriginalAssetsBundle = {
  exportedAt: string;
  assets: Bundle["assets"];
};

const VERIFIED_ORIGINAL_TAG = "source:high-quality-shutterstock";

const LOCAL_FILE_ROUTE = "/api/studio/files/";

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function keyFromLocalUrl(url: string | null | undefined) {
  if (!url) return null;
  const index = url.indexOf(LOCAL_FILE_ROUTE);
  return index >= 0 ? decodeURIComponent(url.slice(index + LOCAL_FILE_ROUTE.length)) : null;
}

/** `{ id, languageId, language: {...} }` → plain columns (relations and ids to remap are handled by the caller). */
function strip<T extends Record<string, unknown>>(row: T, drop: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (drop.includes(key)) continue;
    if (value !== null && typeof value === "object" && !(value instanceof Date)) continue;
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------- export ----
async function exportBundle() {
  const playlistTitle = arg("playlist");
  const out = arg("out");
  if (!playlistTitle || !out) throw new Error("--playlist <title> --out <folder> are required");
  const { prisma } = await import("@/lib/prisma");
  const { storage } = await import("@/lib/studio/storage");

  const playlist = await prisma.playlist.findFirst({ where: { title: playlistTitle }, include: { language: true, module: true, videos: { orderBy: { sortOrder: "asc" }, include: { video: { include: { language: true, module: true, studioTemplates: { include: { module: true, segments: { orderBy: { orderIndex: "asc" }, include: { mediaMatches: true } } } } } } } } } });
  if (!playlist) throw new Error(`playlist "${playlistTitle}" not found`);

  const userEmails = new Map((await prisma.user.findMany({ select: { id: true, email: true } })).map((row) => [row.id, row.email]));
  const assetIds = new Set<string>();
  const bundle: Bundle = {
    exportedAt: new Date().toISOString(),
    playlist: { ...strip(playlist, ["languageId", "moduleId"]), languageCode: playlist.language?.code ?? null, moduleName: playlist.module?.name ?? null } as Bundle["playlist"],
    videos: [],
    templates: [],
    segments: [],
    mediaMatches: [],
    assets: []
  };
  for (const item of playlist.videos) {
    const video = item.video;
    bundle.videos.push({ ...strip(video, ["languageId", "moduleId"]), languageCode: video.language?.code ?? null, moduleName: video.module?.name ?? null, sortOrder: item.sortOrder } as Bundle["videos"][number]);
    for (const template of video.studioTemplates) {
      bundle.templates.push({ ...strip(template, ["moduleId", "createdById"]), moduleName: template.module?.name ?? null, createdByEmail: template.createdById ? userEmails.get(template.createdById) ?? null : null } as Bundle["templates"][number]);
      for (const id of [template.thumbnailAssetId, template.musicAssetId, template.masterAssetId]) if (id) assetIds.add(id);
      for (const segment of template.segments) {
        bundle.segments.push(strip(segment, []) as Bundle["segments"][number]);
        if (segment.frameAssetId) assetIds.add(segment.frameAssetId);
        const composition = JSON.parse(segment.composition || "{}") as { slots?: Array<{ items: Array<{ assetId: string }> }> };
        for (const slot of composition.slots ?? []) for (const entry of slot.items) assetIds.add(entry.assetId);
        for (const match of segment.mediaMatches) {
          bundle.mediaMatches.push(strip(match, []) as Bundle["mediaMatches"][number]);
          if (match.assetId) assetIds.add(match.assetId);
        }
      }
    }
  }

  const assets = await prisma.studioAsset.findMany({ where: { id: { in: [...assetIds] } }, include: { uploadedBy: true } });
  const filesDir = path.join(out, "files");
  await mkdir(filesDir, { recursive: true });
  let bytes = 0;
  for (const asset of assets) {
    const thumbnailKey = keyFromLocalUrl(asset.thumbnailUrl);
    bundle.assets.push({ ...strip(asset, ["uploadedById"]), thumbnailKey, uploadedByEmail: asset.uploadedBy?.email ?? null } as Bundle["assets"][number]);
    for (const key of [asset.storageKey, thumbnailKey]) {
      if (!key) continue;
      const source = storage().localPath(key);
      if (!source) throw new Error(`export needs the local storage driver (asset ${asset.id})`);
      const target = path.join(filesDir, key);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      bytes += (await readFile(target)).length;
    }
  }
  await writeFile(path.join(out, "bundle.json"), JSON.stringify(bundle, null, 1));
  console.log(`exported "${playlist.title}": ${bundle.videos.length} videos, ${bundle.templates.length} templates, ${bundle.segments.length} segments, ${bundle.assets.length} assets (${(bytes / 1e6).toFixed(0)} MB) → ${out}`);
  await prisma.$disconnect();
}

/** Copy only verified originals; never modify live lessons or educator projects. */
async function exportOriginals() {
  const out = arg("out");
  if (!out) throw new Error("--out <folder> is required");
  const { prisma } = await import("@/lib/prisma");
  const { storage } = await import("@/lib/studio/storage");
  if (storage().name !== "local") throw new Error("export-originals needs local Studio storage");
  const assets = await prisma.studioAsset.findMany({
    where: { kind: "image", tags: { contains: VERIFIED_ORIGINAL_TAG } },
    include: { uploadedBy: true },
    orderBy: { name: "asc" }
  });
  const bundle: OriginalAssetsBundle = { exportedAt: new Date().toISOString(), assets: [] };
  const filesDir = path.join(out, "files");
  await mkdir(filesDir, { recursive: true });
  let bytes = 0;
  for (const asset of assets) {
    const thumbnailKey = keyFromLocalUrl(asset.thumbnailUrl);
    bundle.assets.push({ ...strip(asset, ["uploadedById"]), thumbnailKey, uploadedByEmail: asset.uploadedBy?.email ?? null } as Bundle["assets"][number]);
    for (const key of [asset.storageKey, thumbnailKey]) {
      if (!key) continue;
      const source = storage().localPath(key);
      if (!source) throw new Error(`missing local file for ${asset.name}: ${key}`);
      const target = path.join(filesDir, key);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      bytes += (await readFile(target)).length;
    }
  }
  await writeFile(path.join(out, "original-assets.json"), JSON.stringify(bundle, null, 1));
  console.log(`exported ${assets.length} verified originals (${(bytes / 1e6).toFixed(1)} MB) → ${out}`);
  await prisma.$disconnect();
}

// ---------------------------------------------------------------- import ----
const POSTGRES_CLIENT_DIR = path.join(process.cwd(), "node_modules", ".prisma", "client-postgres");

/** A Postgres Prisma client generated next to (not over) the SQLite one the app uses. */
async function postgresClient() {
  const schema = await readFile(path.join("prisma", "schema.postgres.prisma"), "utf8");
  const output = POSTGRES_CLIENT_DIR.split(path.sep).join("/");
  const patched = schema.replace(/generator client \{\s*provider = "prisma-client-js"\s*\}/, `generator client {\n  provider = "prisma-client-js"\n  output   = "${output}"\n}`);
  if (patched === schema) throw new Error("could not patch the generator block of schema.postgres.prisma");
  const tempSchema = path.join("prisma", ".schema.postgres.sync.prisma");
  await writeFile(tempSchema, patched);
  const generate = spawnSync("npx", ["prisma", "generate", `--schema=${tempSchema}`], { stdio: "inherit", shell: true, env: process.env });
  if (generate.status !== 0) throw new Error("prisma generate (postgres) failed");
  const mod = (await import(pathToFileURL(path.join(POSTGRES_CLIENT_DIR, "index.js")).href)) as { PrismaClient: new () => import("@prisma/client").PrismaClient };
  return new mod.PrismaClient();
}

async function importBundle() {
  const dir = arg("bundle");
  if (!dir) throw new Error("--bundle <folder> is required");
  const dryRun = process.argv.includes("--dry-run");
  const setMain = process.argv.includes("--set-main");
  const url = process.env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("import needs DATABASE_URL (and DIRECT_URL) of the production Postgres database");
  if (process.env.STUDIO_STORAGE_DRIVER !== "s3" && !dryRun) throw new Error("import needs STUDIO_STORAGE_DRIVER=s3 and the STUDIO_S3_* settings of the site");

  const bundle = JSON.parse(await readFile(path.join(dir, "bundle.json"), "utf8")) as Bundle;
  const prisma = await postgresClient();
  const { storage } = await import("@/lib/studio/storage");

  // Reference data on the site, matched by natural keys.
  const languages = new Map((await prisma.language.findMany()).map((row) => [row.code, row.id]));
  const modules = new Map((await prisma.module.findMany()).map((row) => [row.name, row.id]));
  const users = new Map((await prisma.user.findMany({ select: { id: true, email: true } })).map((row) => [row.email, row.id]));
  const languageId = (code: string | null) => (code ? languages.get(code) ?? null : null);
  const moduleId = (name: string | null) => (name ? modules.get(name) ?? null : null);
  const userId = (email: string | null) => (email ? users.get(email) ?? null : null);
  const missingModules = [...new Set([bundle.playlist.moduleName, ...bundle.videos.map((video) => video.moduleName), ...bundle.templates.map((template) => template.moduleName)].filter((name): name is string => Boolean(name) && !modules.has(name as string)))];
  if (missingModules.length) console.warn(`! modules not on the site (left unset): ${missingModules.join(", ")}`);
  if (bundle.playlist.languageCode && !languages.has(bundle.playlist.languageCode)) throw new Error(`language ${bundle.playlist.languageCode} is not on the site`);

  const existing = {
    playlist: await prisma.playlist.findUnique({ where: { id: bundle.playlist.id } }),
    videos: await prisma.video.count({ where: { id: { in: bundle.videos.map((video) => video.id) } } }),
    templates: await prisma.studioTemplate.count({ where: { id: { in: bundle.templates.map((template) => template.id) } } }),
    assets: await prisma.studioAsset.count({ where: { id: { in: bundle.assets.map((asset) => asset.id) } } })
  };
  console.log(`site already has: playlist ${existing.playlist ? "yes" : "no"}, ${existing.videos}/${bundle.videos.length} videos, ${existing.templates}/${bundle.templates.length} templates, ${existing.assets}/${bundle.assets.length} assets`);
  if (dryRun) {
    console.log(`dry run — would upsert ${bundle.videos.length} videos, ${bundle.templates.length} templates, ${bundle.segments.length} segments, ${bundle.mediaMatches.length} media matches, ${bundle.assets.length} assets and upload their files`);
    await prisma.$disconnect();
    return;
  }

  // 1. Files, then asset rows (urls recomputed for the site's storage driver).
  let uploaded = 0;
  let skipped = 0;
  for (const [index, asset] of bundle.assets.entries()) {
    for (const key of [asset.storageKey, asset.thumbnailKey]) {
      if (!key) continue;
      const bytes = await readFile(path.join(dir, "files", key));
      const already = await storage().get(key).catch(() => null);
      if (already && already.length === bytes.length) {
        skipped += 1;
        continue;
      }
      const contentType = key === asset.storageKey ? String(asset.mimeType) : "image/jpeg";
      await storage().put(key, bytes, contentType);
      uploaded += 1;
    }
    const data = { ...strip(asset, ["id", "thumbnailKey", "uploadedByEmail", "url", "thumbnailUrl", "createdAt"]), url: storage().publicUrl(asset.storageKey), thumbnailUrl: asset.thumbnailKey ? storage().publicUrl(asset.thumbnailKey) : (asset.thumbnailUrl as string | null) ?? null, uploadedById: userId(asset.uploadedByEmail) };
    await prisma.studioAsset.upsert({ where: { id: asset.id }, create: { id: asset.id, ...(data as object) } as never, update: data as never });
    if ((index + 1) % 50 === 0) console.log(`  assets ${index + 1}/${bundle.assets.length} (${uploaded} uploaded, ${skipped} already there)`);
  }
  console.log(`assets: ${bundle.assets.length} rows, ${uploaded} files uploaded, ${skipped} already in the bucket`);

  // 2. Playlist, videos, order.
  const playlistData = { ...strip(bundle.playlist, ["id", "languageCode", "moduleName", "createdAt", "updatedAt"]), languageId: languageId(bundle.playlist.languageCode), moduleId: moduleId(bundle.playlist.moduleName) };
  await prisma.playlist.upsert({ where: { id: bundle.playlist.id }, create: { id: bundle.playlist.id, ...(playlistData as object) } as never, update: playlistData as never });
  for (const video of bundle.videos) {
    const data = { ...strip(video, ["id", "languageCode", "moduleName", "sortOrder", "createdAt", "updatedAt"]), languageId: languageId(video.languageCode), moduleId: moduleId(video.moduleName) };
    await prisma.video.upsert({ where: { id: video.id }, create: { id: video.id, ...(data as object) } as never, update: data as never });
    await prisma.playlistVideo.upsert({ where: { playlistId_videoId: { playlistId: bundle.playlist.id, videoId: video.id } }, create: { playlistId: bundle.playlist.id, videoId: video.id, sortOrder: video.sortOrder }, update: { sortOrder: video.sortOrder } });
  }
  console.log(`playlist "${bundle.playlist.title}" with ${bundle.videos.length} videos`);

  // 3. Templates → segments → media matches (segments of an existing template are replaced so removed ones disappear).
  for (const template of bundle.templates) {
    const data = { ...strip(template, ["id", "moduleName", "createdByEmail", "createdAt", "updatedAt"]), moduleId: moduleId(template.moduleName), createdById: userId(template.createdByEmail) };
    await prisma.studioTemplate.upsert({ where: { id: template.id }, create: { id: template.id, ...(data as object) } as never, update: data as never });
  }
  const templateIds = bundle.templates.map((template) => template.id);
  const keep = bundle.segments.map((segment) => segment.id);
  await prisma.studioSegment.deleteMany({ where: { templateId: { in: templateIds }, id: { notIn: keep }, projectSegments: { none: {} } } });
  for (const segment of bundle.segments) {
    const data = strip(segment, ["id", "createdAt", "updatedAt"]);
    await prisma.studioSegment.upsert({ where: { id: segment.id }, create: { id: segment.id, ...(data as object) } as never, update: data as never });
  }
  for (const match of bundle.mediaMatches) {
    const data = strip(match, ["id", "createdAt", "updatedAt"]);
    await prisma.studioMediaMatch.upsert({ where: { id: match.id }, create: { id: match.id, ...(data as object) } as never, update: data as never });
  }
  console.log(`${bundle.templates.length} templates, ${bundle.segments.length} segments, ${bundle.mediaMatches.length} media matches`);

  if (setMain) {
    await prisma.studioSettings.upsert({ where: { id: 1 }, create: { id: 1, defaultPlaylistId: bundle.playlist.id }, update: { defaultPlaylistId: bundle.playlist.id } });
    console.log(`"${bundle.playlist.title}" is the main lesson playlist`);
  }
  await prisma.$disconnect();
}

async function importOriginals() {
  const dir = arg("bundle");
  if (!dir) throw new Error("--bundle <folder> is required");
  const dryRun = process.argv.includes("--dry-run");
  if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "")) throw new Error("import-originals needs production DATABASE_URL");
  if (!dryRun && process.env.STUDIO_STORAGE_DRIVER !== "s3") throw new Error("import-originals needs production S3 storage settings");
  const bundle = JSON.parse(await readFile(path.join(dir, "original-assets.json"), "utf8")) as OriginalAssetsBundle;
  if (!Array.isArray(bundle.assets) || bundle.assets.some((asset) => asset.kind !== "image" || !String(asset.tags).includes(VERIFIED_ORIGINAL_TAG))) throw new Error("bundle contains a non-original image");
  const prisma = await postgresClient();
  try {
    const ids = bundle.assets.map((asset) => asset.id);
    const existingRows = await prisma.studioAsset.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const existingIds = new Set(existingRows.map((row) => row.id));
    console.log(`production has ${existingIds.size}/${ids.length} verified-original asset IDs`);
    if (process.argv.includes("--missing-out")) {
      await writeFile(path.join(dir, "missing-originals.json"), JSON.stringify(bundle.assets.filter((asset) => !existingIds.has(asset.id)).map((asset) => ({ id: asset.id, name: asset.name })), null, 2));
      console.log(`wrote ${ids.length - existingIds.size} missing IDs to the bundle folder`);
    }
    if (process.argv.includes("--tag-existing")) {
      if (dryRun) return;
      let tagged = 0;
      for (const asset of bundle.assets) {
        if (!existingIds.has(asset.id)) continue;
        await prisma.studioAsset.update({ where: { id: asset.id }, data: { tags: String(asset.tags) } });
        tagged += 1;
      }
      console.log(`tagged ${tagged} existing originals; no files or lesson rows changed`);
      return;
    }
    if (process.argv.includes("--tag-browser-uploads")) {
      let tagged = 0;
      let missing = 0;
      let mismatched = 0;
      for (const asset of bundle.assets) {
        if (existingIds.has(asset.id)) continue;
        const id = /^Shutterstock (\d+)$/.exec(String(asset.name))?.[1];
        if (!id) throw new Error(`unexpected source name: ${asset.name}`);
        const browserRows = await prisma.studioAsset.findMany({ where: { name: `shutterstock_${id}.jpg`, kind: "image" } });
        const row = browserRows.find((candidate) => candidate.sizeBytes === asset.sizeBytes && candidate.storageKey.startsWith("library/image/"));
        if (!row) {
          if (browserRows.length) mismatched += 1;
          else missing += 1;
          continue;
        }
        if (!dryRun && !row.tags.includes(VERIFIED_ORIGINAL_TAG)) {
          await prisma.studioAsset.update({ where: { id: row.id }, data: { name: String(asset.name), tags: String(asset.tags) } });
        }
        tagged += 1;
      }
      console.log(`browser originals: ${tagged} verified, ${missing} not uploaded, ${mismatched} unmatched size`);
      return;
    }
    if (dryRun) return;
    const { storage } = await import("@/lib/studio/storage");
    const users = new Map((await prisma.user.findMany({ select: { id: true, email: true } })).map((user) => [user.email, user.id]));
    let uploaded = 0;
    let skipped = 0;
    for (const [index, asset] of bundle.assets.entries()) {
      for (const key of [asset.storageKey, asset.thumbnailKey]) {
        if (!key) continue;
        const bytes = await readFile(path.join(dir, "files", key));
        const already = await storage().get(key).catch(() => null);
        if (already && already.length === bytes.length) { skipped += 1; continue; }
        await storage().put(key, bytes, key === asset.storageKey ? String(asset.mimeType) : "image/jpeg");
        uploaded += 1;
      }
      const data = {
        ...strip(asset, ["id", "thumbnailKey", "uploadedByEmail", "url", "thumbnailUrl", "createdAt"]),
        url: storage().publicUrl(asset.storageKey),
        thumbnailUrl: asset.thumbnailKey ? storage().publicUrl(asset.thumbnailKey) : null,
        uploadedById: asset.uploadedByEmail ? users.get(asset.uploadedByEmail) ?? null : null
      };
      await prisma.studioAsset.upsert({ where: { id: asset.id }, create: { id: asset.id, ...(data as object) } as never, update: data as never });
      if ((index + 1) % 25 === 0) console.log(`  originals ${index + 1}/${ids.length} (${uploaded} uploaded, ${skipped} already stored)`);
    }
    console.log(`synced ${ids.length} verified originals: ${uploaded} uploaded, ${skipped} already stored`);
  } finally {
    await prisma.$disconnect();
  }
}

const command = process.argv[2];
(command === "export" ? exportBundle() : command === "import" ? importBundle() : command === "export-originals" ? exportOriginals() : command === "import-originals" ? importOriginals() : Promise.reject(new Error("usage: export | import | export-originals | import-originals"))).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
