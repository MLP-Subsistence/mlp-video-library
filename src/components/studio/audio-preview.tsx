"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { Spinner } from "@/components/studio/ui";
import { previewOwner, previewState, stopPreview, subscribePreview, togglePreview } from "@/lib/studio/preview-player";

export { pauseOtherAudio, stopPreview } from "@/lib/studio/preview-player";

export function useAudioPreview() {
  const current = useSyncExternalStore(subscribePreview, previewState, () => null);
  const token = useRef(Symbol("preview-owner"));

  useEffect(() => {
    const mine = token.current;
    return () => {
      if (previewOwner() === mine) stopPreview();
    };
  }, []);

  const toggle = useCallback((id: string, src: string | null | undefined) => togglePreview(id, src, token.current), []);

  return {
    toggle,
    stop: stopPreview,
    isActive: (id: string) => current?.id === id,
    isLoading: (id: string) => current?.id === id && current.status === "loading"
  };
}

/** Round play/pause button for a voice sample; press again to stop it. */
export function PreviewButton({ id, src, label, size = "size-10" }: { id: string; src: string | null | undefined; label: string; size?: string }) {
  const { toggle, isActive, isLoading } = useAudioPreview();
  const active = isActive(id);
  return (
    <button
      type="button"
      onClick={() => toggle(id, src)}
      disabled={!src}
      aria-pressed={active}
      aria-label={active ? `Stop ${label}` : `Play ${label}`}
      title={active ? "Stop" : "Listen"}
      className={`grid ${size} shrink-0 place-items-center rounded-full disabled:opacity-40 ${active ? "bg-[#a64026] text-white" : "bg-[#f2f4f7] text-[#243447] hover:bg-[#e8ebf0]"}`}
    >
      {isLoading(id) ? <Spinner /> : active ? <Pause className="size-4" /> : <Play className="size-4" />}
    </button>
  );
}
