"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Grid2X2, ImagePlus, ListMusic, Pause, Play, PlayCircle, Wand2 } from "lucide-react";
import { LayoutEditor } from "@/components/studio/layout-editor";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { InlineNotice, Spinner, StatusPill } from "@/components/studio/ui";
import { CompositionPreview } from "@/components/studio/workspace/composition-preview";
import { FullNarrationModal } from "@/components/studio/workspace/full-narration";
import { ScriptPanel } from "@/components/studio/workspace/script-panel";
import { SegmentList } from "@/components/studio/workspace/segment-list";
import { Timeline } from "@/components/studio/workspace/timeline";
import { usePreviewPlayer } from "@/components/studio/workspace/use-player";
import { summarizeProject, useProject } from "@/components/studio/workspace/use-project";
import { api } from "@/lib/studio/client";
import type { ProjectDto } from "@/lib/studio/types";

/**
 * Localization Workspace: Segments | Visual Preview | Script/Narration, with
 * the synchronized timeline along the bottom. One `activeSegmentId` drives
 * every panel; timing always comes from the server-computed timeline.
 */
export function Workspace({ initial, initialSegmentId }: { initial: ProjectDto; initialSegmentId?: string | null }) {
  const controller = useProject(initial, initialSegmentId);
  const { project, activeSegment, activeIndex, setActiveSegmentId, patchSegment } = controller;
  const player = usePreviewPlayer(project);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [fullNarrationOpen, setFullNarrationOpen] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [mobileTimeline, setMobileTimeline] = useState(false);
  const [translating, setTranslating] = useState<{ done: number; remaining: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const summary = summarizeProject(project);

  // Selecting a segment (from any panel) parks the playhead at its start.
  const selectSegment = useCallback(
    (segmentId: string) => {
      setActiveSegmentId(segmentId);
      const block = project.timeline.blocks.find((entry) => entry.segmentId === segmentId);
      if (block && !player.playing) player.seek(block.startSec);
    },
    [player, project.timeline.blocks, setActiveSegmentId]
  );

  // While previewing, follow the playhead so the panels show the segment being played.
  useEffect(() => {
    if (!player.playing || !player.currentBlock) return;
    if (player.currentBlock.segmentId !== activeSegment?.segmentId) setActiveSegmentId(player.currentBlock.segmentId);
  }, [player.playing, player.currentBlock, activeSegment?.segmentId, setActiveSegmentId]);

  useEffect(() => {
    const collapse = () => setTimelineCollapsed(window.innerWidth < 1024);
    collapse();
  }, []);

  const goTo = (index: number) => {
    const segment = project.segments[index];
    if (segment) selectSegment(segment.segmentId);
  };

  const translateLesson = async () => {
    setTranslating({ done: 0, remaining: project.segments.length });
    setNotice(null);
    try {
      let remaining = 1;
      let done = 0;
      while (remaining > 0) {
        const result = await api<{ translated: number; remaining: number; project: ProjectDto }>(`/api/studio/projects/${project.id}/translate`, { method: "POST", json: { mode: "missing" } });
        controller.setProject(result.project);
        done += result.translated;
        remaining = result.remaining;
        setTranslating({ done, remaining });
        if (result.translated === 0) break;
      }
      setNotice(done > 0 ? `Translated ${done} segment${done === 1 ? "" : "s"}. Review each one and approve it.` : "Every segment already has a translation. Use Regenerate on a segment to redo it.");
    } catch (caught) {
      setNotice((caught as Error).message);
    } finally {
      setTranslating(null);
    }
  };

  const activeBlock = activeSegment ? project.timeline.blocks.find((entry) => entry.segmentId === activeSegment.segmentId) ?? null : null;
  const previewBlock = player.playing || !activeBlock ? player.currentBlock : activeBlock;
  const previewSegment = previewBlock ? project.segments.find((entry) => entry.segmentId === previewBlock.segmentId) ?? activeSegment : activeSegment;
  const previewTime = player.playing ? player.timeSec : activeBlock ? Math.max(activeBlock.startSec, Math.min(player.timeSec, activeBlock.endSec - 0.01)) : player.timeSec;

  const timelineProps = {
    project,
    activeSegmentId: activeSegment?.segmentId ?? "",
    timeSec: player.timeSec,
    playing: player.playing,
    onSelect: selectSegment,
    onSeek: player.seek,
    onPlayPause: () => (player.playing ? player.pause() : player.play())
  };

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col">
      <StudioPageHeader
        title={project.title}
        badge={
          <>
            <span className="mlp-soft-badge">{project.targetLanguageName}{project.region ? ` · ${project.region}` : ""}</span>
            <StatusPill tone={summary.needReview === 0 ? "ready" : "warning"}>{summary.total - summary.needReview} / {summary.total} ready</StatusPill>
          </>
        }
        actions={
          <>
            <button type="button" onClick={translateLesson} disabled={Boolean(translating)} className="mlp-btn-outline h-10">
              {translating ? <Spinner /> : <Wand2 className="size-4" />} <span className="hidden sm:inline">Translate Entire Lesson</span><span className="sm:hidden">Translate</span>
            </button>
            <button type="button" onClick={() => setFullNarrationOpen(true)} className="mlp-btn-outline h-10">
              <ListMusic className="size-4" /> <span className="hidden sm:inline">Import Full Narration</span><span className="sm:hidden">Import</span>
            </button>
            <button type="button" onClick={() => (player.playing ? player.pause() : player.playFull())} className="mlp-btn-outline h-10">
              {player.playing && !player.range ? <Pause className="size-4" /> : <PlayCircle className="size-4" />} <span className="hidden sm:inline">Preview Lesson</span>
            </button>
            <Link href={`/studio/projects/${project.id}/review`} className="mlp-btn-primary h-10">
              <span className="hidden sm:inline">Review &amp; Generate</span><span className="sm:hidden">Review</span> <ArrowRight className="size-4" />
            </Link>
          </>
        }
      />

      {(notice || controller.error || translating) && (
        <div className="px-3 pt-3 sm:px-5">
          {translating && <InlineNotice tone="info"><span className="inline-flex items-center gap-2"><Spinner /> Translating… {translating.done} done{translating.remaining ? `, ${translating.remaining} to go` : ""}</span></InlineNotice>}
          {controller.error && <InlineNotice tone="error" onDismiss={() => controller.setError(null)}>{controller.error}</InlineNotice>}
          {notice && !translating && <InlineNotice tone="success" onDismiss={() => setNotice(null)}>{notice}</InlineNotice>}
        </div>
      )}

      <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[260px_minmax(0,1fr)_400px] xl:grid-cols-[280px_minmax(0,1fr)_440px]">
        {/* Segments */}
        <aside className="hidden border-r border-[#e5e7eb] bg-white lg:block lg:min-h-0">
          <SegmentList project={project} activeSegmentId={activeSegment?.segmentId ?? ""} onSelect={selectSegment} />
        </aside>

        {/* Preview */}
        <section className="flex min-w-0 flex-col bg-[#f2f4f7]">
          <div className="flex items-center justify-between gap-2 border-b border-[#e5e7eb] bg-white px-3 py-2 lg:hidden">
            <button type="button" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex <= 0} className="mlp-btn-outline h-9 px-2"><ChevronLeft className="size-4" /></button>
            <select value={activeSegment?.segmentId ?? ""} onChange={(event) => selectSegment(event.target.value)} className="mlp-input h-9 min-w-0 flex-1 text-sm">
              {project.segments.map((segment, index) => (
                <option key={segment.segmentId} value={segment.segmentId}>{String(index + 1).padStart(2, "0")} {segment.title}{segment.warnings.length ? " ⚠" : ""}</option>
              ))}
            </select>
            <button type="button" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex >= project.segments.length - 1} className="mlp-btn-outline h-9 px-2"><ChevronRight className="size-4" /></button>
          </div>
          <div className="p-3 sm:p-5">
            {previewSegment && (
              <CompositionPreview
                composition={previewSegment.composition}
                assets={project.assets}
                block={previewBlock}
                timeSec={previewTime}
                playing={player.playing}
                caption={`Segment ${String((previewBlock?.index ?? activeIndex) + 1).padStart(2, "0")}: ${previewSegment.title}`}
                className="mx-auto max-w-4xl shadow-md"
              />
            )}
            <div className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => setLayoutOpen(true)} className="mlp-btn-outline h-10" disabled={!activeSegment}><Grid2X2 className="size-4" /> Layout</button>
              <button type="button" onClick={() => setLayoutOpen(true)} className="mlp-btn-outline h-10" disabled={!activeSegment}><ImagePlus className="size-4" /> Change Visuals</button>
              <button type="button" onClick={() => activeSegment && (player.playing ? player.pause() : player.playSegment(activeSegment.segmentId))} className="mlp-btn-dark h-10 min-h-10 rounded-lg px-4" disabled={!activeSegment}>
                {player.playing && player.range && !player.range.label.startsWith("Around") ? <Pause className="size-4" /> : <Play className="size-4" />} Preview Segment
              </button>
              <button type="button" onClick={() => activeSegment && player.playAround(activeSegment.segmentId)} className="mlp-btn-outline h-10" disabled={!activeSegment || project.segments.length < 2}>
                Preview Around
              </button>
            </div>
            {activeSegment && activeSegment.warnings.length > 0 && (
              <div className="mx-auto mt-4 max-w-4xl">
                <InlineNotice tone="warning">{activeSegment.warnings.map((warning) => warning.message).join(" · ")}</InlineNotice>
              </div>
            )}
          </div>
          <div className="mt-auto hidden lg:block">
            <Timeline {...timelineProps} collapsed={timelineCollapsed} onToggleCollapsed={() => setTimelineCollapsed((value) => !value)} />
          </div>
        </section>

        {/* Script / Narration */}
        <aside className="border-t border-[#e5e7eb] bg-white lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-[#edf0f3] px-4 py-2 lg:hidden">
            <span className="text-xs font-extrabold uppercase tracking-wide text-[#243447]">Script &amp; Narration</span>
            <button type="button" onClick={() => setMobileTimeline((value) => !value)} className="text-xs font-bold text-[#a64026]">{mobileTimeline ? "Hide Timeline" : "View Timeline"}</button>
          </div>
          {mobileTimeline && (
            <div className="lg:hidden">
              <Timeline {...timelineProps} collapsed={false} onToggleCollapsed={() => setMobileTimeline(false)} mobile />
            </div>
          )}
          <ScriptPanel key={activeSegment?.id ?? "none"} controller={controller} onNext={() => goTo(activeIndex + 1)} onTranslateLesson={translateLesson} translating={Boolean(translating)} />
        </aside>
      </div>

      {activeSegment && (
        <LayoutEditor
          open={layoutOpen}
          onClose={() => setLayoutOpen(false)}
          initial={activeSegment.composition}
          assets={project.assets}
          segmentLabel={`Segment ${String(activeIndex + 1).padStart(2, "0")} — ${activeSegment.title}`}
          segmentDurationSec={activeBlock?.durationSec ?? 4}
          isOverride={activeSegment.compositionIsOverride}
          onApply={async (composition) => {
            await patchSegment(activeSegment, { composition });
          }}
          onResetToTemplate={async () => {
            await patchSegment(activeSegment, { composition: null });
            setLayoutOpen(false);
          }}
        />
      )}
      <FullNarrationModal open={fullNarrationOpen} onClose={() => setFullNarrationOpen(false)} project={project} onProject={controller.setProject} />
    </div>
  );
}
