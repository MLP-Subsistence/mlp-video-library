import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sources = [
  ["vocations", "C:/Users/uwish/Downloads/ChatGPT Image Jul 31, 2026, 09_40_29 PM (6).png"],
  ["online", "C:/Users/uwish/Downloads/ChatGPT Image Jul 31, 2026, 09_40_29 PM (7).png"],
  ["image-diaries", "C:/Users/uwish/Downloads/ChatGPT Image Jul 31, 2026, 09_40_27 PM (1).png"],
  ["doodle", "C:/Users/uwish/Downloads/ChatGPT Image Jul 31, 2026, 09_40_27 PM (2).png"],
  ["animation", "C:/Users/uwish/Downloads/ChatGPT Image Jul 31, 2026, 09_40_28 PM (3).png"],
  ["videoscribe", "C:/Users/uwish/Downloads/ChatGPT Image Jul 31, 2026, 09_40_28 PM (4).png"],
  ["global", "C:/Users/uwish/Downloads/ChatGPT Image Jul 31, 2026, 09_40_28 PM (5).png"]
];

const outputDir = path.join(process.cwd(), "public", "icons", "categories");
const targetSize = 512;
const iconMaxSize = 390;

function isSubjectPixel(r, g, b, alpha) {
  if (alpha < 32) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const navyLine = saturation > 0.13 && luma < 150 && b >= Math.min(r + 6, 255);
  const orangeAccent = r > 145 && g > 55 && g < 205 && b < 175 && r > g + 18;
  const darkInk = saturation > 0.18 && luma < 105;
  return navyLine || orangeAccent || darkInk;
}

function subjectBounds(buffer, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!isSubjectPixel(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3])) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) {
    return { left: 0, top: 0, width, height };
  }

  const pad = Math.round(Math.max(width, height) * 0.055);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(width - 1, maxX + pad);
  const bottom = Math.min(height - 1, maxY + pad);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function matteToTransparent(buffer, width, height) {
  const pixels = width * height;
  const background = new Uint8Array(pixels);
  const queue = [];

  function push(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (background[pixel]) return;
    const i = pixel * 4;
    if (isSubjectPixel(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3])) return;
    background[pixel] = 1;
    queue.push(pixel);
  }

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }

  for (let head = 0; head < queue.length; head++) {
    const pixel = queue[head];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  const alpha = Buffer.alloc(pixels);
  for (let pixel = 0; pixel < pixels; pixel++) {
    const i = pixel * 4;
    alpha[pixel] = background[pixel] ? 0 : buffer[i + 3];
  }
  return alpha;
}

async function saveWebp(pngBuffer, outFile) {
  for (const quality of [90, 84, 78, 72]) {
    const webp = await sharp(pngBuffer).webp({ quality, effort: 6 }).toBuffer();
    await fs.writeFile(outFile, webp);
    if (webp.length <= 150 * 1024 || quality === 72) return webp.length;
  }
  return 0;
}

await fs.mkdir(outputDir, { recursive: true });

for (const [slug, source] of sources) {
  const sourcePath = path.normalize(source);
  await fs.access(sourcePath);

  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bounds = subjectBounds(data, info.width, info.height);
  const crop = await sharp(sourcePath)
    .extract(bounds)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const alpha = matteToTransparent(crop.data, crop.info.width, crop.info.height);
  const rgba = await sharp(crop.data, {
    raw: { width: crop.info.width, height: crop.info.height, channels: 4 }
  })
    .removeAlpha()
    .joinChannel(alpha, { raw: { width: crop.info.width, height: crop.info.height, channels: 1 } })
    .png()
    .toBuffer();

  const resized = await sharp(rgba)
    .resize({ width: iconMaxSize, height: iconMaxSize, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();

  const canvas = await sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();

  const outFile = path.join(outputDir, `${slug}.webp`);
  const size = await saveWebp(canvas, outFile);
  console.log(`${slug}.webp ${Math.round(size / 1024)} KB`);
}
