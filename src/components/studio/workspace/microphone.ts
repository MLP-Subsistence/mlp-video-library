"use client";

/**
 * One microphone for the whole workspace. Opening it once and keeping it
 * warm while educators move from segment to segment means "Record" starts
 * instantly every time; the browser only asks for permission the first time.
 * When no recorder is on screen for a while, the stream is released so the
 * browser's microphone indicator goes off.
 */
const RELEASE_AFTER_MS = 90_000;

type Mic = { stream: MediaStream; context: AudioContext; analyser: AnalyserNode };

let mic: Mic | null = null;
let opening: Promise<Mic> | null = null;
let holders = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function live(current: Mic | null): current is Mic {
  return Boolean(current && current.stream.getAudioTracks().some((track) => track.readyState === "live"));
}

export async function openMicrophone(): Promise<Mic> {
  if (live(mic)) {
    if (mic.context.state === "suspended") await mic.context.resume().catch(() => undefined);
    return mic;
  }
  if (opening) return opening;
  opening = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const context = new AudioContextCtor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    mic = { stream, context, analyser };
    return mic;
  })();
  try {
    return await opening;
  } finally {
    opening = null;
  }
}

function closeMicrophone() {
  mic?.stream.getTracks().forEach((track) => track.stop());
  void mic?.context.close().catch(() => undefined);
  mic = null;
}

/** A recorder is on screen: keep the microphone open. Returns the matching release. */
export function holdMicrophone() {
  holders += 1;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) {
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        if (holders === 0) closeMicrophone();
      }, RELEASE_AFTER_MS);
    }
  };
}

export function microphoneErrorMessage(caught: unknown) {
  const name = (caught as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. Allow the microphone for this site (the icon at the left of the address bar), then press Record again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found. Plug one in or choose another input device, then press Record again.";
  if (name === "NotReadableError") return "Another application is using the microphone. Close it and press Record again.";
  return "The microphone could not be started. Check your browser's microphone permission and press Record again.";
}
