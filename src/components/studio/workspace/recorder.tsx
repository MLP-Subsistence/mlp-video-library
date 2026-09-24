"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Square } from "lucide-react";
import { pauseOtherAudio, stopPreview } from "@/components/studio/audio-preview";
import { holdMicrophone, microphoneErrorMessage, openMicrophone } from "@/components/studio/workspace/microphone";
import { InlineNotice, Spinner } from "@/components/studio/ui";
import { measureMedia, uploadAsset } from "@/lib/studio/client";
import type { StudioAssetDto } from "@/lib/studio/types";

/**
 * Record by Segment: Record → Stop → listen → Use this take. No separate
 * microphone test: the level meter shows while recording, and a take that
 * was silent, very quiet or clipped is flagged when it stops.
 */
type Phase = "idle" | "starting" | "recording" | "recorded" | "saving";

export function SegmentRecorder({ segmentKey, projectId, onApproved, disabled }: { segmentKey: string; projectId: string; onApproved: (asset: StudioAssetDto, durationSec: number) => Promise<void>; disabled?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "error" | "success"; text: string } | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; durationSec: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const meterFrame = useRef<number | null>(null);
  const startedAt = useRef(0);
  const peakSeen = useRef(0);
  const clipFrames = useRef(0);
  const takeUrl = useRef<string | null>(null);

  useEffect(() => {
    const release = holdMicrophone();
    return () => {
      if (meterFrame.current) cancelAnimationFrame(meterFrame.current);
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
      release();
    };
  }, []);

  function setTakeUrl(url: string | null) {
    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    takeUrl.current = url;
  }

  async function record() {
    setPhase("starting");
    setMessage(null);
    stopPreview();
    pauseOtherAudio(null);
    try {
      const { stream, analyser } = await openMicrophone();
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(stream, preferred ? { mimeType: preferred, audioBitsPerSecond: 96_000 } : undefined);
      const chunks: Blob[] = [];
      peakSeen.current = 0;
      clipFrames.current = 0;
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      instance.onstop = async () => {
        if (meterFrame.current) cancelAnimationFrame(meterFrame.current);
        meterFrame.current = null;
        setLevel(0);
        const blob = new Blob(chunks, { type: instance.mimeType || preferred || "audio/webm" });
        const url = URL.createObjectURL(blob);
        setTakeUrl(url);
        const measured = await measureMedia(blob, "audio");
        setTake({ blob, url, durationSec: measured.durationSec ?? (performance.now() - startedAt.current) / 1000 });
        setPhase("recorded");
        if (peakSeen.current < 0.01) setMessage({ tone: "error", text: "This take is silent. Check the microphone isn't muted (or pick another one in your browser), then record again." });
        else if (clipFrames.current > 20) setMessage({ tone: "warning", text: "Parts of this take are too loud and may sound distorted. Listen back; if it crackles, move a little further from the microphone and record again." });
        else if (peakSeen.current < 0.05) setMessage({ tone: "warning", text: "This take is very quiet. Listen back, and record again closer to the microphone if it's hard to hear." });
      };
      const buffer = new Float32Array(analyser.fftSize);
      const meter = () => {
        analyser.getFloatTimeDomainData(buffer);
        let peak = 0;
        for (const value of buffer) peak = Math.max(peak, Math.abs(value));
        peakSeen.current = Math.max(peakSeen.current, peak);
        if (peak > 0.98) clipFrames.current += 1;
        setLevel(peak);
        setElapsed((performance.now() - startedAt.current) / 1000);
        meterFrame.current = requestAnimationFrame(meter);
      };
      recorder.current = instance;
      startedAt.current = performance.now();
      instance.start(250);
      setTake(null);
      setElapsed(0);
      setPhase("recording");
      meter();
    } catch (caught) {
      setPhase(take ? "recorded" : "idle");
      setMessage({ tone: "error", text: microphoneErrorMessage(caught) });
    }
  }

  function stop() {
    recorder.current?.stop();
  }

  async function keepTake() {
    if (!take) return;
    setPhase("saving");
    setProgress(0);
    setMessage(null);
    try {
      const extension = take.blob.type.includes("mp4") ? "m4a" : take.blob.type.includes("ogg") ? "ogg" : "webm";
      const asset = await uploadAsset(take.blob, {
        kind: "audio",
        name: `${segmentKey}-recording.${extension}`,
        folder: `projects/${projectId}/narration`,
        tags: "narration, recording",
        measured: { durationSec: take.durationSec },
        onProgress: setProgress
      });
      await onApproved(asset, take.durationSec || asset.durationSec || 0);
      setTakeUrl(null);
      setTake(null);
      setPhase("idle");
      setMessage({ tone: "success", text: "Recording saved to this segment." });
    } catch (caught) {
      setPhase("recorded");
      setMessage({ tone: "error", text: (caught as Error).message });
    }
  }

  const levelPercent = Math.min(100, Math.round(level * 140));

  return (
    <div className="space-y-3">
      {message && <InlineNotice tone={message.tone}>{message.text}</InlineNotice>}
      <div className="rounded-xl border border-[#d8dde5] bg-[#f7f8fa] p-4">
        {phase === "recording" && (
          <div className="mb-3 flex items-center gap-3">
            <span className="size-2.5 animate-pulse rounded-full bg-[#b3261e]" aria-hidden />
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e5e7eb]">
              <div className={`h-full rounded-full transition-[width] duration-75 ${level > 0.98 ? "bg-red-500" : "bg-[#a64026]"}`} style={{ width: `${levelPercent}%` }} />
            </div>
            <span className="w-12 text-right font-extrabold tabular-nums text-[#243447]">{formatElapsed(elapsed)}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {(phase === "idle" || phase === "starting") && (
            <button type="button" onClick={() => void record()} disabled={disabled || phase === "starting"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b3261e] px-5 font-extrabold text-white hover:bg-[#9a1f18]">
              {phase === "starting" ? <Spinner /> : <span className="size-2.5 rounded-full bg-white" />} Record
            </button>
          )}
          {phase === "recording" && (
            <button type="button" onClick={stop} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#243447] px-5 font-extrabold text-white">
              <Square className="size-4" /> Stop
            </button>
          )}
          {phase === "recorded" && take && (
            <>
              <audio controls src={take.url} data-exclusive-audio onPlay={(event) => { stopPreview(); pauseOtherAudio(event.currentTarget); }} className="h-10 w-full min-w-0 sm:w-auto sm:flex-1" />
              <button type="button" onClick={() => void keepTake()} className="mlp-btn-primary"><Check className="size-4" /> Use this take</button>
              <button type="button" onClick={() => void record()} className="mlp-btn-outline"><RotateCcw className="size-4" /> Record again</button>
            </>
          )}
          {phase === "saving" && (
            <span className="inline-flex items-center gap-2 text-sm font-bold text-[#6b7c8f]">
              <Spinner /> Saving… {progress > 0 && progress < 1 ? `${Math.round(progress * 100)}%` : ""}
            </span>
          )}
        </div>
        {phase === "idle" && !message && <p className="mt-3 text-xs text-[#6b7c8f]">Press Record and read the translation above. Stop when you finish, listen back, then keep the take.</p>}
      </div>
    </div>
  );
}

function formatElapsed(seconds: number) {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
