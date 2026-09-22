"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileAudio, Film, ImageIcon, Layers, Search, Trash2, Upload } from "lucide-react";
import { Drawer, InlineNotice, Spinner } from "@/components/studio/ui";
import { api, formatBytes, kindForFile, uploadAsset } from "@/lib/studio/client";
import { formatClock } from "@/lib/studio/timing";
import type { AssetKind, StudioAssetDto } from "@/lib/studio/types";

const tabs: Array<{ kind: AssetKind; label: string; icon: typeof ImageIcon }> = [
  { kind: "image", label: "Images", icon: ImageIcon },
  { kind: "video", label: "Videos", icon: Film },
  { kind: "audio", label: "Audio", icon: FileAudio }
];

export function useAssetList(kind: AssetKind, query: string, open: boolean, folderId?: string | null) {
  const [assets, setAssets] = useState<StudioAssetDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const folder = folderId ? `&folder=${encodeURIComponent(folderId)}` : "";
      const data = await api<{ assets: StudioAssetDto[] }>(`/api/studio/assets?kind=${kind}&usage=1&q=${encodeURIComponent(query)}${folder}${folderId ? "&take=500" : ""}`);
      setAssets(data.assets);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [folderId, kind, query]);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setAssets(null);
      void reload();
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [open, reload, query]);
  return { assets, error, reload, setAssets };
}

/**
 * Asset Library drawer: browse, search, upload and pick an image/video/audio
 * asset. Used by the layout editor ("Replace Media"), the template editor and
 * the Import Full Narration flow.
 */
export function AssetLibrary({
  open,
  onClose,
  onSelect,
  kinds = ["image", "video"],
  title = "Asset Library",
  description,
  selectedIds = [],
  canManage = false
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: StudioAssetDto) => void;
  kinds?: AssetKind[];
  title?: string;
  description?: string;
  selectedIds?: string[];
  canManage?: boolean;
}) {
  const [kind, setKind] = useState<AssetKind>(kinds[0]);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { assets, error, reload, setAssets } = useAssetList(kind, query, open);
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setNotice(null);
    for (const file of Array.from(files)) {
      const detected = kindForFile(file);
      if (!detected || !kinds.includes(detected)) {
        setNotice(`"${file.name}" is not a supported ${kinds.join("/")} file.`);
        continue;
      }
      try {
        setUploading({ name: file.name, progress: 0 });
        const asset = await uploadAsset(file, { kind: detected, onProgress: (fraction) => setUploading({ name: file.name, progress: fraction }) });
        setKind(detected);
        setAssets((list) => [asset, ...(list ?? [])]);
      } catch (caught) {
        setNotice((caught as Error).message);
      } finally {
        setUploading(null);
      }
    }
    await reload();
  }

  async function remove(asset: StudioAssetDto) {
    if (!window.confirm(`Delete "${asset.name}" from the library?`)) return;
    try {
      await api(`/api/studio/assets/${asset.id}`, { method: "DELETE" });
      setAssets((list) => (list ?? []).filter((entry) => entry.id !== asset.id));
    } catch (caught) {
      setNotice((caught as Error).message);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={title} description={description}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[#8b9bad]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets by name or tag…" className="mlp-input w-full pl-10" />
      </div>
      {kinds.length > 1 && (
        <div className="mt-4 grid grid-cols-3 rounded-lg border border-[#d8dde5] bg-white p-1">
          {tabs
            .filter((tab) => kinds.includes(tab.kind))
            .map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.kind} type="button" onClick={() => setKind(tab.kind)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${kind === tab.kind ? "bg-[#f2f4f7] text-[#243447]" : "text-[#6b7c8f]"}`}>
                  <Icon className="size-4" /> {tab.label}
                </button>
              );
            })}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[#526579]">{assets ? `${assets.length} item${assets.length === 1 ? "" : "s"} in ${tabs.find((tab) => tab.kind === kind)?.label}` : "Loading…"}</span>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={Boolean(uploading)} className="mlp-btn-outline h-10">
          {uploading ? <Spinner /> : <Upload className="size-4" />} Upload New
        </button>
        <input ref={fileInput} type="file" multiple accept={kinds.map((entry) => `${entry}/*`).join(",")} className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
      </div>
      {uploading && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs font-bold text-[#526579]"><span className="truncate">Uploading {uploading.name}</span><span>{Math.round(uploading.progress * 100)}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]"><div className="h-full bg-[#a64026] transition-all" style={{ width: `${Math.round(uploading.progress * 100)}%` }} /></div>
        </div>
      )}
      {(notice || error) && (
        <div className="mt-3">
          <InlineNotice tone="error" onDismiss={() => setNotice(null)}>{notice || error}</InlineNotice>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {assets?.map((asset) => {
          const selected = selectedIds.includes(asset.id);
          return (
            <div key={asset.id} className={`group relative overflow-hidden rounded-xl border bg-white text-left transition ${selected ? "border-[#a64026] ring-2 ring-[#a64026]/20" : "border-[#d8dde5] hover:border-[#c9d0da]"}`}>
              <button type="button" onClick={() => onSelect(asset)} className="block w-full text-left">
                <span className="relative block aspect-video bg-[#f2f4f7]">
                  <AssetThumb asset={asset} />
                  {selected && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[#a64026] text-white"><Check className="size-3.5" /></span>}
                  {asset.kind !== "image" && asset.durationSec ? <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-extrabold text-white">{formatClock(asset.durationSec)}</span> : null}
                </span>
                <span className="block p-3">
                  <span className="block truncate text-sm font-extrabold text-[#243447]">{asset.name}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-[#6b7c8f]"><Layers className="size-3" /> Used in {asset.usedIn ?? 0} segment{asset.usedIn === 1 ? "" : "s"} · {formatBytes(asset.sizeBytes)}</span>
                </span>
              </button>
              {canManage && (
                <button type="button" onClick={() => remove(asset)} className="absolute left-2 top-2 hidden size-7 place-items-center rounded-md bg-white/90 text-red-600 shadow group-hover:grid" aria-label="Delete asset" title="Delete asset">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {assets && assets.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-[#d8dde5] p-8 text-center text-sm text-[#6b7c8f]">Nothing here yet. Upload a file to get started.</div>
        )}
        {!assets && !error && (
          <div className="col-span-full flex items-center justify-center gap-2 p-8 text-sm text-[#6b7c8f]"><Spinner /> Loading assets…</div>
        )}
      </div>
    </Drawer>
  );
}

export function AssetThumb({ asset, className = "" }: { asset: StudioAssetDto; className?: string }) {
  if (asset.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnailUrl || asset.url} alt="" className={`h-full w-full object-cover ${className}`} draggable={false} />;
  }
  if (asset.kind === "video") {
    if (asset.thumbnailUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={asset.thumbnailUrl} alt="" className={`h-full w-full object-cover ${className}`} draggable={false} />;
    }
    return <video src={asset.url} muted preload="metadata" className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <span className={`grid h-full w-full place-items-center bg-[#f3e8e6] text-[#a64026] ${className}`}>
      <FileAudio className="size-8" />
    </span>
  );
}
