import sharp from "sharp";
import { displayText, rgba } from "@/lib/studio/text-overlay";
import type { TextOverlay } from "@/lib/studio/types";

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * Render a transparent full-frame PNG so export uses the same normalized box,
 * fonts and styling as the browser preview: weight/italic/case, tracking and
 * line spacing, horizontal and vertical alignment, outline, drop shadow,
 * background plate, opacity and rotation.
 */
export async function writeTextOverlay(overlay: TextOverlay, width: number, height: number, output: string) {
  const scale = height / 1080;
  const x = Math.round(overlay.x * width);
  const y = Math.round(overlay.y * height);
  const boxWidth = Math.round(overlay.w * width);
  const boxHeight = Math.round(overlay.h * height);
  const padding = Math.max(3, 12 * scale);
  const fontSize = Math.max(8, overlay.fontSize * scale);
  const letterSpacing = overlay.letterSpacing * scale;
  const lineHeight = fontSize * overlay.lineHeight;
  const usableWidth = Math.max(1, boxWidth - 2 * padding);
  // Conservative character widths keep lines inside the same browser text box.
  const perChar = fontSize * (overlay.bold ? 0.62 : 0.58) + letterSpacing;
  const maxChars = Math.max(3, Math.floor(usableWidth / Math.max(1, perChar)));
  const lines = displayText(overlay).split("\n").flatMap((paragraph) => wrap(paragraph, maxChars));
  const maxLines = Math.max(1, Math.floor((boxHeight - 2 * padding) / lineHeight));
  const visible = lines.slice(0, maxLines);

  const anchor = overlay.align === "left" ? "start" : overlay.align === "right" ? "end" : "middle";
  const textX = overlay.align === "left" ? x + padding : overlay.align === "right" ? x + boxWidth - padding : x + boxWidth / 2;
  // Vertical placement of the first baseline inside the box.
  const blockHeight = visible.length * lineHeight;
  const topInset =
    overlay.verticalAlign === "top"
      ? padding
      : overlay.verticalAlign === "bottom"
        ? Math.max(padding, boxHeight - padding - blockHeight)
        : Math.max(padding, (boxHeight - blockHeight) / 2);
  const firstBaseline = y + topInset + fontSize * 0.82;

  const strokeWidth = overlay.strokeWidth * scale;
  const shadowId = "mlp-text-shadow";
  const filter =
    overlay.shadow && (overlay.shadowBlur > 0 || overlay.shadowOffsetX !== 0 || overlay.shadowOffsetY !== 0)
      ? `<filter id="${shadowId}" x="-50%" y="-50%" width="200%" height="200%">
           <feDropShadow dx="${overlay.shadowOffsetX * scale}" dy="${overlay.shadowOffsetY * scale}" stdDeviation="${Math.max(0.01, (overlay.shadowBlur * scale) / 2)}" flood-color="${overlay.shadowColor}" flood-opacity="${overlay.shadowOpacity}"/>
         </filter>`
      : "";
  const rotate = overlay.rotation ? ` transform="rotate(${overlay.rotation} ${x + boxWidth / 2} ${y + boxHeight / 2})"` : "";
  const textAttributes = [
    `font-family="${escapeXml(overlay.fontFamily)}"`,
    `font-size="${fontSize}"`,
    `font-weight="${overlay.bold ? 700 : 400}"`,
    overlay.italic ? `font-style="italic"` : "",
    overlay.underline ? `text-decoration="underline"` : "",
    letterSpacing ? `letter-spacing="${letterSpacing}"` : "",
    `fill="${overlay.color}"`,
    `text-anchor="${anchor}"`,
    strokeWidth > 0 ? `stroke="${overlay.strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke"` : "",
    filter ? `filter="url(#${shadowId})"` : ""
  ]
    .filter(Boolean)
    .join(" ");

  // The plate hugs each line of text rather than filling the whole box.
  const platePadX = fontSize * 0.36;
  const platePadY = fontSize * 0.16;
  const plates = overlay.background
    ? visible
        .map((line, index) => {
          if (!line.trim()) return "";
          const lineWidth = Math.min(boxWidth, line.length * perChar) + 2 * platePadX;
          const left = overlay.align === "left" ? textX - platePadX : overlay.align === "right" ? textX - lineWidth + platePadX : textX - lineWidth / 2;
          const top = firstBaseline + index * lineHeight - fontSize * 0.82 - platePadY;
          return `<rect x="${left}" y="${top}" width="${lineWidth}" height="${fontSize * 1.16 + 2 * platePadY}" rx="${overlay.backgroundRadius * scale}" fill="${overlay.backgroundColor}" fill-opacity="${overlay.backgroundOpacity}"/>`;
        })
        .join("")
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>${filter}</defs>
    <g${rotate} opacity="${overlay.opacity}">
      ${plates}
      <g ${textAttributes}>
        ${visible.map((line, index) => `<text x="${textX}" y="${firstBaseline + index * lineHeight}">${escapeXml(line)}</text>`).join("")}
      </g>
    </g>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(output);
  return { lines: visible.length, truncated: lines.length > visible.length, background: overlay.background ? rgba(overlay.backgroundColor, overlay.backgroundOpacity) : null };
}

function wrap(paragraph: string, limit: number) {
  if (!paragraph.trim()) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of paragraph.split(/\s+/)) {
    if (current && `${current} ${word}`.length > limit) {
      lines.push(current);
      current = "";
    }
    if (word.length > limit) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += limit) lines.push(word.slice(i, i + limit));
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines;
}
