/**
 * One voice-sample player for the whole Studio: pressing a voice's play
 * button while it plays stops it, and starting another voice stops the
 * first, so two previews never overlap. Plain module (no React) so it can
 * be unit-tested; the hook and button live in components/studio/audio-preview.tsx.
 */
type PreviewState = { id: string; status: "loading" | "playing" } | null;

let audio: HTMLAudioElement | null = null;
let state: PreviewState = null;
let owner: symbol | null = null;
const listeners = new Set<() => void>();

export function previewOwner() {
  return owner;
}

function setState(next: PreviewState) {
  state = next;
  for (const listener of listeners) listener();
}

export function stopPreview() {
  if (audio) {
    audio.onplaying = audio.onended = audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  audio = null;
  owner = null;
  setState(null);
}

export function previewState() {
  return state;
}

/** Same id while it plays: stop. Anything else: stop what's playing, then play this. */
export function togglePreview(id: string, src: string | null | undefined, by: symbol | null = null) {
  if (state?.id === id) {
    stopPreview();
    return;
  }
  stopPreview();
  if (!src) return;
  pauseOtherAudio(null);
  const next = new Audio(src);
  audio = next;
  owner = by;
  setState({ id, status: "loading" });
  next.onplaying = () => {
    if (audio === next) setState({ id, status: "playing" });
  };
  next.onended = next.onerror = () => {
    if (audio === next) stopPreview();
  };
  void next.play().catch(() => {
    if (audio === next) stopPreview();
  });
}

const externalPlayers = new Set<() => void>();

/** Players that live outside this module (the workspace lesson preview) register how to stop themselves. */
export function registerExternalPlayer(stop: () => void) {
  externalPlayers.add(stop);
  return () => {
    externalPlayers.delete(stop);
  };
}

/**
 * Something is about to make sound: stop the lesson preview (except `keepExternal`)
 * and pause every on-page player marked `data-exclusive-audio` except `keep`,
 * so nothing ever talks over anything else.
 */
export function pauseOtherAudio(keep: HTMLAudioElement | null, keepExternal?: () => void) {
  for (const stop of externalPlayers) if (stop !== keepExternal) stop();
  if (typeof document === "undefined") return;
  for (const element of document.querySelectorAll<HTMLAudioElement>("audio[data-exclusive-audio]")) if (element !== keep) element.pause();
}

export function subscribePreview(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
