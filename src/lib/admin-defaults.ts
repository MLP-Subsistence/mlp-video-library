import { prisma } from "@/lib/prisma";

export async function ensureAdminDefaults() {
  const existing = await prisma.module.findUnique({ where: { name: "Personal and Professional Aspirations" } });
  if (!existing) {
    await prisma.module.create({
      data: {
        name: "Personal and Professional Aspirations",
        description: "Resources that help facilitators discuss learner goals, livelihoods, confidence, and professional growth.",
        color: "#F3E8E6",
        sortOrder: 3,
        isActive: true
      }
    });
  }
  await prisma.video.updateMany({ where: { resourceFormat: "Doodle Video" }, data: { resourceFormat: "Doodle" } });
  await prisma.video.updateMany({ where: { resourceFormat: "Image Diary" }, data: { resourceFormat: "Image Diaries" } });
  await prisma.video.updateMany({ where: { resourceFormat: "Facilitator Video" }, data: { resourceFormat: "Global" } });
  await prisma.video.updateMany({ where: { resourceFormat: "Animations" }, data: { resourceFormat: "Animation" } });
  await prisma.video.updateMany({ where: { resourceFormat: "Video Scribe" }, data: { resourceFormat: "VideoScribe" } });
}
