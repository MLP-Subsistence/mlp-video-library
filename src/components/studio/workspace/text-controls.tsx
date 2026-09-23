"use client";

import { AlignCenter, AlignEndHorizontal, AlignLeft, AlignRight, AlignStartHorizontal, AlignVerticalSpaceAround, Bold, CaseSensitive, Italic, Type, Underline } from "lucide-react";
import { DEFAULT_TEXT_OVERLAY, TEXT_FONTS, TEXT_STYLE_PRESETS, applyTextPreset } from "@/lib/studio/text-overlay";
import type { ProjectSegmentDto, TextOverlay } from "@/lib/studio/types";
import { textareaClass } from "@/components/studio/ui";

/**
 * On-screen text inspector, in the spirit of a Resolve Text+ panel but kept
 * to what an educator needs: the words, a font row, then folded sections for
 * alignment/spacing, background plate, outline and shadow. Everything writes
 * straight into `composition.textOverlay`; the narration script is separate.
 */
export function TextControls({ segment, disabled, highlighted, onChange, onFlush }: {
  segment: ProjectSegmentDto;
  disabled: boolean;
  /** True when the text clip is the one selected on the timeline. */
  highlighted?: boolean;
  onChange: (overlay: TextOverlay | undefined, immediate?: boolean) => void;
  onFlush: () => void;
}) {
  const overlay = segment.composition.textOverlay;
  const update = (change: Partial<TextOverlay>, immediate = true) => overlay && onChange({ ...overlay, ...change }, immediate);
  return (
    <div id="studio-text-controls" className={`mt-4 rounded-xl border bg-[#f7f8fa] p-3 ${highlighted ? "border-[#a64026] ring-2 ring-[#a64026]/30" : "border-[#d8dde5]"}`}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="inline-flex items-center gap-2 text-sm font-extrabold text-[#243447]"><Type className="size-4" /> On-screen text</h4>
        {overlay ? (
          <button type="button" disabled={disabled} onClick={() => onChange(undefined, true)} className="text-xs font-bold text-[#a64026]">Remove text</button>
        ) : (
          <button type="button" disabled={disabled} onClick={() => onChange({ ...DEFAULT_TEXT_OVERLAY, text: segment.translation || "Your text" }, true)} className="mlp-btn-outline h-9 px-3 text-xs">Add text</button>
        )}
      </div>

      {!overlay ? (
        <p className="mt-2 text-xs text-[#6b7c8f]">Add words over the picture. The narration script stays separate.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <textarea value={overlay.text} onChange={(event) => update({ text: event.target.value }, false)} onBlur={onFlush} rows={3} maxLength={1200} dir="auto" className={`${textareaClass} text-sm`} aria-label="Words shown on video" />

          {/* Styles */}
          <div className="flex flex-wrap gap-1">
            {TEXT_STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange(applyTextPreset(overlay, preset), true)}
                title={preset.description}
                className="rounded-md border border-[#d8dde5] bg-white px-2 py-1 text-[11px] font-bold text-[#526579] hover:border-[#a64026] hover:text-[#a64026]"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Font row */}
          <div className="grid grid-cols-[1fr_5.75rem] gap-2">
            <label className="text-xs font-bold text-[#526579]">Font
              <select value={overlay.fontFamily} disabled={disabled} onChange={(event) => update({ fontFamily: event.target.value as TextOverlay["fontFamily"] })} className="mlp-input mt-1 h-10 w-full text-sm" style={{ fontFamily: overlay.fontFamily }}>
                {TEXT_FONTS.map((font) => <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-[#526579]">Size
              <input type="number" min={8} max={200} value={overlay.fontSize} disabled={disabled} onChange={(event) => update({ fontSize: Number(event.target.value) }, false)} onBlur={onFlush} className="mlp-input mt-1 h-10 w-full text-sm" aria-label="Font size" />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup label="Text alignment">
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([align, Icon]) => (
                <Toggle key={align} active={overlay.align === align} disabled={disabled} onClick={() => update({ align })} label={`Align ${align}`}><Icon className="size-4" /></Toggle>
              ))}
            </ToggleGroup>
            <ToggleGroup label="Vertical position">
              {([["top", AlignStartHorizontal], ["middle", AlignVerticalSpaceAround], ["bottom", AlignEndHorizontal]] as const).map(([verticalAlign, Icon]) => (
                <Toggle key={verticalAlign} active={overlay.verticalAlign === verticalAlign} disabled={disabled} onClick={() => update({ verticalAlign })} label={`${verticalAlign} of the box`}><Icon className="size-4" /></Toggle>
              ))}
            </ToggleGroup>
            <ToggleGroup label="Font style">
              <Toggle active={overlay.bold} disabled={disabled} onClick={() => update({ bold: !overlay.bold })} label="Bold"><Bold className="size-4" /></Toggle>
              <Toggle active={overlay.italic} disabled={disabled} onClick={() => update({ italic: !overlay.italic })} label="Italic"><Italic className="size-4" /></Toggle>
              <Toggle active={overlay.underline} disabled={disabled} onClick={() => update({ underline: !overlay.underline })} label="Underline"><Underline className="size-4" /></Toggle>
              <Toggle active={overlay.uppercase} disabled={disabled} onClick={() => update({ uppercase: !overlay.uppercase })} label="UPPERCASE"><CaseSensitive className="size-4" /></Toggle>
            </ToggleGroup>
            <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8dde5] bg-white px-2 text-xs font-bold text-[#526579]">
              Color <input type="color" value={overlay.color} disabled={disabled} onChange={(event) => update({ color: event.target.value }, false)} onBlur={onFlush} className="size-7 cursor-pointer" aria-label="Text color" />
            </label>
          </div>

          <Section title="Spacing & position" summary={`${overlay.letterSpacing} px tracking · ${overlay.lineHeight}× lines${overlay.rotation ? ` · ${overlay.rotation}°` : ""}`}>
            <Slider label="Letter spacing" value={overlay.letterSpacing} min={-5} max={30} step={0.5} unit="px" disabled={disabled} onChange={(value) => update({ letterSpacing: value }, false)} onCommit={onFlush} />
            <Slider label="Line spacing" value={overlay.lineHeight} min={0.8} max={2.5} step={0.05} unit="×" disabled={disabled} onChange={(value) => update({ lineHeight: value }, false)} onCommit={onFlush} />
            <Slider label="Rotation" value={overlay.rotation} min={-180} max={180} step={1} unit="°" disabled={disabled} onChange={(value) => update({ rotation: value }, false)} onCommit={onFlush} />
            <Slider label="Opacity" value={overlay.opacity} min={0.05} max={1} step={0.05} unit="" disabled={disabled} onChange={(value) => update({ opacity: value }, false)} onCommit={onFlush} />
            <button type="button" onClick={() => update({ x: DEFAULT_TEXT_OVERLAY.x, y: DEFAULT_TEXT_OVERLAY.y, w: DEFAULT_TEXT_OVERLAY.w, h: DEFAULT_TEXT_OVERLAY.h, rotation: 0 })} disabled={disabled} className="text-xs font-bold text-[#a64026]">Reset position &amp; size</button>
          </Section>

          <Section title="Background plate" summary={overlay.background ? `${Math.round(overlay.backgroundOpacity * 100)}% ${overlay.backgroundColor}` : "Off"}>
            <label className="flex items-center gap-2 text-xs font-bold text-[#526579]">
              <input type="checkbox" checked={overlay.background} disabled={disabled} onChange={(event) => update({ background: event.target.checked })} /> Show a plate behind the words
            </label>
            {overlay.background && (
              <>
                <label className="flex items-center justify-between gap-2 text-xs font-bold text-[#526579]">Plate colour
                  <input type="color" value={overlay.backgroundColor} disabled={disabled} onChange={(event) => update({ backgroundColor: event.target.value }, false)} onBlur={onFlush} className="size-7 cursor-pointer" aria-label="Background colour" />
                </label>
                <Slider label="Plate opacity" value={overlay.backgroundOpacity} min={0} max={1} step={0.02} unit="" disabled={disabled} onChange={(value) => update({ backgroundOpacity: value }, false)} onCommit={onFlush} />
                <Slider label="Corner rounding" value={overlay.backgroundRadius} min={0} max={80} step={1} unit="px" disabled={disabled} onChange={(value) => update({ backgroundRadius: value }, false)} onCommit={onFlush} />
              </>
            )}
          </Section>

          <Section title="Outline & shadow" summary={`${overlay.strokeWidth > 0 ? `${overlay.strokeWidth} px outline` : "No outline"}${overlay.shadow ? " · shadow" : ""}`}>
            <Slider label="Outline width" value={overlay.strokeWidth} min={0} max={20} step={0.5} unit="px" disabled={disabled} onChange={(value) => update({ strokeWidth: value }, false)} onCommit={onFlush} />
            {overlay.strokeWidth > 0 && (
              <label className="flex items-center justify-between gap-2 text-xs font-bold text-[#526579]">Outline colour
                <input type="color" value={overlay.strokeColor} disabled={disabled} onChange={(event) => update({ strokeColor: event.target.value }, false)} onBlur={onFlush} className="size-7 cursor-pointer" aria-label="Outline colour" />
              </label>
            )}
            <label className="flex items-center gap-2 text-xs font-bold text-[#526579]">
              <input type="checkbox" checked={overlay.shadow} disabled={disabled} onChange={(event) => update({ shadow: event.target.checked })} /> Drop shadow
            </label>
            {overlay.shadow && (
              <>
                <label className="flex items-center justify-between gap-2 text-xs font-bold text-[#526579]">Shadow colour
                  <input type="color" value={overlay.shadowColor} disabled={disabled} onChange={(event) => update({ shadowColor: event.target.value }, false)} onBlur={onFlush} className="size-7 cursor-pointer" aria-label="Shadow colour" />
                </label>
                <Slider label="Blur" value={overlay.shadowBlur} min={0} max={40} step={1} unit="px" disabled={disabled} onChange={(value) => update({ shadowBlur: value }, false)} onCommit={onFlush} />
                <Slider label="Offset X" value={overlay.shadowOffsetX} min={-40} max={40} step={1} unit="px" disabled={disabled} onChange={(value) => update({ shadowOffsetX: value }, false)} onCommit={onFlush} />
                <Slider label="Offset Y" value={overlay.shadowOffsetY} min={-40} max={40} step={1} unit="px" disabled={disabled} onChange={(value) => update({ shadowOffsetY: value }, false)} onCommit={onFlush} />
                <Slider label="Shadow opacity" value={overlay.shadowOpacity} min={0} max={1} step={0.05} unit="" disabled={disabled} onChange={(value) => update({ shadowOpacity: value }, false)} onCommit={onFlush} />
              </>
            )}
          </Section>

          <p className="text-xs text-[#6b7c8f]">Drag the text in the preview to move it, or its corner to resize the box. Sizes are for a 1080p frame and scale automatically in 720p exports.</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-[#e5e7eb] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-extrabold text-[#243447] [&::-webkit-details-marker]:hidden">
        {title} <span className="truncate font-semibold text-[#8b9bad]">{summary}</span>
      </summary>
      <div className="space-y-2 border-t border-[#edf0f3] px-3 py-2">{children}</div>
    </details>
  );
}

function Slider({ label, value, min, max, step, unit, disabled, onChange, onCommit }: { label: string; value: number; min: number; max: number; step: number; unit: string; disabled: boolean; onChange: (value: number) => void; onCommit: () => void }) {
  return (
    <label className="block text-xs font-bold text-[#526579]">
      <span className="flex items-center justify-between gap-2">{label} <span className="tabular-nums text-[#8b9bad]">{value}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} onPointerUp={onCommit} onBlur={onCommit} className="mt-1 block w-full accent-[#a64026]" />
    </label>
  );
}

function ToggleGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="inline-flex rounded-lg border border-[#d8dde5] bg-white p-1" aria-label={label}>{children}</div>;
}

function Toggle({ active, disabled, onClick, label, children }: { active: boolean; disabled: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} title={label} aria-label={label} className={`grid size-8 place-items-center rounded ${active ? "bg-[#e9ded9] text-[#a64026]" : "text-[#526579]"}`}>
      {children}
    </button>
  );
}
