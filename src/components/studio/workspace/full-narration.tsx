"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Ear, FileAudio, Hand, Minus, Pause, Play, Plus, RotateCcw, Scissors, Timer, Undo2, Wand2 } from "lucide-react";
import { pauseOtherAudio, stopPreview } from "@/components/studio/audio-preview";
import { InlineNotice, Modal, Spinner } from "@/components/studio/ui";
import { api, kindForFile, uploadAsset } from "@/lib/studio/client";
import { encodeWav, expectedCutsFromOriginal, expectedCutsFromWeights, findPauses, loudnessEnvelope, slicesAtBoundaries, snapCutsToPauses, suggestSlices, voicedMask, WINDOW_SEC, type Slice } from "@/lib/studio/narration-split";
import type { ProjectDto } from "@/lib/studio/types";

/**
 * The whole lesson's voice-over, in any language, in one file → one slice per
 * segment of the template. Four ways to find where each segment starts:
 *  - match the words: speech recognition + AI match what's said to each
 *    English line by meaning (default where the language is well supported),
 *  - at the pauses (instant, any language),
 *  - like the original video (a dub recorded to the English video's timing),
 *  - mark while listening (tap as each segment begins; always works).
 * The educator then checks each piece by ear with its English line on screen.
 */
type Loaded = { source: Blob; upload: Blob; uploadName: string; url: string; envelope: Float32Array; durationSec: number };
type Method = "words" | "pauses" | "original" | "tap";
type Listening = { state: "idle" } | { state: "working"; label: string; progress: number } | { state: "failed"; message: string };

const EXTRACT_RATE = 24_000;
const ANALYSE_RATE = 8_000;
const SPEECH_RATE = 16_000;
/** ~2 minutes of 16 kHz mono WAV per request (≈3.8 MB) keeps each one small and quick. */
const CHUNK_SEC = 115;
const MIN_SLICE = 0.2;

async function decodeMono(file: Blob, sampleRate: number) {
  const bytes = await file.arrayBuffer();
  const context = new OfflineAudioContext(1, 1, sampleRate);
  const buffer = await context.decodeAudioData(bytes);
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return { mono, durationSec: buffer.duration };
}

export function FullNarrationModal({ open, onClose, project, onProject, initialFile }: { open: boolean; onClose: () => void; project: ProjectDto; onProject: (project: ProjectDto) => void; initialFile?: File | null }) {
  if (!open) return null;
  return <Splitter onClose={onClose} project={project} onProject={onProject} initialFile={initialFile ?? null} />;
}

