import { spawn } from "child_process";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { StudioAsset } from "@prisma/client";
import { storage } from "@/lib/studio/storage";

/**
 * Thin FFmpeg/FFprobe wrappers for the worker. Binaries come from
 * FFMPEG_PATH / FFPROBE_PATH, else the optional `ffmpeg-static` package, else
 * whatever is on PATH.
 */

function binary(name: "ffmpeg" | "ffprobe") {
  const fromEnv = name === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  if (fromEnv) return fromEnv;
  try {
    // Optional dependency; only present when the deployment installed it.
    const moduleName = name === "ffmpeg" ? "ffmpeg-static" : "ffprobe-static";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const resolved = require(moduleName) as string | { path: string };
    const candidate = typeof resolved === "string" ? resolved : resolved?.path;
    if (candidate) return candidate;
  } catch {
    // fall through to PATH
  }
  return name;
}

export async function run(name: "ffmpeg" | "ffprobe", args: string[], options: { onStderr?: (line: string) => void } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(binary(name), args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      options.onStderr?.(text);
    });
    child.on("error", (error) => reject(new Error(`${name} could not be started (${error.message}). Install FFmpeg or set FFMPEG_PATH.`)));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${name} exited with code ${code}\n${stderr.slice(-4000)}`));
    });
  });
}

export async function probe(file: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string; nb_frames?: string }>;
  };
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const audio = data.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(data.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
  return {
    durationSec: Number.isFinite(duration) ? duration : 0,
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio)
  };
}

export async function makeWorkDir(prefix: string) {
  const base = process.env.STUDIO_WORK_DIR || os.tmpdir();
  await mkdir(base, { recursive: true });
  return mkdtemp(path.join(base, `${prefix}-`));
}

export async function cleanupWorkDir(dir: string) {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Bring a stored asset onto local disk (no copy when the storage driver is already local). */
export async function materializeAsset(asset: Pick<StudioAsset, "storageKey" | "mimeType">, workDir: string) {
  const driver = storage();
  const local = driver.localPath(asset.storageKey);
  if (local) return local;
  const bytes = await driver.get(asset.storageKey);
  if (!bytes) throw new Error(`Asset ${asset.storageKey} is missing from storage`);
  const target = path.join(workDir, asset.storageKey.replace(/[\\/]/g, "_"));
  await writeFile(target, bytes);
  return target;
}

/** Parse "time=HH:MM:SS.xx" from FFmpeg's stderr for progress reporting. */
export function parseProgressSeconds(line: string) {
  const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
