"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileAudio, Minus, Pause, Play, Plus, Scissors, Timer, Wand2 } from "lucide-react";
import { pauseOtherAudio, stopPreview } from "@/components/studio/audio-preview";
import { InlineNotice, Modal, Spinner } from "@/components/studio/ui";
import { api, kindForFile, uploadAsset } from "@/lib/studio/client";
import { expectedCutsFromOriginal, expectedCutsFromWeights, encodeWav, loudnessEnvelope, suggestSlices, voicedMask, WINDOW_SEC, type Slice } from "@/lib/studio/narration-split";
import type { ProjectDto } from "@/lib/studio/types";

/**
 * One recording for the whole lesson → one slice per segment, done in the
 * browser: no background worker and no speech recognition, so it works for
 * every language. The first split comes from the pauses (or the original
 * video's timing); the educator checks it by ear with each segment's English
 * line on screen, drags any edge that's off, and saves.
 */
type Loaded = { upload: Blob; uploadName: string; url: string; envelope: Float32Array; durationSec: number };
type Method = "pauses" | "original";

const EXTRACT_RATE = 24_000;
const ANALYSE_RATE = 8_000;
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

export function FullNarrationModal({ open, onClose, project, onProject }: { open: boolean; onClose: () => void; project: ProjectDto; onProject: (project: ProjectDto) => void }) {
  if (!open) return null;
  return <Splitter onClose={onClose} project={project} onProject={onProject} />;
}

