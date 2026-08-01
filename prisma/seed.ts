import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  PROGRAM_NAME,
  languageThumbnails,
  resourceCategories,
  resourceFormatDefaults,
  resourceLanguages,
  resourceSubmenuDefaults,
  slugify
} from "../src/lib/resource-taxonomy";

const prisma = new PrismaClient();

const sampleVideoIds = ["ysz5S6PUM-U", "ScMzIvxBSi4", "aqz-KE-bpKQ", "jNQXAC9IVRw", "dQw4w9WgXcQ"];

const contentTree: Record<string, string[]> = {
  Introduction: ["Introduction to Marketplace Literacy"],
  "General Marketplace Literacy": [
    "Evolution of Needs",
    "Prioritizing Elements of a Business - Clip 1",
    "Prioritizing Elements of a Business - Clip 2",
    "Prioritizing Elements of a Business - Clip 3",
    "Prioritizing Elements of a Business - Clip 4",
    "Prioritizing Elements of a Business - Clip 5",
    "Physical and Psychological Needs - Clip 1",
    "Physical and Psychological Needs - Clip 2",
    "Types of Customers",
    "Value Chain"
  ],
  "Personal and Professional Aspirations": [
    "Personal Aspirations and Livelihood Goals",
    "Professional Aspirations in the Marketplace",
    "Building Confidence for Marketplace Participation"
  ],
  "Consumer Literacy": ["What Is Value - Clip 1", "What Is Value - Clip 2"],
  "Entrepreneurial Literacy": [
    "Unwrapping a Business",
    "Business Dos and Donts",
    "Choosing a Business - Clip 1",
    "Choosing a Business - Clip 2",
    "Choosing a Business - Clip 3",
    "Choosing a Business - Clip 4",
    "Understanding Customers",
    "How to Learn About Customers and Markets - Clip 1",
    "How to Learn About Customers and Markets - Clip 2",
    "What Is Value for Customers",
    "Designing Products",
    "Communicating About Products"
  ],
  "Sustainability Literacy": []
};

function videoId(index: number) {
  return sampleVideoIds[index % sampleVideoIds.length];
}

function formatFor(category: string, index: number) {
  if (category === "Introduction") return "Global";
  if (category === "Consumer Literacy") return "Animation";
  if (category === "Entrepreneurial Literacy") return index % 2 === 0 ? "Doodle" : "VideoScribe";
  if (category === "Personal and Professional Aspirations") return "Image Diaries";
  if (category === "General Marketplace Literacy") return index % 3 === 0 ? "Image Diaries" : "Doodle";
  return "Global";
}

