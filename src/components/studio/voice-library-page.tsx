"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Filter, Library, Mic, Play, Plus, Search, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { Field, InlineNotice, Spinner, StatusPill, inputClass, textareaClass } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import { ELEVENLABS_LANGUAGES } from "@/lib/studio/elevenlabs-languages";
import type { SharedVoiceOption, VoiceAccountStatus, VoiceDesignPreview, VoiceModelOption, VoiceOption } from "@/lib/studio/types";

type VoicesResponse = { provider: string; model: string; voices: VoiceOption[]; credits: { limit: number; used: number; remaining: number } };
type AccountResponse = { provider: string; defaultModel: string; status: VoiceAccountStatus | null; models: VoiceModelOption[] };
export type Notice = { tone: "info" | "success" | "warning" | "error"; text: string } | null;
type LibraryTab = "voices" | "library" | "create";

const LIBRARY_TABS: Array<{ id: LibraryTab; label: string; icon: typeof Library }> = [
  { id: "voices", label: "My Voices", icon: Mic },
  { id: "library", label: "Explore", icon: Library },
  { id: "create", label: "Create voice", icon: Wand2 }
];

/** One-click category filters, matching ElevenLabs' own voice-library categories. */
export const VOICE_CATEGORY_PILLS = [
  ["conversational", "Conversational"],
  ["narrative_story", "Narration"],
  ["characters_animation", "Characters"],
  ["social_media", "Social Media"],
  ["informative_educational", "Educational"],
  ["advertisement", "Advertisement"],
  ["entertainment_tv", "Entertainment"]
] as const;

