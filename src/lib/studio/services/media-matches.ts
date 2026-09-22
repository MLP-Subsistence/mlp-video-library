import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { StudioError } from "@/lib/studio/access";
import { serializeComposition } from "@/lib/studio/layouts";
import { buildStorageKey, storage } from "@/lib/studio/storage";
import { downloadLicensedFile, findSimilarImages, licenseImage, shutterstockConfigured, shutterstockLicensingConfigured } from "@/lib/studio/services/shutterstock";

/**
 * Media library matching: the original lesson frames carry burnt-in English
 * captions, so localized videos need the clean source images. For a segment
 * we (1) take its poster frame, (2) crop the caption band, (3) ask
 * Shutterstock for visually similar images, (4) let a content manager pick the
 * match and either license it through the API or upload the file they
 * licensed on the website, (5) make that clean image the segment's visual.
 * "Use cropped frame" is the no-Shutterstock fallback.
 */

/** Share of the frame height taken by the caption band (bottom). */
function captionCropFraction() {
  const value = Number(process.env.STUDIO_CAPTION_CROP_FRACTION || 0.2);
  return Number.isFinite(value) && value > 0 && value < 0.5 ? value : 0.2;
}

async function segmentWithFrame(segmentId: string) {
  const segment = await prisma.studioSegment.findUnique({ where: { id: segmentId }, include: { template: true } });
  if (!segment) throw new StudioError("That segment could not be found.", 404);
  let frame = segment.frameAssetId ? await prisma.studioAsset.findUnique({ where: { id: segment.frameAssetId } }) : null;
  if (!frame) {
    // Frames imported before frameAssetId existed are found by their name.
    frame = await prisma.studioAsset.findFirst({ where: { kind: "image", name: { endsWith: `— ${segment.key} frame` }, tags: { contains: "master frame" }, AND: { name: { contains: segment.template.title } } } });
    if (frame) await prisma.studioSegment.update({ where: { id: segment.id }, data: { frameAssetId: frame.id } });
  }
  return { segment, frame };
}

/** The poster frame without its caption band, as JPEG bytes. */
export async function cleanFrameBytes(segmentId: string) {
  const { segment, frame } = await segmentWithFrame(segmentId);
  if (!frame) throw new StudioError("This segment has no frame from the original video yet. Re-run the master import for this lesson.", 409);
  const bytes = await storage().get(frame.storageKey);
  if (!bytes) throw new StudioError("The frame image is missing from storage.", 409);
  const image = sharp(bytes);
  const meta = await image.metadata();
  const width = meta.width ?? 1280;
  const height = meta.height ?? 720;
  const keep = Math.max(Math.round(height * (1 - captionCropFraction())), 16);
  const cropped = await image.extract({ left: 0, top: 0, width, height: keep }).jpeg({ quality: 90 }).toBuffer();
  return { segment, frame, bytes: cropped, width, height: keep };
}

export async function searchMatches(segmentId: string) {
  if (!shutterstockConfigured()) throw new StudioError("Shutterstock is not connected yet. Add SHUTTERSTOCK_API_TOKEN on the server (see docs/educator-studio/MEDIA_LIBRARY.md).", 503);
  const { segment, bytes } = await cleanFrameBytes(segmentId);
  let candidates;
  try {
    candidates = await findSimilarImages(bytes, { perPage: 12 });
  } catch (error) {
    throw new StudioError("Shutterstock could not search for this image right now. Please try again in a minute.", 502, String(error));
  }
  await prisma.studioMediaMatch.deleteMany({ where: { segmentId: segment.id, status: "candidate" } });
  for (const [rank, candidate] of candidates.entries()) {
    await prisma.studioMediaMatch.upsert({
      where: { segmentId_provider_externalId: { segmentId: segment.id, provider: "shutterstock", externalId: candidate.externalId } },
      update: { rank, previewUrl: candidate.previewUrl, pageUrl: candidate.pageUrl, description: candidate.description },
      create: { segmentId: segment.id, provider: "shutterstock", externalId: candidate.externalId, previewUrl: candidate.previewUrl, pageUrl: candidate.pageUrl, description: candidate.description, rank }
    });
  }
  return listMatches(segment.id);
}

