"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, LayoutTemplate, Plus, Search } from "lucide-react";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { EmptyState, Field, InlineNotice, Modal, Spinner, StatusPill, inputClass } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import type { TemplateSummaryDto } from "@/lib/studio/types";

type LibraryVideo = { id: string; title: string; category: string; resourceFormat: string; language: string | null; languageCode: string; moduleId: string | null; thumbnailUrl: string; hasTranscript: boolean; duration: string | null };

/** Master Templates list (content managers). */
export function TemplatesPage({ initialTemplates }: { initialTemplates: TemplateSummaryDto[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <StudioPageHeader
        title="Master Templates"
        subtitle="Prepare a lesson once — segments, scripts and visuals — then localize it into any language."
        actions={
          <button type="button" onClick={() => setCreating(true)} className="mlp-btn-primary"><Plus className="size-4" /> New Master Template</button>
        }
      />
      <main className="px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        {initialTemplates.length === 0 ? (
          <EmptyState icon={LayoutTemplate} title="No master templates yet" action={<button type="button" onClick={() => setCreating(true)} className="mlp-btn-primary"><Plus className="size-4" /> New Master Template</button>}>
            Start from an existing library lesson (its transcript becomes the first draft of the segments) or from a blank template.
          </EmptyState>
        ) : (
          <div className="space-y-8">
            {groupByPlaylist(initialTemplates).map((group) => (
              <section key={group.key}>
                <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-[#6b7c8f]">
                  {group.title} <span className="font-semibold normal-case tracking-normal">· {group.templates.length} lesson{group.templates.length === 1 ? "" : "s"}</span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.templates.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <NewTemplateModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/studio/templates/${id}`)} />
    </>
  );
}

/** Cards grouped by the playlist the lesson belongs to, in the order the server returned (main playlist first, lessons in script order). */
function groupByPlaylist(templates: TemplateSummaryDto[]) {
  const groups: Array<{ key: string; title: string; templates: TemplateSummaryDto[] }> = [];
  for (const template of templates) {
    const key = template.playlistId ?? "none";
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      group = { key, title: template.playlistTitle ?? "Not in a playlist", templates: [] };
      groups.push(group);
    }
    group.templates.push(template);
  }
  return groups;
}

function TemplateCard({ template }: { template: TemplateSummaryDto }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#edf0f3]">
      <div className="relative aspect-video bg-[#f2f4f7]">
        {template.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={template.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[#8b9bad]"><LayoutTemplate className="size-8" /></span>
        )}
        <span className="absolute left-3 top-3"><StatusPill tone={template.status === "ready" ? "ready" : "warning"}>{template.status === "ready" ? "Ready" : "Draft"}</StatusPill></span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-lg font-extrabold text-[#243447]">{template.title}</h3>
        <p className="mt-1 text-sm text-[#6b7c8f]">{template.moduleName ?? "Marketplace Literacy"} · {template.segmentCount} segment{template.segmentCount === 1 ? "" : "s"}</p>
        <p className="mt-1 text-xs text-[#6b7c8f]">{template.languages.length ? `Localized: ${template.languages.join(", ")}` : "No localizations yet"}</p>
        <div className="mt-auto pt-4">
          <Link href={`/studio/templates/${template.id}`} className="mlp-btn-dark min-h-11 w-full">Open template <ArrowRight className="size-4" /></Link>
        </div>
      </div>
    </article>
  );
}

function NewTemplateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<LibraryVideo[] | null>(null);
  const [modules, setModules] = useState<Array<{ id: string; name: string }>>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [importTranscript, setImportTranscript] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      api<{ videos: LibraryVideo[]; modules: Array<{ id: string; name: string }> }>(`/api/studio/library?q=${encodeURIComponent(query)}`)
        .then((data) => {
          setVideos(data.videos);
          setModules(data.modules);
        })
        .catch((caught) => setError((caught as Error).message));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query]);

  const selected = videos?.find((video) => video.id === videoId) ?? null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ id: string }>("/api/studio/templates", {
        method: "POST",
        json: { title: title || selected?.title, sourceVideoId: videoId, moduleId: moduleId || selected?.moduleId || null, sourceLanguageCode: selected?.languageCode ?? "en", importTranscript }
      });
      onCreated(result.id);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Master Template"
      description="Pick the library lesson this template represents, or start blank."
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="mlp-btn-outline">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || (!videoId && !title.trim())} className="mlp-btn-primary">{busy ? <Spinner /> : <Plus className="size-4" />} Create template</button>
        </>
      }
    >
      {error && <div className="mb-4"><InlineNotice tone="error">{error}</InlineNotice></div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_18.75rem]">
        <div>
          <div className="mlp-input flex items-center gap-2">
            <Search className="size-4 shrink-0 text-[#8b9bad]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library lessons…" className="h-full w-full border-0 bg-transparent p-0 text-[#243447] outline-none" />
          </div>
          <div className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            <button type="button" onClick={() => setVideoId(null)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${videoId === null ? "border-[#a64026] bg-[#fbeaea]/60" : "border-[#d8dde5]"}`}>
              <span className="grid h-14 w-24 shrink-0 place-items-center rounded-lg bg-[#f2f4f7] text-[#8b9bad]"><LayoutTemplate className="size-5" /></span>
              <span><span className="block text-sm font-extrabold text-[#243447]">Blank template</span><span className="block text-xs text-[#6b7c8f]">Add segments and scripts yourself.</span></span>
            </button>
            {videos === null ? (
              <div className="flex items-center gap-2 p-3 text-sm text-[#6b7c8f]"><Spinner /> Loading library…</div>
            ) : (
              videos.map((video) => (
                <button key={video.id} type="button" onClick={() => setVideoId(video.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${videoId === video.id ? "border-[#a64026] bg-[#fbeaea]/60" : "border-[#d8dde5] hover:border-[#c9d0da]"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={video.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold text-[#243447]">{video.title}</span>
                    <span className="block truncate text-xs text-[#6b7c8f]">{video.category} · {video.language ?? "—"} · {video.resourceFormat}{video.duration ? ` · ${video.duration}` : ""}</span>
                    <span className="block text-xs text-[#6b7c8f]">{video.hasTranscript ? "Transcript available" : "No transcript"}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Template title">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={selected?.title ?? "e.g. Consumer Literacy — Lesson 3"} className={inputClass} />
          </Field>
          <Field label="Module / category">
            <select value={moduleId || selected?.moduleId || ""} onChange={(event) => setModuleId(event.target.value)} className={inputClass}>
              <option value="">Use the lesson&apos;s category</option>
              {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
            </select>
          </Field>
          {selected?.hasTranscript && (
            <label className="flex items-start gap-3 rounded-xl border border-[#d8dde5] p-3 text-sm">
              <input type="checkbox" checked={importTranscript} onChange={(event) => setImportTranscript(event.target.checked)} className="mt-1 accent-[#a64026]" />
              <span><span className="block font-extrabold text-[#243447]">Split the transcript into starter segments</span><span className="block text-xs text-[#6b7c8f]">You can merge, split and rename them afterwards.</span></span>
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
