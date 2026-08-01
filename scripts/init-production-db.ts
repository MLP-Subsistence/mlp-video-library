import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  PROGRAM_NAME,
  languageThumbnails,
  resourceCategories,
  resourceFormatDefaults,
  resourceFormats,
  resourceLanguages,
  resourceSubmenuDefaults,
  youtubeStylePlaylists,
  youtubeStyleShelves,
  slugify
} from "../src/lib/resource-taxonomy";

function normalizeDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DIRECT_URL?.trim();
  const isPostgresUrl = (value?: string) => value?.startsWith("postgresql://") || value?.startsWith("postgres://");

  if (databaseUrl && databaseUrl !== process.env.DATABASE_URL) {
    process.env.DATABASE_URL = databaseUrl;
  }

  if (process.env.NETLIFY === "true" && isPostgresUrl(directUrl)) {
    process.env.DATABASE_URL = directUrl;
    return;
  }

  if (!isPostgresUrl(process.env.DATABASE_URL) && isPostgresUrl(directUrl)) {
    process.env.DATABASE_URL = directUrl;
  }
}

normalizeDatabaseUrl();

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
    "Business Dos and Don'ts",
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
  return resourceFormats[index % resourceFormats.length];
}

async function ensureDefaults() {
  await prisma.user.upsert({
    where: { email: "admin@marketplaceliteracy.org" },
    update: {},
    create: {
      name: "MLP Admin",
      email: "admin@marketplaceliteracy.org",
      passwordHash: await bcrypt.hash(process.env.INITIAL_ADMIN_PASSWORD || "ChangeMe123!", 12),
      role: "admin"
    }
  });

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      siteTitle: "MLP Video Library",
      siteDescription:
        "A facilitator resource library for organized Marketplace Literacy resources by language and resource format.",
      primaryColor: "#A64026",
      secondaryColor: "#624237",
      youtubeChannelUrl: "https://www.youtube.com/@marketplaceliteracy",
      footerText:
        "The Marketplace Literacy Project supports educators, facilitators, and learning programs with practical resources for subsistence marketplaces."
    }
  });

  for (let i = 0; i < resourceLanguages.length; i++) {
    const language = resourceLanguages[i];
    await prisma.language.upsert({
      where: { name: language.name },
      update: {
        displayName: language.displayName,
        code: language.code,
        color: language.color,
        thumbnailPath: languageThumbnails[language.code],
        sortOrder: i + 1,
        isActive: true
      },
      create: {
        name: language.name,
        displayName: language.displayName,
        code: language.code,
        color: language.color,
        thumbnailPath: languageThumbnails[language.code],
        sortOrder: i + 1,
        isActive: true
      }
    });
  }

  for (let i = 0; i < resourceCategories.length; i++) {
    const category = resourceCategories[i];
    await prisma.module.upsert({
      where: { name: category.name },
      update: {
        description: category.description,
        sortOrder: i + 1,
        isActive: true
      },
      create: {
        name: category.name,
        description: category.description,
        color: i === 0 ? "#FBEAEA" : "#F3E8E6",
        sortOrder: i + 1,
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

async function seedStarterResourcesIfEmpty() {
  const existingVideos = await prisma.video.count();
  if (existingVideos > 0) return;

  const languages = await prisma.language.findMany();
  const modules = await prisma.module.findMany();
  const moduleByName = new Map(modules.map((moduleRow) => [moduleRow.name, moduleRow.id]));
  let globalIndex = 0;

  for (const language of languages) {
    for (const category of resourceCategories) {
      const titles = contentTree[category.name] ?? [];
      const playlist = await prisma.playlist.create({
        data: {
          title: `${PROGRAM_NAME} - ${language.name} - ${category.name}`,
          shortTitle: category.name,
          description: `${category.description} These resources are intended for educators and facilitators using Marketplace Literacy in ${language.name}.`,
          thumbnailUrl: language.thumbnailPath,
          languageId: language.id,
          moduleId: moduleByName.get(category.name),
          region: "Global",
          audience: "Trainers",
          tags: `${PROGRAM_NAME}, ${language.name}, ${category.name}, facilitator resources`,
          visibility: "Published",
          featured: category.name !== "Sustainability Literacy",
          sortOrder: resourceCategories.findIndex((item) => item.name === category.name) + 1
        }
      });

      for (let i = 0; i < titles.length; i++) {
        const youtubeVideoId = videoId(globalIndex + i);
        const title = titles[i];
        const format = formatFor(category.name, i);
        const video = await prisma.video.create({
          data: {
            title,
            resourceTitle: title,
            description: `Facilitator resource for ${category.name}. Replace this starter item with the approved ${language.name} resource when ready.`,
            youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
            youtubeVideoId,
            embedUrl: `https://www.youtube.com/embed/${youtubeVideoId}`,
            thumbnailUrl: language.thumbnailPath,
            program: PROGRAM_NAME,
            category: category.name,
            resourceType: "Video",
            resourceFormat: format,
            transcript: `Starter script notes for ${title}. Replace this sample text with the approved transcript or facilitator script.`,
            orderIndex: i + 1,
            isPublished: true,
            languageId: language.id,
            moduleId: moduleByName.get(category.name),
            region: "Global",
            audience: "Trainers",
            tags: `${slugify(category.name)}, ${language.name}, facilitator, ${PROGRAM_NAME}, ${slugify(format)}`,
            duration: i % 2 === 0 ? "08:45" : "12:10",
            visibility: "Published"
          }
        });
        await prisma.playlistVideo.create({
          data: { playlistId: playlist.id, videoId: video.id, sortOrder: i + 1 }
        });
      }
      globalIndex += titles.length + 1;
    }

    const section = await prisma.homepageSection.create({
      data: {
        title: `${PROGRAM_NAME} - ${language.name}`,
        description: `Educator and facilitator resources in ${language.name}.`,
        filterLanguageId: language.id,
        layout: "row",
        sortOrder: language.sortOrder,
        visibility: "Published"
      }
    });

    const featured = await prisma.playlist.findMany({
      where: { languageId: language.id, featured: true },
      orderBy: { sortOrder: "asc" },
      take: 4
    });

    for (let i = 0; i < featured.length; i++) {
      await prisma.homepageSectionPlaylist.create({
        data: { homepageSectionId: section.id, playlistId: featured[i].id, sortOrder: i + 1 }
      });
    }
  }
}

async function ensureYoutubeStylePlaylists() {
  const languages = await prisma.language.findMany();
  const languageByName = new Map(languages.map((language) => [language.name, language]));
  const category = await prisma.module.findFirst({ where: { name: "General Marketplace Literacy" } });

  for (let i = 0; i < youtubeStyleShelves.length; i++) {
    const shelf = youtubeStyleShelves[i];
    const language = languageByName.get(shelf.language);
    if (!language) continue;
    await prisma.homepageSection.upsert({
      where: { id: `shelf_${slugify(shelf.title)}` },
      update: {
        title: shelf.title,
        description: `Marketplace Literacy playlists in ${shelf.language}.`,
        filterLanguageId: language.id,
        layout: "row",
        sortOrder: i + 1,
        visibility: "Published"
      },
      create: {
        id: `shelf_${slugify(shelf.title)}`,
        title: shelf.title,
        description: `Marketplace Literacy playlists in ${shelf.language}.`,
        filterLanguageId: language.id,
        layout: "row",
        sortOrder: i + 1,
        visibility: "Published"
      }
    });
  }

  for (let i = 0; i < youtubeStylePlaylists.length; i++) {
    const item = youtubeStylePlaylists[i];
    const language = languageByName.get(item.language);
    if (!language) continue;
    const playlistId = `playlist_${i + 1}_${slugify(`${item.language}-${item.title}`)}`;
    const playlist = await prisma.playlist.upsert({
      where: { id: playlistId },
      update: {
        title: item.title,
        shortTitle: item.title,
        thumbnailUrl: language.thumbnailPath,
        languageId: language.id,
        moduleId: category?.id,
        visibility: "Published",
        featured: true,
        sortOrder: i + 1
      },
      create: {
        id: playlistId,
        title: item.title,
        shortTitle: item.title,
        description: `YouTube-style playlist shelf item for ${item.language}.`,
        thumbnailUrl: language.thumbnailPath,
        languageId: language.id,
        moduleId: category?.id,
        region: "Global",
        audience: "General",
        tags: `${item.language}, ${item.shelf}, Playlist`,
        visibility: "Published",
        featured: true,
        sortOrder: i + 1
      }
    });
    const existingVideos = await prisma.playlistVideo.count({ where: { playlistId: playlist.id } });
    if (existingVideos === 0) {
      for (let videoIndex = 0; videoIndex < 3; videoIndex++) {
        const youtubeVideoId = videoId(i + videoIndex);
        const title = `${item.title} - Video ${videoIndex + 1}`;
        const video = await prisma.video.create({
          data: {
            title,
            resourceTitle: title,
            description: `Video placeholder for ${item.title}.`,
            youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
            youtubeVideoId,
            embedUrl: `https://www.youtube.com/embed/${youtubeVideoId}`,
            thumbnailUrl: language.thumbnailPath,
            program: PROGRAM_NAME,
            category: "Playlist",
            resourceType: "Video",
            resourceFormat: "Online",
            orderIndex: videoIndex + 1,
            isPublished: true,
            languageId: language.id,
            moduleId: category?.id,
            region: "Global",
            audience: "General",
            tags: `${slugify(item.title)}, ${item.language}`,
            duration: "08:45",
            visibility: "Published"
          }
        });
        await prisma.playlistVideo.create({ data: { playlistId: playlist.id, videoId: video.id, sortOrder: videoIndex + 1 } });
      }
    }
  }
}

async function main() {
  await ensureDefaults();
  await seedStarterResourcesIfEmpty();
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
