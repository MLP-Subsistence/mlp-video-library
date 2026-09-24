import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * StorageService: durable object storage for narration audio, images, video
 * clips and rendered lessons.
 *
 * - `local`: files on disk under STUDIO_STORAGE_DIR, served by
 *   /api/studio/files/[...key]. Used for development, Electron and any
 *   self-hosted deployment where the web app and worker share a disk.
 * - `s3`: any S3-compatible bucket (Supabase Storage S3 endpoint, Cloudflare
 *   R2, AWS S3, MinIO). Browsers upload directly with presigned URLs, which is
 *   required on Netlify where function bodies are capped at ~6 MB.
 *
 * The web app and the render worker both use this module.
 */

export type SignedUpload = {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  storageKey: string;
  publicUrl: string;
  expiresAt: string;
};

export type StorageDriver = {
  name: "local" | "s3";
  publicUrl(key: string): string;
  signUpload(key: string, contentType: string, maxBytes: number): Promise<SignedUpload>;
  put(key: string, bytes: Buffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  /** Whether the object exists, without downloading it. */
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** For the worker: an absolute filesystem path when the object is local, otherwise null. */
  localPath(key: string): string | null;
};

const UPLOAD_TTL_MS = 15 * 60 * 1000;

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.MLP_PUBLIC_SITE_URL || `http://localhost:${process.env.MLP_PORT || 3000}`).replace(/\/$/, "");
}

function uploadSecret() {
  return process.env.SESSION_SECRET || "local-development-secret-change-before-public-deployment";
}

export function localStorageDir() {
  return process.env.STUDIO_STORAGE_DIR || path.join(process.cwd(), "storage", "studio");
}

/** Keys are always forward-slash relative paths with a safe charset. */
export function isSafeStorageKey(key: string) {
  return /^[a-z0-9][a-z0-9/_\-.]{0,300}$/i.test(key) && !key.includes("..") && !key.includes("//");
}

export function buildStorageKey(folder: string, originalName: string) {
  const extension = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8) || "";
  const base = path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "file";
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, "").replace(/^\/+|\/+$/g, "") || "misc";
  return `${safeFolder}/${Date.now()}-${randomUUID().slice(0, 8)}-${base}${extension}`;
}

/** Local driver upload tokens: HMAC over key|contentType|maxBytes|expires. */
export function signLocalUploadToken(key: string, contentType: string, maxBytes: number, expires: number) {
  return createHmac("sha256", uploadSecret()).update(`${key}|${contentType}|${maxBytes}|${expires}`).digest("hex");
}

export function verifyLocalUploadToken(key: string, contentType: string, maxBytes: number, expires: number, token: string) {
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = signLocalUploadToken(key, contentType, maxBytes, expires);
  return expected.length === token.length && timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

function createLocalDriver(): StorageDriver {
  const root = localStorageDir();
  const resolve = (key: string) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(path.resolve(root))) throw new Error("Invalid storage key");
    return full;
  };
  return {
    name: "local",
    publicUrl: (key) => `${siteOrigin()}/api/studio/files/${key}`,
    async signUpload(key, contentType, maxBytes) {
      const expires = Date.now() + UPLOAD_TTL_MS;
      const token = signLocalUploadToken(key, contentType, maxBytes, expires);
      const query = new URLSearchParams({ key, type: contentType, max: String(maxBytes), exp: String(expires), token });
      return {
        method: "PUT",
        url: `${siteOrigin()}/api/studio/uploads/direct?${query.toString()}`,
        headers: { "content-type": contentType },
        storageKey: key,
        publicUrl: this.publicUrl(key),
        expiresAt: new Date(expires).toISOString()
      };
    },
    async put(key, bytes) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes);
    },
    async get(key) {
      try {
        return await readFile(resolve(key));
      } catch {
        return null;
      }
    },
    async exists(key) {
      try {
        await stat(resolve(key));
        return true;
      } catch {
        return false;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
    localPath: (key) => resolve(key)
  };
}

function createS3Driver(): StorageDriver {
  const bucket = process.env.STUDIO_S3_BUCKET;
  if (!bucket) throw new Error("STUDIO_S3_BUCKET is required when STUDIO_STORAGE_DRIVER=s3");
  const client = new S3Client({
    region: process.env.STUDIO_S3_REGION || "auto",
    endpoint: process.env.STUDIO_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.STUDIO_S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: process.env.STUDIO_S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.STUDIO_S3_SECRET_ACCESS_KEY || ""
    }
  });
  const publicBase = (process.env.STUDIO_S3_PUBLIC_URL || "").replace(/\/$/, "");
  return {
    name: "s3",
    publicUrl: (key) => (publicBase ? `${publicBase}/${key}` : `${siteOrigin()}/api/studio/files/${key}`),
    async signUpload(key, contentType, maxBytes) {
      const expiresIn = Math.floor(UPLOAD_TTL_MS / 1000);
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: undefined }),
        { expiresIn }
      );
      void maxBytes;
      return {
        method: "PUT",
        url,
        headers: { "content-type": contentType },
        storageKey: key,
        publicUrl: this.publicUrl(key),
        expiresAt: new Date(Date.now() + UPLOAD_TTL_MS).toISOString()
      };
    },
    async put(key, bytes, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }));
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = await result.Body?.transformToByteArray();
        return body ? Buffer.from(body) : null;
      } catch {
        return null;
      }
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    localPath: () => null
  };
}

let cached: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (cached) return cached;
  cached = process.env.STUDIO_STORAGE_DRIVER === "s3" ? createS3Driver() : createLocalDriver();
  return cached;
}

// Used right after every upload: must not download the object (it can be a 1 GB video).
export async function storageObjectExists(key: string) {
  return storage().exists(key);
}

export const uploadLimits = {
  image: 25 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
  audio: 512 * 1024 * 1024
} as const;

export const allowedMimeTypes: Record<"image" | "video" | "audio", string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
  audio: ["audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/webm", "audio/ogg", "audio/flac"]
};

export function mimeForExtension(extension: string) {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".m4v": "video/x-m4v",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".json": "application/json",
    ".txt": "text/plain"
  };
  return map[extension.toLowerCase()] || "application/octet-stream";
}
