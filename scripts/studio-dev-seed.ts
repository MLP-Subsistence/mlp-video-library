import { PrismaClient } from "@prisma/client";

/**
 * Local development helper: gives the seeded admin an AI Voice allowance so
 * the studio can be exercised end to end. Usage: npx tsx scripts/studio-dev-seed.ts
 */
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.update({ where: { email: "admin@marketplaceliteracy.org" }, data: { aiVoiceCreditLimit: 100000 } });
  console.log(`${user.email} (${user.role}) → ${user.aiVoiceCreditLimit} AI Voice credits`);
  const video = await prisma.video.findFirst({ where: { transcript: { not: null } }, select: { id: true, title: true } });
  console.log("Example resource with transcript:", video);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
