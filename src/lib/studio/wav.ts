/**
 * Tiny WAV helpers: build a PCM WAV buffer and read a WAV file's duration.
 * No native dependencies so they work in Next route handlers and the worker.
 */

export function buildWav(samples: Float32Array, sampleRate = 22050) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }
  return buffer;
}

/** A quiet, obviously synthetic placeholder: soft ticks every second over near-silence. */
export function buildPlaceholderSpeech(durationSec: number, sampleRate = 22050) {
  const length = Math.max(1, Math.round(durationSec * sampleRate));
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const withinSecond = t % 1;
    if (withinSecond < 0.08) {
      const envelope = Math.sin((withinSecond / 0.08) * Math.PI);
      samples[i] = Math.sin(2 * Math.PI * 440 * t) * 0.12 * envelope;
    } else {
      samples[i] = 0;
    }
  }
  return buildWav(samples, sampleRate);
}

export function readWavDurationSec(bytes: Buffer): number | null {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") byteRate = bytes.readUInt32LE(offset + 16);
    if (chunkId === "data") return byteRate > 0 ? chunkSize / byteRate : null;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return null;
}

/** Rough speaking-time estimate used for mock voice and credit previews. */
export function estimateSpeechSeconds(text: string, wordsPerMinute = 150) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(((words / wordsPerMinute) * 60) * 10) / 10);
}
