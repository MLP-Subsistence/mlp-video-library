import { ok, readJson, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { allowedMimeTypes, buildStorageKey, storage, uploadLimits } from "@/lib/studio/storage";
import type { AssetKind } from "@/lib/studio/types";

/**
 * Step 1 of a browser upload: validate and hand back a short-lived signed PUT
 * URL. The browser then uploads straight to storage (step 2) and registers
 * the asset (step 3, /api/studio/assets). Nothing large passes through a
 * Netlify function.
 */
export const POST = studioRoute(async (request: Request) => {
  const user = await requireStudioApiUser();
  const body = await readJson<{ name?: string; mimeType?: string; size?: number; kind?: AssetKind; folder?: string }>(request);
  const kind = body.kind;
  if (kind !== "image" && kind !== "video" && kind !== "audio") throw new StudioError("Unsupported file kind.");
  const mimeType = String(body.mimeType || "").split(";")[0].trim().toLowerCase();
  if (!allowedMimeTypes[kind].includes(mimeType)) {
    const friendly = kind === "image" ? "JPG, PNG, GIF or WebP image" : kind === "video" ? "MP4, MOV or WebM video" : "WAV, MP3, M4A, OGG or WebM audio";
    throw new StudioError(`Please upload a ${friendly}.`);
  }
  const size = Number(body.size || 0);
  if (!Number.isFinite(size) || size <= 0) throw new StudioError("The file appears to be empty.");
  if (size > uploadLimits[kind]) throw new StudioError(`That file is too large. The limit for ${kind} files is ${Math.round(uploadLimits[kind] / (1024 * 1024))} MB.`);
  const folder = /^[a-z0-9/_-]{1,80}$/i.test(body.folder || "") ? String(body.folder) : `library/${kind}`;
  const key = buildStorageKey(`${folder}/${user.id.slice(0, 8)}`, String(body.name || `${kind}-file`));
  const signed = await storage().signUpload(key, mimeType, size);
  return ok({ ...signed, mimeType });
});
