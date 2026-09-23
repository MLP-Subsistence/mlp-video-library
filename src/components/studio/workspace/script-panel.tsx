"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, AudioLines, Check, ChevronDown, Clock, FileAudio, FileText, Grid2X2, ImagePlus, Mic, Pause, Play, RefreshCw, Sparkles, Trash2, Type, Upload, Wand2 } from "lucide-react";
import { AssetThumb } from "@/components/studio/asset-library";
import { pauseOtherAudio, stopPreview } from "@/components/studio/audio-preview";
import { Flag, projectFlag } from "@/components/studio/language-picker";
import { SegmentRecorder } from "@/components/studio/workspace/recorder";
import { TextControls } from "@/components/studio/workspace/text-controls";
import type { ProjectController } from "@/components/studio/workspace/use-project";
import { InlineNotice, Spinner, StatusPill, textareaClass } from "@/components/studio/ui";
import { api, debounce, kindForFile, uploadAsset } from "@/lib/studio/client";
import { formatSeconds } from "@/lib/studio/timing";
import type { Composition, ProjectDto, ProjectSegmentDto, StudioAssetDto, TextOverlay } from "@/lib/studio/types";

type NarrationTab = "record" | "ai" | "upload";
export type PanelTab = "script" | "visuals" | "timing";

/**
 * Right-hand panel. One segment at a time, in three short tabs — Script &
 * Voice, Visuals, Timing. Script and narration deliberately share one page
 * so an educator can read the words while recording.
 */
