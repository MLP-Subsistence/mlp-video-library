"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ListMusic, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pause, Play, PlayCircle, Settings2, Undo2, Wand2 } from "lucide-react";
import { AssetLibrary } from "@/components/studio/asset-library";
import { Flag, projectFlag } from "@/components/studio/language-picker";
import { LayoutEditor } from "@/components/studio/layout-editor";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { ActionMenu, InlineNotice, MenuItem, Spinner, StatusPill } from "@/components/studio/ui";
import { CompositionPreview } from "@/components/studio/workspace/composition-preview";
import { FullNarrationModal } from "@/components/studio/workspace/full-narration";
import { ScriptPanel, type PanelTab } from "@/components/studio/workspace/script-panel";
import { SegmentList } from "@/components/studio/workspace/segment-list";
import { Timeline, type TimelineTrack } from "@/components/studio/workspace/timeline";
import { TranslationSettingsModal } from "@/components/studio/workspace/translation-settings";
import { usePreviewPlayer } from "@/components/studio/workspace/use-player";
import { summarizeProject, useProject } from "@/components/studio/workspace/use-project";
import { api } from "@/lib/studio/client";
import { replaceMainVisual } from "@/lib/studio/layouts";
import type { ProjectDto, TextOverlay } from "@/lib/studio/types";

/** Desktop column widths for each combination of open/folded side panels (Tailwind needs the literals). */
const GRID_COLUMNS: Record<string, string> = {
  "true:true": "lg:grid-cols-[12.5rem_minmax(0,1fr)_21.25rem] xl:grid-cols-[15.625rem_minmax(0,1fr)_25rem]",
  "true:false": "lg:grid-cols-[12.5rem_minmax(0,1fr)_2.75rem] xl:grid-cols-[15.625rem_minmax(0,1fr)_2.75rem]",
  "false:true": "lg:grid-cols-[2.75rem_minmax(0,1fr)_21.25rem] xl:grid-cols-[2.75rem_minmax(0,1fr)_25rem]",
  "false:false": "lg:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]"
};

/** A folded side column: one tall button that reopens it, with the panel name written vertically. */
function CollapsedRail({ label, badge, icon: Icon, onExpand, className = "" }: { label: string; badge?: string; icon: typeof PanelLeftOpen; onExpand: () => void; className?: string }) {
  return (
    <button type="button" onClick={onExpand} className={`h-full w-11 flex-col items-center gap-3 bg-white py-3 text-[#6b7c8f] hover:bg-[#f7f8fa] hover:text-[#243447] ${className || "flex"}`} aria-label={`Show ${label}`} title={`Show ${label}`}>
      <Icon className="size-4 shrink-0" />
      <span className="text-[11px] font-extrabold uppercase tracking-wide [writing-mode:vertical-rl]">{label}</span>
      {badge && <span className="text-[11px] font-extrabold text-[#a64026] [writing-mode:vertical-rl]">{badge}</span>}
    </button>
  );
}

/**
 * Localization Workspace: Segments | Visual Preview | Script/Narration, with
 * the synchronized timeline along the bottom. One `activeSegmentId` drives
 * every panel; timing always comes from the server-computed timeline.
 */
