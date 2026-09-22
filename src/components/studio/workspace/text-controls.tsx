"use client";

import { AlignCenter, AlignLeft, AlignRight, Bold, Type } from "lucide-react";
import { DEFAULT_TEXT_OVERLAY, TEXT_FONTS } from "@/lib/studio/text-overlay";
import type { ProjectSegmentDto, TextOverlay } from "@/lib/studio/types";
import { textareaClass } from "@/components/studio/ui";

export function TextControls({ segment, disabled, onChange, onFlush }: {
  segment: ProjectSegmentDto;
  disabled: boolean;
  onChange: (overlay: TextOverlay | undefined, immediate?: boolean) => void;
  onFlush: () => void;
}) {
  const overlay = segment.composition.textOverlay;
  const update = (change: Partial<TextOverlay>, immediate = true) => overlay && onChange({ ...overlay, ...change }, immediate);
  return (
    <div id="studio-text-controls" className="mt-4 rounded-xl border border-[#d8dde5] bg-[#f7f8fa] p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="inline-flex items-center gap-2 text-sm font-extrabold text-[#243447]"><Type className="size-4" /> On-screen text</h4>
        {overlay ? (
          <button type="button" disabled={disabled} onClick={() => onChange(undefined, true)} className="text-xs font-bold text-[#a64026]">Remove text</button>
        ) : (
          <button type="button" disabled={disabled} onClick={() => onChange({ ...DEFAULT_TEXT_OVERLAY, text: segment.translation || "Your text" }, true)} className="mlp-btn-outline h-9 px-3 text-xs">Add text</button>
        )}
      </div>
      {!overlay ? <p className="mt-2 text-xs text-[#6b7c8f]">Add words over the picture. The narration script stays separate.</p> : (
        <div className="mt-3 space-y-3">
          <textarea value={overlay.text} onChange={(event) => update({ text: event.target.value }, false)} onBlur={onFlush} rows={3} maxLength={1200} dir="auto" className={`${textareaClass} text-sm`} aria-label="Words shown on video" />
          <div className="grid grid-cols-[1fr_105px] gap-2">
            <label className="text-xs font-bold text-[#526579]">Font
              <select value={overlay.fontFamily} disabled={disabled} onChange={(event) => update({ fontFamily: event.target.value as TextOverlay["fontFamily"] })} className="mlp-input mt-1 h-10 w-full text-sm">
                {TEXT_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-[#526579]">Size
              <input type="number" min={16} max={120} value={overlay.fontSize} disabled={disabled} onChange={(event) => update({ fontSize: Number(event.target.value) }, false)} onBlur={onFlush} className="mlp-input mt-1 h-10 w-full text-sm" aria-label="Font size" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[#d8dde5] bg-white p-1" aria-label="Text alignment">
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([align, Icon]) => <button key={align} type="button" onClick={() => update({ align })} disabled={disabled} className={`grid size-8 place-items-center rounded ${overlay.align === align ? "bg-[#e9ded9] text-[#a64026]" : "text-[#526579]"}`} title={`Align ${align}`} aria-label={`Align ${align}`}><Icon className="size-4" /></button>)}
            </div>
            <button type="button" disabled={disabled} onClick={() => update({ bold: !overlay.bold })} className={`grid size-10 place-items-center rounded-lg border border-[#d8dde5] ${overlay.bold ? "bg-[#e9ded9] text-[#a64026]" : "bg-white text-[#526579]"}`} aria-label="Bold text" aria-pressed={overlay.bold}><Bold className="size-4" /></button>
            <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8dde5] bg-white px-2 text-xs font-bold text-[#526579]">Color <input type="color" value={overlay.color} onChange={(event) => update({ color: event.target.value }, false)} onBlur={onFlush} className="size-7 cursor-pointer" aria-label="Text color" /></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#526579]">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={overlay.background} onChange={(event) => update({ background: event.target.checked })} disabled={disabled} /> Dark background for readability</label>
            <button type="button" onClick={() => update({ x: DEFAULT_TEXT_OVERLAY.x, y: DEFAULT_TEXT_OVERLAY.y, w: DEFAULT_TEXT_OVERLAY.w, h: DEFAULT_TEXT_OVERLAY.h })} disabled={disabled} className="font-bold text-[#a64026]">Reset position</button>
          </div>
          <p className="text-xs text-[#6b7c8f]">Drag the text in the video preview to move it. Drag its corner to resize the text box. Changes save automatically.</p>
        </div>
      )}
    </div>
  );
}
