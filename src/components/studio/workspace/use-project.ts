"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useProject(initial: ProjectDto, initialSegmentId?: string | null) {
  const [project, setProject] = useState(initial);
  const [activeSegmentId, setActiveSegmentIdState] = useState<string>(() => {
    const requested = initialSegmentId && initial.segments.find((segment) => segment.segmentId === initialSegmentId || segment.id === initialSegmentId);
    return requested ? requested.segmentId : initial.segments[0]?.segmentId ?? "";
  });
  const [saving, setSaving] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectId = initial.id;

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

  const patchSegment = useCallback(
    async (segment: ProjectSegmentDto, patch: SegmentPatch) => {
      setSaving((count) => count + 1);
      setError(null);
      try {
        const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${projectId}/segments/${segment.id}`, { method: "PATCH", json: patch });
        replaceProject(result.project);
        return result.project;
      } catch (caught) {
        setError((caught as Error).message);
        throw caught;
      } finally {
        setSaving((count) => count - 1);
      }
    },
    [replaceProject, projectId]
  );

  const patchProject = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving((count) => count + 1);
      setError(null);
      try {
        const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${projectId}`, { method: "PATCH", json: patch });
        replaceProject(result.project);
        return result.project;
      } catch (caught) {
        setError((caught as Error).message);
        throw caught;
      } finally {
        setSaving((count) => count - 1);
      }
    },
    [replaceProject, projectId]
  );

  const refresh = useCallback(async () => {
    const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${projectId}`);
    setProject(result.project);
    return result.project;
  }, [projectId]);

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
    setProject: replaceProject,
    activeSegment,
    activeIndex,
    activeSegmentId: activeSegment?.segmentId ?? "",
    setActiveSegmentId,
    patchSegment,
    patchProject,
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
