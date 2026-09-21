"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic, MicOff, Play, RotateCcw, Square } from "lucide-react";
import { InlineNotice, Spinner } from "@/components/studio/ui";
import { measureMedia, uploadAsset } from "@/lib/studio/client";
import type { StudioAssetDto } from "@/lib/studio/types";

/**
 * Record by Segment: Read → Record → Stop → Listen → Approve. The translated
 * script stays visible above (rendered by the parent). Includes a friendly
 * microphone check that catches denied permission, missing devices, silence
 * and clipping before the educator records 30 segments in vain.
 */
type Phase = "idle" | "checking" | "ready" | "recording" | "recorded" | "uploading";

export function SegmentRecorder({ segmentKey, projectId, onApproved, disabled }: { segmentKey: string; projectId: string; onApproved: (asset: StudioAssetDto, durationSec: number) => Promise<void>; disabled?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "error" | "success"; text: string } | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const analyser = useRef<AnalyserNode | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const meterFrame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const peakSeen = useRef(0);
  const clipCount = useRef(0);
  const elapsedRef = useRef(0);

  const releaseStream = useCallback(() => {
    if (meterFrame.current) cancelAnimationFrame(meterFrame.current);
    meterFrame.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
    analyser.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => {
    releaseStream();
    if (timer.current) clearInterval(timer.current);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meterRef = useRef<() => void>(() => undefined);
  const meter = useCallback(() => {
    const node = analyser.current;
    if (!node) return;
    const data = new Float32Array(node.fftSize);
    node.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const value = Math.abs(data[i]);
      if (value > peak) peak = value;
    }
    if (peak > peakSeen.current) peakSeen.current = peak;
    if (peak > 0.98) clipCount.current += 1;
    setLevel(peak);
    meterFrame.current = requestAnimationFrame(() => meterRef.current());
  }, []);
  useEffect(() => {
    meterRef.current = meter;
  }, [meter]);

  async function openMicrophone() {
    setPhase("checking");
    setMessage(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = media;
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextCtor();
      audioContext.current = context;
      const source = context.createMediaStreamSource(media);
      const node = context.createAnalyser();
      node.fftSize = 1024;
      source.connect(node);
      analyser.current = node;
      peakSeen.current = 0;
      clipCount.current = 0;
      meter();
      // Listen for a moment so silence can be detected before recording starts.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (peakSeen.current < 0.005) setMessage({ tone: "warning", text: "We can hear the microphone but there is no signal yet. Check it is not muted, then say a few words to test the level." });
      else if (peakSeen.current < 0.05) setMessage({ tone: "warning", text: "The microphone level is very low. Move closer or raise the input volume before recording." });
      else setMessage({ tone: "success", text: "Microphone is working. Read the translation aloud when you are ready." });
      setPhase("ready");
    } catch (caught) {
      releaseStream();
      setPhase("idle");
      const name = (caught as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setMessage({ tone: "error", text: "Microphone access was blocked. Allow the microphone for this site in your browser settings and try again." });
      else if (name === "NotFoundError" || name === "OverconstrainedError") setMessage({ tone: "error", text: "No microphone was found. Plug one in or choose another input device, then try again." });
      else if (name === "NotReadableError") setMessage({ tone: "error", text: "The microphone is being used by another application. Close it and try again." });
      else setMessage({ tone: "error", text: "The microphone could not be started. Please check your browser permissions." });
    }
  }

  function startRecording() {
    if (!stream.current) return;
    const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
    const instance = new MediaRecorder(stream.current, preferred ? { mimeType: preferred, audioBitsPerSecond: 128_000 } : undefined);
    chunks.current = [];
    clipCount.current = 0;
    peakSeen.current = 0;
    instance.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    instance.onstop = async () => {
      const type = instance.mimeType || preferred || "audio/webm";
      const recorded = new Blob(chunks.current, { type });
      const url = URL.createObjectURL(recorded);
      setBlob(recorded);
      setBlobUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      const measured = await measureMedia(recorded, "audio");
      setDurationSec(measured.durationSec ?? elapsedRef.current);
      setPhase("recorded");
      if (clipCount.current > 20) setMessage({ tone: "warning", text: "The recording clipped in places (too loud). Listen back; if it sounds distorted, lower the input level and record again." });
      else if (peakSeen.current < 0.05) setMessage({ tone: "warning", text: "The recording is very quiet. Listen back and consider recording again closer to the microphone." });
      else setMessage(null);
      releaseStream();
    };
    recorder.current = instance;
    instance.start(250);
    setElapsed(0);
    elapsedRef.current = 0;
    timer.current = setInterval(() => {
      elapsedRef.current += 0.1;
      setElapsed(elapsedRef.current);
    }, 100);
    setPhase("recording");
    setMessage(null);
  }
  function stopRecording() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    recorder.current?.stop();
  }

  async function approve() {
    if (!blob) return;
    setPhase("uploading");
    try {
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const asset = await uploadAsset(blob, { kind: "audio", name: `${segmentKey}-recording.${extension}`, folder: `projects/${projectId}/narration`, tags: `narration, recording` });
      await onApproved(asset, durationSec || asset.durationSec || 0);
      setPhase("idle");
      setBlob(null);
      setMessage({ tone: "success", text: "Recording saved and attached to this segment." });
    } catch (caught) {
      setPhase("recorded");
      setMessage({ tone: "error", text: (caught as Error).message });
    }
  }

  function discard() {
    setBlob(null);
    setBlobUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setPhase("idle");
    setMessage(null);
  }

  const levelPercent = Math.min(100, Math.round(level * 140));

  return (
    <div className="space-y-3">
      {message && <InlineNotice tone={message.tone}>{message.text}</InlineNotice>}
      <div className="rounded-xl border border-[#d8dde5] bg-[#f7f8fa] p-4">
        <div className="flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#e5e7eb]">
            <div className={`h-full rounded-full transition-[width] duration-75 ${level > 0.98 ? "bg-red-500" : "bg-[#a64026]"}`} style={{ width: `${phase === "ready" || phase === "recording" ? levelPercent : 0}%` }} />
          </div>
          <span className="w-14 text-right text-lg font-extrabold tabular-nums text-[#243447]">{formatElapsed(phase === "recorded" ? durationSec : elapsed)}</span>
        </div>
        <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
          {phase === "idle" && (
            <button type="button" onClick={openMicrophone} disabled={disabled} className="mlp-btn-outline"><Mic className="size-4" /> Test Microphone</button>
          )}
          {phase === "checking" && <span className="inline-flex items-center gap-2 text-sm text-[#6b7c8f]"><Spinner /> Checking microphone…</span>}
          {phase === "ready" && (
            <>
              <button type="button" onClick={startRecording} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b3261e] px-5 font-extrabold text-white hover:bg-[#9a1f18]"><span className="size-2.5 rounded-full bg-white" /> Start Recording</button>
              <button type="button" onClick={() => { releaseStream(); setPhase("idle"); setMessage(null); }} className="mlp-btn-outline"><MicOff className="size-4" /> Cancel</button>
            </>
          )}
          {phase === "recording" && (
            <button type="button" onClick={stopRecording} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#243447] px-5 font-extrabold text-white"><Square className="size-4" /> Stop</button>
          )}
          {phase === "recorded" && blobUrl && (
            <>
              <audio controls src={blobUrl} className="h-11 w-full sm:w-64" />
              <button type="button" onClick={approve} className="mlp-btn-primary"><Check className="size-4" /> Approve &amp; Attach</button>
              <button type="button" onClick={discard} className="mlp-btn-outline"><RotateCcw className="size-4" /> Record Again</button>
            </>
          )}
          {phase === "uploading" && <span className="inline-flex items-center gap-2 text-sm text-[#6b7c8f]"><Spinner /> Saving recording…</span>}
        </div>
        {phase === "idle" && !message && <p className="mt-3 text-xs text-[#6b7c8f]">Read the translation above, press record, then listen back before approving. The recording attaches to this segment automatically.</p>}
        {phase === "ready" && <p className="mt-3 text-xs text-[#6b7c8f]"><Play className="mr-1 inline size-3" />Speak normally; the bar should move without turning red.</p>}
      </div>
    </div>
  );
}

function formatElapsed(seconds: number) {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
