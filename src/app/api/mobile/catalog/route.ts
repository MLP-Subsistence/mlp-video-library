import { prisma } from "@/lib/prisma";
import { resourceImage } from "@/lib/resource-taxonomy";

export const dynamic = "force-dynamic";

const siteURL = "https://marketplaceliteracyapp.org";

function absoluteHTTPSURL(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value, siteURL);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const resources = await prisma.video.findMany({
      where: {
        visibility: "Published",
        isPublished: true,
        language: { is: { isActive: true } }
      },
      select: {
        id: true,
        title: true,
        resourceTitle: true,
        description: true,
        transcript: true,
        resourceType: true,
        resourceFormat: true,
        resourceSubmenu: true,
        category: true,
        duration: true,
        tags: true,
        youtubeVideoId: true,
        embedUrl: true,
        thumbnailUrl: true,
        uploadedThumbnailPath: true,
        orderIndex: true,
        language: { select: { name: true, code: true, sortOrder: true } }
      },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
    });

    const lessons = resources.map((resource) => {
      const directVideoURL = absoluteHTTPSURL(resource.embedUrl);
      return {
        id: resource.id,
        title: resource.resourceTitle || resource.title,
        description: resource.description,
        transcript: resource.transcript,
        resourceType: resource.resourceType,
        format: resource.resourceFormat,
        submenu: resource.resourceSubmenu,
        category: resource.category,
        duration: resource.duration,
        tags: resource.tags,
        language: resource.language!.name,
        languageCode: resource.language!.code,
        languageOrder: resource.language!.sortOrder,
        order: resource.orderIndex,
        thumbnailURL: absoluteHTTPSURL(resourceImage(resource)),
        youtubeVideoID: /^[A-Za-z0-9_-]{11}$/.test(resource.youtubeVideoId) ? resource.youtubeVideoId : null,
        directVideoURL: directVideoURL && !/(^|\.)(youtube(?:-nocookie)?\.com|youtu\.be)$/.test(new URL(directVideoURL).hostname)
          ? directVideoURL
          : null
      };
    });

    return Response.json({ version: 1, lessons }, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" }
    });
  } catch (error) {
    console.error("Mobile catalog unavailable", error);
    return Response.json({ error: "Catalog temporarily unavailable" }, { status: 503 });
  }
}