function Splitter({ onClose, project, onProject }: { onClose: () => void; project: ProjectDto; onProject: (project: ProjectDto) => void }) {
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
  const audio = useRef<HTMLAudioElement | null>(null);
  const frame = useRef<number | null>(null);
  const segments = project.segments;
  const hasOriginalTiming = segments.every((segment) => segment.source);

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    audio.current?.pause();
  }, []);
  useEffect(() => () => {
    if (loaded) URL.revokeObjectURL(loaded.url);
  }, [loaded]);

  const suggest = useCallback(
    (data: Loaded, how: Method) => {
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

  async function choose(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const kind = kindForFile(file);
    if (kind !== "audio" && kind !== "video") {
      setError("Choose an audio file (WAV, MP3, M4A…) or the video file the narration is in.");
      return;
    }
    setError(null);
    setReading(true);
    try {
      let data: Loaded;
      if (kind === "video") {
        const { mono, durationSec } = await decodeMono(file, EXTRACT_RATE);
        const wav = new Blob([encodeWav(mono, EXTRACT_RATE)], { type: "audio/wav" });
        data = { upload: wav, uploadName: `${file.name.replace(/\.[^.]+$/, "")}-narration.wav`, url: URL.createObjectURL(wav), envelope: loudnessEnvelope(mono, EXTRACT_RATE), durationSec };
      } else {
        const { mono, durationSec } = await decodeMono(file, ANALYSE_RATE);
        data = { upload: file, uploadName: file.name, url: URL.createObjectURL(file), envelope: loudnessEnvelope(mono, ANALYSE_RATE), durationSec };
      }
      const how: Method = hasOriginalTiming && kind === "video" ? "original" : "pauses";
      setMethod(how);
      setSlices(suggest(data, how));
      setLoaded(data);
      setSelected(0);
    } catch {
      setError("The sound in this file couldn't be read. Try an MP3, WAV or M4A file (or an MP4 video).");
    } finally {
      setReading(false);
    }
  }

  const resplit = (how: Method) => {
    if (!loaded) return;
    stop();
    setMethod(how);
    setSlices(suggest(loaded, how));
  };

  function stop() {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    audio.current?.pause();
    setPlaying(null);
  }

  function play(mode: "one" | "all", index: number) {
    const element = audio.current;
    if (!element || !loaded) return;
    if (playing && playing.mode === mode && (mode === "all" || playing.index === index)) {
      stop();
      return;
    }
    stopPreview();
    pauseOtherAudio(null);
    const from = mode === "one" ? slices[index].startSec : 0;
    const to = mode === "one" ? slices[index].endSec : loaded.durationSec;
    element.currentTime = from;
    void element.play().catch(() => stop());
    setPlaying({ mode, index });
    const follow = () => {
      const now = element.currentTime;
      setClock(now);
      if (mode === "all") {
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

  async function save() {
    if (!loaded) return;
    stop();
    setSaving(0);
    setError(null);
    try {
      const asset = await uploadAsset(loaded.upload, { kind: "audio", name: loaded.uploadName, folder: `projects/${project.id}/narration`, tags: "narration, full", measured: { durationSec: loaded.durationSec }, onProgress: setSaving });
      const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${project.id}/full-narration/split`, {
        method: "POST",
        json: { assetId: asset.id, slices: slices.map((slice, index) => ({ projectSegmentId: segments[index].id, startSec: slice.startSec, endSec: slice.endSec })) }
      });
      onProject(result.project);
      onClose();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const current = segments[selected];
  const subtitleIndex = playing ? (playing.mode === "one" ? playing.index : slices.findIndex((slice) => clock >= slice.startSec && clock < slice.endSec)) : selected;
  const subtitle = subtitleIndex >= 0 ? segments[subtitleIndex] : null;

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Use one recording for the whole lesson"
      description="Split a full narration into the lesson's segments. Works for any language: check each piece by ear, with its English line on screen."
      footer={
        loaded ? (
          <>
            <span className="mr-auto text-xs text-[#6b7c8f]">{segments.length} segments · the audio in each segment will be replaced</span>
            <button type="button" onClick={onClose} className="mlp-btn-outline">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving !== null} className="mlp-btn-primary">
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
          <span className="text-base font-extrabold text-[#243447]">{reading ? "Reading the recording…" : "Choose the recording of the whole lesson"}</span>
          <span className="max-w-md text-sm text-[#6b7c8f]">An audio file (MP3, WAV, M4A…) or the video the narration is in. It&apos;s read in your browser, then split at the pauses between segments — you can adjust every cut before saving.</span>
          <input type="file" accept="audio/*,video/*" className="hidden" disabled={reading} onChange={(event) => void choose(event.target.files)} />
        </label>
      ) : (
        <div className="space-y-4">
          <audio ref={audio} src={loaded.url} preload="auto" className="hidden" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">First split</span>
            <button type="button" onClick={() => resplit("pauses")} aria-pressed={method === "pauses"} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold ${method === "pauses" ? "border-[#a64026] bg-[#fbeaea] text-[#a64026]" : "border-[#d8dde5] text-[#526579]"}`}>
              <Scissors className="size-3.5" /> At the pauses
            </button>
            {hasOriginalTiming && (
              <button type="button" onClick={() => resplit("original")} aria-pressed={method === "original"} title="For a dub of the whole video: cut where the original English video moves to the next segment" className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold ${method === "original" ? "border-[#a64026] bg-[#fbeaea] text-[#a64026]" : "border-[#d8dde5] text-[#526579]"}`}>
                <Timer className="size-3.5" /> Like the original video
              </button>
            )}
            <span className="flex-1" />
            <button type="button" onClick={() => play("all", 0)} className="mlp-btn-outline h-9 px-3 text-xs">
              {playing?.mode === "all" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {playing?.mode === "all" ? "Stop" : "Play all with subtitles"}
            </button>
          </div>

          <div className="rounded-xl bg-[#1b2430] px-4 py-3 text-center text-white">
            {subtitle ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">{String(subtitleIndex + 1).padStart(2, "0")} · {subtitle.title}</p>
                <p className="mt-1 text-lg font-semibold leading-snug">{subtitle.sourceScript || "—"}</p>
                {subtitle.translation.trim() && <p className="mt-1 text-sm text-white/70" dir="auto">{subtitle.translation}</p>}
              </>
            ) : (
              <p className="text-sm text-white/60">Between segments</p>
            )}
          </div>

          <Waveform loaded={loaded} slices={slices} selected={selected} zoom={zoom} clock={playing ? clock : null} onSelect={setSelected} onMoveEdge={moveEdge} />
          <div className="flex items-center justify-end gap-2 text-xs text-[#6b7c8f]">
            Zoom
            <button type="button" onClick={() => setZoom((value) => Math.max(1, value / 1.5))} className="grid size-8 place-items-center rounded-md border border-[#d8dde5]" aria-label="Zoom out"><Minus className="size-3.5" /></button>
            <span className="w-10 text-center tabular-nums">{zoom.toFixed(1)}×</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(20, value * 1.5))} className="grid size-8 place-items-center rounded-md border border-[#d8dde5]" aria-label="Zoom in"><Plus className="size-3.5" /></button>
          </div>

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
                    <span className="block text-xs tabular-nums text-[#6b7c8f]">{clockText(slice.startSec)} – {clockText(slice.endSec)} · {(slice.endSec - slice.startSec).toFixed(1)} s</span>
                  </span>
                  <Nudge label="Start" onEarlier={() => moveEdge(index, "startSec", slice.startSec - 0.1)} onLater={() => moveEdge(index, "startSec", slice.startSec + 0.1)} />
                  <Nudge label="End" onEarlier={() => moveEdge(index, "endSec", slice.endSec - 0.1)} onLater={() => moveEdge(index, "endSec", slice.endSec + 0.1)} />
                </li>
              );
            })}
          </ol>
          {current && <p className="text-xs text-[#8b9bad]"><Wand2 className="mr-1 inline size-3" />Drag a coloured band&apos;s edges on the waveform, or use Start/End − and + (0.1 s each). Play a segment to check it begins and ends on the right words.</p>}
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

function Waveform({ loaded, slices, selected, zoom, clock, onSelect, onMoveEdge }: { loaded: Loaded; slices: Slice[]; selected: number; zoom: number; clock: number | null; onSelect: (index: number) => void; onMoveEdge: (index: number, edge: "startSec" | "endSec", value: number) => void }) {
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
        {clock !== null && <div className="pointer-events-none absolute inset-y-0 w-px bg-[#b3261e]" style={{ left: `${(clock / total) * 100}%` }} />}
      </div>
    </div>
  );
}

function clockText(sec: number) {
  const minutes = Math.floor(sec / 60);
  return `${minutes}:${(sec - minutes * 60).toFixed(1).padStart(4, "0")}`;
}