async function main() {
  await prisma.homepageSectionPlaylist.deleteMany();
  await prisma.playlistVideo.deleteMany();
  await prisma.homepageSection.deleteMany();
  await prisma.video.deleteMany();
  await prisma.playlist.deleteMany();
  await prisma.resourceSubmenu.deleteMany();
  await prisma.resourceFormat.deleteMany();
  await prisma.module.deleteMany();
  await prisma.language.deleteMany();

  await prisma.user.upsert({
    where: { email: "admin@marketplaceliteracy.org" },
    update: {
      name: "MLP Admin",
      passwordHash: await bcrypt.hash("ChangeMe123!", 12),
      role: "admin"
    },
    create: {
      name: "MLP Admin",
      email: "admin@marketplaceliteracy.org",
      passwordHash: await bcrypt.hash("ChangeMe123!", 12),
      role: "admin"
    }
  });

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      siteTitle: "MLP Video Library",
      siteDescription: "A facilitator resource library for organized Marketplace Literacy resources by language and resource format.",
      primaryColor: "#A64026",
      secondaryColor: "#624237",
      youtubeChannelUrl: "https://www.youtube.com/@marketplaceliteracy",
      footerText: "The Marketplace Literacy Project supports educators, facilitators, and learning programs with practical resources for subsistence marketplaces."
    },
    create: {
      siteTitle: "MLP Video Library",
      siteDescription: "A facilitator resource library for organized Marketplace Literacy resources by language and resource format.",
      primaryColor: "#A64026",
      secondaryColor: "#624237",
      youtubeChannelUrl: "https://www.youtube.com/@marketplaceliteracy",
      footerText: "The Marketplace Literacy Project supports educators, facilitators, and learning programs with practical resources for subsistence marketplaces."
    }
  });

  const languages = new Map<string, { id: string; thumbnailPath: string; sortOrder: number }>();
  for (let i = 0; i < resourceLanguages.length; i++) {
    const seed = resourceLanguages[i];
    const language = await prisma.language.create({
      data: {
        name: seed.name,
        displayName: seed.displayName,
        code: seed.code,
        color: seed.color,
        thumbnailPath: languageThumbnails[seed.code],
        sortOrder: i + 1,
        isActive: true
      }
    });
    languages.set(seed.name, { id: language.id, thumbnailPath: language.thumbnailPath ?? "", sortOrder: language.sortOrder });
  }

  const categories = new Map<string, string>();
  for (let i = 0; i < resourceCategories.length; i++) {
    const category = resourceCategories[i];
    const categoryRow = await prisma.module.create({
      data: {
        name: category.name,
        description: category.description,
        color: i === 0 ? "#FBEAEA" : "#F3E8E6",
        sortOrder: i + 1,
        isActive: true
      }
    });
    categories.set(category.name, categoryRow.id);
  }

  for (const format of resourceFormatDefaults) {
    const savedFormat = await prisma.resourceFormat.create({
      data: {
        name: format.name,
        description: format.description,
        iconPath: format.iconPath,
        sortOrder: format.sortOrder,
        isActive: true
      }
    });

    for (const submenu of resourceSubmenuDefaults.filter((item) => item.resourceFormat === format.name)) {
      await prisma.resourceSubmenu.create({
        data: {
          resourceFormatId: savedFormat.id,
          name: submenu.name,
          description: submenu.description,
          sortOrder: submenu.sortOrder,
          isActive: true
        }
      });
    }
  }

  let globalIndex = 0;
  for (const languageSeed of resourceLanguages) {
    const language = languages.get(languageSeed.name);
    if (!language) continue;

    const section = await prisma.homepageSection.create({
      data: {
        title: `${PROGRAM_NAME} - ${languageSeed.name}`,
        description: `Educator and facilitator resources in ${languageSeed.name}.`,
        filterLanguageId: language.id,
        layout: "row",
        sortOrder: language.sortOrder,
        visibility: "Published"
      }
    });

    let featuredOrder = 0;
    for (const category of resourceCategories) {
      const titles = contentTree[category.name] ?? [];
      if (titles.length === 0) continue;

      const collection = await prisma.playlist.create({
        data: {
          title: `${PROGRAM_NAME} - ${languageSeed.name} - ${category.name}`,
          shortTitle: category.name,
          description: `${category.description} These resources are intended for educators and facilitators using Marketplace Literacy in ${languageSeed.name}.`,
          thumbnailUrl: language.thumbnailPath,
          languageId: language.id,
          moduleId: categories.get(category.name),
          region: "Global",
          audience: "Trainers",
          tags: `${languageSeed.name}, ${category.name}, facilitator, resources`,
          visibility: "Published",
          featured: true,
          sortOrder: globalIndex + 1
        }
      });

      if (featuredOrder < 4) {
        await prisma.homepageSectionPlaylist.create({
          data: { homepageSectionId: section.id, playlistId: collection.id, sortOrder: featuredOrder + 1 }
        });
        featuredOrder++;
      }

      for (let i = 0; i < titles.length; i++) {
        const youtubeVideoId = videoId(globalIndex + i);
        const format = formatFor(category.name, i);
        const resource = await prisma.video.create({
          data: {
            title: titles[i],
            resourceTitle: titles[i],
            description: `Facilitator resource for ${category.name}. Replace this starter item with the approved ${languageSeed.name} resource when ready.`,
            youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
            youtubeVideoId,
            embedUrl: `https://www.youtube.com/embed/${youtubeVideoId}`,
            thumbnailUrl: language.thumbnailPath,
            program: PROGRAM_NAME,
            category: category.name,
            resourceType: "Video",
            resourceFormat: format,
            transcript: "",
            orderIndex: i + 1,
            isPublished: true,
            languageId: language.id,
            moduleId: categories.get(category.name),
            region: "Global",
            audience: "Trainers",
            tags: `${slugify(category.name)}, ${languageSeed.name}, facilitator, ${PROGRAM_NAME}, ${slugify(format)}`,
            duration: "08:45",
            visibility: "Published"
          }
        });
        await prisma.playlistVideo.create({ data: { playlistId: collection.id, videoId: resource.id, sortOrder: i + 1 } });
      }
      globalIndex += titles.length;
    }
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
