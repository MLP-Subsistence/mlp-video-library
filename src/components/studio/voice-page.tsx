"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Check,
  Clock,
  Coins,
  ListMusic,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  X
} from "lucide-react";
import { PreviewButton, pauseOtherAudio, stopPreview } from "@/components/studio/audio-preview";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { Field, InlineNotice, Spinner, StatusPill, inputClass } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import { ELEVENLABS_LANGUAGES } from "@/lib/studio/elevenlabs-languages";
import { TRANSLATION_TIER_GUIDANCE, TRANSLATION_TIER_LABEL, findTranslationLanguage } from "@/lib/studio/language-catalog";
import { formatSeconds } from "@/lib/studio/timing";
import type { ProjectDto, VoiceAccountStatus, VoiceHistoryEntry, VoiceModelOption, VoiceOption, VoiceSettings } from "@/lib/studio/types";

type VoicesResponse = { provider: string; model: string; voices: VoiceOption[]; credits: { limit: number; used: number; remaining: number } };
type AccountResponse = { provider: string; defaultModel: string; status: VoiceAccountStatus | null; models: VoiceModelOption[] };
type Notice = { tone: "info" | "success" | "warning" | "error"; text: string } | null;
type VoiceTab = "voices" | "history" | "settings" | "segments";

const VOICE_TABS: Array<{ id: VoiceTab; label: string; icon: typeof AudioLines }> = [
  { id: "voices", label: "Voice", icon: AudioLines },
  { id: "history", label: "History", icon: Clock },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "segments", label: "Segments", icon: ListMusic }
];

/** One-click category filters, matching ElevenLabs' own voice-library categories. */
const VOICE_CATEGORY_PILLS = [
  ["conversational", "Conversational"],
  ["narrative_story", "Narration"],
  ["characters_animation", "Characters"],
  ["social_media", "Social Media"],
  ["informative_educational", "Educational"],
  ["advertisement", "Advertisement"],
  ["entertainment_tv", "Entertainment"]
] as const;

/**
 * AI Voice page: pick a project voice, tune the few settings that matter,
 * and generate narration for every approved translation that still needs
 * it. All provider calls happen server-side; educators never see raw
 * ElevenLabs responses, only friendly results. Adding, cloning and
 * designing voices lives on the account-wide Voice Library page — this
 * page only chooses from the voices already there.
 */
