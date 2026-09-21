"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FolderKanban, Languages, Plus, Trash2 } from "lucide-react";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { EmptyState, Field, InlineNotice, Modal, Spinner, StatusPill, inputClass } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import { studioAudiences, studioLanguages, studioRegisters } from "@/lib/studio/languages";
import type { ProjectSummaryDto, TemplateSummaryDto } from "@/lib/studio/types";

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

  async function remove(project: ProjectSummaryDto) {
    if (!window.confirm(`Delete "${project.title} — ${project.targetLanguageName}"? Translations and narration for this localization will be removed.`)) return;
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
                    <p className="mt-1 text-sm text-[#6b7c8f]">
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
        onCreated={(id) => {
          setCreating(false);
          router.push(`/studio/projects/${id}`);
        }}
        canManageTemplates={canManageTemplates}
      />
    </>
  );
}

function NewLocalizationModal({ open, onClose, onCreated, canManageTemplates }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; canManageTemplates: boolean }) {
  const [templates, setTemplates] = useState<TemplateSummaryDto[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [languageChoice, setLanguageChoice] = useState("rw");
  const [customLanguage, setCustomLanguage] = useState("");
  const [region, setRegion] = useState("");
  const [variety, setVariety] = useState("");
  const [audience, setAudience] = useState("Adult learners");
  const [register, setRegister] = useState(studioRegisters[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api<{ templates: TemplateSummaryDto[] }>("/api/studio/templates?ready=1")
      .then((data) => {
        setError(null);
        setTemplates(data.templates);
        setTemplateId((current) => current || data.templates[0]?.id || "");
      })
      .catch((caught) => setError((caught as Error).message));
  }, [open]);

  const language = useMemo(() => studioLanguages.find((entry) => entry.code === languageChoice) ?? null, [languageChoice]);
  const selectedTemplate = templates?.find((entry) => entry.id === templateId) ?? null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const languageName = languageChoice === "custom" ? customLanguage.trim() : language?.name ?? "";
      const languageCode = languageChoice === "custom" ? customLanguage.trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 8) || "xx" : languageChoice;
      const result = await api<{ id: string }>("/api/studio/projects", {
        method: "POST",
        json: { templateId, languageCode, languageName, region: region || null, variety: variety || null, audience: audience || null, register: register || null }
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
      title="New Localization"
      description="Choose a lesson and the language you will narrate it in."
      footer={
        <>
          <button type="button" onClick={onClose} className="mlp-btn-outline">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !templateId || (languageChoice === "custom" && !customLanguage.trim())} className="mlp-btn-primary">
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
      <section>
        <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-[#6b7c8f]">Lesson</h3>
        {templates === null ? (
          <div className="flex items-center gap-2 text-sm text-[#6b7c8f]"><Spinner /> Loading lessons…</div>
        ) : templates.length === 0 ? (
          <InlineNotice tone="warning">
            No lessons are ready for localization yet.{canManageTemplates ? " Prepare one under Master Templates and mark it ready." : " Ask an MLP content manager to prepare a master template."}
          </InlineNotice>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setTemplateId(template.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${templateId === template.id ? "border-[#a64026] bg-[#fbeaea]/60 ring-2 ring-[#a64026]/15" : "border-[#d8dde5] bg-white hover:border-[#c9d0da]"}`}
              >
                <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-[#f2f4f7]">
                  {template.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={template.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[#8b9bad]"><FolderKanban className="size-5" /></span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold text-[#243447]">{template.title}</span>
                  <span className="block truncate text-xs text-[#6b7c8f]">{template.moduleName ?? "Marketplace Literacy"} · {template.segmentCount} segments</span>
                  <span className="block truncate text-xs text-[#6b7c8f]">{template.languages.length ? `Also in: ${template.languages.join(", ")}` : "No localizations yet"}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Language">
          <select
            value={languageChoice}
            onChange={(event) => {
              const next = event.target.value;
              setLanguageChoice(next);
              setRegion(studioLanguages.find((entry) => entry.code === next)?.regions?.[0] ?? "");
              setVariety("");
            }}
            className={inputClass}
          >
            {studioLanguages.map((entry) => (
              <option key={entry.code} value={entry.code}>{entry.name}</option>
            ))}
            <option value="custom">Another language…</option>
          </select>
        </Field>
        {languageChoice === "custom" ? (
          <Field label="Language name">
            <input value={customLanguage} onChange={(event) => setCustomLanguage(event.target.value)} placeholder="e.g. Tigrinya" className={inputClass} />
          </Field>
        ) : (
          <Field label="Region / country">
            <input list="studio-regions" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Optional" className={inputClass} />
            <datalist id="studio-regions">{(language?.regions ?? []).map((entry) => <option key={entry} value={entry} />)}</datalist>
          </Field>
        )}
        {(language?.varieties?.length || languageChoice === "custom") ? (
          <Field label="Variety / dialect" hint="Only when it changes how the narration should sound.">
            <input list="studio-varieties" value={variety} onChange={(event) => setVariety(event.target.value)} placeholder="Optional" className={inputClass} />
            <datalist id="studio-varieties">{(language?.varieties ?? []).map((entry) => <option key={entry} value={entry} />)}</datalist>
          </Field>
        ) : null}
        <Field label="Audience">
          <select value={audience} onChange={(event) => setAudience(event.target.value)} className={inputClass}>
            {studioAudiences.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </Field>
        <Field label="Register">
          <select value={register} onChange={(event) => setRegister(event.target.value)} className={inputClass}>
            {studioRegisters.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </Field>
      </section>
      {selectedTemplate && (
        <p className="mt-5 text-sm text-[#6b7c8f]">
          You will localize <strong className="text-[#243447]">{selectedTemplate.title}</strong> ({selectedTemplate.segmentCount} segments) into <strong className="text-[#243447]">{languageChoice === "custom" ? customLanguage || "…" : language?.name}</strong>.
        </p>
      )}
    </Modal>
  );
}
