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
