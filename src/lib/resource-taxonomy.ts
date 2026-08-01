export const PROGRAM_NAME = "Marketplace Literacy";

export const languageThumbnails: Record<string, string> = {
  en: "/thumbnails/languages/english-b4g.jpg",
  fr: "/thumbnails/languages/french-b4g.jpg",
  hi: "/thumbnails/languages/hindi-b4g.jpg",
  es: "/thumbnails/languages/spanish-b4g.jpg",
  sw: "/thumbnails/languages/swahili-b4g.jpg",
  te: "/thumbnails/languages/telugu-b4g.jpg"
};

export const resourceLanguages = [
  { name: "English", displayName: "English", code: "en", color: "#A64026" },
  { name: "French", displayName: "Francais", code: "fr", color: "#8A3B2A" },
  { name: "Hindi", displayName: "Hindi", code: "hi", color: "#A64026" },
  { name: "Spanish", displayName: "Espanol", code: "es", color: "#9B3C25" },
  { name: "Swahili", displayName: "Kiswahili", code: "sw", color: "#7F3B2C" },
  { name: "Telugu", displayName: "Telugu", code: "te", color: "#A64026" }
];

export const resourceCategories = [
  {
    name: "Introduction",
    description: "Start here for a short orientation to Marketplace Literacy resources."
  },
  {
    name: "General Marketplace Literacy",
    description: "Foundational concepts for understanding needs, customers, value, and markets."
  },
  {
    name: "Personal and Professional Aspirations",
    description: "Resources that help facilitators discuss learner goals, livelihoods, confidence, and professional growth."
  },
  {
    name: "Consumer Literacy",
    description: "Resources that help facilitators discuss value and consumer decision-making."
  },
  {
    name: "Entrepreneurial Literacy",
    description: "Resources for business choice, customers, products, and communication."
  },
  {
    name: "Sustainability Literacy",
    description: "Future sustainability resources for facilitators and learning groups."
  }
];

export const resourceTypes = ["Video", "Document", "Activity", "Script", "Audio"];

export const resourceFormatDefaults = [
  {
    name: "Image Diaries",
    description: "Image-based field stories and visual learning clips.",
    iconPath: "/icons/categories/image-diaries.webp",
    sortOrder: 1
  },
  {
    name: "Doodle",
    description: "Doodle-style explainer videos and visual stories.",
    iconPath: "/icons/categories/doodle.webp",
    sortOrder: 2
  },
  {
    name: "Animation",
    description: "Animated Marketplace Literacy clips.",
    iconPath: "/icons/categories/animation.webp",
    sortOrder: 3
  },
  {
    name: "VideoScribe",
    description: "Whiteboard-style VideoScribe resources.",
    iconPath: "/icons/categories/videoscribe.webp",
    sortOrder: 4
  },
  {
    name: "Global",
    description: "Global Marketplace Literacy resources and facilitator clips.",
    iconPath: "/icons/categories/global.webp",
    sortOrder: 5
  },
  {
    name: "Vocations",
    description: "Vocation-focused Marketplace Literacy resources.",
    iconPath: "/icons/categories/vocations.webp",
    sortOrder: 6
  },
  {
    name: "Online",
    description: "Online Marketplace Literacy resources grouped by staff-created submenus.",
    iconPath: "/icons/categories/online.webp",
    sortOrder: 7
  }
] as const;

export const resourceFormats = resourceFormatDefaults.map((format) => format.name);

export const visibleResourceFormats = resourceFormats;

export const resourceSubmenuDefaults = [
  {
    resourceFormat: "Online",
    name: "Online - VideoScribe",
    description: "Online Marketplace Literacy VideoScribe clips.",
    sortOrder: 1
  },
  {
    resourceFormat: "Online",
    name: "Online Image Diaries",
    description: "Online Marketplace Literacy image diary clips.",
    sortOrder: 2
  },
  {
    resourceFormat: "Online",
    name: "Online Doodle",
    description: "Online Marketplace Literacy doodle clips.",
    sortOrder: 3
  }
] as const;

export const resourceFormatIcons = Object.fromEntries(
  resourceFormatDefaults.map((format) => [format.name, format.iconPath])
) as Record<string, string>;

export const categoryIcons: Record<string, string> = {
  Introduction: "/icons/categories/introduction.webp",
  "General Marketplace Literacy": "/icons/categories/general-marketplace-literacy.webp",
  "Personal and Professional Aspirations": "/icons/categories/personal-and-professional-aspirations.webp",
  "Consumer Literacy": "/icons/categories/consumer-literacy.webp",
  "Entrepreneurial Literacy": "/icons/categories/entrepreneurial-literacy.webp",
  "Sustainability Literacy": "/icons/categories/sustainability-literacy.webp"
};

