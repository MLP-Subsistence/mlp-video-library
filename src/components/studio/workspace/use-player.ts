"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pauseOtherAudio, registerExternalPlayer, stopPreview } from "@/lib/studio/preview-player";
import { blockAtTime } from "@/lib/studio/timing";
import type { ProjectDto, TimelineBlock } from "@/lib/studio/types";

/**
 * Browser preview player. The lesson clock runs on requestAnimationFrame and
 * follows the narration audio while a segment speaks, so the timeline and
 * voice stay in step; during pauses (and segments without narration) the
 * clock simply advances.
 *
 * Each narration file gets its own preloaded <audio> element, and the next
 * segment's file is loaded ahead of time. When a narration is still loading,
 * the clock waits for it instead of running on, so the first words of a
 * segment are never skipped, and every play starts the same way.
 */
export type PlayRange = { startSec: number; endSec: number; label: string; kind: "segment" | "context" } | null;

const MAX_AUDIO_ELEMENTS = 8;
/** Give up waiting for a narration that won't load, rather than freezing the preview. */
const MAX_WAIT_MS = 4000;

type NarrationSpot = { block: TimelineBlock; url: string; startSec: number; durationSec: number; localTime: number; inside: boolean } | null;

function absolute(url: string) {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

export function usePreviewPlayer(project: ProjectDto) {
  const [timeSec, setTimeSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [range, setRangeState] = useState<PlayRange>(null);
  const rangeRef = useRef<PlayRange>(null);
  const elements = useRef(new Map<string, HTMLAudioElement>());
  const active = useRef<HTMLAudioElement | null>(null);
  const frame = useRef<number | null>(null);
  const lastTick = useRef(0);
  const waitingSince = useRef<number | null>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const tickRef = useRef<(now: number) => void>(() => undefined);
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const timeline = project.timeline;
  const currentBlock = useMemo(() => blockAtTime(timeline, timeSec), [timeline, timeSec]);

  const setRange = (next: PlayRange) => {
    rangeRef.current = next;
    setRangeState(next);
  };

  const element = useCallback((url: string) => {
    const key = absolute(url);
    const cache = elements.current;
    let audio = cache.get(key);
    if (audio) {
      cache.delete(key);
      cache.set(key, audio);
      return audio;
    }
    audio = new Audio();
    audio.preload = "auto";
    audio.src = key;
    cache.set(key, audio);
    while (cache.size > MAX_AUDIO_ELEMENTS) {
      const [oldestKey, oldest] = cache.entries().next().value as [string, HTMLAudioElement];
      if (oldest === active.current) break;
      oldest.pause();
      oldest.removeAttribute("src");
      oldest.load();
      cache.delete(oldestKey);
    }
    return audio;
  }, []);

  const narrationAt = useCallback((time: number): NarrationSpot => {
    const current = projectRef.current;
    const block = blockAtTime(current.timeline, time);
    if (!block) return null;
    const segment = current.segments.find((entry) => entry.segmentId === block.segmentId);
    const narration = segment?.narration;
    if (!narration?.url || narration.durationSec <= 0) return null;
    const localTime = time - block.startSec - block.pauseBeforeSec;
    return { block, url: narration.url, startSec: narration.startSec ?? 0, durationSec: narration.durationSec, localTime, inside: localTime >= 0 && localTime < narration.durationSec };
  }, []);

  /** Load the narration of the block after `block`, so the hand-over is seamless. */
  const preloadAfter = useCallback(
    (block: TimelineBlock) => {
      const next = projectRef.current.timeline.blocks[block.index + 1];
      if (!next) return;
      const segment = projectRef.current.segments.find((entry) => entry.segmentId === next.segmentId);
      if (segment?.narration.url) element(segment.narration.url);
    },
    [element]
  );

  /** Point the right audio element at `time`, and play or pause it. */
  const syncAudio = useCallback(
    (time: number, shouldPlay: boolean) => {
      const spot = narrationAt(time);
      if (!spot || !spot.inside) {
        active.current?.pause();
        if (spot) preloadAfter(spot.block);
        return;
      }
      const audio = element(spot.url);
      if (active.current && active.current !== audio) active.current.pause();
      active.current = audio;
      const target = spot.startSec + Math.max(0, spot.localTime);
      if (audio.ended || Math.abs(audio.currentTime - target) > 0.25) {
        if (audio.readyState >= 1) audio.currentTime = target;
        else audio.addEventListener("loadedmetadata", () => (audio.currentTime = target), { once: true });
      }
      if (shouldPlay && audio.paused) void audio.play().catch(() => undefined);
      if (!shouldPlay && !audio.paused) audio.pause();
      preloadAfter(spot.block);
    },
    [element, narrationAt, preloadAfter]
  );

  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    setBuffering(false);
    waitingSince.current = null;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    active.current?.pause();
  }, []);

  // Voice samples, recordings and the original clip stop the lesson preview when they start, and vice versa.
  const externalStop = useRef<() => void>(() => undefined);
  useEffect(() => {
    const stopFromOutside = () => stop();
    externalStop.current = stopFromOutside;
    return registerExternalPlayer(stopFromOutside);
  }, [stop]);

  const tick = useCallback(
    (now: number) => {
      if (!playingRef.current) return;
      const dt = Math.min(0.25, (now - lastTick.current) / 1000);
      lastTick.current = now;
      const time = timeRef.current;
      const spot = narrationAt(time);
      let next = time + dt;
      let waiting = false;
      if (spot?.inside) {
        const audio = active.current;
        const ours = audio && audio.src === absolute(spot.url);
        if (ours && !audio.paused && !audio.seeking && audio.readyState >= 3) {
          const offset = audio.currentTime - spot.startSec;
          next = spot.block.startSec + spot.block.pauseBeforeSec + Math.max(0, offset);
          if (offset >= spot.durationSec) audio.pause();
          waitingSince.current = null;
        } else if (!(ours && audio.ended)) {
          // The narration is still loading or seeking: hold the clock so its first words aren't skipped.
          waitingSince.current ??= now;
          if (now - waitingSince.current < MAX_WAIT_MS) {
            next = time;
            waiting = true;
          }
          if (!ours || audio.paused) syncAudio(time, true);
        }
      }
      setBuffering(waiting);
      const limit = rangeRef.current ? rangeRef.current.endSec : projectRef.current.timeline.totalSec;
      if (next >= limit) {
        timeRef.current = limit;
        setTimeSec(limit);
        stop();
        return;
      }
      timeRef.current = next;
      setTimeSec(next);
      if (!waiting) {
        const upcoming = narrationAt(next);
        if (upcoming?.inside) {
          const audio = active.current;
          // A narration that already played to its end stays finished (play() would restart it from 0).
          if (!audio || audio.src !== absolute(upcoming.url) || (audio.paused && !audio.ended)) syncAudio(next, true);
        } else if (active.current && !active.current.paused) {
          active.current.pause();
          if (upcoming) preloadAfter(upcoming.block);
        }
      }
      frame.current = requestAnimationFrame((stamp) => tickRef.current(stamp));
    },
    [narrationAt, preloadAfter, stop, syncAudio]
  );
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const start = useCallback(
    (time: number) => {
      stopPreview();
      pauseOtherAudio(null, externalStop.current);
      timeRef.current = time;
      setTimeSec(time);
      waitingSince.current = null;
      playingRef.current = true;
      setPlaying(true);
      syncAudio(time, true);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame((stamp) => {
        lastTick.current = stamp;
        frame.current = requestAnimationFrame((next) => tickRef.current(next));
      });
    },
    [syncAudio]
  );

  const play = useCallback(
    (from?: number) => {
      const current = rangeRef.current;
      const limit = current ? current.endSec : projectRef.current.timeline.totalSec;
      const requested = from ?? timeRef.current;
      start(requested >= limit - 0.01 ? (current ? current.startSec : 0) : requested);
    },
    [start]
  );

  const seek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(projectRef.current.timeline.totalSec, time));
      timeRef.current = clamped;
      setTimeSec(clamped);
      waitingSince.current = null;
      syncAudio(clamped, playingRef.current);
    },
    [syncAudio]
  );

  const playRange = useCallback(
    (startSec: number, endSec: number, label: string, kind: "segment" | "context") => {
      setRange({ startSec, endSec, label, kind });
      start(startSec);
    },
    [start]
  );

  const playSegment = useCallback(
    (segmentId: string) => {
      const block = projectRef.current.timeline.blocks.find((entry) => entry.segmentId === segmentId);
      if (block) playRange(block.startSec, block.endSec, block.title, "segment");
    },
    [playRange]
  );

  const playAround = useCallback(
    (segmentId: string) => {
      const blocks = projectRef.current.timeline.blocks;
      const index = blocks.findIndex((entry) => entry.segmentId === segmentId);
      if (index < 0) return;
      const from = blocks[Math.max(0, index - 1)].startSec;
      const to = blocks[Math.min(blocks.length - 1, index + 1)].endSec;
      playRange(from, to, `In context: ${blocks[index].title}`, "context");
    },
    [playRange]
  );

  const playFull = useCallback(() => {
    setRange(null);
    start(0);
  }, [start]);

  const pause = useCallback(() => stop(), [stop]);

  useEffect(() => {
    const cache = elements.current;
    return () => {
      stop();
      for (const audio of cache.values()) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      cache.clear();
    };
  }, [stop]);

  // Warm up the first segments' narration so the first press of Play starts promptly.
  useEffect(() => {
    for (const block of project.timeline.blocks.slice(0, 2)) {
      const segment = project.segments.find((entry) => entry.segmentId === block.segmentId);
      if (segment?.narration.url) element(segment.narration.url);
    }
  }, [element, project.segments, project.timeline.blocks]);

  // Keep the clock sane when narration lengths change underneath us.
  useEffect(() => {
    if (timeRef.current > project.timeline.totalSec) {
      timeRef.current = project.timeline.totalSec;
      setTimeSec(project.timeline.totalSec);
    }
  }, [project.timeline.totalSec]);

  return { timeSec, playing, buffering, range, currentBlock, play, pause, seek, playSegment, playAround, playFull, clearRange: () => setRange(null) };
}

export type PreviewPlayer = ReturnType<typeof usePreviewPlayer>;
