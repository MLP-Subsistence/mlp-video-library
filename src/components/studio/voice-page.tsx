"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Filter,
  Library,
  ListMusic,
  Mic,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X
} from "lucide-react";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { Field, InlineNotice, Spinner, StatusPill, inputClass, textareaClass } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import { ELEVENLABS_LANGUAGES } from "@/lib/studio/elevenlabs-languages";
import { TRANSLATION_TIER_GUIDANCE, TRANSLATION_TIER_LABEL, findTranslationLanguage } from "@/lib/studio/language-catalog";
import { formatSeconds } from "@/lib/studio/timing";
import type { ProjectDto, SharedVoiceOption, VoiceAccountStatus, VoiceDesignPreview, VoiceHistoryEntry, VoiceModelOption, VoiceOption, VoiceSettings } from "@/lib/studio/types";

type VoicesResponse = { provider: string; model: string; voices: VoiceOption[]; credits: { limit: number; used: number; remaining: number } };
type AccountResponse = { provider: string; defaultModel: string; status: VoiceAccountStatus | null; models: VoiceModelOption[] };
type Notice = { tone: "info" | "success" | "warning" | "error"; text: string } | null;
type VoiceTab = "voices" | "library" | "create" | "history" | "settings" | "segments";

const VOICE_TABS: Array<{ id: VoiceTab; label: string; icon: typeof AudioLines }> = [
  { id: "voices", label: "My Voices", icon: AudioLines },
  { id: "library", label: "Explore", icon: Library },
  { id: "create", label: "Create voice", icon: Wand2 },
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
 * ElevenLabs responses, only friendly results.
 */
export function VoicePage({ initial }: { initial: ProjectDto }) {
  const [project, setProject] = useState(initial);
  const [voices, setVoices] = useState<VoicesResponse | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [settings, setSettings] = useState<VoiceSettings>(initial.voiceSettings);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
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

  const reloadVoices = async () => {
    const result = await api<VoicesResponse>("/api/studio/voice/voices");
    setVoices(result);
    return result;
  };

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

  const preview = (voice: { id: string; previewUrl?: string | null }) => {
    if (!voice.previewUrl) return;
    setPreviewing(voice.id);
    const audio = new Audio(voice.previewUrl);
    audio.onended = () => setPreviewing(null);
    audio.onerror = () => setPreviewing(null);
    void audio.play().catch(() => setPreviewing(null));
  };

  const credits = voices?.credits ?? project.credits;
  const canManageVoices = project.permissions.canManageTemplates;
  const provider = voices?.provider ?? account?.provider ?? "mock";
  const activeModelId = settings.model ?? account?.defaultModel ?? voices?.model;
  const activeModel = account?.models.find((model) => model.id === activeModelId);
  const translationLanguage = findTranslationLanguage(project.targetLanguageName) ?? findTranslationLanguage(project.targetLanguageCode);

  /** A voice added from the library, cloned, or designed becomes this project's voice straight away. */
  const onVoiceAdded = async (voice: VoiceOption) => {
    const refreshed = await reloadVoices().catch(() => null);
    const stored = refreshed?.voices.find((entry) => entry.id === voice.id) ?? voice;
    await chooseVoice(stored);
    setTab("voices");
  };

  const removeVoice = async (voice: VoiceOption) => {
    setBusy(voice.id);
    setNotice(null);
    try {
      await api(`/api/studio/voice/voices/${voice.id}`, { method: "DELETE" });
      await reloadVoices();
      setNotice({ tone: "success", text: `"${voice.name}" was removed from the MLP account.` });
    } catch (caught) {
      setNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(null);
    }
  };

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

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="space-y-6">
            {tab === "voices" && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-[#243447]">My Voices</h2>
                  {project.defaultVoiceName && <StatusPill tone="accent">{project.defaultVoiceName}</StatusPill>}
                </div>
                <p className="mt-1 text-sm text-[#6b7c8f]">The MLP account&apos;s voices. Every AI-narrated segment uses the one you pick here, unless a segment overrides it in the Segments tab.</p>

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
                  <p className="mt-4 text-sm text-[#6b7c8f]">No voices match. {canManageVoices && <button type="button" onClick={() => setTab("library")} className="font-bold text-[#a64026]">Browse the voice library</button>} to add one.</p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {filteredVoices.map((voice) => {
                      const selected = voice.id === project.defaultVoiceId;
                      const removable = canManageVoices && !selected && (voice.category === "cloned" || voice.category === "designed" || voice.category === "professional");
                      return (
                        <div key={voice.id} className={`flex items-center gap-3 rounded-xl border p-3 ${selected ? "border-[#a64026] bg-[#fbeaea]/60 ring-2 ring-[#a64026]/15" : "border-[#d8dde5]"}`}>
                          <button type="button" onClick={() => preview(voice)} disabled={!voice.previewUrl} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f4f7] text-[#243447] disabled:opacity-40" aria-label={`Preview ${voice.name}`}>
                            {previewing === voice.id ? <Spinner /> : <Play className="size-4" />}
                          </button>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-extrabold text-[#243447]">{voice.name}{voice.category && voice.category !== "premade" ? ` · ${voice.category}` : ""}</span>
                            <span className="block truncate text-xs text-[#6b7c8f]">{voice.description || Object.values(voice.labels ?? {}).join(" · ") || (voice.languages?.length ? voice.languages.join(", ") : "Multilingual")}</span>
                          </span>
                          <button type="button" onClick={() => chooseVoice(voice)} disabled={busy !== null || selected} className={selected ? "inline-flex h-9 items-center gap-1 rounded-lg bg-[#a64026] px-3 text-xs font-extrabold text-white" : "mlp-btn-outline h-9 px-3 text-xs"}>
                            {selected ? <><Check className="size-3.5" /> Selected</> : "Use"}
                          </button>
                          {removable && (
                            <button type="button" onClick={() => removeVoice(voice)} disabled={busy !== null} className="grid size-9 shrink-0 place-items-center rounded-md border border-red-200 text-red-600" aria-label={`Remove ${voice.name}`} title="Remove this voice from the account">
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === "library" && <VoiceLibrary canManage={canManageVoices} provider={provider} onAdded={onVoiceAdded} onNotice={setNotice} />}

            {tab === "create" && (
              <CreateVoiceTab
                canManage={canManageVoices}
                canClone={account?.status?.canCloneVoices ?? false}
                provider={provider}
                onSaved={onVoiceAdded}
                onNotice={setNotice}
              />
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
                translationLanguage={translationLanguage}
                targetLanguageName={project.targetLanguageName}
              />
            )}

            {tab === "segments" && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
                <h2 className="text-lg font-extrabold text-[#243447]">Segments</h2>
                <p className="mt-1 text-sm text-[#6b7c8f]">
                  {pending.length} ready to generate{unapproved ? ` · ${unapproved} translation${unapproved === 1 ? "" : "s"} still need approval in the Workspace` : ""}
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
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
              <p className="mt-2 text-xs text-[#8b9bad]">Choosing, previewing, browsing, cloning, designing and removing voices are free — only generating narration uses credits.</p>
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
/* Voice library (Explore)                                                     */
/* -------------------------------------------------------------------------- */

const VOICE_GENDERS = [
  ["", "Any voice"],
  ["female", "Female"],
  ["male", "Male"],
  ["neutral", "Neutral"]
] as const;

const VOICE_AGES = [
  ["", "Any age"],
  ["young", "Young"],
  ["middle_aged", "Middle aged"],
  ["old", "Older"]
] as const;

const VOICE_CATEGORIES = [
  ["", "Any quality"],
  ["professional", "Professional"],
  ["high_quality", "High quality"],
  ["famous", "Famous"]
] as const;

/** Accents worth one click for MLP's languages; anything else can be typed. */
const VOICE_ACCENTS = ["", "african", "american", "british", "australian", "indian", "irish", "canadian", "nigerian", "kenyan", "south african"] as const;

type LibraryFilters = { q: string; language: string; gender: string; age: string; accent: string; useCase: string; category: string };
const EMPTY_LIBRARY_FILTERS: LibraryFilters = { q: "", language: "", gender: "", age: "", accent: "", useCase: "", category: "" };

/** Browse the provider's public library and copy a voice into the account (free). */
function VoiceLibrary({ canManage, provider, onAdded, onNotice }: { canManage: boolean; provider: string; onAdded: (voice: VoiceOption) => void; onNotice: (notice: Notice) => void }) {
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_LIBRARY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [results, setResults] = useState<SharedVoiceOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const connected = provider !== "mock";

  const search = async (override?: Partial<LibraryFilters>) => {
    const next = { ...filters, ...override };
    setFilters(next);
    setSearching(true);
    onNotice(null);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) if (value.trim()) params.set(key, value.trim());
      const result = await api<{ voices: SharedVoiceOption[] }>(`/api/studio/voice/library?${params.toString()}`);
      setResults(result.voices);
    } catch (caught) {
      setResults([]);
      onNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setSearching(false);
    }
  };

  const add = async (voice: SharedVoiceOption) => {
    setAdding(voice.id);
    onNotice(null);
    try {
      const result = await api<{ voice: VoiceOption }>("/api/studio/voice/library", { method: "POST", json: { publicOwnerId: voice.publicOwnerId, voiceId: voice.id, name: voice.name } });
      onAdded(result.voice);
      onNotice({ tone: "success", text: `"${voice.name}" was added to the MLP voices and is now this lesson's voice.` });
    } catch (caught) {
      onNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setAdding(null);
    }
  };

  const listen = (voice: SharedVoiceOption) => {
    if (!voice.previewUrl) return;
    setPlaying(voice.id);
    const audio = new Audio(voice.previewUrl);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    void audio.play().catch(() => setPlaying(null));
  };

  const panelFilterCount = (["gender", "age", "accent", "category"] as const).filter((key) => filters[key].trim()).length;
  const languageName = ELEVENLABS_LANGUAGES.find((entry) => entry.code === filters.language)?.name;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
      <h2 className="text-lg font-extrabold text-[#243447]">Explore</h2>
      <p className="mt-1 text-sm text-[#6b7c8f]">Search the provider&apos;s public voices, listen to them, and add the ones you want to the MLP account. Searching, listening and adding cost no credits.</p>

      {!connected ? (
        <div className="mt-4">
          <InlineNotice tone="warning">
            No voice provider is connected yet, so the library is empty. An administrator switches the provider to ElevenLabs in <a href="/admin/studio?tab=settings" className="font-bold underline">/admin/studio</a> once the API key is in place.
          </InlineNotice>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[#d8dde5] px-3">
              <Search className="size-4 text-[#8b9bad]" />
              <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="Warm narrator, storyteller, teacher…" className="h-10 flex-1 bg-transparent text-sm outline-none" aria-label="Search the voice library" />
            </label>
            <LanguageCombobox value={filters.language} onChange={(value) => void search({ language: value })} />
            <div className="relative">
              <button type="button" onClick={() => setFiltersOpen((value) => !value)} className="mlp-btn-outline h-10">
                <Filter className="size-4" /> Filters{panelFilterCount > 0 ? ` (${panelFilterCount})` : ""} <ChevronDown className="size-3.5" />
              </button>
              {filtersOpen && (
                <div className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-[#d8dde5] bg-white p-3 shadow-lg">
                  <FilterRow label="Quality" value={filters.category} options={VOICE_CATEGORIES} onChange={(value) => void search({ category: value })} />
                  <FilterRow label="Gender" value={filters.gender} options={VOICE_GENDERS} onChange={(value) => void search({ gender: value })} />
                  <FilterRow label="Age" value={filters.age} options={VOICE_AGES} onChange={(value) => void search({ age: value })} />
                  <label className="mt-2 block text-xs font-bold text-[#526579]">
                    Accent
                    <input
                      list="mlp-voice-accents"
                      value={filters.accent}
                      onChange={(event) => setFilters({ ...filters, accent: event.target.value })}
                      onBlur={() => void search()}
                      onKeyDown={(event) => { if (event.key === "Enter") void search(); }}
                      placeholder="Any accent"
                      className="mlp-input mt-1 h-9 w-full text-sm"
                    />
                    <datalist id="mlp-voice-accents">
                      {VOICE_ACCENTS.filter(Boolean).map((accent) => <option key={accent} value={accent} />)}
                    </datalist>
                  </label>
                  {panelFilterCount > 0 && (
                    <button type="button" onClick={() => void search({ gender: "", age: "", accent: "", category: "" })} className="mt-2 text-xs font-bold text-[#a64026]">Clear these filters</button>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={() => void search()} disabled={searching} className="mlp-btn-primary h-10">{searching ? <Spinner /> : <Search className="size-4" />} Search</button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <CategoryPill active={!filters.useCase} onClick={() => void search({ useCase: "" })}>All</CategoryPill>
            {VOICE_CATEGORY_PILLS.map(([value, label]) => (
              <CategoryPill key={value} active={filters.useCase === value} onClick={() => void search({ useCase: value })}>{label}</CategoryPill>
            ))}
          </div>

          {(languageName || filters.q) && (
            <p className="mt-2 text-xs text-[#8b9bad]">
              {languageName ? `Language: ${languageName}` : ""}
              {languageName && filters.q ? " · " : ""}
              {filters.q ? `“${filters.q}”` : ""}
            </p>
          )}

          {!results ? (
            <p className="mt-4 text-sm text-[#6b7c8f]">Search, or just pick a filter, to see voices. Nothing is added to the account until you press Add.</p>
          ) : results.length === 0 ? (
            <p className="mt-4 text-sm text-[#6b7c8f]">No voices matched those filters. Try fewer filters, or a different description.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {results.map((voice) => (
                <div key={`${voice.publicOwnerId}:${voice.id}`} className="flex items-center gap-3 rounded-xl border border-[#d8dde5] p-3">
                  <button type="button" onClick={() => listen(voice)} disabled={!voice.previewUrl} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f4f7] text-[#243447] disabled:opacity-40" aria-label={`Listen to ${voice.name}`}>
                    {playing === voice.id ? <Spinner /> : <Play className="size-4" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-[#243447]">{voice.name}</span>
                    <span className="block truncate text-xs text-[#6b7c8f]">{[voice.gender, voice.age?.replace("_", " "), voice.accent, voice.languages?.[0], voice.useCase?.replace(/_/g, " ")].filter(Boolean).join(" · ") || voice.description || "Library voice"}</span>
                  </span>
                  <button type="button" onClick={() => void add(voice)} disabled={!canManage || adding !== null} className="mlp-btn-outline h-9 px-3 text-xs" title={canManage ? "Add to the MLP voices" : "Only content managers can add voices to the account"}>
                    {adding === voice.id ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterRow({ label, value, options, onChange }: { label: string; value: string; options: ReadonlyArray<readonly [string, string]>; onChange: (value: string) => void }) {
  return (
    <label className="mt-2 block text-xs font-bold text-[#526579] first:mt-0">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mlp-input mt-1 h-9 w-full text-sm">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

/** Searchable language dropdown, in the spirit of ElevenLabs' own language picker. */
function LanguageCombobox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = ELEVENLABS_LANGUAGES.find((entry) => entry.code === value);
  const filtered = ELEVENLABS_LANGUAGES.filter((entry) => !query.trim() || entry.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-pressed={open} className="mlp-btn-outline h-10">
        {selected ? selected.name : "Any language"} <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-64 rounded-xl border border-[#d8dde5] bg-white shadow-lg">
          <div className="border-b border-[#edf0f3] p-2">
            <label className="flex items-center gap-2 rounded-lg border border-[#d8dde5] px-2">
              <Search className="size-3.5 text-[#8b9bad]" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search languages…" className="h-8 flex-1 bg-transparent text-sm outline-none" />
            </label>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            <button type="button" onClick={() => { onChange(""); setOpen(false); setQuery(""); }} className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm font-bold ${!value ? "bg-[#fbeaea] text-[#a64026]" : "text-[#243447] hover:bg-[#f7f8fa]"}`}>
              Any language
            </button>
            {filtered.map((entry) => (
              <button
                key={entry.code}
                type="button"
                onClick={() => { onChange(entry.code); setOpen(false); setQuery(""); }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-bold ${value === entry.code ? "bg-[#fbeaea] text-[#a64026]" : "text-[#243447] hover:bg-[#f7f8fa]"}`}
              >
                {entry.name}
                {!entry.v2 && <span className="text-[10px] font-bold uppercase text-[#8b9bad]">v3</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-2 py-3 text-center text-xs text-[#8b9bad]">No languages match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create voice: Instant Clone or Voice Design                                 */
/* -------------------------------------------------------------------------- */

function CreateVoiceTab({ canManage, canClone, provider, onSaved, onNotice }: { canManage: boolean; canClone: boolean; provider: string; onSaved: (voice: VoiceOption) => void; onNotice: (notice: Notice) => void }) {
  const [method, setMethod] = useState<"clone" | "design">("clone");
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
        <h2 className="text-lg font-extrabold text-[#243447]">Create voice</h2>
        <p className="mt-1 text-sm text-[#6b7c8f]">Two ways to get a new voice for the MLP account. Neither uses this project&apos;s narration credits.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MethodCard active={method === "clone"} onClick={() => setMethod("clone")} icon={Mic} title="Instant Voice Clone" description="Upload recordings of a real speaker; the provider builds a voice that sounds like them." time="~2 minutes" />
          <MethodCard active={method === "design"} onClick={() => setMethod("design")} icon={Wand2} title="Voice Design" description="Describe a voice in words and get a few candidates to listen to before saving one." time="Under a minute" />
        </div>
        <p className="mt-3 text-xs text-[#8b9bad]">Professional Voice Clone (30+ minutes of studio-quality audio, manual verification) and Voice Remixing aren&apos;t wired into this page yet — the MLP team can use them directly in the ElevenLabs dashboard if a lesson needs them.</p>
      </div>
      {method === "clone" ? (
        <VoiceCloner canManage={canManage} canClone={canClone} provider={provider} onCloned={onSaved} onNotice={onNotice} />
      ) : (
        <VoiceDesigner canManage={canManage} provider={provider} onSaved={onSaved} onNotice={onNotice} />
      )}
    </div>
  );
}

function MethodCard({ active, onClick, icon: Icon, title, description, time }: { active: boolean; onClick: () => void; icon: typeof Mic; title: string; description: string; time: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-xl border p-4 text-left ${active ? "border-[#a64026] bg-[#fbeaea]/60 ring-2 ring-[#a64026]/15" : "border-[#d8dde5] hover:border-[#c9d0da]"}`}>
      <Icon className={`size-5 ${active ? "text-[#a64026]" : "text-[#6b7c8f]"}`} />
      <span className="mt-2 block text-sm font-extrabold text-[#243447]">{title}</span>
      <span className="mt-1 block text-xs text-[#6b7c8f]">{description}</span>
      <span className="mt-2 inline-block rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-bold text-[#526579]">{time}</span>
    </button>
  );
}

/** Instant voice cloning from recordings — free of narration credits, uses a voice slot. */
function VoiceCloner({ canManage, canClone, provider, onCloned, onNotice }: { canManage: boolean; canClone: boolean; provider: string; onCloned: (voice: VoiceOption) => void; onNotice: (notice: Notice) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [denoise, setDenoise] = useState(true);
  const [busy, setBusy] = useState(false);

  const totalMb = files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024;

  const submit = async () => {
    setBusy(true);
    onNotice(null);
    try {
      const form = new FormData();
      form.set("name", name);
      if (description.trim()) form.set("description", description.trim());
      form.set("removeBackgroundNoise", denoise ? "true" : "false");
      for (const file of files) form.append("files", file);
      const response = await fetch("/api/studio/voice/clone", { method: "POST", body: form });
      const data = (await response.json()) as { voice?: VoiceOption; error?: string };
      if (!response.ok || !data.voice) throw new Error(data.error ?? "The voice could not be cloned.");
      onCloned(data.voice);
      onNotice({ tone: "success", text: `"${data.voice.name}" is ready. Choose it in My Voices to narrate this lesson with it.` });
      setName("");
      setDescription("");
      setFiles([]);
    } catch (caught) {
      onNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
      <h3 className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-[#6b7c8f]"><Mic className="size-4" /> Instant Voice Clone</h3>
      <p className="mt-2 text-sm text-[#6b7c8f]">
        Upload recordings of one speaker — a minute or two of clear speech is plenty — and the provider builds a voice that can narrate any lesson. Cloning itself costs no credits; only generating narration does.
      </p>
      {provider === "mock" && <div className="mt-4"><InlineNotice tone="warning">No voice provider is connected yet, so cloning is unavailable. An administrator sets ElevenLabs up in /admin/studio.</InlineNotice></div>}
      {provider !== "mock" && !canClone && <div className="mt-4"><InlineNotice tone="warning">This provider plan does not include instant voice cloning.</InlineNotice></div>}
      {!canManage && <div className="mt-4"><InlineNotice tone="info">Only content managers and administrators can add voices to the shared MLP account.</InlineNotice></div>}

      <div className="mt-4 space-y-4">
        <Field label="Voice name" hint="How it will appear in the voice list, for example “Aline — Kinyarwanda narrator”.">
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} className={inputClass} placeholder="Aline — Kinyarwanda narrator" />
        </Field>
        <Field label="Notes (optional)" hint="Anything the team should know: accent, who recorded it, where consent is filed.">
          <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={400} className={inputClass} placeholder="Recorded by Aline, consent on file, Kigali accent" />
        </Field>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#d8dde5] bg-[#f7f8fa] p-6 text-center hover:border-[#a64026]/50">
          <Upload className="size-6 text-[#a64026]" />
          <span className="text-sm font-bold text-[#243447]">{files.length ? `${files.length} recording${files.length === 1 ? "" : "s"} · ${totalMb.toFixed(1)} MB` : "Choose recordings (MP3, WAV, M4A)"}</span>
          <span className="text-xs text-[#6b7c8f]">One speaker only, no background music. Up to 8 files, 40 MB in total.</span>
          <input type="file" accept="audio/*" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 8))} />
        </label>
        <label className="flex items-center gap-2 text-sm text-[#526579]">
          <input type="checkbox" checked={denoise} onChange={(event) => setDenoise(event.target.checked)} /> Remove background noise from the recordings
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void submit()} disabled={busy || !canManage || !canClone || provider === "mock" || !name.trim() || files.length === 0} className="mlp-btn-primary h-11">
            {busy ? <Spinner /> : <Mic className="size-4" />} Create the voice
          </button>
          {files.length > 0 && <button type="button" onClick={() => setFiles([])} className="text-xs font-bold text-[#a64026]">Clear recordings</button>}
        </div>
        <p className="text-xs text-[#6b7c8f]">Only clone a voice with the speaker&apos;s permission. The recordings are sent to the provider to build the voice and are not kept in the studio.</p>
      </div>
    </div>
  );
}

/** Text to Voice: describe a voice, listen to candidates, save the one you like. */
function VoiceDesigner({ canManage, provider, onSaved, onNotice }: { canManage: boolean; provider: string; onSaved: (voice: VoiceOption) => void; onNotice: (notice: Notice) => void }) {
  const [voiceDescription, setVoiceDescription] = useState("");
  const [sampleText, setSampleText] = useState("");
  const [previews, setPreviews] = useState<VoiceDesignPreview[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setPreviews(null);
    setSelectedPreview(null);
    onNotice(null);
    try {
      const result = await api<{ previews: VoiceDesignPreview[]; text: string }>("/api/studio/voice/design", { method: "POST", json: { voiceDescription, text: sampleText.trim() || undefined } });
      setPreviews(result.previews);
      if (result.previews.length === 0) onNotice({ tone: "warning", text: "No candidates came back. Try describing the voice differently." });
    } catch (caught) {
      onNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setGenerating(false);
    }
  };

  const listen = (preview: VoiceDesignPreview) => {
    setPlaying(preview.previewId);
    const audio = new Audio(`data:audio/mpeg;base64,${preview.audioBase64}`);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    void audio.play().catch(() => setPlaying(null));
  };

  const save = async () => {
    if (!selectedPreview) return;
    setSaving(true);
    onNotice(null);
    try {
      const result = await api<{ voice: VoiceOption }>("/api/studio/voice/design/save", { method: "POST", json: { generatedVoiceId: selectedPreview, name, description: voiceDescription } });
      onSaved(result.voice);
      onNotice({ tone: "success", text: `"${result.voice.name}" is ready. Choose it in My Voices to narrate this lesson with it.` });
      setVoiceDescription("");
      setSampleText("");
      setPreviews(null);
      setSelectedPreview(null);
      setName("");
    } catch (caught) {
      onNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
      <h3 className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-[#6b7c8f]"><Wand2 className="size-4" /> Voice Design</h3>
      <p className="mt-2 text-sm text-[#6b7c8f]">Describe the voice you want — age, tone, accent, pace — and generate a few candidates to listen to. Nothing is added to the account until you save one.</p>
      {provider === "mock" && <div className="mt-4"><InlineNotice tone="warning">No voice provider is connected yet, so Voice Design is unavailable. An administrator sets ElevenLabs up in /admin/studio.</InlineNotice></div>}
      {!canManage && <div className="mt-4"><InlineNotice tone="info">Only content managers and administrators can add voices to the shared MLP account.</InlineNotice></div>}

      <div className="mt-4 space-y-4">
        <Field label="Voice description" hint="At least 20 characters. Example: “Warm, patient middle-aged Kenyan woman, calm classroom narrator, moderate pace.”">
          <textarea value={voiceDescription} onChange={(event) => setVoiceDescription(event.target.value)} maxLength={1000} rows={3} className={textareaClass} placeholder="Warm, patient middle-aged Kenyan woman, calm classroom narrator, moderate pace." />
        </Field>
        <Field label="Sample line to read (optional)" hint="Leave blank to use a default sample.">
          <input value={sampleText} onChange={(event) => setSampleText(event.target.value)} maxLength={1000} className={inputClass} placeholder="Marketplace literacy helps you buy and sell wisely." />
        </Field>
        <button type="button" onClick={() => void generate()} disabled={generating || provider === "mock" || !canManage || voiceDescription.trim().length < 20} className="mlp-btn-primary h-11">
          {generating ? <Spinner /> : <Sparkles className="size-4" />} Generate candidates
        </button>

        {previews && previews.length > 0 && (
          <div className="space-y-2 border-t border-[#edf0f3] pt-4">
            <h4 className="text-sm font-extrabold text-[#243447]">Candidates</h4>
            {previews.map((preview, index) => (
              <label key={preview.previewId} className={`flex items-center gap-3 rounded-xl border p-3 ${selectedPreview === preview.previewId ? "border-[#a64026] bg-[#fbeaea]/60" : "border-[#d8dde5]"}`}>
                <input type="radio" name="voice-design-preview" checked={selectedPreview === preview.previewId} onChange={() => setSelectedPreview(preview.previewId)} className="accent-[#a64026]" />
                <button type="button" onClick={() => listen(preview)} className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f2f4f7] text-[#243447]" aria-label={`Listen to candidate ${index + 1}`}>
                  {playing === preview.previewId ? <Spinner /> : <Play className="size-4" />}
                </button>
                <span className="text-sm font-bold text-[#243447]">Candidate {index + 1}{preview.durationSec ? ` · ${preview.durationSec.toFixed(1)}s` : ""}</span>
              </label>
            ))}
            {selectedPreview && (
              <div className="flex flex-wrap items-end gap-2 pt-2">
                <Field label="Save as" hint="Name for the voice list.">
                  <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} className={inputClass} placeholder="Aline — designed narrator" />
                </Field>
                <button type="button" onClick={() => void save()} disabled={saving || !name.trim()} className="mlp-btn-primary h-11">
                  {saving ? <Spinner /> : <Check className="size-4" />} Save this voice
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
        <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[#d8dde5] px-3">
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
                      <audio controls preload="none" src={entry.outputAssetUrl} className="h-9 w-40 shrink-0" />
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
  translationLanguage,
  targetLanguageName
}: {
  settings: VoiceSettings;
  onChange: (next: VoiceSettings) => void;
  voices: VoiceOption[];
  defaultVoiceId: string | null;
  onChooseVoice: (voice: VoiceOption) => void;
  account: AccountResponse | null;
  fallbackModel?: string;
  provider: string;
  translationLanguage: ReturnType<typeof findTranslationLanguage>;
  targetLanguageName: string;
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
            onClick={() => onChange({ ...settings, languageOverride: settings.languageOverride ? undefined : (ELEVENLABS_LANGUAGES.find((entry) => entry.name === targetLanguageName)?.code ?? "en") })}
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

      {translationLanguage && (
        <div className="mt-6 border-t border-[#edf0f3] pt-4">
          <h3 className="text-sm font-extrabold text-[#243447]">Text translation support — {targetLanguageName}</h3>
          <p className="mt-1 text-xs text-[#6b7c8f]">For the GPT Translate step, not voice synthesis.</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusPill tone={translationLanguage.tier === "STRONG" ? "ready" : translationLanguage.tier === "GOOD_PRACTICAL" ? "warning" : "error"}>{TRANSLATION_TIER_LABEL[translationLanguage.tier]}</StatusPill>
          </div>
          <p className="mt-2 text-xs text-[#6b7c8f]">{TRANSLATION_TIER_GUIDANCE[translationLanguage.tier]}</p>
        </div>
      )}

      <div className="mt-6 border-t border-[#edf0f3] pt-4">
        <h3 className="text-sm font-extrabold text-[#243447]">Provider account</h3>
        {account?.status ? (
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-[#526579] sm:grid-cols-2">
            <div className="flex justify-between gap-2"><dt>Plan</dt><dd className="font-bold text-[#243447]">{account.status.tier ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt>Provider characters</dt><dd className="font-bold text-[#243447]">{account.status.characterCount?.toLocaleString() ?? "—"}{account.status.characterLimit ? ` / ${account.status.characterLimit.toLocaleString()}` : ""}</dd></div>
            <div className="flex justify-between gap-2"><dt>Voices used</dt><dd className="font-bold text-[#243447]">{account.status.voicesUsed ?? "—"}{account.status.voiceLimit ? ` / ${account.status.voiceLimit}` : ""}</dd></div>
            <div className="flex justify-between gap-2"><dt>Voice cloning</dt><dd className="font-bold text-[#243447]">{account.status.canCloneVoices ? "Available" : "Not on this plan"}</dd></div>
          </dl>
        ) : (
          <p className="mt-2 text-xs text-[#6b7c8f]">Provider: {provider === "mock" ? "placeholder voice (development)" : "ElevenLabs"} · Model: {activeModelId}</p>
        )}
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