export function resourceFormatIcon(format: string) {
  return resourceFormatIcons[normalizeResourceFormat(format)] ?? "/icons/categories/general-marketplace-literacy.webp";
}

export function categoryIcon(category: string) {
  return categoryIcons[category] ?? "/icons/categories/general-marketplace-literacy.webp";
}

export const youtubeStyleShelves = [
  { title: "Marketplace Literacy - English", language: "English" },
  { title: "Marketplace Literacy Africa English", language: "English" },
  { title: "Marketplace Literacy Training Videos - English & Spanish", language: "English" },
  { title: "Marketplace Literacy Training Hindi", language: "Hindi" },
  { title: "Marketplace Literacy - Hindi", language: "Hindi" },
  { title: "Marketplace Literacy - Spanish", language: "Spanish" },
  { title: "Marketplace Literacy - French", language: "French" },
  { title: "Marketplace Literacy - Swahili", language: "Swahili" },
  { title: "Marketplace Literacy - Telugu", language: "Telugu" }
] as const;

export const youtubeStylePlaylists = [
  { title: "Marketplace Literacy - Global", language: "English", shelf: "Marketplace Literacy - English" },
  { title: "Online Marketplace Literacy - Global", language: "English", shelf: "Marketplace Literacy - English" },
  { title: "Marketplace Literacy Vocations - English", language: "English", shelf: "Marketplace Literacy - English" },
  { title: "Marketplace Literacy - Animation", language: "English", shelf: "Marketplace Literacy - English" },
  { title: "Marketplace Literacy - Videoscribe English", language: "English", shelf: "Marketplace Literacy - English" },
  { title: "Marketplace Literacy - Global Doodle", language: "English", shelf: "Marketplace Literacy - English" },
  { title: "Marketplace Literacy - Youth USA", language: "English", shelf: "Marketplace Literacy - English" },
  { title: "Online Marketplace Literacy - India - English", language: "English", shelf: "Marketplace Literacy - English" },
  { title: "Marketplace Literacy - Youth Africa", language: "English", shelf: "Marketplace Literacy Africa English" },
  { title: "Marketplace Literacy - Male Youth Africa", language: "English", shelf: "Marketplace Literacy Africa English" },
  { title: "Marketplace Literacy - Africa", language: "English", shelf: "Marketplace Literacy Africa English" },
  { title: "Marketplace Literacy - Female Youth Africa", language: "English", shelf: "Marketplace Literacy Africa English" },
  { title: "Marketplace Literacy Mexico English", language: "English", shelf: "Marketplace Literacy Training Videos - English & Spanish" },
  { title: "Marketplace Literacy USA Facilitator Training", language: "English", shelf: "Marketplace Literacy Training Videos - English & Spanish" },
  { title: "Teaching - Marketplace Literacy", language: "English", shelf: "Marketplace Literacy Training Videos - English & Spanish" },
  { title: "Training - Marketplace Literacy", language: "English", shelf: "Marketplace Literacy Training Videos - English & Spanish" },
  { title: "Marketplace Literacy - Doodle Spanish", language: "Spanish", shelf: "Marketplace Literacy - Spanish" },
  { title: "Marketplace Literacy - Latin America - Spanish", language: "Spanish", shelf: "Marketplace Literacy - Spanish" },
  { title: "Teaching - Marketplace Literacy", language: "Spanish", shelf: "Marketplace Literacy - Spanish" },
  { title: "Training - Marketplace Literacy", language: "Spanish", shelf: "Marketplace Literacy - Spanish" },
  { title: "Emprendimiento de Mercados por Internet", language: "Spanish", shelf: "Marketplace Literacy - Spanish" },
  { title: "Educación sobre Sostenibilidad", language: "Spanish", shelf: "Marketplace Literacy - Spanish" },
  { title: "Profesiones - Marketplace Literacy Vocations", language: "Spanish", shelf: "Marketplace Literacy - Spanish" },
  { title: "Training Videos Bihar बाज़ार साक्षरता लिट्स - युवा + महिलाएं", language: "Hindi", shelf: "Marketplace Literacy Training Hindi" },
  { title: "Training Videos Bihar बाज़ार साक्षरता लिट्स - वयस्क", language: "Hindi", shelf: "Marketplace Literacy Training Hindi" },
  { title: "Training Videos CG IIT - IBITF बाजार साक्षरता", language: "Hindi", shelf: "Marketplace Literacy Training Hindi" },
  { title: "Training Videos Bihar - India बाज़ार साक्षरता लिट्स", language: "Hindi", shelf: "Marketplace Literacy Training Hindi" },
  { title: "Training Bihar बाज़ार साक्षरता मॉड्यूल", language: "Hindi", shelf: "Marketplace Literacy Training Hindi" },
  { title: "Complete Training Videos बाजार साक्षरता प्रशिक्षण वीडियोज", language: "Hindi", shelf: "Marketplace Literacy Training Hindi" },
  { title: "Marketplace Literacy - Youth and Women", language: "Hindi", shelf: "Marketplace Literacy - Hindi" },
  { title: "ऑनलाइन बाज़ार साक्षरता", language: "Hindi", shelf: "Marketplace Literacy - Hindi" },
  { title: "मार्केटप्लेस साक्षरता", language: "Hindi", shelf: "Marketplace Literacy - Hindi" },
  { title: "बाजार साक्षरता व्यवसाय", language: "Hindi", shelf: "Marketplace Literacy - Hindi" },
  { title: "बाजार साक्षरता - मॉड्यूल - वयस्क", language: "Hindi", shelf: "Marketplace Literacy - Hindi" },
  { title: "बाजार साक्षरता - मॉड्यूल - पुरुष", language: "Hindi", shelf: "Marketplace Literacy - Hindi" },
  { title: "Elimu ya Masoko", language: "Swahili", shelf: "Marketplace Literacy - Swahili" },
  { title: "Elimu Ya Masoko na Stadi za Kazi", language: "Swahili", shelf: "Marketplace Literacy - Swahili" },
  { title: "Elimu ya Uendelevu", language: "Swahili", shelf: "Marketplace Literacy - Swahili" },
  { title: "Littératie Du Marché", language: "French", shelf: "Marketplace Literacy - French" },
  { title: "Littératie Du Marché et Métiers", language: "French", shelf: "Marketplace Literacy - French" },
  { title: "Littératie Du Marché En Ligne", language: "French", shelf: "Marketplace Literacy - French" },
  { title: "Animation - French", language: "French", shelf: "Marketplace Literacy - French" },
  { title: "Marketplace Literacy Vocations - Telugu", language: "Telugu", shelf: "Marketplace Literacy - Telugu" },
  { title: "Marketplace Literacy - Telugu", language: "Telugu", shelf: "Marketplace Literacy - Telugu" }
] as const;