export function Workspace({ initial, initialSegmentId }: { initial: ProjectDto; initialSegmentId?: string | null }) {
  const controller = useProject(initial, initialSegmentId);
  const { project, activeSegment, activeIndex, setActiveSegmentId, patchSegment, patchProject } = controller;
  const { canUndo, undo } = controller;
  const player = usePreviewPlayer(project);
  const segmentPlaying = player.playing && player.range?.kind === "segment";
  const contextPlaying = player.playing && player.range?.kind === "context";
  const lessonPlaying = player.playing && !player.range;
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [visualPickerOpen, setVisualPickerOpen] = useState(false);
  const [fullNarrationOpen, setFullNarrationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  // Desktop columns fold away so the timeline can take the width (and, without the preview, the height).
  const [panels, setPanels] = useState({ segments: true, script: true, preview: true });
  const togglePanel = (panel: keyof typeof panels) => setPanels((current) => ({ ...current, [panel]: !current[panel] }));
  const [mobileTimeline, setMobileTimeline] = useState(false);
  // Which right-panel page is open, and which timeline clip it is showing.
  // Script and Voice intentionally share one page for read-along recording.
  // (lifted so selecting a clip opens and highlights its settings).
  const [panelTab, setPanelTab] = useState<PanelTab>("script");
  const [selectedTrack, setSelectedTrack] = useState<TimelineTrack>("video");
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']") || document.querySelector("[role='dialog']")) return;
      if (!canUndo) return;
      event.preventDefault();
      void undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, undo]);

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

  // "Change visual" swaps the segment's main picture/video in place; "Layout" opens the full editor.
  const changeVisual = () => setVisualPickerOpen(true);
  const openLayout = () => setLayoutOpen(true);
  /** Clicking a clip selects the segment and opens that clip's settings on the right. */
  const selectClip = (segmentId: string, track: TimelineTrack) => {
    if (segmentId !== activeSegment?.segmentId) selectSegment(segmentId);
    setSelectedTrack(track);
    setPanelTab(track === "audio" ? "script" : "visuals");
    setPanels((current) => ({ ...current, script: true }));
    if (track === "text") window.setTimeout(() => document.getElementById("studio-text-controls")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
  };

  const timelineProps = {
    project,
    activeSegmentId: activeSegment?.segmentId ?? "",
    timeSec: player.timeSec,
    playing: player.playing,
    onSelectClip: selectClip,
    selectedTrack,
    onSeek: player.seek,
    onPlayPause: () => (player.playing ? player.pause() : player.play())
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">
      <StudioPageHeader
        sticky={false}
        title={project.title}
        badge={
          <>
            <button type="button" onClick={() => setSettingsOpen(true)} className="mlp-soft-badge gap-1.5 hover:border-[#c9d0da]" title="Translation settings"><Flag code={projectFlag(project.targetLanguageCode, project.targetLanguageName, project.region)} className="h-3 w-4" />{project.targetLanguageName}{project.region ? ` · ${project.region}` : ""}</button>
            <StatusPill tone={summary.needReview === 0 ? "ready" : "warning"}>{summary.total - summary.needReview} / {summary.total} ready</StatusPill>
          </>
        }
        actions={
          <>
            <button type="button" onClick={() => void controller.undo()} disabled={!controller.canUndo} className="mlp-btn-outline h-10 px-3" aria-label="Undo last edit" title={controller.canUndo ? `Undo ${controller.undoLabel || "last edit"} (Ctrl+Z)` : "Nothing to undo yet"}><Undo2 className="size-4" /> <span className="hidden sm:inline">Undo</span></button>
            <button type="button" onClick={() => (lessonPlaying ? player.pause() : player.playFull())} className="mlp-btn-outline h-10" title="Play the whole lesson">
              {lessonPlaying ? <Pause className="size-4" /> : <PlayCircle className="size-4" />} <span className="hidden xl:inline">{lessonPlaying ? "Stop" : "Preview lesson"}</span>
            </button>
            <ActionMenu label="Lesson tools">
              <MenuItem icon={Wand2} onClick={translateLesson} disabled={Boolean(translating)} hint="Fill every empty segment with an AI draft">Translate entire lesson</MenuItem>
              <MenuItem icon={ListMusic} onClick={() => setFullNarrationOpen(true)} hint="One long recording, split across the segments">Import full narration</MenuItem>
              <MenuItem icon={Settings2} onClick={() => setSettingsOpen(true)} hint="Language, region, dialect, audience, glossary">Translation settings</MenuItem>
            </ActionMenu>
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

      <div className={`flex flex-1 flex-col lg:grid lg:min-h-0 lg:overflow-hidden ${GRID_COLUMNS[`${panels.segments}:${panels.script}`]}`}>
        {/* Segments */}
        <aside className="hidden border-r border-[#e5e7eb] bg-white lg:block lg:min-h-0">
          {panels.segments ? (
            <SegmentList project={project} activeSegmentId={activeSegment?.segmentId ?? ""} onSelect={selectSegment} onCollapse={() => togglePanel("segments")} />
          ) : (
            <CollapsedRail label="Segments" badge={`${summary.narrationReady}/${summary.total}`} icon={PanelLeftOpen} onExpand={() => togglePanel("segments")} />
          )}
        </aside>

        {/* Preview */}
        <section className="flex min-w-0 flex-col bg-[#f2f4f7] lg:min-h-0">
          <div className="flex items-center justify-between gap-2 border-b border-[#e5e7eb] bg-white px-3 py-2 lg:hidden">
            <button type="button" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex <= 0} className="mlp-btn-outline h-9 px-2"><ChevronLeft className="size-4" /></button>
            <select value={activeSegment?.segmentId ?? ""} onChange={(event) => selectSegment(event.target.value)} className="mlp-input h-9 min-w-0 flex-1 text-sm">
              {project.segments.map((segment, index) => (
                <option key={segment.segmentId} value={segment.segmentId}>{String(index + 1).padStart(2, "0")} {segment.title}{segment.warnings.length ? " ⚠" : ""}</option>
              ))}
            </select>
            <button type="button" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex >= project.segments.length - 1} className="mlp-btn-outline h-9 px-2"><ChevronRight className="size-4" /></button>
          </div>
          {!panels.preview && (
            <div className="hidden items-center justify-between gap-2 border-b border-[#e5e7eb] bg-white px-3 py-2 lg:flex">
              <span className="truncate text-sm font-extrabold text-[#243447]">
                {activeSegment ? `Segment ${String(activeIndex + 1).padStart(2, "0")} — ${activeSegment.title}` : "Preview hidden"}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => activeSegment && (segmentPlaying ? player.pause() : player.playSegment(activeSegment.segmentId))} className="mlp-btn-outline h-9" disabled={!activeSegment}>
                  {segmentPlaying ? <Pause className="size-4" /> : <Play className="size-4" />} {segmentPlaying ? "Stop" : "Preview segment"}
                </button>
                <button type="button" onClick={() => togglePanel("preview")} className="mlp-btn-outline h-9"><ChevronDown className="size-4" /> Show preview</button>
              </div>
            </div>
          )}
          <div className={`flex flex-col justify-center p-3 sm:p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${panels.preview ? "" : "lg:hidden"}`}>
            {previewSegment && (
              <CompositionPreview
                composition={previewSegment.composition}
                assets={project.assets}
                block={previewBlock}
                timeSec={previewTime}
                playing={player.playing}
                // The drag box and handle only appear while the text clip itself is selected;
                // with the video or audio clip selected the preview shows the finished frame.
                editText={!player.playing && selectedTrack === "text" && previewSegment.segmentId === activeSegment?.segmentId}
                onTextMove={(overlay: TextOverlay) => {
                  const composition = { ...previewSegment.composition, textOverlay: overlay };
                  controller.setLocalComposition(previewSegment.id, composition);
                  void patchSegment(previewSegment, { composition });
                }}
                className="mx-auto max-w-4xl shadow-md"
              />
            )}
            <div className="mx-auto mt-3 flex w-full max-w-4xl flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => activeSegment && (segmentPlaying ? player.pause() : player.playSegment(activeSegment.segmentId))} className="mlp-btn-dark h-10 min-h-10 whitespace-nowrap rounded-lg px-4" disabled={!activeSegment}>
                {segmentPlaying ? <Pause className="size-4" /> : <Play className="size-4" />} {segmentPlaying ? "Stop" : "Preview segment"}
              </button>
              <button type="button" onClick={() => activeSegment && (contextPlaying ? player.pause() : player.playAround(activeSegment.segmentId))} className="mlp-btn-outline h-10 whitespace-nowrap" disabled={!activeSegment || project.segments.length < 2} title="Play the end of the previous segment, this one and the start of the next, to hear how they flow together">
                {contextPlaying ? <Pause className="size-4" /> : <ListMusic className="size-4" />} {contextPlaying ? "Stop" : "Hear in context"}
              </button>
              <span className="hidden lg:contents">
                <button type="button" onClick={() => togglePanel("preview")} className="mlp-btn-outline h-10 whitespace-nowrap" title="Fold the preview away so the timeline gets more room"><ChevronUp className="size-4" /> Hide preview</button>
              </span>
            </div>
          </div>
          <div className={`hidden shrink-0 lg:block ${panels.preview ? "" : "lg:min-h-0 lg:overflow-y-auto"}`}>
            <Timeline {...timelineProps} collapsed={timelineCollapsed} onToggleCollapsed={() => setTimelineCollapsed((value) => !value)} large={!panels.preview} />
          </div>
        </section>

        {/* Script / Narration */}
        <aside className="flex flex-col border-t border-[#e5e7eb] bg-white lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-[#edf0f3] px-4 py-2 lg:hidden">
            <span className="text-xs font-extrabold uppercase tracking-wide text-[#243447]">Script &amp; Narration</span>
            <button type="button" onClick={() => setMobileTimeline((value) => !value)} className="text-xs font-bold text-[#a64026]">{mobileTimeline ? "Hide Timeline" : "View Timeline"}</button>
          </div>
          {!panels.script && <CollapsedRail label="Script & Narration" icon={PanelRightOpen} onExpand={() => togglePanel("script")} className="hidden lg:flex" />}
          {panels.script && (
            <div className="hidden items-center justify-between border-b border-[#edf0f3] px-4 py-2 lg:flex">
              <span className="min-w-0 truncate text-xs font-extrabold uppercase tracking-wide text-[#243447]" title={activeSegment?.title}>
                {activeSegment ? `${String(activeIndex + 1).padStart(2, "0")} · ${activeSegment.title}` : "Segment"}
              </span>
              <button type="button" onClick={() => togglePanel("script")} className="grid size-7 place-items-center rounded-md text-[#6b7c8f] hover:bg-[#f2f4f7] hover:text-[#243447]" aria-label="Hide the script panel" title="Hide script & narration (more room for the timeline)">
                <PanelRightClose className="size-4" />
              </button>
            </div>
          )}
          {mobileTimeline && (
            <div className="lg:hidden">
              <Timeline {...timelineProps} collapsed={false} onToggleCollapsed={() => setMobileTimeline(false)} mobile />
            </div>
          )}
          <div className={`flex min-h-0 flex-1 flex-col ${panels.script ? "" : "lg:hidden"}`}>
          <ScriptPanel key={`${activeSegment?.id ?? "none"}:${controller.undoVersion}`} controller={controller} onNext={() => goTo(activeIndex + 1)} onTranslateLesson={translateLesson} translating={Boolean(translating)} onOpenSettings={() => setSettingsOpen(true)} onChangeVisual={changeVisual} onOpenLayout={openLayout} tab={panelTab} onTabChange={setPanelTab} focusTrack={selectedTrack} />
          </div>
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
          preferredFolderId={project.template.id}
          onApply={async (composition) => {
            await patchSegment(activeSegment, { composition });
          }}
          onResetToTemplate={async () => {
            await patchSegment(activeSegment, { composition: null });
            setLayoutOpen(false);
          }}
        />
      )}
      {activeSegment && (
        <AssetLibrary
          open={visualPickerOpen}
          onClose={() => setVisualPickerOpen(false)}
          title="Change Visual"
          description={`Pick the picture or video clip for segment ${String(activeIndex + 1).padStart(2, "0")} — ${activeSegment.title}. Upload your own or choose from the library.`}
          selectedIds={activeSegment.composition.slots.flatMap((slot) => slot.items.map((item) => item.assetId))}
          canManage
          preferredFolderId={project.template.id}
          onSelect={(asset) => {
            setVisualPickerOpen(false);
            void patchSegment(activeSegment, { composition: replaceMainVisual(activeSegment.composition, asset.id) });
          }}
        />
      )}
      <TranslationSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} project={project} onSave={patchProject} />
      <FullNarrationModal open={fullNarrationOpen} onClose={() => setFullNarrationOpen(false)} project={project} onProject={controller.setProject} />
    </div>
  );
}
