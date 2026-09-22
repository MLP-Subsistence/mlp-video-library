import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { serializeComposition } from "@/lib/studio/layouts";
import { lessonDisplayTitle, stripLessonNumber } from "@/lib/studio/lesson-order";
import { buildStorageKey, storage } from "@/lib/studio/storage";
import { cleanupWorkDir, makeWorkDir, probe, run } from "@/worker/ffmpeg";

/**
 * Master lesson import: turns an original MLP lesson video plus its script
 * into a Master Video Template whose segments are the script lines, each
 * tied to the time range where that line is narrated in the original video.
 *
 * The image-diary lessons are narrated one line at a time with a pause
 * between lines, so the pauses in the original audio mark the segment
 * boundaries. No transcription service is needed: FFmpeg's silencedetect
 * finds the speech chunks and they are matched to the script lines.
 *
 * Runs in the worker/CLI (needs FFmpeg), never inside a Netlify function.
 */

export type ScriptLesson = { number: string; title: string; lines: string[]; sequence: number };

/** Parse the "Marketplace Literacy_Script-English" text: headings look like `3-1-Title` or `12-Title`. */
export function parseScriptText(text: string): ScriptLesson[] {
  const lessons: ScriptLesson[] = [];
  let current: ScriptLesson | null = null;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/ /g, " ").trim();
    if (!line) continue;
    const heading = /^(\d+)(?:-(\d+))?-(.+)$/.exec(line);
    if (heading && /^[A-Z]/.test(heading[3].trim())) {
      current = { number: heading[2] ? `${heading[1]}-${heading[2]}` : heading[1], title: heading[3].trim(), lines: [], sequence: lessons.length + 1 };
      lessons.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return lessons;
}

/** Lesson number from a media file name such as `3-1-General ... Clip-1_8f977137.mp4` or `10 5 Entrepreneurial ....mp4`. */
export function lessonNumberFromFilename(filename: string) {
  const match = /^(\d+)(?:[\s-]+(\d+))?(?=[\s-])/.exec(path.basename(filename));
  if (!match) return null;
  return match[2] ? `${match[1]}-${match[2]}` : match[1];
}

export function categoryForLesson(number: string) {
  const major = Number(number.split("-")[0]);
  if (major === 1) return "Introduction";
  if (major <= 6) return "General Marketplace Literacy";
  if (major === 7) return "Consumer Literacy";
  if (major <= 18) return "Entrepreneurial Literacy";
  if (major === 19) return "Sustainability Literacy";
  return "Personal and Professional Aspirations";
}

export type SpeechChunk = { start: number; end: number };

