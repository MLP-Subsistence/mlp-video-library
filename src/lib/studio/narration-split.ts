/**
 * Splitting one long narration recording into per-segment slices, entirely
 * in the browser (no worker, no speech recognition, works in any language).
 *
 * The recording is reduced to a loudness envelope. Pauses are runs of quiet
 * windows; each boundary between two segments is placed in the pause that
 * best fits where that boundary is expected (from script lengths, or from the
 * original English video's timing). Each slice is then trimmed to its speech.
 */

export const WINDOW_SEC = 0.02;
const MIN_PAUSE_SEC = 0.22;
const PAD_SEC = 0.08;

export type Slice = { startSec: number; endSec: number };

/** RMS loudness per `WINDOW_SEC` window. */
export function loudnessEnvelope(samples: Float32Array, sampleRate: number, windowSec = WINDOW_SEC) {
  const size = Math.max(1, Math.round(sampleRate * windowSec));
  const out = new Float32Array(Math.ceil(samples.length / size));
  for (let w = 0; w < out.length; w++) {
    let sum = 0;
    const start = w * size;
    const end = Math.min(samples.length, start + size);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    out[w] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return out;
}

function percentile(values: Float32Array, p: number) {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))] ?? 0;
}

export function voicedMask(envelope: Float32Array) {
  const floor = percentile(envelope, 0.1);
  const loud = percentile(envelope, 0.9);
  const threshold = Math.max(floor + 0.12 * (loud - floor), 1e-4);
  return Array.from(envelope, (value) => value > threshold);
}

type Pause = { startSec: number; endSec: number; midSec: number; lengthSec: number };

/** Quiet stretches between the first and last speech, long enough to be a pause rather than a gap between words. */
export function findPauses(voiced: boolean[], windowSec = WINDOW_SEC): Pause[] {
  const first = voiced.indexOf(true);
  const last = voiced.lastIndexOf(true);
  const pauses: Pause[] = [];
  if (first < 0) return pauses;
  let run = -1;
  for (let i = first; i <= last + 1; i++) {
    const quiet = i <= last && !voiced[i];
    if (quiet && run < 0) run = i;
    if (!quiet && run >= 0) {
      const lengthSec = (i - run) * windowSec;
      if (lengthSec >= MIN_PAUSE_SEC) pauses.push({ startSec: run * windowSec, endSec: i * windowSec, midSec: ((run + i) / 2) * windowSec, lengthSec });
      run = -1;
    }
  }
  return pauses;
}

/**
 * Pick exactly `expectedCuts.length` boundaries, in order: each from a real
 * pause when one is close enough, weighing a longer pause against distance
 * from where the boundary is expected. Falls back to the expected position
 * itself when no pause fits (the recording ran on without stopping).
 */
export function chooseCuts(pauses: Pause[], expectedCuts: number[], spanSec: number, strictness = 6): number[] {
  const n = expectedCuts.length;
  if (n === 0) return [];
  type Candidate = { sec: number; strength: number };
  const candidates: Candidate[] = [
    ...pauses.map((pause) => ({ sec: pause.midSec, strength: Math.log1p(pause.lengthSec * 4) })),
    ...expectedCuts.map((sec) => ({ sec, strength: -0.35 }))
  ].sort((a, b) => a.sec - b.sec);
  const c = candidates.length;
  const scale = Math.max(1, spanSec);
  const score = (k: number, j: number) => candidates[j].strength - (strictness * Math.abs(candidates[j].sec - expectedCuts[k])) / scale;
  const best: number[][] = Array.from({ length: n }, () => new Array<number>(c).fill(-Infinity));
  const from: number[][] = Array.from({ length: n }, () => new Array<number>(c).fill(-1));
  for (let j = 0; j < c; j++) best[0][j] = score(0, j);
  for (let k = 1; k < n; k++) {
    let runningBest = -Infinity;
    let runningIndex = -1;
    for (let j = 0; j < c; j++) {
      if (j > 0 && best[k - 1][j - 1] > runningBest) {
        runningBest = best[k - 1][j - 1];
        runningIndex = j - 1;
      }
      if (runningIndex >= 0 && candidates[j].sec > candidates[runningIndex].sec) {
        best[k][j] = runningBest + score(k, j);
        from[k][j] = runningIndex;
      }
    }
  }
  let end = 0;
  for (let j = 1; j < c; j++) if (best[n - 1][j] > best[n - 1][end]) end = j;
  const picked: number[] = new Array(n);
  for (let k = n - 1, j = end; k >= 0; k--) {
    picked[k] = candidates[j].sec;
    j = from[k][j];
  }
  return picked;
}

/** Turn boundaries into per-segment slices trimmed to their speech (with a little padding). */
export function slicesFromCuts(voiced: boolean[], cuts: number[], windowSec = WINDOW_SEC): Slice[] {
  const first = Math.max(0, voiced.indexOf(true));
  const last = Math.max(first, voiced.lastIndexOf(true));
  const edges = [first * windowSec, ...cuts, (last + 1) * windowSec];
  const slices: Slice[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const regionStart = edges[i];
    const regionEnd = Math.max(regionStart + 0.2, edges[i + 1]);
    let from = -1;
    let to = -1;
    for (let w = Math.floor(regionStart / windowSec); w < Math.ceil(regionEnd / windowSec) && w < voiced.length; w++) {
      if (!voiced[w]) continue;
      if (from < 0) from = w;
      to = w;
    }
    const startSec = from < 0 ? regionStart : Math.max(regionStart, from * windowSec - PAD_SEC);
    const endSec = from < 0 ? regionEnd : Math.min(regionEnd, (to + 1) * windowSec + PAD_SEC);
    slices.push({ startSec: round(startSec), endSec: round(Math.max(startSec + 0.2, endSec)) });
  }
  return slices;
}

/** Boundaries expected from how long each segment's text is. */
export function expectedCutsFromWeights(weights: number[], speechStartSec: number, speechEndSec: number) {
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const span = speechEndSec - speechStartSec;
  const cuts: number[] = [];
  let acc = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    acc += weights[i];
    cuts.push(speechStartSec + (acc / total) * span);
  }
  return cuts;
}

/**
 * Boundaries expected from the original English video: for a dub of the whole
 * video, segment N speaks at about the same moment as in the original (scaled
 * if the recording is a little longer or shorter).
 */
export function expectedCutsFromOriginal(sources: Array<{ startSec: number; endSec: number }>, audioDurationSec: number, originalDurationSec: number) {
  const scale = originalDurationSec > 0 ? audioDurationSec / originalDurationSec : 1;
  const cuts: number[] = [];
  for (let i = 0; i < sources.length - 1; i++) cuts.push(((sources[i].endSec + sources[i + 1].startSec) / 2) * scale);
  return cuts;
}

export function suggestSlices(envelope: Float32Array, expectedCuts: number[], strictness = 6, windowSec = WINDOW_SEC): Slice[] {
  const voiced = voicedMask(envelope);
  const first = voiced.indexOf(true);
  const last = voiced.lastIndexOf(true);
  if (first < 0) {
    const total = envelope.length * windowSec;
    const step = total / (expectedCuts.length + 1);
    return Array.from({ length: expectedCuts.length + 1 }, (_, i) => ({ startSec: round(i * step), endSec: round((i + 1) * step) }));
  }
  const cuts = chooseCuts(findPauses(voiced, windowSec), expectedCuts, (last - first) * windowSec, strictness);
  return slicesFromCuts(voiced, cuts, windowSec);
}

/** 16-bit mono PCM WAV, built in the browser (the recording's upload format when it came from a video). */
export function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return buffer;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
