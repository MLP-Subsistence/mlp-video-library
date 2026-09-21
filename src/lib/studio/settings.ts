import { prisma } from "@/lib/prisma";

/** Singleton studio settings row (id = 1), created on first access. */
export async function getStudioSettings() {
  const existing = await prisma.studioSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.studioSettings.create({ data: { id: 1 } });
}

/**
 * Glossary lines are "term = preferred translation" (one per line). Lines
 * without "=" are treated as "keep this term consistent".
 */
export function parseGlossary(raw: string | null | undefined) {
  return (raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [term, ...rest] = line.split("=");
      return { term: term.trim(), preferred: rest.join("=").trim() || null };
    })
    .filter((entry) => entry.term.length > 0);
}

export const defaultGlossaryTerms = ["marketplace", "consumer", "entrepreneur", "sustainability", "needs", "wants", "business", "transportation"];