/** Speech chunks between silences, merging blips shorter than `minChunkSec`. */
export async function detectSpeechChunks(file: string, durationSec: number, options: { noiseDb?: number; minSilenceSec?: number; minChunkSec?: number } = {}) {
  const noise = options.noiseDb ?? -35;
  const minSilence = options.minSilenceSec ?? 0.45;
  const minChunk = options.minChunkSec ?? 0.3;
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=noise=${noise}dB:d=${minSilence}`, "-f", "null", "-"]);
  const silences: Array<{ start: number; end: number }> = [];
  let pendingStart: number | null = null;
  for (const line of stderr.split("\n")) {
    const start = /silence_start: ([0-9.]+)/.exec(line);
    const end = /silence_end: ([0-9.]+)/.exec(line);
    if (start) pendingStart = Number(start[1]);
    if (end && pendingStart !== null) {
      silences.push({ start: pendingStart, end: Number(end[1]) });
      pendingStart = null;
    }
  }
  if (pendingStart !== null) silences.push({ start: pendingStart, end: durationSec });
  const chunks: SpeechChunk[] = [];
  let cursor = 0;
  for (const silence of silences) {
    if (silence.start - cursor > 0.05) chunks.push({ start: cursor, end: silence.start });
    cursor = silence.end;
  }
  if (durationSec - cursor > 0.05) chunks.push({ start: cursor, end: durationSec });
  // Merge tiny chunks (breaths, clicks) into the neighbour they are closest to.
  const merged: SpeechChunk[] = [];
  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (chunk.end - chunk.start < minChunk && previous) previous.end = chunk.end;
    else merged.push({ ...chunk });
  }
  return merged.filter((chunk) => chunk.end - chunk.start >= minChunk);
}

export type LineTiming = { start: number; end: number; pauseAfter: number; confidence: number };

/**
 * Match speech chunks to script lines. Exact count → one chunk per line.
 * Otherwise partition the speech span proportionally to line length and snap
 * boundaries to the nearest pause, which keeps the visuals roughly right and
 * flags the lesson for a content manager to check.
 */
export function matchChunksToLines(chunks: SpeechChunk[], lines: string[], durationSec: number): { timings: LineTiming[]; exact: boolean } {
  const n = lines.length;
  if (n === 0) return { timings: [], exact: true };
  const pad = 0.15;
  const finish = (ranges: Array<{ start: number; end: number }>, exact: boolean, confidence: number) => {
    const timings: LineTiming[] = ranges.map((range, index) => {
      const next = ranges[index + 1];
      const gap = next ? Math.max(0, next.start - range.end) : Math.max(0, durationSec - range.end);
      const previousEnd = index > 0 ? ranges[index - 1].end : 0;
      const start = Math.max(previousEnd, range.start - Math.min(pad, Math.max(0, (range.start - previousEnd) / 2)));
      const end = Math.min(next ? next.start : durationSec, range.end + Math.min(pad, gap / 2));
      const pauseAfter = Math.min(2.5, Math.max(0.3, Math.round((gap - 2 * Math.min(pad, gap / 2)) * 10) / 10));
      return { start: round(start), end: round(end), pauseAfter: next ? pauseAfter : 1, confidence };
    });
    return { timings, exact };
  };
  if (chunks.length === 0) {
    // No detectable pauses at all: split the whole file by line length.
    const weights = lineWeights(lines);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let cursor = 0;
    const ranges = weights.map((w) => {
      const start = cursor;
      cursor += (durationSec * w) / total;
      return { start, end: cursor };
    });
    return finish(ranges, false, 0.2);
  }
  if (chunks.length === n) return finish(chunks, true, 0.95);

  const weights = lineWeights(lines);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const speechTotal = chunks.reduce((sum, chunk) => sum + (chunk.end - chunk.start), 0);
  const expected = weights.map((w) => (speechTotal * w) / totalWeight);
  const m = chunks.length;

  if (m > n) {
    // More pauses than lines (breaths mid-sentence): group consecutive chunks into n runs
    // whose lengths best match the lines' expected lengths. Real pauses stay boundaries.
    const prefix = [0];
    for (const chunk of chunks) prefix.push(prefix[prefix.length - 1] + (chunk.end - chunk.start));
    const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Number.POSITIVE_INFINITY));
    const back = Array.from({ length: n + 1 }, () => new Int32Array(m + 1).fill(-1));
    cost[0][0] = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = i; j <= m - (n - i); j++) {
        for (let k = i - 1; k < j; k++) {
          if (!Number.isFinite(cost[i - 1][k])) continue;
          const groupDuration = prefix[j] - prefix[k];
          const candidate = cost[i - 1][k] + Math.abs(groupDuration - expected[i - 1]);
          if (candidate < cost[i][j]) {
            cost[i][j] = candidate;
            back[i][j] = k;
          }
        }
      }
    }
    const ranges: Array<{ start: number; end: number }> = [];
    let j = m;
    for (let i = n; i >= 1; i--) {
      const k = back[i][j];
      ranges.unshift({ start: chunks[k].start, end: chunks[j - 1].end });
      j = k;
    }
    const deviation = cost[n][m] / Math.max(1, speechTotal);
    return finish(ranges, false, Math.max(0.35, Math.min(0.9, 1 - deviation * 2)));
  }

  // Fewer pauses than lines (lines run together): assign consecutive lines to each chunk,
  // then split that chunk's time between its lines by length.
  const cost = Array.from({ length: m + 1 }, () => new Float64Array(n + 1).fill(Number.POSITIVE_INFINITY));
  const back = Array.from({ length: m + 1 }, () => new Int32Array(n + 1).fill(-1));
  cost[0][0] = 0;
  const expectedPrefix = [0];
  for (const value of expected) expectedPrefix.push(expectedPrefix[expectedPrefix.length - 1] + value);
  for (let j = 1; j <= m; j++) {
    const chunkDuration = chunks[j - 1].end - chunks[j - 1].start;
    for (let i = j; i <= n - (m - j); i++) {
      for (let k = j - 1; k < i; k++) {
        if (!Number.isFinite(cost[j - 1][k])) continue;
        const candidate = cost[j - 1][k] + Math.abs(chunkDuration - (expectedPrefix[i] - expectedPrefix[k]));
        if (candidate < cost[j][i]) {
          cost[j][i] = candidate;
          back[j][i] = k;
        }
      }
    }
  }
  const ranges: Array<{ start: number; end: number }> = [];
  let i = n;
  for (let j = m; j >= 1; j--) {
    const k = back[j][i];
    const chunk = chunks[j - 1];
    const span = chunk.end - chunk.start;
    const groupWeight = weights.slice(k, i).reduce((sum, w) => sum + w, 0);
    let cursor = chunk.start;
    const pieces = [] as Array<{ start: number; end: number }>;
    for (let line = k; line < i; line++) {
      const piece = (span * weights[line]) / groupWeight;
      pieces.push({ start: cursor, end: cursor + piece });
      cursor += piece;
    }
    ranges.unshift(...pieces);
    i = k;
  }
  const deviation = cost[m][n] / Math.max(1, speechTotal);
  return finish(ranges, false, Math.max(0.3, Math.min(0.8, 1 - deviation * 2)));
}

function lineWeights(lines: string[]) {
  return lines.map((line) => Math.max(1, line.replace(/[^\p{L}\p{N}]/gu, "").length));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Case/punctuation-insensitive, ignoring the `3-1-` lesson number so renamed rows still match. */
function normalizeTitle(value: string) {
  return stripLessonNumber(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type ImportResult = { lesson: ScriptLesson; templateId: string; videoId: string; segments: number; exact: boolean; skipped?: string };

export async function importMasterLesson(options: {
  lesson: ScriptLesson;
  mediaFile: string;
  playlistTitle: string;
  languageCode?: string;
  resourceFormat?: string;
  region?: string;
  createdById?: string | null;
  log?: (message: string) => void;
}): Promise<ImportResult> {
  const { lesson } = options;
  const log = options.log ?? (() => undefined);
  const languageCode = options.languageCode ?? "en";
  const resourceFormat = options.resourceFormat ?? "Image Diaries";
  const region = options.region ?? "Global";

  const language = await prisma.language.findFirst({ where: { code: languageCode } });
  if (!language) throw new Error(`Language ${languageCode} is not in the library`);
  const categoryName = categoryForLesson(lesson.number);
  const lessonModule = (await prisma.module.findFirst({ where: { name: categoryName } })) ?? (await prisma.module.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }));

  // --- Library rows: playlist + video --------------------------------------
  let playlist = await prisma.playlist.findFirst({ where: { title: options.playlistTitle, languageId: language.id } });
  if (!playlist) {
    playlist = await prisma.playlist.create({
      data: { title: options.playlistTitle, shortTitle: options.playlistTitle, languageId: language.id, moduleId: lessonModule?.id ?? null, region, visibility: "Published", featured: true, tags: `Marketplace Literacy, ${language.name}, ${resourceFormat}` }
    });
    log(`created playlist "${playlist.title}"`);
  }
  const wanted = normalizeTitle(lesson.title);
  const displayTitle = lessonDisplayTitle(lesson.number, lesson.title);
  const candidates = await prisma.video.findMany({ where: { languageId: language.id }, select: { id: true, title: true, resourceTitle: true } });
  let video = candidates.find((entry) => normalizeTitle(entry.resourceTitle || entry.title) === wanted) ?? null;
  const transcript = lesson.lines.join("\n");
  if (!video) {
    video = await prisma.video.create({
      data: {
        title: displayTitle,
        resourceTitle: displayTitle,
        description: `${categoryName} — Marketplace Literacy lesson ${lesson.number}.`,
        category: categoryName,
        resourceType: "Video",
        resourceFormat,
        transcript,
        orderIndex: lesson.sequence,
        languageId: language.id,
        moduleId: lessonModule?.id ?? null,
        region,
        visibility: "Draft",
        tags: `Marketplace Literacy, ${language.name}, ${categoryName}, ${resourceFormat}`
      },
      select: { id: true, title: true, resourceTitle: true }
    });
    log(`created library resource "${displayTitle}" (draft)`);
  } else {
    await prisma.video.update({ where: { id: video.id }, data: { transcript, title: displayTitle, resourceTitle: displayTitle, orderIndex: lesson.sequence } });
  }
  await prisma.playlistVideo.upsert({
    where: { playlistId_videoId: { playlistId: playlist.id, videoId: video.id } },
    update: { sortOrder: lesson.sequence },
    create: { playlistId: playlist.id, videoId: video.id, sortOrder: lesson.sequence }
  });

  // --- Existing template? ----------------------------------------------------
  const existing = await prisma.studioTemplate.findFirst({ where: { sourceVideoId: video.id }, include: { _count: { select: { projects: true } } } });
  if (existing && existing._count.projects > 0) {
    return { lesson, templateId: existing.id, videoId: video.id, segments: 0, exact: true, skipped: "template already has localization projects" };
  }

  // --- Media analysis ----------------------------------------------------------
  const workDir = await makeWorkDir("mlp-import");
  try {
    const info = await probe(options.mediaFile);
    const duration = info.durationSec;
    const chunks = await detectSpeechChunks(options.mediaFile, duration);
    const { timings, exact } = matchChunksToLines(chunks, lesson.lines, duration);
    log(`${lesson.number}: ${lesson.lines.length} lines, ${chunks.length} speech chunks → ${exact ? "exact match" : "approximate boundaries (review)"}`);

    // Upload the master video once.
    const masterBytes = await readFile(options.mediaFile);
    const masterKey = buildStorageKey(`masters/${slug(lesson.title)}`, path.basename(options.mediaFile).replace(/_[0-9a-f]{8}(?=\.mp4$)/i, ""));
    await storage().put(masterKey, masterBytes, "video/mp4");
    const thumbFile = path.join(workDir, "master-thumb.jpg");
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", Math.min(2, duration / 2).toFixed(2), "-i", options.mediaFile, "-frames:v", "1", "-vf", "scale=640:-2", thumbFile]).catch(() => undefined);
    let masterThumbUrl: string | null = null;
    try {
      const thumbKey = buildStorageKey(`masters/${slug(lesson.title)}`, "master-thumb.jpg");
      await storage().put(thumbKey, await readFile(thumbFile), "image/jpeg");
      masterThumbUrl = storage().publicUrl(thumbKey);
    } catch {
      masterThumbUrl = null;
    }
    const masterAsset = await prisma.studioAsset.create({
      data: {
        kind: "video",
        name: `${lesson.number} ${lesson.title} — master video`,
        storageKey: masterKey,
        url: storage().publicUrl(masterKey),
        mimeType: "video/mp4",
        sizeBytes: masterBytes.length,
        width: info.width,
        height: info.height,
        durationSec: duration,
        thumbnailUrl: masterThumbUrl,
        tags: `master, lesson ${lesson.number}, ${categoryName}`,
        uploadedById: options.createdById ?? null
      }
    });

    // One poster frame per segment (library alternative visuals + timeline thumbnails).
    const frameAssets: string[] = [];
    for (const [index, timing] of timings.entries()) {
      const mid = (timing.start + timing.end) / 2;
      const frameFile = path.join(workDir, `frame-${index + 1}.jpg`);
      await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", mid.toFixed(3), "-i", options.mediaFile, "-frames:v", "1", "-vf", "scale=1280:-2", frameFile]);
      const bytes = await readFile(frameFile);
      const key = buildStorageKey(`masters/${slug(lesson.title)}/frames`, `seg_${String(index + 1).padStart(3, "0")}.jpg`);
      await storage().put(key, bytes, "image/jpeg");
      const frame = await prisma.studioAsset.create({
        data: {
          kind: "image",
          name: `${lesson.number} ${lesson.title} — seg_${String(index + 1).padStart(3, "0")} frame`,
          storageKey: key,
          url: storage().publicUrl(key),
          mimeType: "image/jpeg",
          sizeBytes: bytes.length,
          width: 1280,
          height: info.width && info.height ? Math.round((1280 * info.height) / info.width) : null,
          tags: `master frame, lesson ${lesson.number}, ${categoryName}`,
          uploadedById: options.createdById ?? null
        }
      });
      frameAssets.push(frame.id);
    }

    // --- Template + segments -----------------------------------------------------
    if (existing) {
      await prisma.studioSegment.deleteMany({ where: { templateId: existing.id } });
    }
    const template = existing
      ? await prisma.studioTemplate.update({ where: { id: existing.id }, data: { title: displayTitle, moduleId: lessonModule?.id ?? null, masterAssetId: masterAsset.id, thumbnailAssetId: frameAssets[0] ?? null, status: "ready", frameWidth: 1920, frameHeight: 1080 } })
      : await prisma.studioTemplate.create({
          data: {
            title: displayTitle,
            description: `Master template for Marketplace Literacy lesson ${lesson.number}. Segments follow the original narration; visuals come from the original video.`,
            sourceVideoId: video.id,
            moduleId: lessonModule?.id ?? null,
            sourceLanguageCode: languageCode,
            status: "ready",
            masterAssetId: masterAsset.id,
            thumbnailAssetId: frameAssets[0] ?? null,
            createdById: options.createdById ?? null
          }
        });
    for (const [index, line] of lesson.lines.entries()) {
      const timing = timings[index];
      await prisma.studioSegment.create({
        data: {
          templateId: template.id,
          key: `seg_${String(index + 1).padStart(3, "0")}`,
          orderIndex: index,
          title: segmentTitle(line, index),
          sourceScript: line,
          pauseAfterSec: timing.pauseAfter,
          sourceStartSec: timing.start,
          sourceEndSec: timing.end,
          frameAssetId: frameAssets[index] ?? null,
          notes: exact || timing.confidence >= 0.8 ? null : "Boundaries were estimated from pauses in the original audio — check the visual matches this line.",
          composition: serializeComposition({
            layout: "full",
            slots: [{ id: "slot_1", fit: "cover", items: [{ assetId: masterAsset.id, share: 1, startSec: timing.start }] }]
          })
        }
      });
    }
    return { lesson, templateId: template.id, videoId: video.id, segments: lesson.lines.length, exact };
  } finally {
    await cleanupWorkDir(workDir);
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "lesson";
}

/** Short, readable segment titles: the first few words of the line. */
export function segmentTitle(line: string, index: number) {
  const words = line.replace(/[“”"]/g, "").split(/\s+/).filter(Boolean);
  const short = words.slice(0, 6).join(" ");
  const title = (words.length > 6 ? `${short}…` : short).replace(/[.,;:!?]+$/, "");
  return title || `Segment ${index + 1}`;
}
