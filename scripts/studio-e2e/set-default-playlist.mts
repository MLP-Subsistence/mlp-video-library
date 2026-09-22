import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const title = process.argv[2] ?? "Marketplace Literacy Youth Africa";
const playlist = await prisma.playlist.findFirst({ where: { title } });
if (!playlist) throw new Error(`playlist "${title}" not found`);
await prisma.studioSettings.upsert({ where: { id: 1 }, update: { defaultPlaylistId: playlist.id }, create: { id: 1, defaultPlaylistId: playlist.id } });
console.log("default playlist:", playlist.title, playlist.id);
await prisma.$disconnect();
