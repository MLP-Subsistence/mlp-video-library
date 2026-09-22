import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryForLesson, lessonNumberFromFilename, matchChunksToLines, parseScriptText, segmentTitle } from "../services/master-import";

test("parseScriptText splits the master script into numbered lessons and lines", () => {
  const lessons = parseScriptText(`Marketplace Literacy_Script-English
1-Introduction to Marketplace Literacy
Hello, everyone.
So let's get started.
3-1-Generic Marketplace Literacy - Prioritizing Elements of a Business Clip-1
What is most important when starting a business?
`);
  assert.equal(lessons.length, 2);
  assert.deepEqual(lessons[0], { number: "1", title: "Introduction to Marketplace Literacy", lines: ["Hello, everyone.", "So let's get started."], sequence: 1 });
  assert.equal(lessons[1].number, "3-1");
  assert.equal(lessons[1].lines.length, 1);
});

test("lesson numbers are read from media file names in their various spellings", () => {
  assert.equal(lessonNumberFromFilename("1-Introduction to Marketplace Literacy_f92a2fa0.mp4"), "1");
  assert.equal(lessonNumberFromFilename("3-1-General Marketplace Literacy - Clip-1_8f977137.mp4"), "3-1");
  assert.equal(lessonNumberFromFilename("10 5 Entrepreneurial Literacy Choosing a Business Clip 5_f3066ea5.mp4"), "10-5");
  assert.equal(lessonNumberFromFilename("20-1 - Personal and Professional Aspirations_f89d5f13.mp4"), "20-1");
  assert.equal(categoryForLesson("7-2"), "Consumer Literacy");
  assert.equal(categoryForLesson("19-4"), "Sustainability Literacy");
});

test("exact chunk count maps one chunk per line with pauses from the gaps", () => {
  const chunks = [
    { start: 3.1, end: 3.87 },
    { start: 4.4, end: 6.81 },
    { start: 7.43, end: 13.85 }
  ];
  const { timings, exact } = matchChunksToLines(chunks, ["Hello, everyone.", "We have a number of lessons.", "Marketplace literacy is about learning."], 15);
  assert.equal(exact, true);
  assert.equal(timings.length, 3);
  assert.ok(timings[0].start < 3.1 && timings[0].end > 3.87);
  assert.ok(timings[1].start >= timings[0].end);
  assert.ok(timings[0].pauseAfter >= 0.3);
});

test("extra pauses (breaths) are grouped so real line boundaries survive", () => {
  // Line 2 is long and was spoken with a breath in the middle → 4 chunks for 3 lines.
  const chunks = [
    { start: 0.5, end: 1.5 },
    { start: 2.2, end: 4.0 },
    { start: 4.3, end: 6.2 },
    { start: 7.0, end: 8.0 }
  ];
  const lines = ["Short line.", "A much longer line that the narrator split with a breath in the middle of it.", "Short close."];
  const { timings, exact } = matchChunksToLines(chunks, lines, 9);
  assert.equal(exact, false);
  assert.equal(timings.length, 3);
  assert.ok(Math.abs(timings[1].start - 2.2) < 0.2, `line 2 starts at ${timings[1].start}`);
  assert.ok(Math.abs(timings[1].end - 6.2) < 0.2, `line 2 ends at ${timings[1].end}`);
  assert.ok(Math.abs(timings[2].start - 7.0) < 0.2);
});

test("fewer pauses than lines splits a run-on chunk between its lines by length", () => {
  const chunks = [
    { start: 0.5, end: 4.5 },
    { start: 5.2, end: 6.2 }
  ];
  const lines = ["First sentence here.", "Second sentence here.", "Last."];
  const { timings } = matchChunksToLines(chunks, lines, 7);
  assert.equal(timings.length, 3);
  assert.ok(timings[0].start <= 0.5 && timings[1].end <= 4.5 + 0.2);
  assert.ok(Math.abs(timings[2].start - 5.2) < 0.2);
  for (let i = 1; i < timings.length; i++) assert.ok(timings[i].start >= timings[i - 1].end - 0.001);
});

test("segment titles are short and readable", () => {
  assert.equal(segmentTitle("Hello, everyone.", 0), "Hello, everyone");
  assert.equal(segmentTitle("Marketplace literacy is about learning to be better customers.", 1), "Marketplace literacy is about learning to…");
});
