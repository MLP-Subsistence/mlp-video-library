import { readdir, readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { importMasterLesson, lessonNumberFromFilename, parseScriptText } from "@/lib/studio/services/master-import";

/**
 * Import master lessons (original video + script) into Educator Studio.
 *
 *   npx tsx scripts/studio-import-master.ts --media "<folder with the .mp4 files>" \
 *       --script docs/educator-studio/scripts/marketplace-literacy-global-en.txt \
 *       --playlist "Marketplace Literacy - Global" [--only 1,2,3-1] [--format "Image Diaries"]
 *
 * Needs FFmpeg on PATH (or FFMPEG_PATH/FFPROBE_PATH) and the same DATABASE_URL /
 * storage settings as the web app. Safe to re-run: lessons whose template
 * already has localization projects are skipped.
 */
function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const mediaDir = arg("media");
  const scriptFile = arg("script", "docs/educator-studio/scripts/marketplace-literacy-global-en.txt")!;
  const playlistTitle = arg("playlist", "Marketplace Literacy - Global")!;
  const resourceFormat = arg("format", "Image Diaries");
  const only = (arg("only") ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!mediaDir) throw new Error("--media <folder> is required");

  const lessons = parseScriptText(await readFile(scriptFile, "utf8"));
  const files = (await readdir(mediaDir)).filter((file) => /\.(mp4|mov|m4v)$/i.test(file));
  const byNumber = new Map<string, string>();
  for (const file of files) {
    const number = lessonNumberFromFilename(file);
    if (number && !byNumber.has(number)) byNumber.set(number, path.join(mediaDir, file));
  }
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  console.log(`${lessons.length} lessons in script, ${byNumber.size} media files`);

  const selected = lessons.filter((lesson) => only.length === 0 || only.includes(lesson.number));
  let imported = 0;
  for (const lesson of selected) {
    const mediaFile = byNumber.get(lesson.number);
    if (!mediaFile) {
      console.warn(`- ${lesson.number} ${lesson.title}: no media file, skipped`);
      continue;
    }
    try {
      const result = await importMasterLesson({ lesson, mediaFile, playlistTitle, resourceFormat, createdById: admin?.id ?? null, log: (message) => console.log(`  ${message}`) });
      if (result.skipped) console.log(`- ${lesson.number} ${lesson.title}: skipped (${result.skipped})`);
      else {
        imported += 1;
        console.log(`✓ ${lesson.number} ${lesson.title}: template ${result.templateId}, ${result.segments} segments${result.exact ? "" : " (review boundaries)"}`);
      }
    } catch (error) {
      console.error(`✗ ${lesson.number} ${lesson.title}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`done — ${imported} lesson${imported === 1 ? "" : "s"} imported`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
