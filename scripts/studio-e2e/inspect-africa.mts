import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const playlists = await prisma.playlist.findMany({ include: { _count: { select: { videos: true } } }, orderBy: { title: "asc" } });
for (const p of playlists) console.log(`${p.id} | ${p.title} | ${p._count.videos} videos`);
const africa = playlists.find((p) => /Africa/i.test(p.title));
if (africa) {
  const items = await prisma.playlistVideo.findMany({ where: { playlistId: africa.id }, include: { video: { include: { studioTemplates: { select: { id: true, title: true, status: true, _count: { select: { segments: true } } } } } } }, orderBy: { sortOrder: "asc" } });
  console.log("---", africa.title);
  for (const item of items) console.log(`${item.sortOrder} | ${item.video.id} | ${item.video.title} | ${item.video.resourceFormat} | ${item.video.studioTemplates.map((t) => `${t.title} [${t.status}, ${t._count.segments} seg]`).join("; ")}`);
}
await prisma.$disconnect();
