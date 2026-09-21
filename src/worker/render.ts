import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { StudioAsset } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLayout } from "@/lib/studio/layouts";
import { loadProjectDto } from "@/lib/studio/project-state";
import { buildStorageKey, storage } from "@/lib/studio/storage";
import type { ProjectDto, ProjectSegmentDto, TimelineBlock } from "@/lib/studio/types";
import { cleanupWorkDir, makeWorkDir, materializeAsset, parseProgressSeconds, probe, run } from "@/worker/ffmpeg";

/**
 * Render pipeline. One FFmpeg invocation per segment builds the visual
 * composition (layout slots, sequential items, cover/contain fitting, held
 * last frames for short clips) and muxes the narration plus trailing pause.
 * Segments are then concatenated losslessly and optionally mixed with the
 * template's music bed. Audio is the timing authority throughout: every
 * duration comes from `computeTimeline()` via the project DTO.
 */

export type RenderQuality = "1080p" | "720p";

type Progress = (progress: number, stage: string) => Promise<void>;

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

export async function renderProject(options: { projectId: string; userId: string | null; quality: RenderQuality; progress: Progress }) {
  const owner = await prisma.studioProject.findUnique({ where: { id: options.projectId }, select: { createdById: true, createdBy: { select: { role: true } } } });
  if (!owner) throw new Error("Project not found");
  const project = await loadProjectDto(options.projectId, { id: owner.createdById, role: owner.createdBy.role });
  if (!project) throw new Error("Project not found");
  if (project.segments.length === 0) throw new Error("This lesson has no segments to render.");

  const scale = options.quality === "720p" ? 2 / 3 : 1;
  const width = even(project.template.frameWidth * scale);
  const height = even(project.template.frameHeight * scale);
  const fps = project.template.fps || 30;

  const assetRows = await prisma.studioAsset.findMany({
    where: { id: { in: [...new Set([...Object.keys(project.assets), ...project.segments.map((s) => s.narration.assetId).filter((id): id is string => Boolean(id)), project.template.musicAssetId].filter((id): id is string => Boolean(id)))] } }
  });
  const assetsById = new Map(assetRows.map((asset) => [asset.id, asset]));

  const workDir = await makeWorkDir(`mlp-render-${project.id.slice(0, 8)}`);
  try {
    await options.progress(3, "Preparing media assets");
    const localPaths = new Map<string, string>();
    for (const asset of assetRows) localPaths.set(asset.id, await materializeAsset(asset, workDir));

    const segmentFiles: string[] = [];
    for (let index = 0; index < project.timeline.blocks.length; index++) {
      const block = project.timeline.blocks[index];
      const segment = project.segments.find((entry) => entry.segmentId === block.segmentId)!;
      const file = path.join(workDir, `segment-${String(index + 1).padStart(3, "0")}.mp4`);
      await options.progress(5 + Math.round((index / project.timeline.blocks.length) * 80), `Building segment ${index + 1} of ${project.timeline.blocks.length}: ${segment.title}`);
      await renderSegment({ segment, block, width, height, fps, assetsById, localPaths, output: file, project });
      segmentFiles.push(file);
    }

    await options.progress(86, "Joining segments");
    const listFile = path.join(workDir, "segments.txt");
    await writeFile(listFile, segmentFiles.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
    const joined = path.join(workDir, "joined.mp4");
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", joined]);

    let finalFile = joined;
    const music = project.template.musicAssetId ? assetsById.get(project.template.musicAssetId) : null;
    if (music) {
      await options.progress(90, "Mixing music");
      const mixed = path.join(workDir, "final.mp4");
      const volume = Math.min(1, Math.max(0, project.template.musicVolume || 0.2));
      await run("ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", joined,
        "-stream_loop", "-1", "-i", localPaths.get(music.id)!,
        "-filter_complex", `[1:a]volume=${volume},aresample=48000,aformat=channel_layouts=stereo[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", mixed
      ]);
      finalFile = mixed;
    }

    await options.progress(93, "Finalizing render");
    const thumbFile = path.join(workDir, "thumb.jpg");
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", "1", "-i", finalFile, "-frames:v", "1", "-vf", "scale=640:-2", thumbFile]).catch(() => undefined);
    const info = await probe(finalFile);

    await options.progress(96, "Uploading video");
    const videoBytes = await readFile(finalFile);
    const videoKey = buildStorageKey(`projects/${project.id}/renders`, `${slug(project.title)}-${project.targetLanguageCode}-${options.quality}.mp4`);
    await storage().put(videoKey, videoBytes, "video/mp4");
    let thumbnailUrl: string | null = null;
    try {
      const thumbBytes = await readFile(thumbFile);
      const thumbKey = buildStorageKey(`projects/${project.id}/renders`, `${slug(project.title)}-thumb.jpg`);
      await storage().put(thumbKey, thumbBytes, "image/jpeg");
      thumbnailUrl = storage().publicUrl(thumbKey);
    } catch {
      thumbnailUrl = null;
    }

    const asset = await prisma.studioAsset.create({
      data: {
        kind: "video",
        name: `${project.title} — ${project.targetLanguageName} (${options.quality})`,
        storageKey: videoKey,
        url: storage().publicUrl(videoKey),
        mimeType: "video/mp4",
        sizeBytes: videoBytes.length,
        width: info.width,
        height: info.height,
        durationSec: info.durationSec,
        thumbnailUrl,
        tags: `render, ${project.targetLanguageCode}, ${options.quality}`,
        uploadedById: options.userId
      }
    });
    return asset;
  } finally {
    await cleanupWorkDir(workDir);
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "lesson";
}

async function renderSegment(options: {
  project: ProjectDto;
  segment: ProjectSegmentDto;
  block: TimelineBlock;
  width: number;
  height: number;
  fps: number;
  assetsById: Map<string, StudioAsset>;
  localPaths: Map<string, string>;
  output: string;
}) {
  const { segment, block, width, height, fps, assetsById, localPaths } = options;
  const duration = Math.max(0.5, block.durationSec);
  const layout = getLayout(segment.composition.layout);
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error", "-stats"];
  const filters: string[] = [];
  let inputIndex = 0;

  filters.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${duration.toFixed(3)}[base]`);
  let current = "base";
  let slotCounter = 0;

  segment.composition.slots.forEach((slot, slotIndex) => {
    if (slot.items.length === 0) return;
    const rect = layout.slots[slotIndex];
    if (!rect) return;
    const sw = even(rect.w * width);
    const sh = even(rect.h * height);
    const sx = Math.round(rect.x * width);
    const sy = Math.round(rect.y * height);
    const itemLabels: string[] = [];
    slot.items.forEach((item, itemIndex) => {
      const asset = assetsById.get(item.assetId);
      const file = asset ? localPaths.get(asset.id) : null;
      const itemDuration = Math.max(0.1, duration * item.share);
      const label = `s${slotCounter}i${itemIndex}`;
      const fit = slot.fit === "contain"
        ? `scale=${sw}:${sh}:force_original_aspect_ratio=decrease,pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2:color=black`
        : `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh}`;
      if (!asset || !file) {
        filters.push(`color=c=0x243447:s=${sw}x${sh}:r=${fps}:d=${itemDuration.toFixed(3)}[${label}]`);
      } else if (asset.kind === "image" && asset.mimeType !== "image/gif") {
        args.push("-loop", "1", "-framerate", String(fps), "-t", itemDuration.toFixed(3), "-i", file);
        filters.push(`[${inputIndex}:v]${fit},setsar=1,fps=${fps},format=yuv420p,trim=0:${itemDuration.toFixed(3)},setpts=PTS-STARTPTS[${label}]`);
        inputIndex += 1;
      } else {
        // Video (or animated GIF): trim to the slot, hold the last frame when the clip is shorter.
        if (asset.mimeType === "image/gif") args.push("-stream_loop", "-1");
        args.push("-t", (itemDuration + 0.5).toFixed(3), "-i", file);
        filters.push(
          `[${inputIndex}:v]${fit},setsar=1,fps=${fps},format=yuv420p,trim=0:${itemDuration.toFixed(3)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${itemDuration.toFixed(3)},trim=0:${itemDuration.toFixed(3)},setpts=PTS-STARTPTS[${label}]`
        );
        inputIndex += 1;
      }
      itemLabels.push(`[${label}]`);
    });
    const slotLabel = `slot${slotCounter}`;
    if (itemLabels.length === 1) filters.push(`${itemLabels[0]}null[${slotLabel}]`);
    else filters.push(`${itemLabels.join("")}concat=n=${itemLabels.length}:v=1:a=0[${slotLabel}]`);
    const next = `v${slotCounter}`;
    filters.push(`[${current}][${slotLabel}]overlay=${sx}:${sy}:eof_action=repeat[${next}]`);
    current = next;
    slotCounter += 1;
  });
  filters.push(`[${current}]format=yuv420p,trim=0:${duration.toFixed(3)}[vout]`);

  const narrationAsset = segment.narration.assetId ? assetsById.get(segment.narration.assetId) : null;
  const narrationFile = narrationAsset ? localPaths.get(narrationAsset.id) : null;
  if (narrationFile && segment.narration.durationSec > 0) {
    if (segment.narration.startSec !== null && segment.narration.endSec !== null) {
      args.push("-ss", segment.narration.startSec.toFixed(3), "-t", Math.max(0.05, segment.narration.endSec - segment.narration.startSec).toFixed(3), "-i", narrationFile);
    } else {
      args.push("-i", narrationFile);
    }
    filters.push(`[${inputIndex}:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)}[aout]`);
    inputIndex += 1;
  } else {
    filters.push(`anullsrc=r=48000:cl=stereo:d=${duration.toFixed(3)}[aout]`);
  }

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", process.env.STUDIO_X264_PRESET || "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(fps),
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    "-t", duration.toFixed(3),
    "-movflags", "+faststart",
    options.output
  );
  await run("ffmpeg", args, { onStderr: (line) => void parseProgressSeconds(line) });
  const info = await probe(options.output);
  if (!info.hasVideo) throw new Error(`Segment ${segment.key} produced no video stream`);
}

