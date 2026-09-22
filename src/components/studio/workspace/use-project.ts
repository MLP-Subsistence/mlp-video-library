"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/studio/client";
import type { Composition, NarrationSource, ProjectDto, ProjectSegmentDto } from "@/lib/studio/types";

/**
 * Single source of truth for a localization project in the browser. Every
 * mutation goes through the API and replaces the whole DTO, so the segment
 * list, preview, script panel and timeline can never disagree about timing.
 */
export type SegmentPatch = {
  translation?: string;
  translationAction?: "approve" | "unapprove";
  pauseBeforeSec?: number;
  pauseAfterSec?: number | null;
  composition?: Composition | null;
  narration?: { assetId: string; durationSec: number; source: NarrationSource } | null;
  alignment?: { startSec: number; endSec: number };
  voiceIdOverride?: string | null;
  reviewNote?: string | null;
  approve?: boolean;
  markNarrationReady?: boolean;
};

type UndoEntry = { token: string; label: string; segmentId?: string };

function editLabel(patch: SegmentPatch) {
  if (patch.composition !== undefined) return "visual change";
  if (patch.pauseBeforeSec !== undefined || patch.pauseAfterSec !== undefined) return "timing change";
  if (patch.translation !== undefined || patch.translationAction !== undefined) return "text edit";
  if (patch.narration !== undefined) return "narration change";
  if (patch.alignment !== undefined) return "narration timing";
  if (patch.approve !== undefined) return "segment approval";
  return "segment edit";
}

export function useProject(initial: ProjectDto, initialSegmentId?: string | null) {
  const [project, setProject] = useState(initial);
  const [activeSegmentId, setActiveSegmentIdState] = useState<string>(() => {
    const requested = initialSegmentId && initial.segments.find((segment) => segment.segmentId === initialSegmentId || segment.id === initialSegmentId);
    return requested ? requested.segmentId : initial.segments[0]?.segmentId ?? "";
  });
  const [saving, setSaving] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoVersion, setUndoVersion] = useState(0);
  const undoStack = useRef<UndoEntry[]>([]);
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const undoingRef = useRef(false);
  const projectId = initial.id;

  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const next = mutationQueue.current.then(work, work);
    mutationQueue.current = next.catch(() => undefined);
    return next;
  }, []);

  const clearUndo = useCallback(() => {
    undoStack.current = [];
    setUndoCount(0);
    setUndoLabel(null);
  }, []);

  const pushUndo = useCallback((entry: UndoEntry) => {
    undoStack.current = [...undoStack.current.slice(-29), entry];
    setUndoCount(undoStack.current.length);
    setUndoLabel(entry.label);
  }, []);

  const activeSegment = useMemo(() => project.segments.find((segment) => segment.segmentId === activeSegmentId) ?? project.segments[0] ?? null, [project.segments, activeSegmentId]);
  const activeIndex = activeSegment ? project.segments.findIndex((segment) => segment.segmentId === activeSegment.segmentId) : -1;

  const setActiveSegmentId = useCallback((segmentId: string) => {
    setActiveSegmentIdState(segmentId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("segment", segmentId);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const replaceProject = useCallback((next: ProjectDto) => {
    setProject(next);
    setSavedAt(new Date());
  }, []);

  const setExternalProject = useCallback((next: ProjectDto) => {
    clearUndo();
    replaceProject(next);
  }, [clearUndo, replaceProject]);

  const patchSegment = useCallback(
    async (segment: ProjectSegmentDto, patch: SegmentPatch) => {
      setSaving((count) => count + 1);
      setError(null);
      try {
        return await enqueue(async () => {
          const result = await api<{ project: ProjectDto; undoToken: string | null }>(`/api/studio/projects/${projectId}/segments/${segment.id}`, { method: "PATCH", json: patch });
          replaceProject(result.project);
          if (result.undoToken) pushUndo({ token: result.undoToken, label: editLabel(patch), segmentId: segment.segmentId });
          return result.project;
        });
      } catch (caught) {
        setError((caught as Error).message);
        throw caught;
      } finally {
        setSaving((count) => count - 1);
      }
    },
    [enqueue, replaceProject, projectId, pushUndo]
  );

  const patchProject = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving((count) => count + 1);
      setError(null);
      try {
        return await enqueue(async () => {
          const result = await api<{ project: ProjectDto; undoToken: string | null }>(`/api/studio/projects/${projectId}`, { method: "PATCH", json: patch });
          replaceProject(result.project);
          if (result.undoToken) pushUndo({ token: result.undoToken, label: "project settings" });
          return result.project;
        });
      } catch (caught) {
        setError((caught as Error).message);
        throw caught;
      } finally {
        setSaving((count) => count - 1);
      }
    },
    [enqueue, replaceProject, projectId, pushUndo]
  );

  const undo = useCallback(async () => {
    if (undoingRef.current || undoStack.current.length === 0) return;
    undoingRef.current = true;
    setUndoing(true);
    setError(null);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("studio-before-undo"));
    try {
      await enqueue(async () => {
        const entry = undoStack.current[undoStack.current.length - 1];
        if (!entry) return;
        const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${projectId}/undo`, { method: "POST", json: { token: entry.token } });
        undoStack.current = undoStack.current.slice(0, -1);
        setUndoCount(undoStack.current.length);
        setUndoLabel(undoStack.current[undoStack.current.length - 1]?.label ?? null);
        replaceProject(result.project);
        if (entry.segmentId) setActiveSegmentIdState(entry.segmentId);
        setUndoVersion((version) => version + 1);
      });
    } catch (caught) {
      setError((caught as Error).message);
      // A stale entry must not mask newer work in another tab or background job.
      if ((caught as { status?: number }).status === 409) clearUndo();
    } finally {
      undoingRef.current = false;
      setUndoing(false);
    }
  }, [clearUndo, enqueue, projectId, replaceProject]);

  const refresh = useCallback(async () => {
    const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${projectId}`);
    setProject(result.project);
    clearUndo();
    return result.project;
  }, [clearUndo, projectId]);

  /** Optimistic local edit for text fields while autosave is pending. */
  const setLocalTranslation = useCallback((segmentId: string, translation: string) => {
    setProject((current) => ({
      ...current,
      segments: current.segments.map((segment) => (segment.id === segmentId ? { ...segment, translation } : segment))
    }));
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  return {
    project,
    setProject: setExternalProject,
    activeSegment,
    activeIndex,
    activeSegmentId: activeSegment?.segmentId ?? "",
    setActiveSegmentId,
    patchSegment,
    patchProject,
    undo,
    canUndo: undoCount > 0 && saving === 0 && !undoing,
    undoLabel,
    undoVersion,
    refresh,
    setLocalTranslation,
    saving: saving > 0,
    savedAt,
    error,
    setError
  };
}

export type ProjectController = ReturnType<typeof useProject>;

export function summarizeProject(project: ProjectDto) {
  const total = project.segments.length;
  const ready = project.segments.filter((segment) => segment.warnings.length === 0).length;
  const needReview = project.segments.filter((segment) => segment.warnings.length > 0).length;
  const narrationReady = project.segments.filter((segment) => segment.narration.status === "ready").length;
  const translationApproved = project.segments.filter((segment) => segment.translationStatus === "approved").length;
  return { total, ready, needReview, narrationReady, translationApproved };
}