export function CategoryPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${active ? "border-[#a64026] bg-[#fbeaea] text-[#a64026]" : "border-[#d8dde5] bg-white text-[#526579] hover:border-[#c9d0da]"}`}>
      {children}
    </button>
  );
}

/**
 * Voice Library (content managers): the MLP account's shared ElevenLabs
 * voices — browse the account, search the public library, clone or design
 * new ones, and see the account's own plan limits. Not tied to any one
 * localization; a voice added here is immediately available to every
 * project's Voice tab. Adding, browsing, cloning and removing all cost no
 * narration credits — only generating narration for a lesson does.
 */
export function VoiceLibraryPage() {
  const [tab, setTab] = useState<LibraryTab>("voices");
  const [voices, setVoices] = useState<VoicesResponse | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    api<VoicesResponse>("/api/studio/voice/voices").then(setVoices).catch((caught) => setVoiceError((caught as Error).message));
    api<AccountResponse>("/api/studio/voice/account").then(setAccount).catch(() => undefined);
  }, []);

  const reload = async () => {
    const [nextVoices, nextAccount] = await Promise.all([
      api<VoicesResponse>("/api/studio/voice/voices").catch(() => voices),
      api<AccountResponse>("/api/studio/voice/account").catch(() => account)
    ]);
    if (nextVoices) setVoices(nextVoices);
    if (nextAccount) setAccount(nextAccount);
  };

  const provider = voices?.provider ?? account?.provider ?? "mock";

  const preview = (voice: { id: string; previewUrl?: string | null }) => {
    if (!voice.previewUrl) return;
    setPreviewing(voice.id);
    const audio = new Audio(voice.previewUrl);
    audio.onended = () => setPreviewing(null);
    audio.onerror = () => setPreviewing(null);
    void audio.play().catch(() => setPreviewing(null));
  };

  const remove = async (voice: VoiceOption) => {
    setBusy(voice.id);
    setNotice(null);
    try {
      await api(`/api/studio/voice/voices/${voice.id}`, { method: "DELETE" });
      await reload();
      setNotice({ tone: "success", text: `"${voice.name}" was removed from the MLP account.` });
    } catch (caught) {
      setNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const onAdded = async (voice: VoiceOption) => {
    await reload();
    setNotice({ tone: "success", text: `"${voice.name}" was added. It's ready to choose from any lesson's Voice tab.` });
    setTab("voices");
  };

  const filteredVoices = (voices?.voices ?? []).filter((voice) => {
    if (query.trim() && !`${voice.name} ${voice.description ?? ""} ${Object.values(voice.labels ?? {}).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (category && voice.labels?.use_case !== category && !Object.values(voice.labels ?? {}).some((value) => value === category)) return false;
    return true;
  });

  return (
    <>
      <StudioPageHeader title="Voice Library" subtitle="The MLP account's shared voices. Add one here and it's ready to choose from any lesson." />
      <main className="space-y-6 px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        {notice && <InlineNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice>}

        <div className="flex flex-wrap gap-1 rounded-xl border border-[#d8dde5] bg-white p-1">
          {LIBRARY_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold ${tab === id ? "bg-[#fbeaea] text-[#a64026]" : "text-[#6b7c8f] hover:bg-[#f7f8fa]"}`}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <section>
            {tab === "voices" && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
                <h2 className="text-lg font-extrabold text-[#243447]">My Voices</h2>
                <p className="mt-1 text-sm text-[#6b7c8f]">Every voice the MLP account can use to narrate a lesson.</p>

                {voices && voices.voices.length > 6 && (
                  <>
                    <div className="mlp-input mt-3 flex items-center gap-2">
                      <Search className="size-4 shrink-0 text-[#8b9bad]" />
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search voices…" className="h-full w-full border-0 bg-transparent p-0 text-[#243447] outline-none" aria-label="Search voices" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <CategoryPill active={category === ""} onClick={() => setCategory("")}>All</CategoryPill>
                      {VOICE_CATEGORY_PILLS.map(([value, label]) => (
                        <CategoryPill key={value} active={category === value} onClick={() => setCategory(value)}>{label}</CategoryPill>
                      ))}
                    </div>
                  </>
                )}

                {voiceError ? (
                  <div className="mt-4"><InlineNotice tone="warning">{voiceError}</InlineNotice></div>
                ) : !voices ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-[#6b7c8f]"><Spinner /> Loading voices…</div>
                ) : filteredVoices.length === 0 ? (
                  <p className="mt-4 text-sm text-[#6b7c8f]">No voices match. {voices.voices.length === 0 && <button type="button" onClick={() => setTab("library")} className="font-bold text-[#a64026]">Browse the voice library</button>}</p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {filteredVoices.map((voice) => {
                      const removable = voice.category === "cloned" || voice.category === "designed" || voice.category === "professional";
                      return (
                        <div key={voice.id} className="flex items-center gap-3 rounded-xl border border-[#d8dde5] p-3">
                          <button type="button" onClick={() => preview(voice)} disabled={!voice.previewUrl} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f4f7] text-[#243447] disabled:opacity-40" aria-label={`Preview ${voice.name}`}>
                            {previewing === voice.id ? <Spinner /> : <Play className="size-4" />}
                          </button>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-extrabold text-[#243447]">{voice.name}{voice.category && voice.category !== "premade" ? ` · ${voice.category}` : ""}</span>
                            <span className="block truncate text-xs text-[#6b7c8f]">{voice.description || Object.values(voice.labels ?? {}).join(" · ") || (voice.languages?.length ? voice.languages.join(", ") : "Multilingual")}</span>
                          </span>
                          {removable && (
                            <button type="button" onClick={() => void remove(voice)} disabled={busy !== null} className="grid size-9 shrink-0 place-items-center rounded-md border border-red-200 text-red-600" aria-label={`Remove ${voice.name}`} title="Remove this voice from the account">
                              {busy === voice.id ? <Spinner className="size-3.5" /> : <Trash2 className="size-4" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === "library" && <VoiceLibrary canManage provider={provider} onAdded={onAdded} onNotice={setNotice} />}

            {tab === "create" && <CreateVoiceTab canManage canClone={account?.status?.canCloneVoices ?? false} provider={provider} onSaved={onAdded} onNotice={setNotice} />}
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#6b7c8f]">Provider account</h2>
              {account?.status ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Plan</dt><dd className="font-extrabold text-[#243447]">{account.status.tier ?? "—"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Provider characters</dt><dd className="font-extrabold text-[#243447]">{account.status.characterCount?.toLocaleString() ?? "—"}{account.status.characterLimit ? ` / ${account.status.characterLimit.toLocaleString()}` : ""}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Voices used</dt><dd className="font-extrabold text-[#243447]">{account.status.voicesUsed ?? "—"}{account.status.voiceLimit ? ` / ${account.status.voiceLimit}` : ""}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Voice cloning</dt><dd className="font-extrabold text-[#243447]">{account.status.canCloneVoices ? "Available" : "Not on this plan"}</dd></div>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-[#6b7c8f]">Provider: {provider === "mock" ? "placeholder voice (development)" : "ElevenLabs"}</p>
              )}
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] text-xs text-[#6b7c8f]">
              Choosing, previewing, browsing, cloning, designing and removing voices are all free. Only generating narration for a lesson uses that lesson&apos;s AI Voice credits — set per educator in <a href="/admin/studio" className="font-bold text-[#a64026]">Admin → Educator Studio</a>.
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Explore                                                                      */
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
      await onAdded(result.voice);
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
        <p className="mt-1 text-sm text-[#6b7c8f]">Two ways to get a new voice for the MLP account. Neither uses any project&apos;s narration credits.</p>
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
      await onCloned(data.voice);
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
      await onSaved(result.voice);
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
