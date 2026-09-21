"use client";

import { useRef, useState } from "react";
import { FileAudio, Film, ImageIcon, Layers, Search, Trash2, Upload } from "lucide-react";
import { AssetThumb, useAssetList } from "@/components/studio/asset-library";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { InlineNotice, Spinner } from "@/components/studio/ui";
import { api, formatBytes, kindForFile, uploadAsset } from "@/lib/studio/client";
import { formatClock } from "@/lib/studio/timing";
import type { AssetKind, StudioAssetDto } from "@/lib/studio/types";

/** Asset Library management page (content managers): upload, rename, tag, safely delete. */
export function AssetsPage() {
  const [kind, setKind] = useState<AssetKind>("image");
  const [query, setQuery] = useState("");
  const { assets, error, reload, setAssets } = useAssetList(kind, query, true);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const detected = kindForFile(file);
      if (!detected) {
        setNotice(`"${file.name}" is not a supported image, video or audio file.`);
        continue;
      }
      try {
        setUploading({ name: file.name, progress: 0 });
        await uploadAsset(file, { kind: detected, onProgress: (fraction) => setUploading({ name: file.name, progress: fraction }) });
        setKind(detected);
      } catch (caught) {
        setNotice((caught as Error).message);
      } finally {
        setUploading(null);
      }
    }
    await reload();
  }

  async function rename(asset: StudioAssetDto) {
    const name = window.prompt("Asset name", asset.name);
    if (!name || name === asset.name) return;
    try {
      const result = await api<{ asset: StudioAssetDto }>(`/api/studio/assets/${asset.id}`, { method: "PATCH", json: { name } });
      setAssets((list) => (list ?? []).map((entry) => (entry.id === asset.id ? { ...entry, name: result.asset.name } : entry)));
    } catch (caught) {
      setNotice((caught as Error).message);
    }
  }

  async function tag(asset: StudioAssetDto) {
    const tags = window.prompt("Tags (comma separated)", asset.tags);
    if (tags === null) return;
    try {
      const result = await api<{ asset: StudioAssetDto }>(`/api/studio/assets/${asset.id}`, { method: "PATCH", json: { tags } });
      setAssets((list) => (list ?? []).map((entry) => (entry.id === asset.id ? { ...entry, tags: result.asset.tags } : entry)));
    } catch (caught) {
      setNotice((caught as Error).message);
    }
  }

  async function remove(asset: StudioAssetDto) {
    if (asset.usedIn) {
      setNotice(`"${asset.name}" is currently used in ${asset.usedIn} segment${asset.usedIn === 1 ? "" : "s"}. Replace it there before deleting.`);
      return;
    }
    if (!window.confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;
    try {
      await api(`/api/studio/assets/${asset.id}`, { method: "DELETE" });
      setAssets((list) => (list ?? []).filter((entry) => entry.id !== asset.id));
    } catch (caught) {
      setNotice((caught as Error).message);
    }
  }

  const tabs: Array<{ kind: AssetKind; label: string; icon: typeof ImageIcon }> = [
    { kind: "image", label: "Images", icon: ImageIcon },
    { kind: "video", label: "Videos", icon: Film },
    { kind: "audio", label: "Audio", icon: FileAudio }
  ];

  return (
    <>
      <StudioPageHeader
        title="Asset Library"
        subtitle="Images, video clips and audio shared by every master template and localization."
        actions={
          <>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={Boolean(uploading)} className="mlp-btn-primary h-10">{uploading ? <Spinner /> : <Upload className="size-4" />} Upload</button>
            <input ref={fileInput} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
          </>
        }
      />
      <main className="px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        {(notice || error) && <div className="mb-4"><InlineNotice tone="error" onDismiss={() => setNotice(null)}>{notice || error}</InlineNotice></div>}
        {uploading && (
          <div className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3]">
            <div className="mb-1 flex justify-between text-xs font-bold text-[#526579]"><span className="truncate">Uploading {uploading.name}</span><span>{Math.round(uploading.progress * 100)}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]"><div className="h-full bg-[#a64026] transition-all" style={{ width: `${Math.round(uploading.progress * 100)}%` }} /></div>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid flex-1 grid-cols-3 rounded-lg border border-[#d8dde5] bg-white p-1 sm:max-w-md">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.kind} type="button" onClick={() => setKind(tab.kind)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${kind === tab.kind ? "bg-[#f2f4f7] text-[#243447]" : "text-[#6b7c8f]"}`}>
                  <Icon className="size-4" /> {tab.label}
                </button>
              );
            })}
          </div>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[#8b9bad]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or tag…" className="mlp-input w-full pl-10" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets?.map((asset) => (
            <article key={asset.id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#edf0f3]">
              <div className="relative aspect-video bg-[#f2f4f7]">
                <AssetThumb asset={asset} />
                {asset.kind !== "image" && asset.durationSec ? <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-extrabold text-white">{formatClock(asset.durationSec)}</span> : null}
              </div>
              <div className="p-3">
                <button type="button" onClick={() => rename(asset)} className="block w-full truncate text-left text-sm font-extrabold text-[#243447]" title="Rename">{asset.name}</button>
                <button type="button" onClick={() => tag(asset)} className="mt-0.5 block w-full truncate text-left text-xs text-[#6b7c8f]" title="Edit tags">{asset.tags || "Add tags…"}</button>
                <div className="mt-2 flex items-center justify-between text-xs text-[#6b7c8f]">
                  <span className="inline-flex items-center gap-1"><Layers className="size-3" /> {asset.usedIn ?? 0} segment{asset.usedIn === 1 ? "" : "s"} · {formatBytes(asset.sizeBytes)}</span>
                  <button type="button" onClick={() => remove(asset)} className={`grid size-7 place-items-center rounded-md ${asset.usedIn ? "text-[#c9d0da]" : "text-red-600 hover:bg-red-50"}`} aria-label="Delete asset" title={asset.usedIn ? "In use — replace it first" : "Delete"}><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            </article>
          ))}
          {assets && assets.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-[#d8dde5] bg-white p-10 text-center text-sm text-[#6b7c8f]">No {kind} assets yet. Upload some to get started.</div>}
          {!assets && !error && <div className="col-span-full flex items-center justify-center gap-2 p-10 text-sm text-[#6b7c8f]"><Spinner /> Loading…</div>}
        </div>
      </main>
    </>
  );
}