export function VoicePage({ initial }: { initial: ProjectDto }) {
  const [project, setProject] = useState(initial);
  const [voices, setVoices] = useState<VoicesResponse | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [settings, setSettings] = useState<VoiceSettings>(initial.voiceSettings);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [tab, setTab] = useState<VoiceTab>("voices");
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [voiceQuery, setVoiceQuery] = useState("");
  const [voiceCategory, setVoiceCategory] = useState("");

  useEffect(() => {
    api<VoicesResponse>("/api/studio/voice/voices")
      .then(setVoices)
      .catch((caught) => setVoiceError((caught as Error).message));
    // Account limits and model list are free provider calls; failures stay silent.
    api<AccountResponse>("/api/studio/voice/account")
      .then(setAccount)
      .catch(() => undefined);
  }, []);

  const pending = useMemo(
    () => project.segments.filter((segment) => segment.translationStatus === "approved" && (segment.narration.status === "missing" || (segment.narration.status === "needs_update" && segment.narration.source === "ai"))),
    [project.segments]
  );
  const unapproved = project.segments.filter((segment) => segment.translationStatus !== "approved").length;
  const estimate = pending.reduce((sum, segment) => sum + segment.translation.trim().length, 0);

  const chooseVoice = async (voice: VoiceOption) => {
    setBusy("voice");
    try {
      const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${project.id}`, { method: "PATCH", json: { defaultVoiceId: voice.id, defaultVoiceName: voice.name } });
      setProject(result.project);
    } catch (caught) {
      setNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async (next: VoiceSettings) => {
    setSettings(next);
    try {
      const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${project.id}`, { method: "PATCH", json: { voiceSettings: next } });
      setProject(result.project);
    } catch (caught) {
      setNotice({ tone: "error", text: (caught as Error).message });
    }
  };

  const generateOne = async (projectSegmentId: string, force = false) => {
    const result = await api<{ project: ProjectDto; skipped: boolean; reason: string | null }>(`/api/studio/projects/${project.id}/voice`, { method: "POST", json: { projectSegmentId, force } });
    setProject(result.project);
    return result;
  };

  const generateAll = async () => {
    setBusy("all");
    setNotice(null);
    const targets = pending;
    let done = 0;
    let failed: string | null = null;
    for (const segment of targets) {
      setProgress({ done, total: targets.length, current: segment.title });
      try {
        await generateOne(segment.id);
        done += 1;
      } catch (caught) {
        failed = (caught as Error).message;
        break;
      }
    }
    setProgress(null);
    setBusy(null);
    if (failed) setNotice({ tone: "error", text: `${done} narration${done === 1 ? "" : "s"} generated before stopping: ${failed}` });
    else setNotice({ tone: "success", text: done ? `Generated narration for ${done} segment${done === 1 ? "" : "s"}. The timeline is updated.` : "Nothing to generate — every approved translation already has narration." });
  };

  const single = async (segmentId: string, force: boolean) => {
    setBusy(segmentId);
    setNotice(null);
    try {
      const result = await generateOne(segmentId, force);
      if (result.skipped) setNotice({ tone: "info", text: result.reason ?? "Narration already up to date." });
    } catch (caught) {
      setNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const credits = voices?.credits ?? project.credits;
  const canManageVoices = project.permissions.canManageTemplates;
  const provider = voices?.provider ?? account?.provider ?? "mock";
  const activeModelId = settings.model ?? account?.defaultModel ?? voices?.model;
  const activeModel = account?.models.find((model) => model.id === activeModelId);
  const translationLanguage = findTranslationLanguage(project.targetLanguageName) ?? findTranslationLanguage(project.targetLanguageCode);

  const filteredVoices = (voices?.voices ?? []).filter((voice) => {
    if (voiceQuery.trim() && !`${voice.name} ${voice.description ?? ""} ${Object.values(voice.labels ?? {}).join(" ")}`.toLowerCase().includes(voiceQuery.trim().toLowerCase())) return false;
    if (voiceCategory && voice.labels?.use_case !== voiceCategory && !Object.values(voice.labels ?? {}).some((value) => value === voiceCategory)) return false;
    return true;
  });

  return (
    <>
      <StudioPageHeader
        title="AI Voice"
        subtitle={`${project.title} · ${project.targetLanguageName}`}
        actions={
          <>
            <Link href={`/studio/projects/${project.id}`} className="mlp-btn-outline h-10">Back to Workspace</Link>
            <button type="button" onClick={generateAll} disabled={busy !== null || pending.length === 0 || !project.defaultVoiceId} className="mlp-btn-primary h-10">
              {busy === "all" ? <Spinner /> : <Sparkles className="size-4" />} Generate All Missing Narration{pending.length ? ` (${pending.length})` : ""}
            </button>
          </>
        }
      />
      <main className="space-y-6 px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        {notice && <InlineNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice>}
        {progress && (
          <InlineNotice tone="info">
            <span className="inline-flex items-center gap-2"><Spinner /> Generating {progress.done + 1} of {progress.total}: {progress.current}</span>
          </InlineNotice>
        )}

        <div className="flex flex-wrap gap-1 rounded-xl border border-[#d8dde5] bg-white p-1">
          {VOICE_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold ${tab === id ? "bg-[#fbeaea] text-[#a64026]" : "text-[#6b7c8f] hover:bg-[#f7f8fa]"}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_22.5rem]">
          <section className="space-y-6">
            {tab === "voices" && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-[#243447]">Voice</h2>
                  {project.defaultVoiceName && <StatusPill tone="accent">{project.defaultVoiceName}</StatusPill>}
                </div>
                <p className="mt-1 text-sm text-[#6b7c8f]">The MLP account&apos;s voices. Every AI-narrated segment uses the one you pick here, unless a segment overrides it in the Segments tab.</p>
                {canManageVoices ? (
                  <Link href="/studio/voices" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#a64026]">
                    Manage voices, clone or design new ones <ArrowRight className="size-3.5" />
                  </Link>
                ) : (
                  <p className="mt-2 text-xs text-[#8b9bad]">Ask a content manager to add more voices in the Voice Library.</p>
                )}

                {voices && voices.voices.length > 6 && (
                  <>
                    <label className="mt-3 flex items-center gap-2 rounded-lg border border-[#d8dde5] px-3">
                      <Search className="size-4 text-[#8b9bad]" />
                      <input value={voiceQuery} onChange={(event) => setVoiceQuery(event.target.value)} placeholder="Search the account's voices…" className="h-10 flex-1 bg-transparent text-sm outline-none" aria-label="Search voices" />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <CategoryPill active={voiceCategory === ""} onClick={() => setVoiceCategory("")}>All</CategoryPill>
                      {VOICE_CATEGORY_PILLS.map(([value, label]) => (
                        <CategoryPill key={value} active={voiceCategory === value} onClick={() => setVoiceCategory(value)}>{label}</CategoryPill>
                      ))}
                    </div>
                  </>
                )}

                {voiceError ? (
                  <div className="mt-4"><InlineNotice tone="warning">{voiceError}</InlineNotice></div>
                ) : !voices ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-[#6b7c8f]"><Spinner /> Loading voices…</div>
                ) : filteredVoices.length === 0 ? (
                  <p className="mt-4 text-sm text-[#6b7c8f]">{voices.voices.length === 0 ? "No voices in the account yet." : "No voices match."} {canManageVoices && <Link href="/studio/voices" className="font-bold text-[#a64026]">Open the Voice Library</Link>} to add one.</p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {filteredVoices.map((voice) => {
                      const selected = voice.id === project.defaultVoiceId;
                      return (
                        <div key={voice.id} className={`flex items-center gap-3 rounded-xl border p-3 ${selected ? "border-[#a64026] bg-[#fbeaea]/60 ring-2 ring-[#a64026]/15" : "border-[#d8dde5]"}`}>
                          <PreviewButton id={voice.id} src={voice.previewUrl} label={voice.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-extrabold text-[#243447]">{voice.name}{voice.category && voice.category !== "premade" ? ` · ${voice.category}` : ""}</span>
                            <span className="block truncate text-xs text-[#6b7c8f]">{voice.description || Object.values(voice.labels ?? {}).join(" · ") || (voice.languages?.length ? voice.languages.join(", ") : "Multilingual")}</span>
                          </span>
                          <button type="button" onClick={() => chooseVoice(voice)} disabled={busy !== null || selected} className={selected ? "inline-flex h-9 items-center gap-1 rounded-lg bg-[#a64026] px-3 text-xs font-extrabold text-white" : "mlp-btn-outline h-9 px-3 text-xs"}>
                            {selected ? <><Check className="size-3.5" /> Selected</> : "Use"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === "history" && <HistoryTab projectId={project.id} voices={voices?.voices ?? []} models={account?.models ?? []} />}

            {tab === "settings" && (
              <SettingsTab
                settings={settings}
                onChange={saveSettings}
                voices={voices?.voices ?? []}
                defaultVoiceId={project.defaultVoiceId}
                onChooseVoice={chooseVoice}
                account={account}
                fallbackModel={voices?.model}
                provider={provider}
                canManageVoices={canManageVoices}
              />
            )}

            {tab === "segments" && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
                <h2 className="text-lg font-extrabold text-[#243447]">Segments</h2>
                <p className="mt-1 text-sm text-[#6b7c8f]">
                  {pending.length} ready to generate{unapproved ? ` · ${unapproved} translation${unapproved === 1 ? "" : "s"} still need approval in the Workspace` : ""}
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="border-b border-[#edf0f3] text-[11px] uppercase tracking-wide text-[#526579]">
                      <tr>
                        <th className="py-2 pr-3">Segment</th>
                        <th className="py-2 pr-3">Translation</th>
                        <th className="py-2 pr-3">Narration</th>
                        <th className="py-2 pr-3">Voice</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.segments.map((segment, index) => {
                        const canGenerate = segment.translationStatus === "approved" && Boolean(project.defaultVoiceId || segment.voiceIdOverride);
                        const isAi = segment.narration.source === "ai";
                        return (
                          <tr key={segment.id} className="border-b border-[#f2f4f7]">
                            <td className="py-2 pr-3">
                              <Link href={`/studio/projects/${project.id}?segment=${segment.segmentId}`} className="font-extrabold text-[#243447]">{String(index + 1).padStart(2, "0")} {segment.title}</Link>
                              <div className="text-xs text-[#6b7c8f]">{segment.translation.trim().length.toLocaleString()} characters</div>
                            </td>
                            <td className="py-2 pr-3"><StatusPill tone={segment.translationStatus === "approved" ? "ready" : segment.translationStatus === "draft" ? "warning" : "muted"}>{segment.translationStatus}</StatusPill></td>
                            <td className="py-2 pr-3">
                              <StatusPill tone={segment.narration.status === "ready" ? "ready" : segment.narration.status === "missing" ? "muted" : "warning"}>{segment.narration.status.replace("_", " ")}</StatusPill>
                              {segment.narration.durationSec > 0 && <span className="ml-2 text-xs text-[#6b7c8f]">{formatSeconds(segment.narration.durationSec)} · {segment.narration.source === "ai" ? "AI" : segment.narration.source}</span>}
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                value={segment.voiceIdOverride ?? ""}
                                onChange={async (event) => {
                                  const result = await api<{ project: ProjectDto }>(`/api/studio/projects/${project.id}/segments/${segment.id}`, { method: "PATCH", json: { voiceIdOverride: event.target.value || null } }).catch((caught) => {
                                    setNotice({ tone: "error", text: (caught as Error).message });
                                    return null;
                                  });
                                  if (result) setProject(result.project);
                                }}
                                className="h-9 rounded-lg border border-[#d8dde5] bg-white px-2 text-xs"
                                aria-label="Voice override"
                              >
                                <option value="">Project voice</option>
                                {voices?.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
                              </select>
                            </td>
                            <td className="py-2 text-right">
                              <button type="button" onClick={() => single(segment.id, isAi && segment.narration.status === "ready")} disabled={busy !== null || !canGenerate} className="mlp-btn-outline h-9 px-3 text-xs">
                                {busy === segment.id ? <Spinner className="size-3.5" /> : isAi && segment.narration.status === "ready" ? <RefreshCw className="size-3.5" /> : <AudioLines className="size-3.5" />}
                                {isAi && segment.narration.status === "ready" ? "Regenerate" : "Generate"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#243447]"><Coins className="size-5 text-[#a64026]" /> AI Voice Credits</h2>
              <div className="mt-3 text-3xl font-extrabold text-[#243447]">{credits.remaining.toLocaleString()} <span className="text-base font-bold text-[#6b7c8f]">remaining</span></div>
              <div className="mt-1 text-sm text-[#6b7c8f]">{credits.used.toLocaleString()} used of {credits.limit.toLocaleString()}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f2f4f7]"><div className="h-full bg-[#a64026]" style={{ width: `${credits.limit ? Math.min(100, Math.round((credits.used / credits.limit) * 100)) : 0}%` }} /></div>
              <p className="mt-3 text-xs text-[#6b7c8f]">One credit per character of text narrated. Generating all missing narration now would use about {estimate.toLocaleString()} credits.</p>
              <p className="mt-2 text-xs text-[#8b9bad]">Choosing voices is free — only generating narration uses credits.</p>
              {credits.remaining < estimate && <div className="mt-3"><InlineNotice tone="warning">Not enough credits for everything. Ask the MLP administrator to increase your allowance.</InlineNotice></div>}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#6b7c8f]">This localization</h2>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Voice</dt><dd className="font-extrabold text-[#243447]">{project.defaultVoiceName ?? "Not chosen"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Model</dt><dd className="font-extrabold text-[#243447]">{activeModel?.name ?? activeModelId ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Ready to generate</dt><dd className="font-extrabold text-[#243447]">{pending.length}</dd></div>
              </dl>
            </div>

            {translationLanguage && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#6b7c8f]">Text translation support</h2>
                <p className="mt-2 text-xs text-[#6b7c8f]">For the Translate step (GPT), not voice — {project.targetLanguageName} is:</p>
                <div className="mt-2">
                  <StatusPill tone={translationLanguage.tier === "STRONG" ? "ready" : translationLanguage.tier === "GOOD_PRACTICAL" ? "warning" : "error"}>{TRANSLATION_TIER_LABEL[translationLanguage.tier]}</StatusPill>
                </div>
                <p className="mt-2 text-xs text-[#6b7c8f]">{TRANSLATION_TIER_GUIDANCE[translationLanguage.tier]}</p>
              </div>
            )}

            <Field label="Language context (read-only)">
              <input readOnly value={[project.targetLanguageName, project.region, project.variety, project.audience].filter(Boolean).join(" · ")} className={`${inputClass} bg-[#f7f8fa]`} />
            </Field>
          </aside>
        </div>
      </main>
    </>
  );
}

function CategoryPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${active ? "border-[#a64026] bg-[#fbeaea] text-[#a64026]" : "border-[#d8dde5] bg-white text-[#526579] hover:border-[#c9d0da]"}`}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

function HistoryTab({ projectId, voices, models }: { projectId: string; voices: VoiceOption[]; models: VoiceModelOption[] }) {
  const [entries, setEntries] = useState<VoiceHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [voiceFilter, setVoiceFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    api<{ history: VoiceHistoryEntry[] }>(`/api/studio/projects/${projectId}/voice/history`)
      .then((result) => setEntries(result.history))
      .catch((caught) => setError((caught as Error).message));
  }, [projectId]);

  const voiceNameById = useMemo(() => new Map(voices.map((voice) => [voice.id, voice.name])), [voices]);
  const modelNameById = useMemo(() => new Map(models.map((model) => [model.id, model.name])), [models]);

  const filtered = (entries ?? []).filter((entry) => {
    if (voiceFilter && entry.voiceId !== voiceFilter) return false;
    if (modelFilter && entry.model !== modelFilter) return false;
    if (statusFilter && entry.status !== statusFilter) return false;
    if (query.trim() && !`${entry.textSnippet ?? ""} ${entry.segmentTitle ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const groups = useMemo(() => {
    const byDate = new Map<string, VoiceHistoryEntry[]>();
    for (const entry of filtered) {
      const label = new Date(entry.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      byDate.set(label, [...(byDate.get(label) ?? []), entry]);
    }
    return [...byDate.entries()];
  }, [filtered]);

  const activeFilterCount = [voiceFilter, modelFilter, statusFilter].filter(Boolean).length;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
      <h2 className="text-lg font-extrabold text-[#243447]">History</h2>
      <p className="mt-1 text-sm text-[#6b7c8f]">Every narration generation attempt for this localization, newest first.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="flex min-w-[12.5rem] flex-1 items-center gap-2 rounded-lg border border-[#d8dde5] px-3">
          <Search className="size-4 text-[#8b9bad]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search history…" className="h-10 flex-1 bg-transparent text-sm outline-none" aria-label="Search history" />
        </label>
        <select value={voiceFilter} onChange={(event) => setVoiceFilter(event.target.value)} className="mlp-input h-10 text-sm" aria-label="Filter by voice">
          <option value="">All voices</option>
          {[...new Set((entries ?? []).map((entry) => entry.voiceId))].map((id) => <option key={id} value={id}>{voiceNameById.get(id) ?? id}</option>)}
        </select>
        <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} className="mlp-input h-10 text-sm" aria-label="Filter by model">
          <option value="">All models</option>
          {[...new Set((entries ?? []).map((entry) => entry.model))].map((id) => <option key={id} value={id}>{modelNameById.get(id) ?? id}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mlp-input h-10 text-sm" aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="charged">Generated</option>
          <option value="failed">Failed</option>
          <option value="reserved">In progress</option>
        </select>
        {activeFilterCount > 0 && (
          <button type="button" onClick={() => { setVoiceFilter(""); setModelFilter(""); setStatusFilter(""); }} className="inline-flex items-center gap-1 text-xs font-bold text-[#a64026]"><X className="size-3.5" /> Clear filters</button>
        )}
      </div>

      {error ? (
        <div className="mt-4"><InlineNotice tone="warning">{error}</InlineNotice></div>
      ) : !entries ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#6b7c8f]"><Spinner /> Loading history…</div>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-[#6b7c8f]">{entries.length === 0 ? "No narration has been generated for this localization yet." : "Nothing matches those filters."}</p>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map(([date, dayEntries]) => (
            <div key={date}>
              <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#8b9bad]">{date}</h3>
              <div className="space-y-1.5">
                {dayEntries.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-[#edf0f3] p-3">
                    <StatusPill tone={entry.status === "charged" ? "ready" : entry.status === "failed" ? "error" : "warning"}>
                      {entry.status === "charged" ? "Generated" : entry.status === "failed" ? "Failed" : "In progress"}
                    </StatusPill>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#243447]" dir="auto">{entry.textSnippet ? (entry.textSnippet.length > 140 ? `${entry.textSnippet.slice(0, 140)}…` : entry.textSnippet) : entry.segmentTitle ?? "—"}</span>
                      <span className="mt-0.5 block text-xs text-[#6b7c8f]">
                        {voiceNameById.get(entry.voiceId) ?? entry.voiceId} · {modelNameById.get(entry.model) ?? entry.model} · {entry.characters.toLocaleString()} characters
                        {entry.isRetry ? " · retry" : ""} · {relativeTime(entry.createdAt)}
                      </span>
                    </span>
                    {entry.outputAssetUrl && (
                      <audio controls preload="none" src={entry.outputAssetUrl} data-exclusive-audio onPlay={(event) => { stopPreview(); pauseOtherAudio(event.currentTarget); }} className="h-9 w-40 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.round(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                     */
/* -------------------------------------------------------------------------- */

function SettingsTab({
  settings,
  onChange,
  voices,
  defaultVoiceId,
  onChooseVoice,
  account,
  fallbackModel,
  provider,
  canManageVoices
}: {
  settings: VoiceSettings;
  onChange: (next: VoiceSettings) => void;
  voices: VoiceOption[];
  defaultVoiceId: string | null;
  onChooseVoice: (voice: VoiceOption) => void;
  account: AccountResponse | null;
  fallbackModel?: string;
  provider: string;
  canManageVoices: boolean;
}) {
  const activeModelId = settings.model ?? account?.defaultModel ?? fallbackModel;
  const activeModel = account?.models.find((model) => model.id === activeModelId);
  const supportsLanguageOverride = activeModel?.supportsLanguageOverride ?? false;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
      <h2 className="text-lg font-extrabold text-[#243447]">Voice settings</h2>
      <p className="mt-1 text-sm text-[#6b7c8f]">These apply to narration generated from now on, for this localization only.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Voice">
          <select
            value={defaultVoiceId ?? ""}
            onChange={(event) => {
              const voice = voices.find((entry) => entry.id === event.target.value);
              if (voice) onChooseVoice(voice);
            }}
            className={`${inputClass} h-11`}
          >
            <option value="" disabled>Choose a voice…</option>
            {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
          </select>
        </Field>
        <Field label="Model">
          <select value={activeModelId ?? ""} onChange={(event) => onChange({ ...settings, model: event.target.value })} className={`${inputClass} h-11`}>
            {(account?.models.length ? account.models : [{ id: activeModelId ?? "eleven_multilingual_v2", name: activeModelId ?? "Default model" }]).map((model) => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>
        </Field>
      </div>
      {activeModel?.description && <p className="mt-2 text-xs text-[#6b7c8f]">{activeModel.description}</p>}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <RangeSetting label="Speed" value={settings.speed ?? 1} min={0.7} max={1.2} step={0.05} low="Slower" high="Faster" onChange={(value) => onChange({ ...settings, speed: value })} />
        <RangeSetting label="Stability" value={settings.stability ?? 0.5} min={0} max={1} step={0.05} low="More variable" high="More stable" onChange={(value) => onChange({ ...settings, stability: value })} />
        <RangeSetting label="Similarity" value={settings.similarity ?? 0.75} min={0} max={1} step={0.05} low="Low" high="High" onChange={(value) => onChange({ ...settings, similarity: value })} />
        <RangeSetting label="Style Exaggeration" value={settings.style ?? 0} min={0} max={1} step={0.05} low="None" high="Exaggerated" onChange={(value) => onChange({ ...settings, style: value })} />
      </div>

      <div className="mt-6 border-t border-[#edf0f3] pt-4">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-extrabold text-[#243447]">Language Override</span>
            <span className="block text-xs text-[#6b7c8f]">
              {supportsLanguageOverride
                ? "Force pronunciation in a specific language instead of the model's own detection."
                : `${activeModel?.name ?? "This model"} doesn't support a language override — pick a Flash, Turbo or v3 model above to use it.`}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(settings.languageOverride)}
            disabled={!supportsLanguageOverride}
            onClick={() => onChange({ ...settings, languageOverride: settings.languageOverride ? undefined : "en" })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${settings.languageOverride ? "bg-[#a64026]" : "bg-[#d8dde5]"}`}
          >
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${settings.languageOverride ? "left-5" : "left-0.5"}`} />
          </button>
        </div>
        {supportsLanguageOverride && settings.languageOverride && (
          <select value={settings.languageOverride} onChange={(event) => onChange({ ...settings, languageOverride: event.target.value })} className={`${inputClass} mt-3 h-10 max-w-xs text-sm`}>
            {ELEVENLABS_LANGUAGES.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
          </select>
        )}
      </div>

      <div className="mt-6 border-t border-[#edf0f3] pt-4">
        <h3 className="text-sm font-extrabold text-[#243447]">Provider account</h3>
        <p className="mt-2 text-xs text-[#6b7c8f]">
          {provider === "mock" ? "Voices aren't set up yet — narration uses silent placeholder audio until an MLP administrator connects ElevenLabs." : `ElevenLabs · ${activeModel?.name ?? activeModelId}.`}{" "}
          {canManageVoices ? (
            <Link href="/studio/voices" className="font-bold text-[#a64026]">Plan, voice count and cloning limits are on the Voice Library page.</Link>
          ) : (
            "A content manager can see plan and voice limits in the Voice Library."
          )}
        </p>
      </div>
    </div>
  );
}

function RangeSetting({ label, value, min, max, step, low, high, onChange }: { label: string; value: number; min: number; max: number; step: number; low: string; high: string; onChange: (value: number) => void }) {
  const [local, setLocal] = useState(value);
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setLocal(value);
  }
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm font-bold text-[#243447]">
        {label} <span className="tabular-nums text-[#6b7c8f]">{local.toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={local} onChange={(event) => setLocal(Number(event.target.value))} onMouseUp={() => onChange(local)} onTouchEnd={() => onChange(local)} onKeyUp={() => onChange(local)} className="mt-1 w-full accent-[#a64026]" />
      <span className="mt-0.5 flex justify-between text-[11px] text-[#8b9bad]">
        <span>{low}</span>
        <span>{high}</span>
      </span>
    </label>
  );
}
