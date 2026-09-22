import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { lessonDisplayTitle, stripLessonNumber } from "@/lib/studio/lesson-order";
import { parseScriptText } from "@/lib/studio/services/master-import";

/**
 * Rename and re-order the clips of a library playlist to follow the
 * "Marketplace Literacy_Script-English" script: `1-Introduction …`,
 * `3-1-… Clip-1`, … in script order. Updates the library video, its
 * playlist position and the master template title. Safe to re-run.
 *
 *   npx tsx scripts/studio-rename-lessons.ts --playlist "Marketplace Literacy Youth Africa" \
 *       [--script docs/educator-studio/scripts/marketplace-literacy-global-en.txt] [--title-suffix "— Youth Africa"] [--dry-run]
 */
function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function normalize(value: string, suffix: string) {
  let title = stripLessonNumber(value);
  if (suffix && title.endsWith(suffix)) title = title.slice(0, -suffix.length);
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function main() {
  const playlistTitle = arg("playlist");
  const scriptFile = arg("script", "docs/educator-studio/scripts/marketplace-literacy-global-en.txt")!;
  const suffix = (arg("title-suffix", "") ?? "").trim();
  const dryRun = process.argv.includes("--dry-run");
  if (!playlistTitle) throw new Error("--playlist <title> is required");

  const playlist = await prisma.playlist.findFirst({ where: { title: playlistTitle }, include: { videos: { include: { video: { include: { studioTemplates: true } } } } } });
  if (!playlist) throw new Error(`playlist "${playlistTitle}" not found`);
  const lessons = parseScriptText(await readFile(scriptFile, "utf8"));
  const byTitle = new Map(playlist.videos.map((item) => [normalize(item.video.resourceTitle || item.video.title, suffix), item]));

  let renamed = 0;
  const seen = new Set<string>();
  for (const lesson of lessons) {
    const item = byTitle.get(normalize(lesson.title, ""));
    if (!item) continue;
    seen.add(item.videoId);
    const title = lessonDisplayTitle(lesson.number, suffix ? `${lesson.title} ${suffix}` : lesson.title);
    const changed = item.video.title !== title || item.sortOrder !== lesson.sequence || item.video.studioTemplates.some((template) => template.title !== title);
    console.log(`${changed ? "→" : "="} ${String(lesson.sequence).padStart(2)} | ${title}`);
    if (!changed || dryRun) continue;
    await prisma.$transaction([
      prisma.video.update({ where: { id: item.videoId }, data: { title, resourceTitle: title, orderIndex: lesson.sequence } }),
      prisma.playlistVideo.update({ where: { playlistId_videoId: { playlistId: playlist.id, videoId: item.videoId } }, data: { sortOrder: lesson.sequence } }),
      ...item.video.studioTemplates.map((template) => prisma.studioTemplate.update({ where: { id: template.id }, data: { title } }))
    ]);
    renamed += 1;
  }
  for (const item of playlist.videos) {
    if (!seen.has(item.videoId)) console.warn(`! not in script, left untouched: ${item.video.title}`);
  }
  console.log(`${dryRun ? "would rename" : "renamed"} ${renamed} of ${playlist.videos.length} clips in "${playlist.title}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
