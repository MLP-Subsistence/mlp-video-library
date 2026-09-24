import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSrt } from "../../../components/studio/workspace/export";
import type { ProjectDto } from "../types";

test("subtitles are timed to when each narration speaks, and wrap long lines", () => {
  const project = {
    timeline: {
      totalSec: 9,
      blocks: [
        { segmentId: "a", startSec: 0, endSec: 4, pauseBeforeSec: 0.5, narrationSec: 3 },
        { segmentId: "b", startSec: 4, endSec: 9, pauseBeforeSec: 0, narrationSec: 0 }
      ]
    },
    segments: [
      { segmentId: "a", translation: "Muraho mwese, murakaza neza kuri iri somo ryerekeye isoko n'ubucuruzi.", sourceScript: "Hello, everyone." },
      { segmentId: "b", translation: "", sourceScript: "We have a number of lessons." }
    ]
  } as unknown as ProjectDto;
  assert.equal(buildSrt(project, "target"), "1\n00:00:00,500 --> 00:00:03,500\nMuraho mwese, murakaza neza kuri iri somo\nryerekeye isoko n'ubucuruzi.\n");
  assert.equal(buildSrt(project, "source"), "1\n00:00:00,500 --> 00:00:03,500\nHello, everyone.\n\n2\n00:00:04,000 --> 00:00:09,000\nWe have a number of lessons.\n");
});
