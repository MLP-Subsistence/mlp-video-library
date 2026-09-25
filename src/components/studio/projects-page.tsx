"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileAudio, FolderKanban, Languages, ListOrdered, Plus, Trash2, Upload } from "lucide-react";
import { Flag, LanguagePicker, RegionPicker, projectFlag, suggestedCountries } from "@/components/studio/language-picker";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { setPendingVoiceover } from "@/components/studio/workspace/pending-voiceover";
import { EmptyState, Field, InlineNotice, Modal, Spinner, StatusPill, inputClass, useConfirm } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import { studioAudiences, studioLanguages, studioRegisters } from "@/lib/studio/languages";
import type { LibraryPlaylistDto, ProjectSummaryDto } from "@/lib/studio/types";

export function projectStatusLabel(status: string) {
  switch (status) {
    case "rendering":
      return { label: "Generating video", tone: "accent" as const };
    case "ready":
      return { label: "Video ready", tone: "ready" as const };
    case "approved":
      return { label: "Approved", tone: "ready" as const };
    case "published":
      return { label: "Published", tone: "ready" as const };
    default:
      return { label: "In progress", tone: "muted" as const };
  }
}

export function ProjectsPage({ initialProjects, canManageTemplates }: { initialProjects: ProjectSummaryDto[]; canManageTemplates: boolean }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function remove(project: ProjectSummaryDto) {
    if (!(await confirm({ title: `Delete "${project.title} — ${project.targetLanguageName}"?`, message: "Translations and narration for this localization will be removed. This cannot be undone." }))) return;
    try {
      await api(`/api/studio/projects/${project.id}`, { method: "DELETE" });
      setProjects((list) => list.filter((entry) => entry.id !== project.id));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <>
      <StudioPageHeader
        title="Educator Studio"
        subtitle="Create and manage localized Marketplace Literacy lessons."
        actions={
          <button type="button" onClick={() => setCreating(true)} className="mlp-btn-primary">
            <Plus className="size-4" /> New Localization
          </button>
        }
      />
      <main className="px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        {error && (
          <div className="mb-5">
            <InlineNotice tone="error" onDismiss={() => setError(null)}>{error}</InlineNotice>
          </div>
        )}
        <h2 className="mb-4 text-xl font-extrabold text-[#243447]">Your Projects</h2>
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No localizations yet"
            action={
              <button type="button" onClick={() => setCreating(true)} className="mlp-btn-primary">
                <Plus className="size-4" /> New Localization
              </button>
            }
          >
            Choose a Marketplace Literacy lesson and a language to get started. Translation, narration and video generation happen inside the studio.
            {canManageTemplates && " Content managers prepare lessons under Master Templates first."}
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {projects.map((project) => {
              const status = projectStatusLabel(project.status);
              const pct = project.segmentCount ? Math.round((project.narrationReady / project.segmentCount) * 100) : 0;
              return (
                <article key={project.id} className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] sm:flex-row sm:items-center sm:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-extrabold text-[#243447]">{project.title}</h3>
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-[#6b7c8f]">
                      <Flag code={projectFlag("", project.targetLanguageName, project.region)} className="h-3 w-4" />
                      {project.targetLanguageName}
                      {project.region ? ` · ${project.region}` : ""}
                      {!canManageTemplates ? "" : ` · ${project.createdByName}`}
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 w-40 overflow-hidden rounded-full bg-[#f2f4f7]">
                        <div className="h-full rounded-full bg-[#a64026]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-[#526579]">Narration: {project.narrationReady} / {project.segmentCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => remove(project)} className="mlp-btn-outline h-10 border-red-200 px-3 text-red-700" title="Delete project">
                      <Trash2 className="size-4" />
                    </button>
                    <Link href={`/studio/projects/${project.id}`} className="mlp-btn-primary h-10">
                      Continue <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <NewLocalizationModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id, voiceover) => {
          setCreating(false);
          if (voiceover) setPendingVoiceover(id, voiceover.file);
          router.push(`/studio/projects/${id}${voiceover ? "?voiceover=1" : ""}`);
        }}
        canManageTemplates={canManageTemplates}
      />
      {confirmDialog}
    </>
  );
}


function NewLocalizationModal({ open, onClose, onCreated, canManageTemplates }: { open: boolean; onClose: () => void; onCreated: (id: string, voiceover: { file: File | null } | null) => void; canManageTemplates: boolean }) {
  const [playlists, setPlaylists] = useState<LibraryPlaylistDto[] | null>(null);
  const [playlistId, setPlaylistId] = useState("");
  const [videoId, setVideoId] = useState("");
  const [language, setLanguage] = useState<{ code: string; name: string }>({ code: "rw", name: "Kinyarwanda" });
  const [region, setRegion] = useState("Rwanda");
  const [variety, setVariety] = useState("");
  const [audience, setAudience] = useState("Adult learners");
  const [register, setRegister] = useState(studioRegisters[0]);
  const [voiceMode, setVoiceMode] = useState<"segments" | "whole">("segments");
  const [voiceoverFile, setVoiceoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api<{ playlists: LibraryPlaylistDto[] }>("/api/studio/library/playlists")
      .then((data) => {
        setError(null);
        setPlaylists(data.playlists);
        setPlaylistId((current) => current || data.playlists.find((entry) => entry.isDefault)?.id || data.playlists.find((entry) => entry.readyCount > 0)?.id || data.playlists[0]?.id || "");
      })
      .catch((caught) => setError((caught as Error).message));
  }, [open]);

  const varieties = useMemo(() => studioLanguages.find((entry) => entry.code === language.code)?.varieties ?? [], [language.code]);
  const playlist = playlists?.find((entry) => entry.id === playlistId) ?? null;
  const video = playlist?.videos.find((entry) => entry.id === videoId) ?? null;
  const step = !video ? 1 : 2;

  async function submit() {
    if (!video?.templateId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ id: string }>("/api/studio/projects", {
        method: "POST",
        json: { templateId: video.templateId, languageCode: language.code, languageName: language.name, region: region || null, variety: variety || null, audience: audience || null, register: register || null }
      });
      onCreated(result.id, voiceMode === "whole" ? { file: voiceoverFile } : null);
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
      title="New Localization"
      description="Pick a playlist, then the lesson you want to narrate in another language."
      wide
      footer={
        <>
          {video && (
            <button type="button" onClick={() => setVideoId("")} className="mr-auto text-sm font-bold text-[#a64026]">
              ← Choose a different lesson
            </button>
          )}
          <button type="button" onClick={onClose} className="mlp-btn-outline">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !video?.templateId || video.templateStatus !== "ready" || !language.name.trim()} className="mlp-btn-primary">
            {busy ? <Spinner /> : <Languages className="size-4" />} Start Localization
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-4">
          <InlineNotice tone="error">{error}</InlineNotice>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-5 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">1 · Playlist</h3>
            {playlists === null ? (
              <div className="flex items-center gap-2 text-sm text-[#6b7c8f]"><Spinner /> Loading playlists…</div>
            ) : playlists.length === 0 ? (
              <InlineNotice tone="warning">The library has no playlists yet.</InlineNotice>
            ) : (
              <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
                {playlists.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => { setPlaylistId(entry.id); setVideoId(""); }} className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${playlistId === entry.id ? "bg-[#fbeaea] font-extrabold text-[#243447] ring-1 ring-[#e5ccd0]" : "font-semibold text-[#526579] hover:bg-[#f7f8fa]"}`}>
                    <span className="min-w-0">
                      <span className="block truncate">{entry.title}{entry.isDefault ? <span className="ml-1 rounded bg-[#fbeaea] px-1 text-[10px] font-extrabold uppercase text-[#a64026]">Main</span> : null}</span>
                      <span className="block text-xs font-normal text-[#8b9bad]">{entry.language ?? "—"} · {entry.videoCount} lesson{entry.videoCount === 1 ? "" : "s"}</span>
                    </span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${entry.readyCount ? "bg-green-50 text-green-700" : "bg-[#f2f4f7] text-[#8b9bad]"}`}>{entry.readyCount} ready</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">2 · Lesson{playlist ? ` in ${playlist.title}` : ""}</h3>
            {!playlist ? (
              <p className="text-sm text-[#6b7c8f]">Choose a playlist first.</p>
            ) : (
              <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                {playlist.videos.map((entry) => {
                  const ready = entry.templateStatus === "ready";
                  return (
                    <div key={entry.id} className={`flex items-center gap-3 rounded-xl border p-3 ${ready ? "border-[#d8dde5] bg-white" : "border-dashed border-[#d8dde5] bg-[#fbfcfd]"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold text-[#243447]">{entry.title}</span>
                        <span className="block truncate text-xs text-[#6b7c8f]">{entry.category} · {entry.resourceFormat}{entry.duration ? ` · ${entry.duration}` : ""}</span>
                        <span className="block truncate text-xs text-[#6b7c8f]">
                          {ready ? `${entry.segmentCount} segments${entry.localizedInto.length ? ` · also in ${entry.localizedInto.join(", ")}` : ""}` : entry.templateStatus === "draft" ? "Master template still in draft" : "Not prepared for localization yet"}
                        </span>
                      </span>
                      {ready ? (
                        <button type="button" onClick={() => setVideoId(entry.id)} className="mlp-btn-primary h-9 px-3 text-xs">Choose</button>
                      ) : canManageTemplates ? (
                        <a href={entry.templateId ? `/studio/templates/${entry.templateId}` : "/studio/templates"} className="mlp-btn-outline h-9 px-3 text-xs">{entry.templateId ? "Finish template" : "Prepare"}</a>
                      ) : (
                        <span className="text-xs text-[#8b9bad]">Ask a content manager</span>
                      )}
                    </div>
                  );
                })}
                {playlist.videos.length === 0 && <p className="text-sm text-[#6b7c8f]">This playlist has no lessons.</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 2 && video && (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-[#e5ccd0] bg-[#fbeaea]/50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={video.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold text-[#243447]">{video.title}</span>
              <span className="block text-xs text-[#6b7c8f]">{playlist?.title} · {video.segmentCount} segments</span>
            </span>
          </div>
          <h3 className="mb-2 mt-5 text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">3 · Language</h3>
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Language">
                <LanguagePicker
                  value={language}
                  onChange={(choice) => {
                    setLanguage({ code: choice.code, name: choice.name });
                    setRegion(suggestedCountries(choice)[0]?.name ?? "");
                    setVariety("");
                  }}
                />
              </Field>
            </div>
            <Field label="Audience">
              <select value={audience} onChange={(event) => setAudience(event.target.value)} className={inputClass}>
                {studioAudiences.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </Field>
          </section>

          <details className="mt-4 group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-bold text-[#a64026]">
              More options <span className="text-[#8b9bad] transition-transform group-open:rotate-180">▾</span>
            </summary>
            <p className="mt-1 text-xs text-[#8b9bad]">Region, a specific dialect, or a formal/informal register — only if the default wouldn&apos;t sound right.</p>
            <section className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Region / country">
                <RegionPicker value={region} onChange={setRegion} language={language} />
              </Field>
              <Field label="Variety / dialect" hint="Only when it changes how the narration should sound.">
                <input list="studio-varieties" value={variety} onChange={(event) => setVariety(event.target.value)} placeholder={varieties[0] ? `e.g. ${varieties[0]} (optional)` : "Optional"} className={inputClass} />
                <datalist id="studio-varieties">{varieties.map((entry) => <option key={entry} value={entry} />)}</datalist>
              </Field>
              <Field label="Register" hint="How formal the narration should sound.">
                <select value={register} onChange={(event) => setRegister(event.target.value)} className={inputClass}>
                  {studioRegisters.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </Field>
            </section>
          </details>
          <h3 className="mb-2 mt-5 text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">4 · Voice-over</h3>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How will you add the voice-over?">
            <button type="button" role="radio" aria-checked={voiceMode === "segments"} onClick={() => setVoiceMode("segments")} className={`rounded-xl border p-4 text-left ${voiceMode === "segments" ? "border-[#a64026] bg-[#fbeaea]/60 ring-2 ring-[#a64026]/15" : "border-[#d8dde5] hover:border-[#c9d0da]"}`}>
              <span className="flex items-center gap-2 text-sm font-extrabold text-[#243447]"><ListOrdered className="size-4 text-[#a64026]" /> Segment by segment</span>
              <span className="mt-1 block text-xs text-[#6b7c8f]">Translate each of the {video.segmentCount} lines, then record, generate with AI or upload each one.</span>
            </button>
            <button type="button" role="radio" aria-checked={voiceMode === "whole"} onClick={() => setVoiceMode("whole")} className={`rounded-xl border p-4 text-left ${voiceMode === "whole" ? "border-[#a64026] bg-[#fbeaea]/60 ring-2 ring-[#a64026]/15" : "border-[#d8dde5] hover:border-[#c9d0da]"}`}>
              <span className="flex items-center gap-2 text-sm font-extrabold text-[#243447]"><FileAudio className="size-4 text-[#a64026]" /> I already have the whole voice-over</span>
              <span className="mt-1 block text-xs text-[#6b7c8f]">One audio or video file of the whole lesson. We cut it into the {video.segmentCount} segments for you, and the pictures follow it.</span>
            </button>
          </div>
          {voiceMode === "whole" && (
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[#d8dde5] bg-[#f7f8fa] p-4 hover:border-[#a64026]/50">
              <Upload className="size-5 shrink-0 text-[#a64026]" />
              <span className="min-w-0 text-sm">
                <span className="block truncate font-bold text-[#243447]">{voiceoverFile ? voiceoverFile.name : "Choose the voice-over file now (optional)"}</span>
                <span className="block text-xs text-[#6b7c8f]">{voiceoverFile ? "It opens as soon as the lesson is created." : "MP3, WAV, M4A… or the video it's in. You can also choose it on the next screen."}</span>
              </span>
              <input type="file" accept="audio/*,video/*" className="hidden" onChange={(event) => setVoiceoverFile(event.target.files?.[0] ?? null)} />
            </label>
          )}
          <p className="mt-5 text-sm text-[#6b7c8f]">
            You will localize <strong className="text-[#243447]">{video.title}</strong> ({video.segmentCount} segments) into <strong className="text-[#243447]">{language.name}</strong>. The original visuals and pacing come with it; you replace the narration.
          </p>
        </>
      )}
    </Modal>
  );
}
