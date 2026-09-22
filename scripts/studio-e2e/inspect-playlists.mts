import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const playlists = await prisma.playlist.findMany({ include: { language: true, _count: { select: { videos: true } } }, orderBy: { title: "asc" } });
for (const p of playlists) console.log(`${p.id} | ${p.language?.name ?? "-"} | ${p.title} | ${p._count.videos} videos | ${p.visibility}`);
const global = playlists.find((p) => /Marketplace Literacy - Global$/i.test(p.title) || /Global/i.test(p.title));
if (global) {
  const items = await prisma.playlistVideo.findMany({ where: { playlistId: global.id }, include: { video: true }, orderBy: { sortOrder: "asc" } });
  console.log("---", global.title);
  for (const item of items) console.log(`${item.sortOrder} | ${item.video.id} | ${item.video.title} | ${item.video.resourceFormat} | transcript ${item.video.transcript?.length ?? 0}`);
}
await prisma.$disconnect();
