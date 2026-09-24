"use client";

import { encodeWav } from "@/lib/studio/narration-split";
import type { ProjectDto } from "@/lib/studio/types";

/**
 * Downloads built in the browser from the project's own timeline, so they
 * work without the rendering worker: subtitles, and all the narration
 * mixed onto one track at the right times.
 */

export function fileBaseName(project: ProjectDto) {
  return `${project.title} - ${project.targetLanguageName}`.replace(/[^\p{L}\p{N}\- ]+/gu, "").trim() || "lesson";
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function srtTime(sec: number) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

/** Two short lines per cue at most, broken at a space. */
function wrap(text: string, width = 42) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/**
 * One cue per segment, timed to when its narration speaks (or the whole
 * segment when it has no narration yet). `language` "target" uses the
 * translation; "source" the original English line.
 */
export function buildSrt(project: ProjectDto, language: "target" | "source") {
  const cues: string[] = [];
  for (const block of project.timeline.blocks) {
    const segment = project.segments.find((entry) => entry.segmentId === block.segmentId);
    const text = (language === "target" ? segment?.translation : segment?.sourceScript)?.trim();
    if (!segment || !text) continue;
    const start = block.narrationSec > 0 ? block.startSec + block.pauseBeforeSec : block.startSec;
    const end = block.narrationSec > 0 ? start + block.narrationSec : block.endSec;
    cues.push(`${cues.length + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${wrap(text)}\n`);
  }
  return cues.join("\n");
}

/** Every segment's narration placed at its timeline position, as one mono WAV. */
export async function mixNarration(project: ProjectDto, onProgress?: (fraction: number) => void) {
  const rate = 24_000;
  const total = Math.max(0.1, project.timeline.totalSec);
  const context = new OfflineAudioContext(1, Math.ceil(total * rate), rate);
  const decoded = new Map<string, Promise<AudioBuffer>>();
  const load = (url: string) => {
    if (!decoded.has(url)) decoded.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error("A narration file could not be downloaded.");
      return response.arrayBuffer();
    }).then((bytes) => context.decodeAudioData(bytes)));
    return decoded.get(url)!;
  };
  const placed = project.timeline.blocks
    .map((block) => ({ block, narration: project.segments.find((entry) => entry.segmentId === block.segmentId)?.narration }))
    .filter((entry) => entry.narration?.url && entry.block.narrationSec > 0);
  if (placed.length === 0) throw new Error("No segment has narration yet.");
  let done = 0;
  for (const { block, narration } of placed) {
    const buffer = await load(narration!.url!);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(block.startSec + block.pauseBeforeSec, narration!.startSec ?? 0, block.narrationSec);
    done += 1;
    onProgress?.(done / placed.length);
  }
  const rendered = await context.startRendering();
  return new Blob([encodeWav(rendered.getChannelData(0), rate)], { type: "audio/wav" });
}
