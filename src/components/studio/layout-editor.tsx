"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, ImagePlus, Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AssetLibrary, AssetThumb } from "@/components/studio/asset-library";
import { Modal } from "@/components/studio/ui";
import { balanceShares, circleCountForLayout, emptyComposition, getLayout, layouts, normalizeComposition } from "@/lib/studio/layouts";
import type { Composition, StudioAssetDto } from "@/lib/studio/types";

/**
 * Layout Editor: choose a composition (Full Screen, 2 Split, …), assign one
 * or more visuals to each slot, and choose Fill/Fit. Several visuals in one
 * slot play in sequence; their shares follow the narration length.
 */
type LayoutEditorProps = {
  open: boolean;
  onClose: () => void;
  onApply: (composition: Composition) => Promise<void> | void;
  initial: Composition;
  assets: Record<string, StudioAssetDto>;
  segmentLabel: string;
  segmentDurationSec: number;
  isOverride?: boolean;
  onResetToTemplate?: () => Promise<void> | void;
  preferredFolderId?: string;
};

/** Mounted only while open so every opening starts from the segment's current composition. */
export function LayoutEditor(props: LayoutEditorProps) {
  if (!props.open) return null;
  return <LayoutEditorDialog {...props} />;
}

function LayoutEditorDialog({ open, onClose, onApply, initial, assets, segmentLabel, segmentDurationSec, isOverride, onResetToTemplate, preferredFolderId }: LayoutEditorProps) {
  const [composition, setComposition] = useState<Composition>(() => normalizeComposition(initial));
  const [activeSlot, setActiveSlot] = useState(0);
  const [localAssets, setLocalAssets] = useState(assets);
  const [picking, setPicking] = useState<{ slotIndex: number; replaceIndex: number | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const layout = getLayout(composition.layout);
  const circleCount = circleCountForLayout(composition.layout);
  const layoutChoices = useMemo(() => {
    const ordinary = layouts.filter((entry) => circleCountForLayout(entry.id) === null);
    return [...ordinary, getLayout(`circles${circleCount ?? 3}`)];
  }, [circleCount]);
  const slot = composition.slots[activeSlot] ?? composition.slots[0];
  const slotItems = slot?.items ?? [];

  const changeLayout = (layoutId: string) => {
    const next = emptyComposition(layoutId);
    // Keep already chosen visuals in the same slot positions where possible.
    next.slots = next.slots.map((emptySlot, index) => composition.slots[index] ? { ...emptySlot, fit: composition.slots[index].fit, items: composition.slots[index].items } : emptySlot);
    next.textOverlay = composition.textOverlay;
    // Extra visuals from removed slots flow into the last slot rather than vanishing.
    const overflow = composition.slots.slice(next.slots.length).flatMap((entry) => entry.items);
    if (overflow.length) next.slots[next.slots.length - 1].items = balanceShares([...next.slots[next.slots.length - 1].items, ...overflow]);
    setComposition(next);
    setActiveSlot(Math.min(activeSlot, next.slots.length - 1));
  };

  const changeCircleCount = (count: number) => changeLayout(`circles${Math.min(6, Math.max(2, count))}`);

  const updateSlot = (index: number, updater: (slot: Composition["slots"][number]) => Composition["slots"][number]) => {
    setComposition((current) => ({ ...current, slots: current.slots.map((entry, i) => (i === index ? updater(entry) : entry)) }));
  };

  const selectAsset = (asset: StudioAssetDto) => {
    if (!picking) return;
    setLocalAssets((current) => ({ ...current, [asset.id]: asset }));
    updateSlot(picking.slotIndex, (entry) => {
      const items = [...entry.items];
      if (picking.replaceIndex !== null && items[picking.replaceIndex]) items[picking.replaceIndex] = { ...items[picking.replaceIndex], assetId: asset.id };
      else items.push({ assetId: asset.id, share: items.length ? 1 / items.length : 1 });
      return { ...entry, items: balanceShares(items) };
    });
    setPicking(null);
  };

  const moveItem = (from: number, to: number) => {
    updateSlot(activeSlot, (entry) => {
      const items = [...entry.items];
      if (to < 0 || to >= items.length) return entry;
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...entry, items };
    });
  };

  const setDisplaySeconds = (index: number, seconds: number) => {
    updateSlot(activeSlot, (entry) => {
      const remainingCount = entry.items.length - 1;
      if (remainingCount < 1) return entry;
      const minimumShare = 0.1 / previewDuration;
      const selectedShare = Math.min(1 - remainingCount * minimumShare, Math.max(minimumShare, seconds / previewDuration));
      const otherTotal = entry.items.reduce((total, item, i) => total + (i === index ? 0 : item.share), 0);
      const items = entry.items.map((item, i) => ({ ...item, share: i === index ? selectedShare : (1 - selectedShare) * (otherTotal ? item.share / otherTotal : 1 / remainingCount) }));
      return { ...entry, items: balanceShares(items) };
    });
  };

  const apply = async () => {
    setBusy(true);
    try {
      await onApply(normalizeComposition(composition));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const previewDuration = Math.max(1, segmentDurationSec);
  const slotSummary = useMemo(() => composition.slots.map((entry) => entry.items.length), [composition]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Layout Editor"
        description={`Choose a visual composition for ${segmentLabel}`}
        wide
        footer={
          <>
            {isOverride && onResetToTemplate && (
              <button type="button" onClick={() => void onResetToTemplate()} className="mr-auto inline-flex items-center gap-2 text-sm font-bold text-[#a64026]">
                <RefreshCw className="size-4" /> Use the master template visuals
              </button>
            )}
            <button type="button" onClick={onClose} className="mlp-btn-outline">Cancel</button>
            <button type="button" onClick={apply} disabled={busy} className="mlp-btn-primary"><Check className="size-4" /> Apply Layout</button>
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">Composition</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {layoutChoices.map((entry) => (
                <button key={entry.id} type="button" onClick={() => changeLayout(entry.id)} className={`rounded-xl border p-3 text-left transition ${composition.layout === entry.id ? "border-[#a64026] bg-[#fbeaea]/60 ring-2 ring-[#a64026]/15" : "border-[#d8dde5] hover:border-[#c9d0da]"}`}>
                  <span className="relative block aspect-video overflow-hidden rounded-md bg-[#f2f4f7]">
                    {entry.slots.map((rect, index) => (
                      <span key={index} className="absolute border border-[#c9d0da] bg-white" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, borderRadius: rect.shape === "circle" ? "9999px" : "2px" }} />
                    ))}
                  </span>
                  <span className="mt-2 block text-sm font-extrabold text-[#243447]">{circleCountForLayout(entry.id) ? "Circle Collage" : entry.label}</span>
                  <span className="block text-xs text-[#6b7c8f]">{entry.description}</span>
                </button>
              ))}
            </div>

            {circleCount !== null && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8dde5] bg-[#f7f8fa] px-4 py-3">
                <span>
                  <span className="block text-sm font-extrabold text-[#243447]">Number of circles</span>
                  <span className="block text-xs text-[#6b7c8f]">Each circle can have its own image or video.</span>
                </span>
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => changeCircleCount(circleCount - 1)} disabled={circleCount <= 2} className="grid size-8 place-items-center rounded-md border border-[#d8dde5] bg-white disabled:opacity-40" aria-label="Use fewer circles"><Minus className="size-4" /></button>
                  <strong className="w-8 text-center text-lg text-[#243447]">{circleCount}</strong>
                  <button type="button" onClick={() => changeCircleCount(circleCount + 1)} disabled={circleCount >= 6} className="grid size-8 place-items-center rounded-md border border-[#d8dde5] bg-white disabled:opacity-40" aria-label="Use more circles"><Plus className="size-4" /></button>
                </span>
              </div>
            )}

            <h3 className="mb-3 mt-6 text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">Slots</h3>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-[#0d1a2b]">
              {composition.slots.map((entry, index) => {
                const rect = layout.slots[index];
                const first = entry.items[0] ? localAssets[entry.items[0].assetId] : null;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setActiveSlot(index);
                      if (entry.items.length === 0) setPicking({ slotIndex: index, replaceIndex: null });
                    }}
                    className={`absolute overflow-hidden text-left ${activeSlot === index ? "ring-4 ring-inset ring-[#a64026]" : "ring-1 ring-inset ring-white/20"}`}
                    style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, borderRadius: rect.shape === "circle" ? "9999px" : undefined }}
                    aria-label={`${entry.items.length ? "Edit" : "Add media to"} screen ${index + 1}`}
                  >
                    {first ? <AssetThumb asset={first} /> : <span className="grid h-full w-full place-items-center gap-1 text-center text-white/75"><span><ImagePlus className="mx-auto size-6" /> <span className="mt-1 block text-[10px] font-extrabold">Add image/video</span></span></span>}
                    <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-extrabold text-white">Screen {index + 1}{slotSummary[index] > 1 ? ` · ${slotSummary[index]} in sequence` : ""}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[#6b7c8f]">Click an empty screen to add an image or video. Click a filled screen to change its media or timing.</p>
          </div>

          <aside className="rounded-xl bg-[#f7f8fa] p-4 ring-1 ring-[#edf0f3]">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">Screen Settings</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {composition.slots.map((entry, index) => (
                <button key={entry.id} type="button" onClick={() => setActiveSlot(index)} className={`rounded-md px-2.5 py-1.5 text-xs font-extrabold ${activeSlot === index ? "bg-[#a64026] text-white" : "border border-[#d8dde5] bg-white text-[#526579]"}`}>
                  Screen {index + 1}{entry.items.length ? " ✓" : ""}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm font-extrabold text-[#a64026]">Editing Screen {activeSlot + 1}</p>

            <div className="mt-3 space-y-2">
              {slotItems.map((item, index) => {
                const asset = localAssets[item.assetId];
                return (
                  <div key={`${item.assetId}-${index}`} className="flex items-center gap-2 rounded-lg border border-[#d8dde5] bg-white p-2">
                    <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-[#f2f4f7]">{asset && <AssetThumb asset={asset} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-extrabold text-[#243447]">{asset?.name ?? "Missing asset"}</span>
                      {slotItems.length > 1 && (
                        <label className="mt-1 block text-[11px] text-[#6b7c8f]">
                          On screen for about {(previewDuration * item.share).toFixed(1)} sec
                          <input type="range" min={0.1} max={Math.max(0.1, previewDuration - (slotItems.length - 1) * 0.1)} step={0.1} value={Math.max(0.1, previewDuration * item.share)} onChange={(event) => setDisplaySeconds(index, Number(event.target.value))} className="mt-1 block w-full accent-[#a64026]" aria-label={`Time on screen for ${asset?.name ?? `visual ${index + 1}`}`} />
                        </label>
                      )}
                      {slotItems.length === 1 && <span className="mt-1 block text-[11px] text-[#6b7c8f]">Stays on screen for the full {previewDuration.toFixed(1)} sec</span>}
                    </span>
                    <span className="flex flex-col">
                      {slotItems.length > 1 && (
                        <>
                          <button type="button" onClick={() => moveItem(index, index - 1)} className="grid size-6 place-items-center text-[#6b7c8f]" aria-label="Move earlier"><ChevronUp className="size-3.5" /></button>
                          <button type="button" onClick={() => moveItem(index, index + 1)} className="grid size-6 place-items-center text-[#6b7c8f]" aria-label="Move later"><ChevronDown className="size-3.5" /></button>
                        </>
                      )}
                    </span>
                    <button type="button" onClick={() => setPicking({ slotIndex: activeSlot, replaceIndex: index })} className="grid size-8 place-items-center rounded-md border border-[#d8dde5] text-[#243447]" aria-label="Replace media" title="Replace Media"><RefreshCw className="size-3.5" /></button>
                    <button type="button" onClick={() => updateSlot(activeSlot, (entry) => ({ ...entry, items: balanceShares(entry.items.filter((_, i) => i !== index)) }))} className="grid size-8 place-items-center rounded-md border border-red-200 text-red-600" aria-label="Remove" title="Remove"><Trash2 className="size-3.5" /></button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setPicking({ slotIndex: activeSlot, replaceIndex: null })} className="mlp-btn-outline mt-3 w-full">
              <ImagePlus className="size-4" /> {slotItems.length ? "Add another image/video (plays after)" : `Add image/video to Screen ${activeSlot + 1}`}
            </button>
            {slotItems.length > 1 && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6b7c8f]"><span>These visuals play one after another. Lengthening one shortens the others.</span><button type="button" onClick={() => updateSlot(activeSlot, (entry) => ({ ...entry, items: entry.items.map((item) => ({ ...item, share: 1 / entry.items.length })) }))} className="font-bold text-[#a64026]">Split time evenly</button></div>}
            <p className="mt-2 text-xs text-[#6b7c8f]">To keep visuals on screen longer overall, add quiet time before or after the voice in Pacing.</p>

            <div className="mt-5 border-t border-[#e5e7eb] pt-4">
              <p className="text-sm font-extrabold text-[#243447]">Sizing Mode</p>
              {(["cover", "contain"] as const).map((fit) => (
                <label key={fit} className="mt-2 flex cursor-pointer items-start gap-3">
                  <input type="radio" name="fit" checked={slot?.fit === fit} onChange={() => updateSlot(activeSlot, (entry) => ({ ...entry, fit }))} className="mt-1 accent-[#a64026]" />
                  <span>
                    <span className="block text-sm font-bold text-[#243447]">{fit === "cover" ? "Fill" : "Fit"}</span>
                    <span className="block text-xs text-[#6b7c8f]">{fit === "cover" ? "Cover entire slot area" : "Show entire image"}</span>
                  </span>
                </label>
              ))}
            </div>
          </aside>
        </div>
      </Modal>
      <AssetLibrary open={Boolean(picking)} onClose={() => setPicking(null)} onSelect={selectAsset} kinds={["image", "video"]} description={`Select an image or video for ${segmentLabel}`} selectedIds={slotItems.map((item) => item.assetId)} preferredFolderId={preferredFolderId} />
    </>
  );
}
