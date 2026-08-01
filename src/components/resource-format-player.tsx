"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, ListVideo, Search, Sparkles } from "lucide-react";
import { SmartImage } from "@/components/smart-image";
import { youtubeWatchUrl } from "@/lib/youtube";

export type ClipResource = {
  id: string;
  title: string;
  resourceTitle: string | null;
  resourceType: string;
  resourceFormat: string;
  description: string | null;
  duration: string | null;
  category: string;
  resourceSubmenu: string | null;
  thumbnailSrc: string;
  youtubeVideoId: string | null;
};

export function ResourceFormatPlayer({
  resources,
  initialResourceId,
  languageName,
  format,
  searchTerm
}: {
  resources: ClipResource[];
  initialResourceId?: string;
  languageName: string;
  format: string;
  searchTerm?: string;
}) {
  const playerRef = useRef<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState(initialResourceId ?? resources[0]?.id ?? "");
  const selectedIndex = Math.max(0, resources.findIndex((resource) => resource.id === selectedId));
  const selected = resources[selectedIndex] ?? resources[0] ?? null;
  const previous = selectedIndex > 0 ? resources[selectedIndex - 1] : null;
  const next = selectedIndex >= 0 && selectedIndex < resources.length - 1 ? resources[selectedIndex + 1] : null;

  const title = selected?.resourceTitle || selected?.title || "";
  const clipLabel = useMemo(() => (resources.length === 1 ? "Clip" : "Clips"), [resources.length]);

  function chooseClip(resourceId: string, scrollToPlayer = false) {
    setSelectedId(resourceId);
    const params = new URLSearchParams(window.location.search);
    params.set("resource", resourceId);
    if (!searchTerm) params.delete("q");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    if (scrollToPlayer) {
      window.requestAnimationFrame(() => {
        playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  if (!selected) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-[#edf0f3]">
        <Sparkles className="mx-auto mb-4 size-10 text-[#a64026]" />
        <h2 className="text-2xl font-extrabold">Future Resources / Coming Soon</h2>
        <p className="mx-auto mt-3 max-w-xl text-[#6b7c8f]">
          No published clips match this language and resource format yet. Try resetting the search or check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <article ref={playerRef} className="scroll-mt-24 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#edf0f3]">
        <div className="relative aspect-video overflow-hidden bg-black">
          {selected.youtubeVideoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${selected.youtubeVideoId}`}
              title={title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <SmartImage src={selected.thumbnailSrc} alt="" fill className="h-full w-full object-cover" sizes="100vw" />
          )}
        </div>
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="mlp-badge">{languageName}</span>
            <span className="mlp-soft-badge">{format}</span>
            {selected.resourceSubmenu && <span className="mlp-soft-badge">{selected.resourceSubmenu}</span>}
            <span className="mlp-soft-badge">{selected.resourceType}</span>
          </div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {selected.description && <p className="mt-3 leading-relaxed text-[#526579]">{selected.description}</p>}
          <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
            {previous ? (
              <button type="button" onClick={() => chooseClip(previous.id)} className="mlp-btn-outline w-full sm:w-auto">
                <ArrowLeft className="size-4" /> Previous Clip
              </button>
            ) : (
              <span className="mlp-btn-outline w-full opacity-50 sm:w-auto" aria-disabled="true">
                <ArrowLeft className="size-4" /> Previous Clip
              </span>
            )}
            {next ? (
              <button type="button" onClick={() => chooseClip(next.id)} className="mlp-btn-primary w-full sm:w-auto">
                Next Clip <ArrowRight className="size-4" />
              </button>
            ) : (
              <span className="mlp-btn-primary w-full opacity-50 sm:w-auto" aria-disabled="true">
                Next Clip <ArrowRight className="size-4" />
              </span>
            )}
            {selected.youtubeVideoId && (
              <a href={youtubeWatchUrl(selected.youtubeVideoId)} target="_blank" rel="noreferrer" className="mlp-btn-outline w-full sm:w-auto">
                <ExternalLink className="size-4" /> Open on YouTube
              </a>
            )}
          </div>
        </div>
      </article>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold">
              <ListVideo className="size-5 text-[#a64026]" /> {clipLabel} in {format}
            </h2>
            <p className="mt-1 text-sm text-[#6b7c8f]">
              {resources.length} published clip{resources.length === 1 ? "" : "s"} available in {languageName}
            </p>
          </div>
          {searchTerm && (
            <span className="inline-flex items-center gap-2 rounded-full bg-[#f7f8fa] px-3 py-1 text-xs font-bold text-[#526579]">
              <Search className="size-3" /> Filtered
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resources.map((resource, index) => {
            const isActive = resource.id === selected.id;
            return (
              <button
                type="button"
                key={resource.id}
                onClick={() => chooseClip(resource.id, true)}
                className={`group w-full rounded-xl border p-2 text-left transition active:scale-[0.99] ${
                  isActive
                    ? "border-[#e2c8c2] bg-[#fbeaea] text-[#a64026]"
                    : "border-[#edf0f3] bg-white hover:border-[#d8dde5] hover:bg-[#fbfcfd]"
                }`}
              >
                <span className="flex gap-3">
                  <span className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-[#f2f4f7] ring-1 ring-[#edf0f3]">
                    <SmartImage src={resource.thumbnailSrc} alt="" fill className="object-cover" sizes="112px" />
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="line-clamp-2 font-extrabold leading-snug text-[#243447] group-hover:text-[#a64026]">
                      {index + 1}. {resource.resourceTitle || resource.title}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-[#6b7c8f]">{resource.resourceType}</span>
                    {resource.duration && <span className="mt-1 block text-xs font-semibold text-[#6b7c8f]">{resource.duration}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