function Splitter({ onClose, project, onProject, initialFile }: { onClose: () => void; project: ProjectDto; onProject: (project: ProjectDto) => void; initialFile: File | null }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slices, setSlices] = useState<Slice[]>([]);
  const [method, setMethod] = useState<Method>("pauses");
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState<null | { mode: "one" | "all"; index: number }>(null);
  const [clock, setClock] = useState(0);
  const [saving, setSaving] = useState<number | null>(null);
  const [capability, setCapability] = useState<{ available: boolean; language: string | null } | null>(null);
  const [listening, setListening] = useState<Listening>({ state: "idle" });
  const [heard, setHeard] = useState<string[] | null>(null);
  const [fillText, setFillText] = useState(true);
  const [marks, setMarks] = useState<number[] | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const frame = useRef<number | null>(null);
  const started = useRef(false);
  const segments = project.segments;
  const hasOriginalTiming = segments.length > 1 && segments.every((segment) => segment.source);
  const canMatchWords = Boolean(capability?.available);
  const wordsRecommended = Boolean(capability?.available && capability.language);

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    audio.current?.pause();
  }, []);
  useEffect(() => () => {
    if (loaded) URL.revokeObjectURL(loaded.url);
  }, [loaded]);
  useEffect(() => {
    api<{ available: boolean; language: string | null }>(`/api/studio/projects/${project.id}/full-narration/listen`)
      .then(setCapability)
      .catch(() => setCapability({ available: false, language: null }));
  }, [project.id]);

  const suggest = useCallback(
    (data: Loaded, how: "pauses" | "original") => {
      if (segments.length === 0) return [];
      const voiced = voicedMask(data.envelope);
      const speechStart = Math.max(0, voiced.indexOf(true)) * WINDOW_SEC;
      const speechEnd = (Math.max(0, voiced.lastIndexOf(true)) + 1) * WINDOW_SEC;
      if (how === "original" && hasOriginalTiming) {
        const sources = segments.map((segment) => segment.source!);
        return suggestSlices(data.envelope, expectedCutsFromOriginal(sources, data.durationSec, sources[sources.length - 1].endSec), 10);
      }
      const translated = segments.every((segment) => segment.translation.trim());
      const weights = segments.map((segment) => (translated ? segment.translation.trim().length : Math.max(1, segment.sourceScript.trim().split(/\s+/).length)));
      return suggestSlices(data.envelope, expectedCutsFromWeights(weights, speechStart, speechEnd));
    },
    [hasOriginalTiming, segments]
  );

  /** Speech recognition in ~2-minute chunks cut at pauses, then the AI places every line. */
  const matchWords = useCallback(
    async (data: Loaded) => {
      stop();
      setMethod("words");
      setMarks(null);
      setListening({ state: "working", label: "Listening to the voice-over…", progress: 0 });
      try {
        const { mono } = await decodeMono(data.source, SPEECH_RATE);
        const pauses = findPauses(voicedMask(data.envelope));
        const edges = [0];
        while (data.durationSec - edges[edges.length - 1] > CHUNK_SEC * 1.15) {
          const target = edges[edges.length - 1] + CHUNK_SEC;
          const pause = pauses.filter((entry) => Math.abs(entry.midSec - target) < 20).sort((a, b) => Math.abs(a.midSec - target) - Math.abs(b.midSec - target))[0];
          edges.push(pause ? pause.midSec : target);
        }
        edges.push(data.durationSec);
        const words: Array<{ word: string; start: number; end: number }> = [];
        for (let i = 0; i < edges.length - 1; i++) {
          const chunk = mono.subarray(Math.floor(edges[i] * SPEECH_RATE), Math.ceil(edges[i + 1] * SPEECH_RATE));
          const response = await fetch(`/api/studio/projects/${project.id}/full-narration/listen?offset=${edges[i].toFixed(3)}`, { method: "POST", headers: { "content-type": "audio/wav" }, body: new Blob([encodeWav(chunk, SPEECH_RATE)], { type: "audio/wav" }) });
          const body = (await response.json().catch(() => ({}))) as { words?: typeof words; error?: string };
          if (!response.ok) throw new Error(body.error || "The voice-over couldn't be listened to.");
          words.push(...(body.words ?? []));
          setListening({ state: "working", label: "Listening to the voice-over…", progress: (i + 1) / (edges.length - 1) });
        }
        setListening({ state: "working", label: "Matching what was said to each line…", progress: 1 });
        const result = await api<{ segments: Array<{ projectSegmentId: string; startSec: number; endSec: number; heard: string }> }>(`/api/studio/projects/${project.id}/full-narration/match`, {
          method: "POST",
          json: { words, pauses: pauses.map((pause) => ({ startSec: pause.startSec, endSec: pause.endSec })), durationSec: data.durationSec }
        });
        const found = segments.map((segment) => result.segments.find((entry) => entry.projectSegmentId === segment.id));
        if (found.some((entry) => !entry)) throw new Error("Some segments couldn't be placed.");
        const placed = found as Array<{ startSec: number; endSec: number; heard: string }>;
        const cuts = placed.slice(1).map((entry, index) => (placed[index].endSec + entry.startSec) / 2);
        setSlices(slicesAtBoundaries(data.envelope, { firstStartSec: Math.max(0, placed[0].startSec - 0.2), cuts, lastEndSec: placed[placed.length - 1].endSec + 0.3 }, { before: 0.8, after: 0.8 }));
        setHeard(placed.map((entry) => entry.heard));
        setListening({ state: "idle" });
      } catch (caught) {
        setMethod("pauses");
        setSlices(suggest(data, "pauses"));
        setListening({ state: "failed", message: `${(caught as Error).message} The split below is from the pauses — check it, or mark the segments while listening.` });
      }
    },
    [project.id, segments, suggest]
  );

  async function choose(file: File | null | undefined) {
    if (!file) return;
    const kind = kindForFile(file);
    if (kind !== "audio" && kind !== "video") {
      setError("Choose an audio file (MP3, WAV, M4A…) or the video the voice-over is in.");
      return;
    }
    setError(null);
    setReading(true);
    try {
      let data: Loaded;
      if (kind === "video") {
        const { mono, durationSec } = await decodeMono(file, EXTRACT_RATE);
        const wav = new Blob([encodeWav(mono, EXTRACT_RATE)], { type: "audio/wav" });
        data = { source: wav, upload: wav, uploadName: `${file.name.replace(/\.[^.]+$/, "")}-voiceover.wav`, url: URL.createObjectURL(wav), envelope: loudnessEnvelope(mono, EXTRACT_RATE), durationSec };
      } else {
        const { mono, durationSec } = await decodeMono(file, ANALYSE_RATE);
        data = { source: file, upload: file, uploadName: file.name, url: URL.createObjectURL(file), envelope: loudnessEnvelope(mono, ANALYSE_RATE), durationSec };
      }
      setMethod("pauses");
      setSlices(suggest(data, "pauses"));
      setHeard(null);
      setLoaded(data);
      setSelected(0);
    } catch {
      setError("The sound in this file couldn't be read. Try an MP3, WAV or M4A file (or an MP4 video).");
    } finally {
      setReading(false);
    }
  }

  // A file chosen in New Localization is opened straight away.
  useEffect(() => {
    if (initialFile && !started.current) {
      started.current = true;
      void choose(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  // Once the file is read, listen for the words where the language is well supported.
  const autoMatched = useRef(false);
  useEffect(() => {
    if (loaded && wordsRecommended && !autoMatched.current) {
      autoMatched.current = true;
      void matchWords(loaded);
    }
  }, [loaded, wordsRecommended, matchWords]);

  const switchMethod = (how: Method) => {
    if (!loaded || listening.state === "working") return;
    stop();
    setListening({ state: "idle" });
    if (how === "words") return void matchWords(loaded);
    setMethod(how);
    if (how === "tap") {
      setMarks([]);
      return;
    }
    setMarks(null);
    setSlices(suggest(loaded, how));
  };

  function stop() {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    audio.current?.pause();
    setPlaying(null);
  }

  function play(mode: "one" | "all", index: number, from?: number) {
    const element = audio.current;
    if (!element || !loaded) return;
    if (from === undefined && playing && playing.mode === mode && (mode === "all" || playing.index === index)) {
      stop();
      return;
    }
    stopPreview();
    pauseOtherAudio(null);
    const start = from ?? (mode === "one" ? slices[index].startSec : 0);
    const to = mode === "one" ? slices[index].endSec : loaded.durationSec;
    element.currentTime = start;
    void element.play().catch(() => stop());
    setPlaying({ mode, index });
    const follow = () => {
      const now = element.currentTime;
      setClock(now);
      if (mode === "all" && method !== "tap") {
        const current = slices.findIndex((slice) => now >= slice.startSec && now < slice.endSec);
        if (current >= 0) setSelected(current);
      }
      if (now >= to || element.ended) {
        stop();
        return;
      }
      frame.current = requestAnimationFrame(follow);
    };
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(follow);
  }

  const finishMarks = useCallback(
    (done: number[]) => {
      if (!loaded) return;
      stop();
      // Taps come a moment late, so each one moves back to the pause just before it; the first tap marks where segment 1 begins.
      const snapped = snapCutsToPauses(done, findPauses(voicedMask(loaded.envelope)), 1.5, 0.15, "before");
      setSlices(slicesAtBoundaries(loaded.envelope, { firstStartSec: snapped[0], cuts: snapped.slice(1) }, { before: 0, after: 0 }));
      setMarks(null);
      setSelected(0);
    },
    [loaded]
  );

  const mark = useCallback(() => {
    const element = audio.current;
    if (!element || marks === null) return;
    const next = [...marks, element.currentTime];
    if (next.length >= segments.length) finishMarks(next);
    else setMarks(next);
  }, [finishMarks, marks, segments.length]);

  useEffect(() => {
    if (marks === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !playing) return;
      event.preventDefault();
      mark();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mark, marks, playing]);

  const moveEdge = (index: number, edge: "startSec" | "endSec", value: number) => {
    setSlices((current) => {
      const next = current.map((slice) => ({ ...slice }));
      const slice = next[index];
      const min = edge === "startSec" ? (next[index - 1]?.endSec ?? 0) : slice.startSec + MIN_SLICE;
      const max = edge === "startSec" ? slice.endSec - MIN_SLICE : (next[index + 1]?.startSec ?? loaded?.durationSec ?? value);
      slice[edge] = Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
      return next;
    });
  };

  const canFillText = Boolean(heard && segments.some((segment, index) => !segment.translation.trim() && heard[index]?.trim()));

  async function save() {
    if (!loaded) return;
    stop();
    setSaving(0);
    setError(null);
    try {
      const asset = await uploadAsset(loaded.upload, { kind: "audio", name: loaded.uploadName, folder: `projects/${project.id}/narration`, tags: "narration, full, voice-over", measured: { durationSec: loaded.durationSec }, onProgress: setSaving });
      const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${project.id}/full-narration/split`, {
        method: "POST",
        json: {
          assetId: asset.id,
          slices: slices.map((slice, index) => ({ projectSegmentId: segments[index].id, startSec: slice.startSec, endSec: slice.endSec, heardText: fillText && canFillText ? heard?.[index] ?? "" : "" }))
        }
      });
      onProject(result.project);
      onClose();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const tapping = method === "tap" && marks !== null;
  const nextToMark = tapping ? marks.length : -1;
  const subtitleIndex = tapping ? Math.min(segments.length - 1, marks.length) : playing ? (playing.mode === "one" ? playing.index : slices.findIndex((slice) => clock >= slice.startSec && clock < slice.endSec)) : selected;
  const subtitle = subtitleIndex >= 0 ? segments[subtitleIndex] : null;
  const busy = listening.state === "working";

  const methodButton = (how: Method, icon: typeof Scissors, label: string, title: string) => {
    const Icon = icon;
    return (
      <button type="button" onClick={() => switchMethod(how)} disabled={busy} aria-pressed={method === how} title={title} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold ${method === how ? "border-[#a64026] bg-[#fbeaea] text-[#a64026]" : "border-[#d8dde5] text-[#526579] hover:border-[#c9d0da]"}`}>
        <Icon className="size-3.5" /> {label}
      </button>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Add the whole voice-over"
      description={`One audio or video file of the whole lesson, in ${project.targetLanguageName} or any language. We find where each of the ${segments.length} segments starts, then you check it by ear with the English line on screen.`}
      footer={
        loaded ? (
          <>
            {canFillText ? (
              <label className="mr-auto inline-flex items-center gap-2 text-xs font-bold text-[#526579]">
                <input type="checkbox" checked={fillText} onChange={(event) => setFillText(event.target.checked)} className="accent-[#a64026]" />
                Also type what was heard into the empty {project.targetLanguageName} text boxes (check them later)
              </label>
            ) : (
              <span className="mr-auto text-xs text-[#6b7c8f]">{segments.length} segments · each segment&apos;s audio will be replaced</span>
            )}
            <button type="button" onClick={onClose} className="mlp-btn-outline">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving !== null || busy || tapping} className="mlp-btn-primary">
              {saving !== null ? <Spinner /> : <Check className="size-4" />} {saving !== null ? `Saving… ${Math.round(saving * 100)}%` : "Save to all segments"}
            </button>
          </>
        ) : undefined
      }
    >
      {error && <div className="mb-4"><InlineNotice tone="error" onDismiss={() => setError(null)}>{error}</InlineNotice></div>}
      {!loaded ? (
        <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#d8dde5] bg-[#f7f8fa] p-10 text-center ${reading ? "opacity-60" : "hover:border-[#a64026]/50"}`}>
          {reading ? <Spinner className="size-6" /> : <FileAudio className="size-8 text-[#a64026]" />}
          <span className="text-base font-extrabold text-[#243447]">{reading ? "Reading the voice-over…" : "Choose the voice-over of the whole lesson"}</span>
          <span className="max-w-md text-sm text-[#6b7c8f]">An audio file (MP3, WAV, M4A…) or the video it&apos;s in. The pacing doesn&apos;t need to match the English — every cut can be checked and moved before saving.</span>
          <input type="file" accept="audio/*,video/*" className="hidden" disabled={reading} onChange={(event) => void choose(event.target.files?.[0])} />
        </label>
      ) : (
        <div className="space-y-4">
          <audio ref={audio} src={loaded.url} preload="auto" className="hidden" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">Find the segments</span>
            {canMatchWords && methodButton("words", Ear, wordsRecommended ? "Match the words" : "Match the words (may be unreliable)", wordsRecommended ? "Listens to what is said and matches it to each English line — works whatever the pacing" : `Speech recognition isn't reliable for ${project.targetLanguageName}; try it, but check every cut`)}
            {methodButton("pauses", Scissors, "At the pauses", "Cuts at the pauses between lines — instant, any language")}
            {hasOriginalTiming && methodButton("original", Timer, "Like the original video", "For a voice-over recorded over the original English video, at the same pace")}
            {methodButton("tap", Hand, "Mark while listening", "Play the voice-over and tap each time a new segment starts — always works")}
            <span className="flex-1" />
            {!tapping && (
              <button type="button" onClick={() => play("all", 0)} disabled={busy} className="mlp-btn-outline h-9 px-3 text-xs">
                {playing?.mode === "all" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {playing?.mode === "all" ? "Stop" : "Play all with subtitles"}
              </button>
            )}
          </div>

          {busy && (
            <InlineNotice tone="info">
              <span className="inline-flex items-center gap-2"><Spinner /> {listening.label} {listening.progress > 0 && listening.progress < 1 ? `${Math.round(listening.progress * 100)}%` : ""}</span>
              <span className="mt-1 block text-xs font-semibold opacity-80">Usually under a minute. Meanwhile, the split below comes from the pauses.</span>
            </InlineNotice>
          )}
          {listening.state === "failed" && <InlineNotice tone="warning" onDismiss={() => setListening({ state: "idle" })}>{listening.message}</InlineNotice>}
          {capability && !wordsRecommended && method === "pauses" && !busy && listening.state !== "failed" && (
            <p className="text-xs text-[#6b7c8f]">
              {capability.available ? `Speech recognition isn't reliable for ${project.targetLanguageName}, so this first split comes from the pauses.` : "This first split comes from the pauses."} If a narrator runs lines together, use <strong>Mark while listening</strong>.
            </p>
          )}

          <div className="rounded-xl bg-[#1b2430] px-4 py-3 text-center text-white">
            {tapping && <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-300">{playing ? `Waiting for segment ${nextToMark + 1} of ${segments.length}` : "Press Start, then tap when each new segment begins"}</p>}
            {subtitle ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">{String(subtitleIndex + 1).padStart(2, "0")} · {subtitle.title}</p>
                <p className="mt-1 text-lg font-semibold leading-snug">{subtitle.sourceScript || "—"}</p>
                {(subtitle.translation.trim() || heard?.[subtitleIndex]) && <p className="mt-1 text-sm text-white/70" dir="auto">{subtitle.translation.trim() || `Heard: ${heard?.[subtitleIndex]}`}</p>}
              </>
            ) : (
              <p className="text-sm text-white/60">Between segments</p>
            )}
          </div>

          {tapping && (
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-[#d8dde5] bg-[#f7f8fa] p-3">
              {!playing ? (
                <button type="button" onClick={() => play("all", 0, marks.length ? marks[marks.length - 1] : 0)} className="mlp-btn-primary h-11"><Play className="size-4" /> {marks.length ? "Continue listening" : "Start listening"}</button>
              ) : (
                <button type="button" onClick={mark} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#a64026] px-6 text-base font-extrabold text-white hover:bg-[#8e351f]">
                  <Hand className="size-5" /> Segment {nextToMark + 1} starts now <span className="rounded bg-white/20 px-1.5 text-xs">Space</span>
                </button>
              )}
              {playing && <button type="button" onClick={stop} className="mlp-btn-outline h-11"><Pause className="size-4" /> Pause</button>}
              <button type="button" onClick={() => setMarks((current) => (current && current.length ? current.slice(0, -1) : current))} disabled={!marks.length} className="mlp-btn-outline h-11"><Undo2 className="size-4" /> Undo last</button>
              <button type="button" onClick={() => { stop(); setMarks([]); }} disabled={!marks.length} className="mlp-btn-outline h-11"><RotateCcw className="size-4" /> Start over</button>
              <span className="w-full text-center text-xs text-[#6b7c8f]">{marks.length} of {segments.length} marked. Tap as each segment begins, starting with segment 1 — a moment late is fine, each mark moves back to the pause before it.</span>
            </div>
          )}

          <Waveform loaded={loaded} slices={tapping ? [] : slices} marks={tapping ? marks : null} selected={selected} zoom={zoom} clock={playing ? clock : null} onSelect={setSelected} onMoveEdge={moveEdge} />
          <div className="flex items-center justify-end gap-2 text-xs text-[#6b7c8f]">
            Zoom
            <button type="button" onClick={() => setZoom((value) => Math.max(1, value / 1.5))} className="grid size-8 place-items-center rounded-md border border-[#d8dde5]" aria-label="Zoom out"><Minus className="size-3.5" /></button>
            <span className="w-10 text-center tabular-nums">{zoom.toFixed(1)}×</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(20, value * 1.5))} className="grid size-8 place-items-center rounded-md border border-[#d8dde5]" aria-label="Zoom in"><Plus className="size-3.5" /></button>
          </div>

          {!tapping && (
            <>
              <ol className="max-h-[32vh] space-y-1.5 overflow-y-auto pr-1">
                {segments.map((segment, index) => {
                  const slice = slices[index];
                  if (!slice) return null;
                  const isSelected = index === selected;
                  const isPlaying = playing?.mode === "one" && playing.index === index;
                  return (
                    <li key={segment.id} onClick={() => setSelected(index)} className={`flex flex-wrap items-center gap-3 rounded-lg border p-2.5 ${isSelected ? "border-[#a64026] bg-[#fbeaea]/50" : "border-[#edf0f3]"}`}>
                      <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(index); play("one", index); }} className={`grid size-9 shrink-0 place-items-center rounded-full ${isPlaying ? "bg-[#a64026] text-white" : "bg-[#f2f4f7] text-[#243447]"}`} aria-label={isPlaying ? "Stop" : `Play segment ${index + 1}`}>
                        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold text-[#243447]">{String(index + 1).padStart(2, "0")} · {segment.sourceScript || segment.title}</span>
                        <span className="block text-xs tabular-nums text-[#6b7c8f]">{clockText(slice.startSec)} – {clockText(slice.endSec)} · {(slice.endSec - slice.startSec).toFixed(1)} s{heard?.[index] ? <span className="ml-1 text-[#8b9bad]" dir="auto"> · heard: {heard[index]}</span> : null}</span>
                      </span>
                      <Nudge label="Start" onEarlier={() => moveEdge(index, "startSec", slice.startSec - 0.1)} onLater={() => moveEdge(index, "startSec", slice.startSec + 0.1)} />
                      <Nudge label="End" onEarlier={() => moveEdge(index, "endSec", slice.endSec - 0.1)} onLater={() => moveEdge(index, "endSec", slice.endSec + 0.1)} />
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-[#8b9bad]"><Wand2 className="mr-1 inline size-3" />Play a segment to check it starts and ends on the right words. Drag a coloured band&apos;s edge on the waveform, or use Start/End − and + (0.1 s each).</p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Nudge({ label, onEarlier, onLater }: { label: string; onEarlier: () => void; onLater: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6b7c8f]">
      {label}
      <button type="button" onClick={(event) => { event.stopPropagation(); onEarlier(); }} className="grid size-7 place-items-center rounded-md border border-[#d8dde5] bg-white" aria-label={`${label} 0.1 s earlier`}><Minus className="size-3" /></button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onLater(); }} className="grid size-7 place-items-center rounded-md border border-[#d8dde5] bg-white" aria-label={`${label} 0.1 s later`}><Plus className="size-3" /></button>
    </span>
  );
}

const BAND_COLORS = ["rgba(166,64,38,0.22)", "rgba(36,96,160,0.2)"];

function Waveform({ loaded, slices, marks, selected, zoom, clock, onSelect, onMoveEdge }: { loaded: Loaded; slices: Slice[]; marks: number[] | null; selected: number; zoom: number; clock: number | null; onSelect: (index: number) => void; onMoveEdge: (index: number, edge: "startSec" | "endSec", value: number) => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ index: number; edge: "startSec" | "endSec" } | null>(null);
  const total = loaded.durationSec || 1;
  const peak = useMemo(() => {
    const sorted = Float32Array.from(loaded.envelope).sort();
    return sorted[Math.floor(sorted.length * 0.99)] || 1;
  }, [loaded.envelope]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const width = Math.min(30_000, Math.round(element.clientWidth * (window.devicePixelRatio || 1)));
    const height = Math.round(element.clientHeight * (window.devicePixelRatio || 1));
    element.width = width;
    element.height = height;
    const context = element.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#8b9bad";
    const env = loaded.envelope;
    const perPixel = env.length / width;
    for (let x = 0; x < width; x++) {
      let max = 0;
      for (let i = Math.floor(x * perPixel); i < Math.min(env.length, Math.floor((x + 1) * perPixel) + 1); i++) max = Math.max(max, env[i]);
      const bar = Math.max(1, Math.min(1, max / peak) * (height * 0.9));
      context.fillRect(x, (height - bar) / 2, 1, bar);
    }
  }, [loaded.envelope, peak, zoom]);

  useEffect(() => {
    const slice = slices[selected];
    const box = scroller.current;
    if (!slice || !box || zoom <= 1) return;
    const left = (slice.startSec / total) * box.scrollWidth;
    if (left < box.scrollLeft || left > box.scrollLeft + box.clientWidth - 40) box.scrollTo({ left: Math.max(0, left - 40), behavior: "smooth" });
  }, [selected, slices, total, zoom]);

  const secondsAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, ((clientX - rect.left) / rect.width) * total));
  };

  return (
    <div ref={scroller} className="overflow-x-auto rounded-xl border border-[#d8dde5] bg-white">
      <div
        ref={track}
        className="relative h-28 select-none"
        style={{ width: `${zoom * 100}%` }}
        onPointerMove={(event) => {
          if (drag.current) onMoveEdge(drag.current.index, drag.current.edge, secondsAt(event.clientX));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {slices.map((slice, index) => (
          <div
            key={index}
            onClick={() => onSelect(index)}
            className={`absolute inset-y-0 cursor-pointer ${index === selected ? "ring-2 ring-inset ring-[#a64026]" : ""}`}
            style={{ left: `${(slice.startSec / total) * 100}%`, width: `${((slice.endSec - slice.startSec) / total) * 100}%`, background: BAND_COLORS[index % 2] }}
            title={`Segment ${index + 1}`}
          >
            <span className="absolute left-1 top-1 rounded bg-white/85 px-1 text-[10px] font-extrabold text-[#243447]">{index + 1}</span>
            {(["startSec", "endSec"] as const).map((edge) => (
              <span
                key={edge}
                role="slider"
                aria-label={`Segment ${index + 1} ${edge === "startSec" ? "start" : "end"}`}
                aria-valuenow={slice[edge]}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  (event.currentTarget.parentElement?.parentElement as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
                  drag.current = { index, edge };
                  onSelect(index);
                }}
                className={`absolute inset-y-0 w-2 cursor-ew-resize ${edge === "startSec" ? "-left-1" : "-right-1"}`}
              >
                <span className="absolute inset-y-2 left-1/2 w-0.5 -translate-x-1/2 rounded bg-[#a64026]" />
              </span>
            ))}
          </div>
        ))}
        {marks?.map((mark, index) => (
          <div key={index} className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#a64026]" style={{ left: `${(mark / total) * 100}%` }}>
            <span className="absolute left-1 top-1 rounded bg-[#a64026] px-1 text-[10px] font-extrabold text-white">{index + 1}</span>
          </div>
        ))}
        {clock !== null && <div className="pointer-events-none absolute inset-y-0 w-px bg-[#b3261e]" style={{ left: `${(clock / total) * 100}%` }} />}
      </div>
    </div>
  );
}

function clockText(sec: number) {
  const minutes = Math.floor(sec / 60);
  return `${minutes}:${(sec - minutes * 60).toFixed(1).padStart(4, "0")}`;
}
