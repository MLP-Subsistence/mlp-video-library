"use client";

import type { AssetKind, StudioAssetDto } from "@/lib/studio/types";

/**
 * Browser-side helpers for Educator Studio. All server errors arrive as
 * `{ error: string }` with a friendly message, which becomes the thrown
 * Error's message so components can show it directly.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
    cache: "no-store"
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error || (response.status === 401 ? "Please sign in again." : "Something went wrong. Please try again.");
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export function kindForFile(file: File): AssetKind | null {
  const type = file.type.split(";")[0];
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  const ext = file.name.toLowerCase().split(".").pop() || "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  if (["wav", "mp3", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
  return null;
}

function mimeForFile(file: File, kind: AssetKind) {
  const declared = file.type.split(";")[0];
  if (declared) return declared;
  const ext = file.name.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: kind === "audio" ? "audio/webm" : "video/webm", m4v: "video/x-m4v", wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac" };
  return map[ext] || "application/octet-stream";
}

/** Measure media in the browser so the server never has to open the file. */
export async function measureMedia(file: Blob, kind: AssetKind): Promise<{ width?: number; height?: number; durationSec?: number }> {
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      return await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve({});
        image.src = url;
      });
    }
    if (kind === "audio") {
      const decoded = await decodeAudioDuration(file);
      if (decoded) return { durationSec: decoded };
    }
    return await new Promise((resolve) => {
      const element = document.createElement(kind === "video" ? "video" : "audio") as HTMLVideoElement;
      element.preload = "metadata";
      const finish = () => {
        let duration = Number.isFinite(element.duration) ? element.duration : undefined;
        // Chrome reports Infinity for MediaRecorder blobs until seeked to the end.
        if (duration === undefined || duration === Infinity) {
          element.currentTime = 1e101;
          element.ontimeupdate = () => {
            element.ontimeupdate = null;
            duration = Number.isFinite(element.duration) ? element.duration : undefined;
            resolve({ durationSec: duration, width: element.videoWidth || undefined, height: element.videoHeight || undefined });
          };
          return;
        }
        resolve({ durationSec: duration, width: element.videoWidth || undefined, height: element.videoHeight || undefined });
      };
      element.onloadedmetadata = finish;
      element.onerror = () => resolve({});
      element.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

async function decodeAudioDuration(file: Blob) {
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const context = new AudioContextCtor();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    await context.close();
    return buffer.duration;
  } catch {
    return null;
  }
}

export type UploadProgress = (fraction: number) => void;

/** Sign → PUT directly to storage → register. Returns the stored asset. */
export async function uploadAsset(file: File | Blob, options: { kind: AssetKind; name?: string; folder?: string; tags?: string; onProgress?: UploadProgress }): Promise<StudioAssetDto> {
  const name = options.name || (file instanceof File ? file.name : `${options.kind}-${Date.now()}`);
  const mimeType = file instanceof File ? mimeForFile(file, options.kind) : file.type.split(";")[0] || "application/octet-stream";
  const signed = await api<{ method: "PUT"; url: string; headers: Record<string, string>; storageKey: string; mimeType: string }>("/api/studio/uploads/sign", {
    method: "POST",
    json: { name, mimeType, size: file.size, kind: options.kind, folder: options.folder }
  });
  await putWithProgress(signed.url, file, signed.headers, options.onProgress);
  const measured = await measureMedia(file, options.kind);
  const registered = await api<{ asset: StudioAssetDto }>("/api/studio/assets", {
    method: "POST",
    json: { storageKey: signed.storageKey, name, mimeType: signed.mimeType, size: file.size, kind: options.kind, tags: options.tags, ...measured }
  });
  return registered.asset;
}

function putWithProgress(url: string, body: Blob, headers: Record<string, string>, onProgress?: UploadProgress) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError("The upload could not be completed. Please check your connection and try again.", xhr.status)));
    xhr.onerror = () => reject(new ApiError("The upload could not be completed. Please check your connection and try again.", 0));
    xhr.send(body);
  });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Debounced autosave helper: returns a function that schedules `save` after `delay` ms of quiet. */
export function debounce<T extends unknown[]>(fn: (...args: T) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  wrapped.flush = (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = null;
    fn(...args);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  /** True while a call is still waiting to run — used to flush edits on unmount. */
  wrapped.pending = () => timer !== null;
  return wrapped;
}
