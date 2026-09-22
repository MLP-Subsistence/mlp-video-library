import sharp from "sharp";

/**
 * Perceptual hash (pHash, 64-bit) for matching lesson frames against the
 * account's licensed Shutterstock images. Robust to scaling/compression;
 * moderately tolerant of cropping when several crops are tried.
 */
const SIZE = 32;
const LOW = 8;

function dct2d(matrix: number[][]) {
  const n = SIZE;
  const out: number[][] = Array.from({ length: LOW }, () => new Array<number>(LOW).fill(0));
  const cos = Array.from({ length: n }, (_, x) => Array.from({ length: LOW }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n))));
  for (let u = 0; u < LOW; u++) {
    for (let v = 0; v < LOW; v++) {
      let sum = 0;
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) sum += matrix[x][y] * cos[x][u] * cos[y][v];
      }
      const cu = u === 0 ? Math.SQRT1_2 : 1;
      const cv = v === 0 ? Math.SQRT1_2 : 1;
      out[u][v] = (2 / n) * cu * cv * sum;
    }
  }
  return out;
}

export async function phash(input: Buffer | string, region?: { left: number; top: number; width: number; height: number }): Promise<bigint> {
  let image = sharp(input).rotate();
  if (region) image = image.extract(region);
  const { data } = await image.grayscale().resize(SIZE, SIZE, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const matrix: number[][] = [];
  for (let x = 0; x < SIZE; x++) {
    matrix.push([]);
    for (let y = 0; y < SIZE; y++) matrix[x].push(data[x * SIZE + y]);
  }
  const dct = dct2d(matrix);
  const values: number[] = [];
  for (let u = 0; u < LOW; u++) for (let v = 0; v < LOW; v++) if (u !== 0 || v !== 0) values.push(dct[u][v]);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let hash = BigInt(0);
  for (let u = 0; u < LOW; u++) {
    for (let v = 0; v < LOW; v++) {
      hash = (hash << BigInt(1)) | (dct[u][v] > median ? BigInt(1) : BigInt(0));
    }
  }
  return hash;
}

export function hamming(a: bigint, b: bigint) {
  let x = a ^ b;
  let count = 0;
  while (x) {
    count += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return count;
}

/** Hashes of the whole frame plus centred crops, so a stock image the video cropped still matches. */
export async function frameHashes(input: Buffer) {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const crops = [1, 0.9, 0.8, 0.7].map((scale) => ({
    left: Math.round((width * (1 - scale)) / 2),
    top: Math.round((height * (1 - scale)) / 2),
    width: Math.max(8, Math.round(width * scale)),
    height: Math.max(8, Math.round(height * scale))
  }));
  const hashes: bigint[] = [];
  for (const crop of crops) hashes.push(await phash(input, crop));
  // Also: the slide may show the image fitted by height with the sides cut — try the 16:9 centre and the 3:2 centre.
  for (const ratio of [16 / 9, 3 / 2, 4 / 3]) {
    const targetWidth = Math.min(width, Math.round(height * ratio));
    hashes.push(await phash(input, { left: Math.round((width - targetWidth) / 2), top: 0, width: targetWidth, height }));
  }
  return hashes;
}

export function bestDistance(frame: bigint[], candidate: bigint) {
  return Math.min(...frame.map((hash) => hamming(hash, candidate)));
}

/**
 * The lesson videos "Ken Burns" the photos: a 16:9 window, often zoomed to
 * 45–100 % of the original and panned. To find the original behind a frame we
 * hash many 16:9 windows of the original (zoom levels × 3×3 anchors), each
 * reduced to its top `keep` share so it lines up with a caption-cropped frame.
 */
export async function windowHashes(input: Buffer, keep = 0.8) {
  const base = sharp(input).rotate();
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return [] as bigint[];
  const hashes: bigint[] = [];
  const seen = new Set<string>();
  // Landscape 16:9 windows (single-photo segments, caption band removed) and
  // portrait ~3:4 windows (one column of a 2- or 3-photo collage).
  const shapes: Array<{ ratio: number; keepShare: number }> = [
    { ratio: 16 / 9, keepShare: keep },
    { ratio: 0.74, keepShare: 1 }
  ];
  for (const shape of shapes) {
    const fullWindowWidth = Math.min(width, Math.floor(height * shape.ratio));
    const zooms = shape.ratio > 1 ? [1, 0.85, 0.7, 0.55, 0.45] : [1, 0.9, 0.8, 0.7, 0.55];
    for (const zoom of zooms) {
      const w = Math.max(16, Math.floor(fullWindowWidth * zoom));
      const h = Math.max(9, Math.floor(w / shape.ratio));
      if (h > height) continue;
      const xAnchors = zoom === 1 && shape.ratio > 1 ? [0.5] : [0.15, 0.5, 0.85];
      // Collage columns are usually cut from the top of a full-height strip, so include the edges vertically.
      const yAnchors = shape.ratio > 1 ? (zoom === 1 ? [0.5] : [0.15, 0.5, 0.85]) : [0, 0.25, 0.5, 0.75, 1];
      for (const ax of xAnchors) {
        for (const ay of yAnchors) {
          const left = Math.round((width - w) * ax);
          const top = Math.round((height - h) * ay);
          const region = { left, top, width: w, height: Math.max(8, Math.floor(h * shape.keepShare)) };
        const key = `${region.left}:${region.top}:${region.width}:${region.height}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hashes.push(await phash(input, region));
        }
      }
    }
  }
  return hashes;
}

export function minDistance(frameHash: bigint, candidateHashes: bigint[]) {
  let best = 64;
  for (const hash of candidateHashes) {
    const distance = hamming(frameHash, hash);
    if (distance < best) best = distance;
  }
  return best;
}
