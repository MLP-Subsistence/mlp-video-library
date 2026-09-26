import type { ProjectSummaryDto } from "@/lib/studio/types";

export type ProjectPlaylistGroup = {
  id: string;
  title: string;
  projects: ProjectSummaryDto[];
};

export type ProjectLanguageGroup = {
  name: string;
  regions: string[];
  playlists: ProjectPlaylistGroup[];
  projectCount: number;
  readyCount: number;
};

/** Build the simple Studio navigation hierarchy: Language → Playlist → Video. */
export function groupProjects(projects: ProjectSummaryDto[]): ProjectLanguageGroup[] {
  const languages = new Map<string, ProjectLanguageGroup>();

  for (const project of projects) {
    const languageKey = project.targetLanguageName.toLocaleLowerCase();
    let language = languages.get(languageKey);
    if (!language) {
      language = {
        name: project.targetLanguageName,
        regions: [],
        playlists: [],
        projectCount: 0,
        readyCount: 0
      };
      languages.set(languageKey, language);
    }

    if (project.region && !language.regions.includes(project.region)) language.regions.push(project.region);

    language.projectCount += 1;
    if (["ready", "approved", "published"].includes(project.status)) language.readyCount += 1;

    const playlistId = project.playlistId ?? "unfiled";
    let playlist = language.playlists.find((entry) => entry.id === playlistId);
    if (!playlist) {
      playlist = { id: playlistId, title: project.playlistTitle ?? "Other lessons", projects: [] };
      language.playlists.push(playlist);
    }
    playlist.projects.push(project);
  }

  return [...languages.values()]
    .map((language) => ({
      ...language,
      playlists: language.playlists
        .map((playlist) => ({
          ...playlist,
          projects: [...playlist.projects].sort(
            (a, b) =>
              (a.playlistOrder ?? Number.MAX_SAFE_INTEGER) - (b.playlistOrder ?? Number.MAX_SAFE_INTEGER) ||
              a.title.localeCompare(b.title) ||
              b.updatedAt.localeCompare(a.updatedAt)
          )
        }))
        .sort((a, b) => (a.id === "unfiled" ? 1 : b.id === "unfiled" ? -1 : a.title.localeCompare(b.title)))
    }))
    .map((language) => ({ ...language, regions: language.regions.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
