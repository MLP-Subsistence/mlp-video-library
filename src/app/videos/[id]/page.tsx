import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizeResourceFormat, slugify } from "@/lib/resource-taxonomy";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = await prisma.video.findUnique({ where: { id }, include: { language: true } });
  if (!resource || !resource.language) notFound();
  redirect(`/resources/${resource.language.code}/${slugify(normalizeResourceFormat(resource.resourceFormat))}?resource=${resource.id}`);
}
