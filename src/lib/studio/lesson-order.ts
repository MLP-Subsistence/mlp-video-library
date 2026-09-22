/**
 * Lesson numbering as used in the "Marketplace Literacy_Script-English" script
 * and the YouTube playlists: `1-Introduction …`, `3-1-… Clip-1`, `19-7-…`.
 * Titles carry the number so lists read in lesson order everywhere.
 */
const NUMBER_PREFIX = /^(\d+)(?:-(\d+))?-\s*/;

/** `"3-1"` for `"3-1-Generic … Clip-1 — Youth Africa"`, `null` when the title is not numbered. */
export function lessonNumberFromTitle(title: string): string | null {
  const match = NUMBER_PREFIX.exec(title.trim());
  if (!match) return null;
  return match[2] ? `${match[1]}-${match[2]}` : match[1];
}

/** Title without its lesson number. */
export function stripLessonNumber(title: string) {
  return title.trim().replace(NUMBER_PREFIX, "");
}

/** `1-Introduction to Marketplace Literacy` — the script's own form. */
export function lessonDisplayTitle(number: string, title: string) {
  return `${number}-${stripLessonNumber(title)}`;
}

/** `[major, minor]` sort key; unnumbered titles sort after every numbered one. */
export function lessonSortKey(title: string): [number, number] {
  const number = lessonNumberFromTitle(title);
  if (!number) return [Number.MAX_SAFE_INTEGER, 0];
  const [major, minor = "0"] = number.split("-");
  return [Number(major), Number(minor)];
}

export function compareLessonTitles(a: string, b: string) {
  const [aMajor, aMinor] = lessonSortKey(a);
  const [bMajor, bMinor] = lessonSortKey(b);
  return aMajor - bMajor || aMinor - bMinor || a.localeCompare(b);
}
