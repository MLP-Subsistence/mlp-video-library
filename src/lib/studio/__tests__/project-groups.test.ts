import assert from "node:assert/strict";
import test from "node:test";
import { groupProjects } from "@/lib/studio/project-groups";
import type { ProjectSummaryDto } from "@/lib/studio/types";

function project(overrides: Partial<ProjectSummaryDto>): ProjectSummaryDto {
  return {
    id: "project",
    title: "Lesson",
    targetLanguageName: "Kinyarwanda",
    region: null,
    playlistId: "playlist",
    playlistTitle: "Youth Africa",
    playlistOrder: 1,
    status: "in_progress",
    narrationReady: 0,
    segmentCount: 3,
    updatedAt: "2026-09-25T00:00:00.000Z",
    createdByName: "Educator",
    ...overrides
  };
}

test("projects are organized as language, playlist, then video", () => {
  const groups = groupProjects([
    project({ id: "second", title: "Lesson 2", region: "Rwanda", playlistOrder: 2 }),
    project({ id: "first", title: "Lesson 1", playlistOrder: 1, status: "ready" }),
    project({ id: "other", title: "Unfiled", playlistId: null, playlistTitle: null, playlistOrder: null })
  ]);

  assert.equal(groups.length, 1, "region details must not create a second language folder");
  assert.equal(groups[0].name, "Kinyarwanda");
  assert.deepEqual(groups[0].regions, ["Rwanda"]);
  assert.equal(groups[0].readyCount, 1);
  assert.deepEqual(groups[0].playlists.map((entry) => entry.title), ["Youth Africa", "Other lessons"]);
  assert.deepEqual(groups[0].playlists[0].projects.map((entry) => entry.id), ["first", "second"]);
});
