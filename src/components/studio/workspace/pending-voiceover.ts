"use client";

/**
 * A whole-lesson voice-over chosen in New Localization, handed to the new
 * project's workspace (same page session, so the File needs no upload yet).
 */
let pending: { projectId: string; file: File | null } | null = null;

export function setPendingVoiceover(projectId: string, file: File | null) {
  pending = { projectId, file };
}

export function pendingVoiceoverFile(projectId: string) {
  return pending && pending.projectId === projectId ? pending.file : null;
}

export function clearPendingVoiceover() {
  pending = null;
}
