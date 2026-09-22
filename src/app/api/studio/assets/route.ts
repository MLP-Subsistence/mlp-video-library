import { prisma } from "@/lib/prisma";
import { ok, readJson, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { assetToDto } from "@/lib/studio/project-state";
import { cleanOptional, cleanText } from "@/lib/sanitize";
import { assetUsageMap } from "@/lib/studio/services/assets";
import { originalAssetIdsForFolder, safeAssetTags } from "@/lib/studio/asset-folders";
import { allowedMimeTypes, isSafeStorageKey, storage, storageObjectExists } from "@/lib/studio/storage";
import type { AssetKind } from "@/lib/studio/types";

export const GET = studioRoute(async (request: Request) => {
  await requireStudioApiUser();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const q = (url.searchParams.get("q") || "").trim();
  const withUsage = url.searchParams.get("usage") === "1";
  const folderId = (url.searchParams.get("folder") || "").trim();
  const requestedTake = Number(url.searchParams.get("take") || 120);
  const take = Number.isFinite(requestedTake) ? Math.min(folderId ? 500 : 200, Math.max(1, requestedTake)) : 120;
  const folderAssetIds = folderId ? await originalAssetIdsForFolder(folderId) : null;
  const assets = await prisma.studioAsset.findMany({
    where: {
      ...(folderAssetIds ? { id: { in: folderAssetIds } } : {}),
      ...(kind === "image" || kind === "video" || kind === "audio" ? { kind } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { tags: { contains: q } }] } : {}),
      // Generated narration and renders are project files, not library media.
      NOT: { tags: { contains: "narration" } }
    },
    orderBy: { createdAt: "desc" },
    take
  });
  const usage = withUsage ? await assetUsageMap(assets.map((asset) => asset.id)) : null;
  return ok({ assets: assets.map((asset) => assetToDto(asset, usage ? usage.get(asset.id)?.segments ?? 0 : undefined)) });
});

/** Step 3 of an upload: the file is already in storage; record it. */
export const POST = studioRoute(async (request: Request) => {
  const user = await requireStudioApiUser();
  const body = await readJson<{
    storageKey?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    kind?: AssetKind;
    width?: number;
    height?: number;
    durationSec?: number;
    tags?: string;
    library?: boolean;
  }>(request);
  const kind = body.kind;
  if (kind !== "image" && kind !== "video" && kind !== "audio") throw new StudioError("Unsupported file kind.");
  const storageKey = String(body.storageKey || "");
  if (!isSafeStorageKey(storageKey)) throw new StudioError("Invalid upload reference.");
  const mimeType = String(body.mimeType || "").split(";")[0].trim().toLowerCase();
  if (!allowedMimeTypes[kind].includes(mimeType)) throw new StudioError("Unsupported file type.");
  if (!(await storageObjectExists(storageKey))) throw new StudioError("The upload did not finish. Please try again.");
  const existing = await prisma.studioAsset.findUnique({ where: { storageKey } });
  if (existing) return ok({ asset: assetToDto(existing) });
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);
  const asset = await prisma.studioAsset.create({
    data: {
      kind,
      name: cleanText(body.name).slice(0, 120) || `${kind} file`,
      storageKey,
      url: storage().publicUrl(storageKey),
      mimeType,
      sizeBytes: Math.round(number(body.size) ?? 0),
      width: number(body.width) ? Math.round(number(body.width)!) : null,
      height: number(body.height) ? Math.round(number(body.height)!) : null,
      durationSec: number(body.durationSec),
      tags: safeAssetTags(cleanOptional(body.tags)),
      uploadedById: user.id
    }
  });
  return ok({ asset: assetToDto(asset) }, { status: 201 });
});
