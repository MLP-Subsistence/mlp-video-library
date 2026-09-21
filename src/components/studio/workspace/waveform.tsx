"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Lightweight waveform for timeline audio blocks. Peaks are decoded once per
 * URL in the browser and cached; slices of a full narration reuse the same
 * decode. Falls back to a deterministic pseudo-waveform while decoding.
 */
const peakCache = new Map<string, Promise<Float32Array | null>>();
const PEAKS_PER_SECOND = 20;

async function decodePeaks(url: string): Promise<Float32Array | null> {
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) return null;
    const context = new AudioContextCtor();
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    await context.close();
    const channel = buffer.getChannelData(0);
    const total = Math.max(1, Math.round(buffer.duration * PEAKS_PER_SECOND));
    const peaks = new Float32Array(total);
    const span = Math.max(1, Math.floor(channel.length / total));
    for (let i = 0; i < total; i++) {
      let max = 0;
      const start = i * span;
      const end = Math.min(channel.length, start + span);
      for (let j = start; j < end; j += 4) {
        const value = Math.abs(channel[j]);
        if (value > max) max = value;
      }
      peaks[i] = max;
    }
    return peaks;
  } catch {
    return null;
  }
}

export function useWaveformPeaks(url: string | null) {
  const [state, setState] = useState<{ url: string | null; peaks: Float32Array | null }>({ url: null, peaks: null });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    if (!peakCache.has(url)) peakCache.set(url, decodePeaks(url));
    peakCache.get(url)!.then((result) => {
      if (!cancelled) setState({ url, peaks: result });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state.url === url ? state.peaks : null;
}

export function Waveform({ url, startSec, endSec, seed, className = "" }: { url: string | null; startSec: number; endSec: number; seed: string; className?: string }) {
  const peaks = useWaveformPeaks(url);
  const bars = useMemo(() => {
    const count = 64;
    if (peaks && endSec > startSec) {
      const from = Math.floor(startSec * PEAKS_PER_SECOND);
      const to = Math.max(from + 1, Math.floor(endSec * PEAKS_PER_SECOND));
      const out: number[] = [];
      for (let i = 0; i < count; i++) {
        const a = from + Math.floor(((to - from) * i) / count);
        const b = Math.max(a + 1, from + Math.floor(((to - from) * (i + 1)) / count));
        let max = 0;
        for (let j = a; j < b && j < peaks.length; j++) if (peaks[j] > max) max = peaks[j];
        out.push(Math.min(1, max * 1.4));
      }
      return out;
    }
    // Deterministic placeholder so the track reads as audio before decode finishes.
    let hash = 0;
    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      hash = (hash * 1103515245 + 12345) >>> 0;
      out.push(0.15 + ((hash >>> 8) % 60) / 100);
    }
    return out;
  }, [peaks, startSec, endSec, seed]);
  return (
    <svg viewBox={`0 0 ${bars.length * 3} 40`} preserveAspectRatio="none" className={`h-full w-full ${className}`} aria-hidden="true">
      {bars.map((value, index) => {
        const height = Math.max(2, value * 36);
        return <rect key={index} x={index * 3} y={20 - height / 2} width={2} height={height} rx={1} fill="currentColor" />;
      })}
    </svg>
  );
}