export function ScriptPanel({ controller, onNext, onTranslateLesson, translating, onOpenSettings, onChangeVisual, onOpenLayout, tab: panelTab, onTabChange, focusTrack }: { controller: ProjectController; onNext: () => void; onTranslateLesson: () => void; translating: boolean; onOpenSettings: () => void; onChangeVisual: () => void; onOpenLayout: () => void; tab: PanelTab; onTabChange: (tab: PanelTab) => void; focusTrack: "text" | "video" | "audio" }) {
  const { project, activeSegment, patchSegment, setLocalTranslation, setLocalComposition, saving, savedAt } = controller;
  const [tab, setTab] = useState<NarrationTab>(() => (activeSegment?.narration.source === "ai" ? "ai" : activeSegment?.narration.source === "upload" ? "upload" : "record"));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "warning" | "error"; text: string } | null>(null);
  const [draft, setDraft] = useState(activeSegment?.translation ?? "");
  const pendingText = useRef<{ segment: ProjectSegmentDto; composition: Composition } | null>(null);

  const save = useMemo(
    () =>
      debounce((segment: ProjectSegmentDto, translation: string) => {
        void patchSegment(segment, { translation }).catch(() => undefined);
      }, 900),
    [patchSegment]
  );

  useEffect(() => () => save.cancel(), [save]);

  const saveText = useMemo(() => debounce((segment: ProjectSegmentDto, composition: Composition) => {
    void patchSegment(segment, { composition }).catch(() => undefined);
  }, 650), [patchSegment]);
  // Leaving the segment (or the panel) must not lose a half-typed caption.
  useEffect(() => () => {
    const waiting = pendingText.current;
    if (waiting && saveText.pending()) saveText.flush(waiting.segment, waiting.composition);
    else saveText.cancel();
    pendingText.current = null;
  }, [saveText]);

  useEffect(() => {
    const cancelPendingSave = () => { save.cancel(); saveText.cancel(); pendingText.current = null; };
    window.addEventListener("studio-before-undo", cancelPendingSave);
    return () => window.removeEventListener("studio-before-undo", cancelPendingSave);
  }, [save, saveText]);

  if (!activeSegment) return null;
  const segment = activeSegment;

  const onTranslationChange = (value: string) => {
    setDraft(value);
    setLocalTranslation(segment.id, value);
    save(segment, value);
  };

  const onTextOverlayChange = (overlay: TextOverlay | undefined, immediate = false) => {
    const composition = { ...segment.composition, textOverlay: overlay };
    setLocalComposition(segment.id, composition);
    pendingText.current = { segment, composition };
    if (immediate) {
      pendingText.current = null;
      saveText.flush(segment, composition);
    } else saveText(segment, composition);
  };
  const flushText = () => {
    const waiting = pendingText.current;
    if (!waiting) return;
    pendingText.current = null;
    saveText.flush(waiting.segment, waiting.composition);
  };

  const run = async (label: string, action: () => Promise<unknown>, success?: string) => {
    setBusy(label);
    setNotice(null);
    try {
      await action();
      if (success) setNotice({ tone: "success", text: success });
    } catch (caught) {
      setNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const regenerate = () =>
    run("regenerate", async () => {
      save.cancel();
      const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${project.id}/translate`, { method: "POST", json: { segmentIds: [segment.id], mode: "regenerate" } });
      controller.setProject(result.project);
      setDraft(result.project.segments.find((entry) => entry.id === segment.id)?.translation ?? "");
    });

  const approveTranslation = () =>
    run("approve-translation", async () => {
      save.flush(segment, draft);
      await patchSegment({ ...segment, translation: draft }, { translation: draft, translationAction: "approve" });
    });

  const generateVoice = (force = false) =>
    run(
      "voice",
      async () => {
        save.flush(segment, draft);
        const result = await api<{ project: ProjectDto; skipped: boolean; reason: string | null }>(`/api/studio/projects/${project.id}/voice`, { method: "POST", json: { projectSegmentId: segment.id, force } });
        controller.setProject(result.project);
        if (result.skipped) setNotice({ tone: "info", text: result.reason ?? "Narration is already up to date." });
      },
      undefined
    );

  const attachAsset = async (asset: StudioAssetDto, durationSec: number, source: "record" | "upload") => {
    await patchSegment(segment, { narration: { assetId: asset.id, durationSec, source } });
  };

  const handleUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (kindForFile(file) !== "audio") {
      setNotice({ tone: "error", text: "Please choose a WAV, MP3, M4A, OGG or WebM audio file." });
      return;
    }
    await run("upload", async () => {
      const asset = await uploadAsset(file, { kind: "audio", folder: `projects/${project.id}/narration`, tags: "narration, upload" });
      await attachAsset(asset, asset.durationSec ?? 0, "upload");
    }, "Audio attached to this segment.");
  };

  const approveAndNext = () =>
    run("approve", async () => {
      save.flush(segment, draft);
      await patchSegment({ ...segment, translation: draft }, { approve: true, translationAction: "approve" });
      onNext();
    });

  const translationTone = segment.translationStatus === "approved" ? "ready" : segment.translationStatus === "draft" ? "warning" : "muted";
  const narrationTone = segment.narration.status === "ready" ? "ready" : segment.narration.status === "missing" ? "muted" : "warning";
  const narrationLabel = { missing: "Missing", ready: "Ready", needs_update: "Needs updating", needs_review: "Needs review" }[segment.narration.status];
  const canGenerateVoice = Boolean(project.defaultVoiceId || segment.voiceIdOverride);

  const tabs: Array<{ id: PanelTab; label: string; icon: typeof FileText; attention: boolean }> = [
    { id: "script", label: "Script & Voice", icon: FileText, attention: segment.translationStatus !== "approved" || segment.narration.status !== "ready" },
    { id: "visuals", label: "Visuals", icon: Type, attention: !segment.composition.slots.some((slot) => slot.items.length > 0) },
    { id: "timing", label: "Timing", icon: Clock, attention: false }
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 gap-1 border-b border-[#edf0f3] px-2 py-2">
        {tabs.map(({ id, label, icon: Icon, attention }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-pressed={panelTab === id}
            className={`relative inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-bold ${panelTab === id ? "bg-[#fbeaea] text-[#a64026]" : "text-[#6b7c8f] hover:bg-[#f7f8fa]"}`}
          >
            <Icon className="size-4" /> {label}
            {attention && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#a64026]" aria-hidden />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        {notice && <InlineNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice>}

        {panelTab === "script" && (
          <>
            <section>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">Original — {languageName(project.template.sourceLanguageCode)}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#243447]">{segment.sourceScript || <span className="italic text-[#8b9bad]">No source script for this segment.</span>}</p>
              {project.template.masterAssetUrl && segment.source && (
                <OriginalClipButton key={segment.id} url={project.template.masterAssetUrl} startSec={segment.source.startSec} endSec={segment.source.endSec} />
              )}
            </section>

            <section className="border-t border-[#edf0f3] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">
                  Translation —{" "}
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-[#e5ccd0] bg-[#fbeaea]/60 px-2 py-1 align-middle font-bold normal-case tracking-normal text-[#a64026] hover:bg-[#fbeaea]"
                    title="Change the language, region, dialect, audience or glossary"
                  >
                    <Flag code={projectFlag(project.targetLanguageCode, project.targetLanguageName, project.region)} className="h-3 w-4" />
                    {project.targetLanguageName}
                    <ChevronDown className="size-3.5" />
                  </button>
                </h3>
                <div className="flex items-center gap-2">
                  <StatusPill tone={translationTone}>{segment.translationStatus === "approved" ? "Approved" : segment.translationStatus === "draft" ? (segment.translationSource === "ai" ? "AI draft" : "Draft") : "Missing"}</StatusPill>
                  <button type="button" onClick={regenerate} disabled={busy !== null || !segment.sourceScript.trim()} className="inline-flex items-center gap-1 text-xs font-bold text-[#a64026]" title="Regenerate this segment with AI">
                    {busy === "regenerate" ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" />} {segment.translation ? "Regenerate" : "Translate"}
                  </button>
                </div>
              </div>
              <textarea
                value={draft}
                onChange={(event) => onTranslationChange(event.target.value)}
                rows={6}
                dir="auto"
                placeholder={`Write the ${project.targetLanguageName} narration here, or use Translate.`}
                className={`${textareaClass} mt-2 text-[1.0625rem] leading-relaxed`}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6b7c8f]">
                <span>{saving ? "Saving…" : savedAt ? `Saved ${relative(savedAt)}` : "Autosaves as you type"}</span>
                <div className="flex items-center gap-2">
                  {!project.segments.some((entry) => entry.translation.trim()) && (
                    <button type="button" onClick={onTranslateLesson} disabled={translating} className="inline-flex items-center gap-1 font-bold text-[#a64026]">
                      {translating ? <Spinner className="size-3.5" /> : <Wand2 className="size-3.5" />} Translate Entire Lesson
                    </button>
                  )}
                  {segment.translationStatus !== "approved" ? (
                    <button type="button" onClick={approveTranslation} disabled={busy !== null || !draft.trim()} className="mlp-btn-outline h-9 px-3 text-xs">
                      <Check className="size-3.5" /> Approve translation
                    </button>
                  ) : (
                    <button type="button" onClick={() => run("unapprove", () => patchSegment(segment, { translationAction: "unapprove" }))} className="font-bold text-[#6b7c8f]">
                      Unapprove
                    </button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {panelTab === "script" && (
          <section className={`border-t border-[#edf0f3] pt-4 ${focusTrack === "audio" ? "rounded-xl p-2 ring-2 ring-[#a64026]/40" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">Narration</h3>
              <div className="flex items-center gap-2">
                <StatusPill tone={narrationTone}>{narrationLabel}</StatusPill>
                <span className="text-sm font-extrabold tabular-nums text-[#a64026]">{segment.narration.durationSec > 0 ? formatSeconds(segment.narration.durationSec) : "—"}</span>
              </div>
            </div>

            {segment.narration.url && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#d8dde5] bg-white p-2">
                <NarrationPlayer url={segment.narration.url} startSec={segment.narration.startSec} endSec={segment.narration.endSec} />
                <span className="hidden text-xs font-bold text-[#6b7c8f] sm:inline">{sourceLabel(segment.narration.source)}</span>
                <button type="button" onClick={() => run("remove", () => patchSegment(segment, { narration: null }))} className="grid size-9 shrink-0 place-items-center rounded-md border border-red-200 text-red-600" aria-label="Remove narration" title="Remove narration">
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}

            <div className="mt-3 rounded-xl border border-[#e5ccd0] bg-[#fff8f6] p-3" dir="auto">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#a64026]">Read this while recording</p>
              <p className="mt-1 whitespace-pre-wrap text-[1.0625rem] font-semibold leading-relaxed text-[#243447]">
                {draft.trim() || segment.sourceScript || <span className="font-normal italic text-[#8b9bad]">Add or translate the script above before recording.</span>}
              </p>
            </div>
            {segment.narration.status === "needs_update" && (
              <div className="mt-3">
                <InlineNotice tone="warning">The translation changed after this narration was made. Re-record, upload or regenerate it so the audio matches the text.</InlineNotice>
              </div>
            )}

            {segment.narration.source === "full" && (
              <AlignmentCorrection key={`${segment.id}:${segment.narration.startSec}:${segment.narration.endSec}`} segment={segment} busy={busy !== null} onSave={(startSec, endSec) => run("align", () => patchSegment(segment, { alignment: { startSec, endSec } }), "Boundaries updated.")} onConfirm={() => run("confirm", () => patchSegment(segment, { markNarrationReady: true }), "Marked as ready.")} />
            )}

            <div className="mt-3 grid grid-cols-3 rounded-lg border border-[#d8dde5] bg-white p-1">
              {(
                [
                  ["record", "Record", Mic],
                  ["ai", "AI Voice", AudioLines],
                  ["upload", "Upload", Upload]
                ] as const
              ).map(([key, label, Icon]) => (
                <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${tab === key ? "bg-[#f2f4f7] text-[#243447]" : "text-[#6b7c8f]"}`}>
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              {tab === "record" && <SegmentRecorder key={segment.id} segmentKey={segment.key} projectId={project.id} onApproved={(asset, durationSec) => attachAsset(asset, durationSec, "record")} disabled={busy !== null} />}
              {tab === "ai" && (
                <div className="rounded-xl border border-[#d8dde5] bg-[#f7f8fa] p-4">
                  {!canGenerateVoice ? (
                    <p className="text-sm text-[#6b7c8f]">
                      Choose a voice for this project on the <a href={`/studio/projects/${project.id}/voice`} className="font-bold text-[#a64026]">AI Voice</a> page first.
                    </p>
                  ) : segment.translationStatus !== "approved" ? (
                    <p className="text-sm text-[#6b7c8f]">Approve the translation above, then generate the narration with {project.defaultVoiceName ?? "the project voice"}.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="button" onClick={() => generateVoice(segment.narration.source === "ai")} disabled={busy !== null} className="mlp-btn-primary">
                        {busy === "voice" ? <Spinner /> : <AudioLines className="size-4" />} {segment.narration.source === "ai" && segment.narration.status === "ready" ? "Regenerate narration" : "Generate narration"}
                      </button>
                      <span className="text-xs text-[#6b7c8f]">
                        {project.defaultVoiceName ?? "Project voice"} · {draft.trim().length.toLocaleString()} credits · {project.credits.remaining.toLocaleString()} remaining
                      </span>
                    </div>
                  )}
                </div>
              )}
              {tab === "upload" && (
                <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#d8dde5] bg-[#f7f8fa] p-6 text-center ${busy === "upload" ? "opacity-60" : "hover:border-[#a64026]/50"}`}>
                  {busy === "upload" ? <Spinner className="size-6" /> : <FileAudio className="size-6 text-[#a64026]" />}
                  <span className="text-sm font-bold text-[#243447]">Upload audio for this segment</span>
                  <span className="text-xs text-[#6b7c8f]">WAV, MP3, M4A, OGG or WebM. Duration is measured automatically.</span>
                  <input type="file" accept="audio/*" className="hidden" disabled={busy !== null} onChange={(event) => void handleUpload(event.target.files)} />
                </label>
              )}
            </div>
          </section>
        )}

        {panelTab === "visuals" && (
          <VisualSection segment={segment} assets={project.assets} disabled={busy !== null} focusTrack={focusTrack} onChangeVisual={onChangeVisual} onOpenLayout={onOpenLayout} onResetToTemplate={segment.compositionIsOverride ? () => void run("visual", () => patchSegment(segment, { composition: segment.composition.textOverlay ? { ...segment.templateComposition, textOverlay: segment.composition.textOverlay } : null }), "Back to the master template visual; your on-screen text was kept.") : undefined}>
            <TextControls segment={segment} disabled={busy !== null} highlighted={focusTrack === "text"} onChange={onTextOverlayChange} onFlush={flushText} />
          </VisualSection>
        )}

        {panelTab === "timing" && (
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-extrabold text-[#243447]">Pacing</h3>
              <p className="text-xs text-[#6b7c8f]">The visual stays on screen while it is quiet. Later segments move automatically.</p>
            </div>
            <PacingControl label="Before voice" value={segment.pauseBeforeSec} disabled={busy !== null} onChoose={(seconds) => void run("timing", () => patchSegment(segment, { pauseBeforeSec: seconds }))} />
            <PacingControl label="After voice" value={segment.pauseAfterSec} disabled={busy !== null} onChoose={(seconds) => void run("timing", () => patchSegment(segment, { pauseAfterSec: seconds }))} onReset={segment.pauseIsOverride ? () => void run("timing", () => patchSegment(segment, { pauseAfterSec: null })) : undefined} />
            <div className="flex justify-between border-t border-[#edf0f3] pt-2 text-sm">
              <span className="font-extrabold text-[#243447]">Segment total</span>
              <span className="font-extrabold tabular-nums text-[#243447]">{(project.timeline.blocks.find((block) => block.segmentId === segment.segmentId)?.durationSec ?? segment.pauseBeforeSec + segment.narration.durationSec + segment.pauseAfterSec).toFixed(1)} sec</span>
            </div>
          </section>
        )}
      </div>

      <div className="border-t border-[#e5e7eb] bg-white px-4 py-3 sm:px-5">
        <button type="button" onClick={approveAndNext} disabled={busy !== null} className="mlp-btn-primary w-full">
          {busy === "approve" ? <Spinner /> : <ArrowRight className="size-4" />} {segment.approvedAt ? "Approved — Next Segment" : "Approve & Next Segment"}
        </button>
        {segment.warnings.length > 0 && <p className="mt-2 text-center text-xs text-[#6b7c8f]">{segment.warnings.map((warning) => warning.message).join(" · ")}</p>}
      </div>
    </div>
  );
}

function PacingControl({ label, value, disabled, onChoose, onReset }: { label: string; value: number; disabled: boolean; onChoose: (seconds: number) => void; onReset?: () => void }) {
  const presets = [0, 0.5, 1, 2];
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-[#243447]">{label}</span>
        <span className="tabular-nums text-[#526579]">{value.toFixed(1)} sec</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((seconds) => (
          <button key={seconds} type="button" disabled={disabled} onClick={() => onChoose(seconds)} aria-pressed={Math.abs(value - seconds) < 0.01} className={`rounded-md border px-2 py-1 text-xs font-bold ${Math.abs(value - seconds) < 0.01 ? "border-[#a64026] bg-[#fbeaea] text-[#a64026]" : "border-[#d8dde5] bg-white text-[#526579]"}`}>
            {seconds === 0 ? "None" : `${seconds} s`}
          </button>
        ))}
        <details className="relative text-xs">
          <summary className="cursor-pointer rounded-md border border-[#d8dde5] bg-white px-2 py-1 font-bold text-[#526579]">Custom</summary>
          <label className="mt-1 flex items-center gap-1 text-[#526579]">
            <span className="sr-only">{label} custom seconds</span>
            <input key={value} type="number" min={0} max={10} step={0.1} defaultValue={value} disabled={disabled} onBlur={(event) => { const seconds = Number(event.currentTarget.value); if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 10 && Math.abs(seconds - value) > 0.01) onChoose(seconds); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label={`${label} custom seconds`} className="w-16 rounded border border-[#d8dde5] bg-white px-1 py-1 text-right" /> sec
          </label>
        </details>
        {onReset && <button type="button" disabled={disabled} onClick={onReset} className="px-1 text-xs font-bold text-[#a64026]">Template default</button>}
      </div>
    </div>
  );
}

function AlignmentCorrection({ segment, busy, onSave, onConfirm }: { segment: ProjectSegmentDto; busy: boolean; onSave: (startSec: number, endSec: number) => void; onConfirm: () => void }) {
  const [start, setStart] = useState(segment.narration.startSec ?? 0);
  const [end, setEnd] = useState(segment.narration.endSec ?? 0);
  const changed = Math.abs(start - (segment.narration.startSec ?? 0)) > 0.001 || Math.abs(end - (segment.narration.endSec ?? 0)) > 0.001;
  return (
    <div className="mt-3 rounded-xl border border-[#d8dde5] bg-[#f7f8fa] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">From full narration</span>
        {segment.narration.confidence !== null && (
          <StatusPill tone={segment.narration.confidence >= 0.75 ? "ready" : "warning"}>Match {Math.round(segment.narration.confidence * 100)}%</StatusPill>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <label className="block">
          <span className="text-[#6b7c8f]">Starts at (sec)</span>
          <input type="number" step={0.05} min={0} value={start} onChange={(event) => setStart(Number(event.target.value))} className="mt-1 h-8 w-full rounded border border-[#d8dde5] px-2 text-right" />
        </label>
        <label className="block">
          <span className="text-[#6b7c8f]">Ends at (sec)</span>
          <input type="number" step={0.05} min={0} value={end} onChange={(event) => setEnd(Number(event.target.value))} className="mt-1 h-8 w-full rounded border border-[#d8dde5] px-2 text-right" />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onSave(start, end)} disabled={busy || !changed || end <= start} className="mlp-btn-outline h-9 px-3 text-xs"><RefreshCw className="size-3.5" /> Update boundaries</button>
        {segment.narration.status === "needs_review" && (
          <button type="button" onClick={onConfirm} disabled={busy} className="mlp-btn-outline h-9 px-3 text-xs"><Check className="size-3.5" /> Sounds right</button>
        )}
      </div>
    </div>
  );
}

/** What is on the video track for this segment, with the same "swap it" affordance the narration has. */
function VisualSection({ segment, assets, disabled, focusTrack, onChangeVisual, onOpenLayout, onResetToTemplate, children }: { segment: ProjectSegmentDto; assets: ProjectDto["assets"]; disabled: boolean; focusTrack: "text" | "video" | "audio"; onChangeVisual: () => void; onOpenLayout: () => void; onResetToTemplate?: () => void; children?: React.ReactNode }) {
  const items = segment.composition.slots.flatMap((slot) => slot.items.map((item) => assets[item.assetId]).filter((asset): asset is StudioAssetDto => Boolean(asset)));
  const first = items[0] ?? null;
  const summary = !first ? "No visual yet" : items.length > 1 ? `${items.length} visuals · ${segment.composition.layout === "full" ? "in sequence" : "split screen"}` : first.kind === "video" ? "Video clip" : "Picture";
  return (
    <section className="border-t border-[#edf0f3] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">Visual</h3>
        <StatusPill tone={first ? (segment.compositionIsOverride ? "warning" : "ready") : "muted"}>{first ? (segment.compositionIsOverride ? "Changed" : "From template") : "Missing"}</StatusPill>
      </div>
      <div className={`mt-3 flex items-center gap-3 rounded-lg border bg-white p-2 ${focusTrack === "video" ? "border-[#a64026] ring-2 ring-[#a64026]/30" : "border-[#d8dde5]"}`}>
        <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-[#e5e7eb]">
          {first ? <AssetThumb asset={first} /> : <span className="grid h-full w-full place-items-center text-[#8b9bad]"><ImagePlus className="size-4" /></span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold text-[#243447]">{first?.name ?? "Choose a picture or video"}</span>
          <span className="block text-xs text-[#6b7c8f]">{summary}</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onChangeVisual} disabled={disabled} className="mlp-btn-primary h-10"><ImagePlus className="size-4" /> Change visual</button>
        <button type="button" onClick={onOpenLayout} disabled={disabled} className="mlp-btn-outline h-10"><Grid2X2 className="size-4" /> Layout</button>
        {onResetToTemplate && (
          <button type="button" onClick={onResetToTemplate} disabled={disabled} className="inline-flex items-center gap-1 text-xs font-bold text-[#a64026]"><RefreshCw className="size-3.5" /> Use template visual</button>
        )}
      </div>
      {children}
    </section>
  );
}

function NarrationPlayer({ url, startSec, endSec }: { url: string; startSec: number | null; endSec: number | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio || startSec === null) return;
    const onTime = () => {
      if (endSec !== null && audio.currentTime >= endSec) {
        audio.pause();
        audio.currentTime = startSec;
      }
    };
    const onPlay = () => {
      if (audio.currentTime < startSec || (endSec !== null && audio.currentTime >= endSec)) audio.currentTime = startSec;
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
    };
  }, [startSec, endSec, url]);
  return <audio ref={ref} controls preload="metadata" src={url} data-exclusive-audio onPlay={(event) => { stopPreview(); pauseOtherAudio(event.currentTarget); }} className="h-9 min-w-0 flex-1" />;
}

/** Plays just this segment's slice of the original master video's audio; press again to stop. */
function OriginalClipButton({ url, startSec, endSec }: { url: string; startSec: number; endSec: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    const onTime = () => {
      if (audio.currentTime >= endSec) audio.pause();
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
    };
  }, [endSec]);
  const toggle = () => {
    const audio = ref.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    stopPreview();
    pauseOtherAudio(audio);
    audio.currentTime = startSec;
    void audio.play().catch(() => setPlaying(false));
  };
  return (
    <>
      <audio ref={ref} src={url} preload="none" data-exclusive-audio className="hidden" />
      <button type="button" onClick={toggle} aria-pressed={playing} className={`mt-2 inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-bold ${playing ? "border-[#a64026] bg-[#a64026] text-white" : "border-[#d8dde5] bg-white text-[#243447] hover:border-[#c9d0da]"}`}>
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        {playing ? "Stop" : "Listen to the original"} · {(endSec - startSec).toFixed(1)} s
      </button>
    </>
  );
}

function sourceLabel(source: ProjectSegmentDto["narration"]["source"]) {
  return { none: "", record: "Recorded", ai: "AI voice", upload: "Uploaded", full: "Full narration" }[source];
}

function languageName(code: string) {
  return { en: "English", fr: "French", es: "Spanish", hi: "Hindi", sw: "Swahili", te: "Telugu" }[code] ?? code.toUpperCase();
}

function relative(date: Date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
