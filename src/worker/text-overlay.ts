import sharp from "sharp";
import type { TextOverlay } from "@/lib/studio/types";

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Render a transparent full-frame PNG so export uses the same normalized box as the preview. */
export async function writeTextOverlay(overlay: TextOverlay, width: number, height: number, output: string) {
  const scale = height / 1080;
  const x = Math.round(overlay.x * width);
  const y = Math.round(overlay.y * height);
  const boxWidth = Math.round(overlay.w * width);
  const boxHeight = Math.round(overlay.h * height);
  const padding = Math.max(3, 12 * scale);
  const fontSize = Math.max(8, overlay.fontSize * scale);
  const lineHeight = fontSize * 1.15;
  const usableWidth = Math.max(1, boxWidth - 2 * padding);
  // Conservative character widths keep lines inside the same browser text box.
  const maxChars = Math.max(3, Math.floor(usableWidth / (fontSize * (overlay.bold ? .62 : .58))));
  const lines = overlay.text.split("\n").flatMap((paragraph) => wrap(paragraph, maxChars));
  const visible = lines.slice(0, Math.max(1, Math.floor((boxHeight - 2 * padding) / lineHeight)));
  const anchor = overlay.align === "left" ? "start" : overlay.align === "right" ? "end" : "middle";
  const textX = overlay.align === "left" ? x + padding : overlay.align === "right" ? x + boxWidth - padding : x + boxWidth / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${overlay.background ? `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="${8 * scale}" fill="#000" fill-opacity=".68"/>` : ""}
    <g font-family="${escapeXml(overlay.fontFamily)}" font-size="${fontSize}" font-weight="${overlay.bold ? 700 : 400}" fill="${overlay.color}" text-anchor="${anchor}">
      ${visible.map((line, index) => `<text x="${textX}" y="${y + padding + fontSize + index * lineHeight}">${escapeXml(line)}</text>`).join("")}
    </g>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(output);
}

function wrap(paragraph: string, limit: number) {
  if (!paragraph.trim()) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of paragraph.split(/\s+/)) {
    if (current && `${current} ${word}`.length > limit) { lines.push(current); current = ""; }
    if (word.length > limit) {
      if (current) { lines.push(current); current = ""; }
      for (let i = 0; i < word.length; i += limit) lines.push(word.slice(i, i + limit));
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines;
}
