"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blockAtTime } from "@/lib/studio/timing";
import type { ProjectDto, TimelineBlock } from "@/lib/studio/types";

/**
 * Browser preview player. The lesson clock runs on requestAnimationFrame;
 * while a segment's narration exists, a hidden <audio> element plays it and
 * the clock follows the audio so lip-sync with the timeline is exact. During
 * educational pauses (and for segments without narration) the clock simply
 * advances. No rendering is needed to preview: visuals are laid out live.
 */
export type PlayRange = { startSec: number; endSec: number; label: string } | null;

export function usePreviewPlayer(project: ProjectDto) {
  const [timeSec, setTimeSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [range, setRange] = useState<PlayRange>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frame = useRef<number | null>(null);
  const lastTick = useRef<number>(0);
  const timeRef = useRef(0);
  const blockRef = useRef<TimelineBlock | null>(null);
  const projectRef = useRef(project);
  const tickRef = useRef<(now: number) => void>(() => undefined);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const timeline = project.timeline;
  const currentBlock = useMemo(() => blockAtTime(timeline, timeSec), [timeline, timeSec]);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current && typeof window !== "undefined") {
      const element = new Audio();
      element.preload = "auto";
      audioRef.current = element;
    }
    return audioRef.current;
  }, []);

  /** Point the audio element at the narration that covers `time`, seeking inside it. */
  const syncAudio = useCallback(
    (time: number, shouldPlay: boolean) => {
      const audio = ensureAudio();
      if (!audio) return;
      const current = projectRef.current;
      const block = blockAtTime(current.timeline, time);
      blockRef.current = block;
      const segment = block ? current.segments.find((entry) => entry.segmentId === block.segmentId) : null;
      const narration = segment?.narration;
      const localTime = block ? time - block.startSec - block.pauseBeforeSec : -1;
      const withinNarration = block && narration?.url && narration.durationSec > 0 && localTime >= 0 && localTime < narration.durationSec;
      if (!withinNarration || !narration?.url || !block) {
        if (!audio.paused) audio.pause();
        return;
      }
      const offset = (narration.startSec ?? 0) + localTime;
      if (audio.src !== narration.url) {
        audio.src = narration.url;
        audio.load();
      }
      const seekTo = Math.max(0, offset);
      if (Math.abs(audio.currentTime - seekTo) > 0.25) {
        try {
          audio.currentTime = seekTo;
        } catch {
          audio.addEventListener("loadedmetadata", () => (audio.currentTime = seekTo), { once: true });
        }
      }
      if (shouldPlay && audio.paused) void audio.play().catch(() => undefined);
      if (!shouldPlay && !audio.paused) audio.pause();
    },
    [ensureAudio]
  );

  const stop = useCallback(() => {
    setPlaying(false);
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    audioRef.current?.pause();
  }, []);

  const tick = useCallback(
    (now: number) => {
      const dt = Math.min(0.25, (now - lastTick.current) / 1000);
      lastTick.current = now;
      const current = projectRef.current;
      const audio = audioRef.current;
      let next = timeRef.current + dt;
      const block = blockAtTime(current.timeline, timeRef.current);
      const segment = block ? current.segments.find((entry) => entry.segmentId === block.segmentId) : null;
      const narration = segment?.narration;
      if (block && narration?.url && narration.durationSec > 0 && audio && audio.src === narration.url && !audio.paused && !audio.ended) {
        const audioOffset = audio.currentTime - (narration.startSec ?? 0);
        if (audioOffset >= 0 && audioOffset <= narration.durationSec + 0.05) next = block.startSec + block.pauseBeforeSec + Math.min(audioOffset, narration.durationSec);
      }
      const limit = range ? range.endSec : current.timeline.totalSec;
      if (next >= limit) {
        timeRef.current = limit;
        setTimeSec(limit);
        stop();
        return;
      }
      timeRef.current = next;
      setTimeSec(next);
      const nextBlock = blockAtTime(current.timeline, next);
      const nextSegment = nextBlock ? current.segments.find((entry) => entry.segmentId === nextBlock.segmentId) : null;
      const narrationLocalTime = nextBlock ? next - nextBlock.startSec - nextBlock.pauseBeforeSec : -1;
      const shouldPlayNarration = Boolean(nextSegment?.narration.url && narrationLocalTime >= 0 && narrationLocalTime < nextSegment.narration.durationSec);
      if (nextBlock?.segmentId !== blockRef.current?.segmentId || (shouldPlayNarration && (audio?.paused || audio?.src !== nextSegment?.narration.url))) syncAudio(next, true);
      else if (!shouldPlayNarration && audio && !audio.paused) audio.pause();
      frame.current = requestAnimationFrame((next) => tickRef.current(next));
    },
    [range, stop, syncAudio]
  );

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const play = useCallback(
    (from?: number) => {
      const start = from ?? timeRef.current;
      const limit = range ? range.endSec : projectRef.current.timeline.totalSec;
      const time = start >= limit - 0.01 ? (range ? range.startSec : 0) : start;
      timeRef.current = time;
      setTimeSec(time);
      setPlaying(true);
      lastTick.current = performance.now();
      syncAudio(time, true);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(tick);
    },
    [range, syncAudio, tick]
  );

  const seek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(projectRef.current.timeline.totalSec, time));
      timeRef.current = clamped;
      setTimeSec(clamped);
      syncAudio(clamped, playing);
    },
    [playing, syncAudio]
  );

  const playRange = useCallback(
    (startSec: number, endSec: number, label: string) => {
      setRange({ startSec, endSec, label });
      timeRef.current = startSec;
      setTimeSec(startSec);
      setPlaying(true);
      lastTick.current = performance.now();
      blockRef.current = null;
      syncAudio(startSec, true);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame((now) => {
        lastTick.current = now;
        frame.current = requestAnimationFrame(tick);
      });
    },
    [syncAudio, tick]
  );

  const playSegment = useCallback(
    (segmentId: string) => {
      const block = projectRef.current.timeline.blocks.find((entry) => entry.segmentId === segmentId);
      if (block) playRange(block.startSec, block.endSec, block.title);
    },
    [playRange]
  );

  const playAround = useCallback(
    (segmentId: string) => {
      const blocks = projectRef.current.timeline.blocks;
      const index = blocks.findIndex((entry) => entry.segmentId === segmentId);
      if (index < 0) return;
      const start = blocks[Math.max(0, index - 1)].startSec;
      const end = blocks[Math.min(blocks.length - 1, index + 1)].endSec;
      playRange(start, end, `Around ${blocks[index].title}`);
    },
    [playRange]
  );

  const playFull = useCallback(() => {
    setRange(null);
    play(0);
  }, [play]);

  const pause = useCallback(() => stop(), [stop]);

  useEffect(() => () => stop(), [stop]);

  // Keep the clock sane when narration lengths change underneath us.
  useEffect(() => {
    if (timeRef.current > project.timeline.totalSec) {
      timeRef.current = project.timeline.totalSec;
      setTimeSec(project.timeline.totalSec);
    }
  }, [project.timeline.totalSec]);

  return { timeSec, playing, range, currentBlock, play, pause, seek, playSegment, playAround, playFull, clearRange: () => setRange(null) };
}

export type PreviewPlayer = ReturnType<typeof usePreviewPlayer>;