export async function listMatches(segmentId: string) {
  const matches = await prisma.studioMediaMatch.findMany({ where: { segmentId }, include: { asset: true }, orderBy: [{ status: "asc" }, { rank: "asc" }] });
  return matches.map((match) => ({
    id: match.id,
    provider: match.provider,
    externalId: match.externalId,
    previewUrl: match.previewUrl,
    pageUrl: match.pageUrl,
    description: match.description,
    status: match.status as "candidate" | "chosen" | "licensed",
    assetUrl: match.asset?.url ?? null,
    assetId: match.assetId
  }));
}

async function setSegmentVisual(segmentId: string, assetId: string) {
  await prisma.studioSegment.update({
    where: { id: segmentId },
    data: { composition: serializeComposition({ layout: "full", slots: [{ id: "slot_1", fit: "cover", items: [{ assetId, share: 1 }] }] }) }
  });
}

/** Fallback without Shutterstock: store the caption-cropped frame as an image asset and use it. */
export async function useCleanFrame(segmentId: string, userId: string | null) {
  const { segment, frame, bytes, width, height } = await cleanFrameBytes(segmentId);
  const key = buildStorageKey(`masters/clean-frames/${segment.templateId}`, `${segment.key}-clean.jpg`);
  await storage().put(key, bytes, "image/jpeg");
  const asset = await prisma.studioAsset.create({
    data: {
      kind: "image",
      name: frame.name.replace(/ frame$/, " (caption removed)"),
      storageKey: key,
      url: storage().publicUrl(key),
      mimeType: "image/jpeg",
      sizeBytes: bytes.length,
      width,
      height,
      tags: `clean frame, ${frame.tags}`,
      uploadedById: userId
    }
  });
  await setSegmentVisual(segment.id, asset.id);
  return asset;
}

/**
 * Use a matched stock image for the segment. With `uploadedAssetId` the content
 * manager already licensed the file on shutterstock.com and uploaded it; without
 * it we license through the API subscription and download the file.
 */
export async function useMatch(matchId: string, options: { uploadedAssetId?: string | null; userId: string | null }) {
  const match = await prisma.studioMediaMatch.findUnique({ where: { id: matchId }, include: { segment: true } });
  if (!match) throw new StudioError("That match no longer exists.", 404);
  let assetId = options.uploadedAssetId ?? null;
  let licenseId: string | null = null;
  if (assetId) {
    const asset = await prisma.studioAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.kind !== "image") throw new StudioError("Upload the licensed image first.");
  } else {
    if (!shutterstockLicensingConfigured()) {
      throw new StudioError("Licensing through the API needs a Shutterstock API subscription (SHUTTERSTOCK_SUBSCRIPTION_ID). License this image on shutterstock.com with the MLP account, then upload the file here.", 409);
    }
    try {
      const license = await licenseImage(match.externalId, { size: "huge" });
      const file = await downloadLicensedFile(license.downloadUrl);
      const meta = await sharp(file.bytes).metadata();
      const key = buildStorageKey(`stock/shutterstock/${match.segment.templateId}`, `${match.segment.key}-${match.externalId}.jpg`);
      await storage().put(key, file.bytes, file.contentType);
      const asset = await prisma.studioAsset.create({
        data: {
          kind: "image",
          name: `${match.description || "Shutterstock image"} (${match.externalId})`.slice(0, 120),
          storageKey: key,
          url: storage().publicUrl(key),
          mimeType: file.contentType,
          sizeBytes: file.bytes.length,
          width: meta.width ?? null,
          height: meta.height ?? null,
          tags: `shutterstock, ${match.externalId}, licensed`,
          uploadedById: options.userId
        }
      });
      assetId = asset.id;
      licenseId = license.licenseId;
    } catch (error) {
      if (error instanceof StudioError) throw error;
      throw new StudioError("Shutterstock could not license or download this image. Check the API subscription allowance and try again.", 502, String(error));
    }
  }
  await prisma.$transaction([
    prisma.studioMediaMatch.updateMany({ where: { segmentId: match.segmentId, status: { in: ["chosen", "licensed"] } }, data: { status: "candidate" } }),
    prisma.studioMediaMatch.update({ where: { id: match.id }, data: { status: licenseId ? "licensed" : "chosen", assetId, licenseId } })
  ]);
  await setSegmentVisual(match.segmentId, assetId!);
  return listMatches(match.segmentId);
}

export function mediaLibraryStatus() {
  return { searchConfigured: shutterstockConfigured(), licensingConfigured: shutterstockLicensingConfigured() };
}
