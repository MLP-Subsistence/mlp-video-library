import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizeResourceFormat, normalizeResourceSubmenu, slugify } from "@/lib/resource-taxonomy";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = await prisma.video.findUnique({ where: { id }, include: { language: true } });
  if (!resource || !resource.language) notFound();
  const query = new URLSearchParams();
  const submenu = normalizeResourceSubmenu(resource.resourceSubmenu);
  if (submenu) query.set("submenu", slugify(submenu));
  query.set("resource", resource.id);
  redirect(`/resources/${resource.language.code}/${slugify(normalizeResourceFormat(resource.resourceFormat))}?${query.toString()}`);
}
