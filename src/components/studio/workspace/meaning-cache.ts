"use client";

/**
 * English meaning of each segment's narration ("back-translation"), kept in
 * this browser so it survives a reload without a database column. An entry
 * only counts while the narration text is exactly the text it was made for.
 */
export type Meaning = { text: string; english: string; matchesOriginal?: boolean; differences?: string };

const PREFIX = "mlp-meaning:";
const listeners = new Set<() => void>();
let version = 0;
const memory = new Map<string, Meaning | null>();

function read(segmentId: string): Meaning | null {
  if (memory.has(segmentId)) return memory.get(segmentId) ?? null;
  let value: Meaning | null = null;
  try {
    const raw = window.localStorage.getItem(PREFIX + segmentId);
    value = raw ? (JSON.parse(raw) as Meaning) : null;
  } catch {
    value = null;
  }
  memory.set(segmentId, value);
  return value;
}

export function meaningFor(segmentId: string, text: string): Meaning | null {
  const entry = typeof window === "undefined" ? null : read(segmentId);
  return entry && entry.text.trim() === text.trim() ? entry : null;
}

export function rememberMeaning(segmentId: string, meaning: Meaning) {
  memory.set(segmentId, meaning);
  try {
    window.localStorage.setItem(PREFIX + segmentId, JSON.stringify(meaning));
  } catch {
    /* private mode or full storage: keep it for this page only */
  }
  version += 1;
  for (const listener of listeners) listener();
}

export function rememberMeanings(entries: Record<string, { text: string; english: string }> | undefined) {
  for (const [segmentId, meaning] of Object.entries(entries ?? {})) if (meaning.english) rememberMeaning(segmentId, meaning);
}

export function subscribeMeanings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function meaningsVersion() {
  return version;
}
