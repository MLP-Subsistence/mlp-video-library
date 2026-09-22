import { PrismaClient } from "@prisma/client";

/** Queue a render job directly (bypassing the web app) to exercise a standalone worker. */
const prisma = new PrismaClient();
const projectId = process.argv[2];
if (!projectId) throw new Error("usage: tsx scripts/studio-e2e/queue-render.mts <projectId> [720p|1080p]");
const quality = process.argv[3] === "1080p" ? "1080p" : "720p";
const job = await prisma.studioJob.create({ data: { type: "render", status: "queued", projectId, payload: JSON.stringify({ quality }), stage: "Waiting for the render worker" } });
console.log(job.id);
await prisma.$disconnect();
