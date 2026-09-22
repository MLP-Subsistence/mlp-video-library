import assert from "node:assert/strict";
import { test } from "node:test";
import { compareLessonTitles, lessonDisplayTitle, lessonNumberFromTitle, stripLessonNumber } from "../lesson-order";

test("lesson numbers are read from script-style titles", () => {
  assert.equal(lessonNumberFromTitle("1-Introduction to Marketplace Literacy"), "1");
  assert.equal(lessonNumberFromTitle("3-1-Generic Marketplace Literacy - Prioritizing Elements of a Business Clip-1 — Youth Africa"), "3-1");
  assert.equal(lessonNumberFromTitle("19-7-Sustainability Literacy"), "19-7");
  assert.equal(lessonNumberFromTitle("Consumer Literacy - What is Value Clip-1"), null);
  assert.equal(stripLessonNumber("10-2-Entrepreneurial Literacy - Choosing a Business Clip-2"), "Entrepreneurial Literacy - Choosing a Business Clip-2");
});

test("display titles carry the number once", () => {
  assert.equal(lessonDisplayTitle("3-1", "Prioritizing Elements Clip-1 — Youth Africa"), "3-1-Prioritizing Elements Clip-1 — Youth Africa");
  assert.equal(lessonDisplayTitle("3-1", "3-1-Prioritizing Elements Clip-1"), "3-1-Prioritizing Elements Clip-1");
});

test("titles sort in lesson order, not alphabetically", () => {
  const titles = ["10-1-Choosing a Business Clip-1", "2-Evolution of Needs", "3-2-Prioritizing Clip-2", "Unnumbered lesson", "1-Introduction", "3-1-Prioritizing Clip-1"];
  assert.deepEqual([...titles].sort(compareLessonTitles), [
    "1-Introduction",
    "2-Evolution of Needs",
    "3-1-Prioritizing Clip-1",
    "3-2-Prioritizing Clip-2",
    "10-1-Choosing a Business Clip-1",
    "Unnumbered lesson"
  ]);
});
