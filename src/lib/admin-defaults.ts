import { prisma } from "@/lib/prisma";
import { resourceFormatDefaults, resourceSubmenuDefaults } from "@/lib/resource-taxonomy";

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

  for (const format of resourceFormatDefaults) {
    const savedFormat = await prisma.resourceFormat.upsert({
      where: { name: format.name },
      update: {
        description: format.description,
        iconPath: format.iconPath,
        sortOrder: format.sortOrder,
        isActive: true
      },
      create: {
        name: format.name,
        description: format.description,
        iconPath: format.iconPath,
        sortOrder: format.sortOrder,
        isActive: true
      }
    });

    for (const submenu of resourceSubmenuDefaults.filter((item) => item.resourceFormat === format.name)) {
      await prisma.resourceSubmenu.upsert({
        where: { resourceFormatId_name: { resourceFormatId: savedFormat.id, name: submenu.name } },
        update: {
          description: submenu.description,
          sortOrder: submenu.sortOrder,
          isActive: true
        },
        create: {
          resourceFormatId: savedFormat.id,
          name: submenu.name,
          description: submenu.description,
          sortOrder: submenu.sortOrder,
          isActive: true
        }
      });
    }
  }

  await prisma.video.updateMany({ where: { resourceFormat: "Doodle Video" }, data: { resourceFormat: "Doodle" } });
  await prisma.video.updateMany({ where: { resourceFormat: "Image Diary" }, data: { resourceFormat: "Image Diaries" } });
  await prisma.video.updateMany({ where: { resourceFormat: "Facilitator Video" }, data: { resourceFormat: "Global" } });
  await prisma.video.updateMany({ where: { resourceFormat: "Animations" }, data: { resourceFormat: "Animation" } });
  await prisma.video.updateMany({ where: { resourceFormat: "Video Scribe" }, data: { resourceFormat: "VideoScribe" } });
}