export function normalizeResourceFormat(value?: string | null) {
  if (!value) return "Doodle";
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "doodle video" || lower === "doodle") return "Doodle";
  if (lower === "image diary" || lower === "image diaries") return "Image Diaries";
  if (lower === "animation" || lower === "animations") return "Animation";
  if (lower === "videoscribe" || lower === "video scribe") return "VideoScribe";
  if (lower === "facilitator video" || lower === "facilitator videos") return "Global";
  if (lower === "vocation" || lower === "vocations" || lower === "vocational") return "Vocations";
  if (lower === "global") return "Global";
  if (lower === "online") return "Online";
  return trimmed;
}

export function normalizeResourceSubmenu(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function resourceFormatAliases(value?: string | null) {
  const normalized = normalizeResourceFormat(value);
  if (normalized === "Doodle") return ["Doodle", "Doodle Video"];
  if (normalized === "Image Diaries") return ["Image Diaries", "Image Diary"];
  if (normalized === "Animation") return ["Animation", "Animations"];
  if (normalized === "VideoScribe") return ["VideoScribe", "Video Scribe"];
  if (normalized === "Global") return ["Global", "Facilitator Video", "Facilitator Videos"];
  if (normalized === "Vocations") return ["Vocations", "Vocation", "Vocational"];
  return [normalized];
}

export function resourceSubmenuFromSlug(slug: string, names: string[]) {
  return names.find((name) => slugify(name) === slug) ?? null;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function categoryFromSlug(slug: string) {
  return resourceCategories.find((category) => slugify(category.name) === slug) ?? null;
}

export function resourceFormatFromSlug(slug: string) {
  const direct = resourceFormats.find((format) => slugify(format) === slug);
  if (direct) return normalizeResourceFormat(direct);
  if (slug === "doodle-video") return "Doodle";
  if (slug === "image-diary") return "Image Diaries";
  if (slug === "animations") return "Animation";
  if (slug === "video-scribe") return "VideoScribe";
  if (slug === "vocational") return "Vocations";
  return null;
}

export function languageThumbnail(code?: string | null) {
  if (!code) return "/placeholder.svg";
  return languageThumbnails[code] ?? "/placeholder.svg";
}

export function resourceImage(resource: {
  uploadedThumbnailPath?: string | null;
  thumbnailUrl?: string | null;
  language?: { thumbnailPath?: string | null; code?: string | null } | null;
}) {
  return resource.uploadedThumbnailPath || resource.thumbnailUrl || resource.language?.thumbnailPath || languageThumbnail(resource.language?.code);
}
