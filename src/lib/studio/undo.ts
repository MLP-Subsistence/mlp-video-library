import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { StudioProject, StudioProjectSegment } from "@prisma/client";
import { StudioError } from "@/lib/studio/errors";

const SEGMENT_FIELDS = [
  "translation", "translationStatus", "translationSource", "translationUpdatedAt",
  "narrationAssetId", "narrationSource", "narrationStartSec", "narrationEndSec",
  "narrationDurationSec", "narrationStatus", "narrationUpdatedAt", "narrationScriptHash",
  "alignmentConfidence", "pauseBeforeSec", "pauseAfterSecOverride", "compositionOverride",
  "voiceIdOverride", "reviewNote", "approvedAt"
] as const;

const PROJECT_FIELDS = [
  "region", "variety", "audience", "register", "glossary", "defaultVoiceId",
  "defaultVoiceName", "voiceSettings", "renderQuality"
] as const;

type SegmentSnapshot = { [K in (typeof SEGMENT_FIELDS)[number]]: StudioProjectSegment[K] extends Date | null ? string | null : StudioProjectSegment[K] };
type ProjectSnapshot = Pick<StudioProject, (typeof PROJECT_FIELDS)[number]>;

function pickSnapshot<T extends object, K extends readonly (keyof T)[]>(row: T, fields: K) {
  return Object.fromEntries(fields.map((field) => {
    const value = row[field];
    return [field, value instanceof Date ? value.toISOString() : value];
  })) as { [P in K[number]]: T[P] extends Date | null ? string | null : T[P] };
}

export function segmentSnapshot(row: StudioProjectSegment): SegmentSnapshot {
  return pickSnapshot(row, SEGMENT_FIELDS);
}

export function projectSnapshot(row: StudioProject): ProjectSnapshot {
  return pickSnapshot(row, PROJECT_FIELDS) as ProjectSnapshot;
}

export function snapshotsEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function segmentRestoreData(snapshot: SegmentSnapshot) {
  return {
    ...snapshot,
    translationUpdatedAt: snapshot.translationUpdatedAt ? new Date(snapshot.translationUpdatedAt) : null,
    narrationUpdatedAt: snapshot.narrationUpdatedAt ? new Date(snapshot.narrationUpdatedAt) : null,
    approvedAt: snapshot.approvedAt ? new Date(snapshot.approvedAt) : null
  };
}

type UndoPayload =
  | { scope: "segment"; projectId: string; recordId: string; userId: string; before: SegmentSnapshot; after: SegmentSnapshot; expiresAt: number }
  | { scope: "project"; projectId: string; recordId: string; userId: string; before: ProjectSnapshot; after: ProjectSnapshot; expiresAt: number };

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new StudioError("Undo is unavailable until the server session secret is configured.", 503);
  return value;
}

export function issueUndoToken(payload: Omit<UndoPayload, "expiresAt">) {
  const full = { ...payload, expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(full)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyUndoToken(token: string): UndoPayload {
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra || token.length > 20000) throw new StudioError("That change can no longer be undone.", 400);
  const expected = createHmac("sha256", secret()).update(encoded).digest("base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new StudioError("That change can no longer be undone.", 400);
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as UndoPayload;
    if (!payload || (payload.scope !== "segment" && payload.scope !== "project") || !payload.projectId || !payload.recordId || !payload.userId || !payload.before || !payload.after || payload.expiresAt < Date.now()) throw new Error("Invalid or expired token");
    return payload;
  } catch {
    throw new StudioError("That change can no longer be undone.", 400);
  }
}
