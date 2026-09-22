"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AudioLines, Check, Coins, Library, ListMusic, Mic, Play, Plus, RefreshCw, Search, Settings2, Sparkles, Trash2, Upload } from "lucide-react";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { Field, InlineNotice, Spinner, StatusPill, inputClass } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import { formatSeconds } from "@/lib/studio/timing";
import type { ProjectDto, SharedVoiceOption, VoiceAccountStatus, VoiceModelOption, VoiceOption, VoiceSettings } from "@/lib/studio/types";

type VoicesResponse = { provider: string; model: string; voices: VoiceOption[]; credits: { limit: number; used: number; remaining: number } };
type AccountResponse = { provider: string; defaultModel: string; status: VoiceAccountStatus | null; models: VoiceModelOption[] };
type VoiceTab = "voices" | "library" | "clone" | "settings" | "segments";

const VOICE_TABS: Array<{ id: VoiceTab; label: string; icon: typeof AudioLines }> = [
  { id: "voices", label: "Voices", icon: AudioLines },
  { id: "library", label: "Voice library", icon: Library },
  { id: "clone", label: "Clone a voice", icon: Mic },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "segments", label: "Segments", icon: ListMusic }
];

/**
 * AI Voice page: pick a project voice, tune the few settings that matter,
 * and generate narration for every approved translation that still needs
 * it. All provider calls happen server-side; educators never see ElevenLabs.
 */
export function VoicePage({ initial }: { initial: ProjectDto }) {
  const [project, setProject] = useState(initial);
  const [voices, setVoices] = useState<VoicesResponse | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [settings, setSettings] = useState<VoiceSettings>(initial.voiceSettings);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "warning" | "error"; text: string } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [tab, setTab] = useState<VoiceTab>("voices");
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [voiceQuery, setVoiceQuery] = useState("");

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

  const preview = (voice: VoiceOption) => {
    if (!voice.previewUrl) return;
    setPreviewing(voice.id);
    const audio = new Audio(voice.previewUrl);
    audio.onended = () => setPreviewing(null);
    audio.onerror = () => setPreviewing(null);
    void audio.play().catch(() => setPreviewing(null));
  };

  const credits = voices?.credits ?? project.credits;
  const canManageVoices = project.permissions.canManageTemplates;

  /** A voice added from the library or freshly cloned becomes this project's voice straight away. */
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
                  <h2 className="text-lg font-extrabold text-[#243447]">Project voice</h2>
                  {project.defaultVoiceName && <StatusPill tone="accent">{project.defaultVoiceName}</StatusPill>}
                </div>
                <p className="mt-1 text-sm text-[#6b7c8f]">Every AI-narrated segment uses this voice unless a segment overrides it in the Segments tab.</p>
                {voices && voices.voices.length > 6 && (
                  <label className="mt-3 flex items-center gap-2 rounded-lg border border-[#d8dde5] px-3">
                    <Search className="size-4 text-[#8b9bad]" />
                    <input value={voiceQuery} onChange={(event) => setVoiceQuery(event.target.value)} placeholder="Search the account's voices…" className="h-10 flex-1 bg-transparent text-sm outline-none" aria-label="Search voices" />
                  </label>
                )}
                {voiceError ? (
                  <div className="mt-4"><InlineNotice tone="warning">{voiceError}</InlineNotice></div>
                ) : !voices ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-[#6b7c8f]"><Spinner /> Loading voices…</div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {voices.voices
                      .filter((voice) => !voiceQuery.trim() || `${voice.name} ${voice.description ?? ""} ${Object.values(voice.labels ?? {}).join(" ")}`.toLowerCase().includes(voiceQuery.trim().toLowerCase()))
                      .map((voice) => {
                        const selected = voice.id === project.defaultVoiceId;
                        return (
                          <div key={voice.id} className={`flex items-center gap-3 rounded-xl border p-3 ${selected ? "border-[#a64026] bg-[#fbeaea]/60 ring-2 ring-[#a64026]/15" : "border-[#d8dde5]"}`}>
                            <button type="button" onClick={() => preview(voice)} disabled={!voice.previewUrl} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f4f7] text-[#243447] disabled:opacity-40" aria-label={`Preview ${voice.name}`}>
                              {previewing === voice.id ? <Spinner /> : <Play className="size-4" />}
                            </button>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-extrabold text-[#243447]">{voice.name}{voice.category === "cloned" ? " · cloned" : ""}</span>
                              <span className="block truncate text-xs text-[#6b7c8f]">{voice.description || Object.values(voice.labels ?? {}).join(" · ") || (voice.languages?.length ? voice.languages.join(", ") : "Multilingual")}</span>
                            </span>
                            <button type="button" onClick={() => chooseVoice(voice)} disabled={busy !== null || selected} className={selected ? "inline-flex h-9 items-center gap-1 rounded-lg bg-[#a64026] px-3 text-xs font-extrabold text-white" : "mlp-btn-outline h-9 px-3 text-xs"}>
                              {selected ? <><Check className="size-3.5" /> Selected</> : "Use"}
                            </button>
                            {canManageVoices && voice.category === "cloned" && !selected && (
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

            {tab === "library" && <VoiceLibrary canManage={canManageVoices} onAdded={onVoiceAdded} onNotice={setNotice} />}

            {tab === "clone" && <VoiceCloner canManage={canManageVoices} canClone={account?.status?.canCloneVoices ?? false} provider={voices?.provider ?? account?.provider ?? "mock"} onCloned={onVoiceAdded} onNotice={setNotice} />}

            {tab === "settings" && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
                <h2 className="text-lg font-extrabold text-[#243447]">Voice settings</h2>
                <p className="mt-1 text-sm text-[#6b7c8f]">These apply to narration generated from now on, for this localization only. The defaults suit most lessons.</p>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <Slider label="Stability" hint="Higher = steadier, lower = more expressive" value={settings.stability ?? 0.5} min={0} max={1} step={0.05} onChange={(value) => saveSettings({ ...settings, stability: value })} />
                  <Slider label="Similarity" hint="How closely to match the chosen voice" value={settings.similarity ?? 0.75} min={0} max={1} step={0.05} onChange={(value) => saveSettings({ ...settings, similarity: value })} />
                  <Slider label="Style" hint="Extra expressiveness; keep low for teaching" value={settings.style ?? 0} min={0} max={1} step={0.05} onChange={(value) => saveSettings({ ...settings, style: value })} />
                  <Slider label="Speed" hint="Speaking pace" value={settings.speed ?? 1} min={0.7} max={1.2} step={0.05} onChange={(value) => saveSettings({ ...settings, speed: value })} />
                </div>

                <div className="mt-6 border-t border-[#edf0f3] pt-4">
                  <h3 className="text-sm font-extrabold text-[#243447]">Model</h3>
                  <p className="text-xs text-[#6b7c8f]">Faster models cost fewer credits per character; the multilingual model is the most natural for teaching.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(account?.models.length ? account.models : [{ id: account?.defaultModel ?? voices?.model ?? "eleven_multilingual_v2", name: account?.defaultModel ?? voices?.model ?? "Default model", costFactor: 1 }]).map((model) => {
                      const current = (settings.model ?? account?.defaultModel ?? voices?.model) === model.id;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => saveSettings({ ...settings, model: model.id })}
                          aria-pressed={current}
                          className={`rounded-xl border p-3 text-left ${current ? "border-[#a64026] bg-[#fbeaea]/60" : "border-[#d8dde5] hover:border-[#c9d0da]"}`}
                        >
                          <span className="block text-sm font-extrabold text-[#243447]">{model.name}</span>
                          <span className="block text-xs text-[#6b7c8f]">{model.description ?? model.id}</span>
                          {model.costFactor !== undefined && <span className="mt-1 block text-[11px] font-bold text-[#a64026]">{model.costFactor === 1 ? "1 credit per character" : `${model.costFactor} credits per character`}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {settings.model && settings.model !== (account?.defaultModel ?? voices?.model) && (
                    <button type="button" onClick={() => saveSettings({ ...settings, model: undefined })} className="mt-2 text-xs font-bold text-[#a64026]">Use the studio default ({account?.defaultModel ?? voices?.model})</button>
                  )}
                </div>

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
                    <p className="mt-2 text-xs text-[#6b7c8f]">Provider: {voices?.provider === "mock" ? "placeholder voice (development)" : "ElevenLabs"} · Model: {voices?.model}</p>
                  )}
                </div>
              </div>
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
              <p className="mt-2 text-xs text-[#8b9bad]">Choosing, previewing, cloning and removing voices are free — only generating narration uses credits.</p>
              {credits.remaining < estimate && <div className="mt-3"><InlineNotice tone="warning">Not enough credits for everything. Ask the MLP administrator to increase your allowance.</InlineNotice></div>}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#6b7c8f]">This localization</h2>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Voice</dt><dd className="font-extrabold text-[#243447]">{project.defaultVoiceName ?? "Not chosen"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Model</dt><dd className="font-extrabold text-[#243447]">{settings.model ?? account?.defaultModel ?? voices?.model ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-[#6b7c8f]">Ready to generate</dt><dd className="font-extrabold text-[#243447]">{pending.length}</dd></div>
              </dl>
            </div>

            <Field label="Language context (read-only)">
              <input readOnly value={[project.targetLanguageName, project.region, project.variety, project.audience].filter(Boolean).join(" · ")} className={`${inputClass} bg-[#f7f8fa]`} />
            </Field>
          </aside>
        </div>
      </main>
    </>
  );
}

/** Browse the provider's public library and copy a voice into the account (free). */
function VoiceLibrary({ canManage, onAdded, onNotice }: { canManage: boolean; onAdded: (voice: VoiceOption) => void; onNotice: (notice: { tone: "info" | "success" | "warning" | "error"; text: string } | null) => void }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [results, setResults] = useState<SharedVoiceOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    onNotice(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (language.trim()) params.set("language", language.trim());
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
      onNotice({ tone: "success", text: `"${voice.name}" was added to the MLP voices and can now be chosen for a lesson.` });
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

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
      <h2 className="text-lg font-extrabold text-[#243447]">Voice library</h2>
      <p className="mt-1 text-sm text-[#6b7c8f]">Search the provider&apos;s public voices, listen to them, and add the ones you want to the MLP account. Searching, listening and adding cost no credits.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[#d8dde5] px-3">
          <Search className="size-4 text-[#8b9bad]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="Warm female narrator, storyteller, African accent…" className="h-10 flex-1 bg-transparent text-sm outline-none" aria-label="Search the voice library" />
        </label>
        <input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Language (en, fr, sw…)" className="h-10 w-40 rounded-lg border border-[#d8dde5] px-3 text-sm" aria-label="Language code" />
        <button type="button" onClick={() => void search()} disabled={searching} className="mlp-btn-primary h-10">{searching ? <Spinner /> : <Search className="size-4" />} Search</button>
      </div>

      {!results ? (
        <p className="mt-4 text-sm text-[#6b7c8f]">Search to see voices. Nothing is added to the account until you press Add.</p>
      ) : results.length === 0 ? (
        <p className="mt-4 text-sm text-[#6b7c8f]">No voices matched. Try a different description, or leave the search empty to see popular voices.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {results.map((voice) => (
            <div key={`${voice.publicOwnerId}:${voice.id}`} className="flex items-center gap-3 rounded-xl border border-[#d8dde5] p-3">
              <button type="button" onClick={() => listen(voice)} disabled={!voice.previewUrl} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f4f7] text-[#243447] disabled:opacity-40" aria-label={`Listen to ${voice.name}`}>
                {playing === voice.id ? <Spinner /> : <Play className="size-4" />}
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold text-[#243447]">{voice.name}</span>
                <span className="block truncate text-xs text-[#6b7c8f]">{[voice.accent, voice.useCase, voice.languages?.[0], voice.description].filter(Boolean).join(" · ") || "Library voice"}</span>
              </span>
              <button type="button" onClick={() => void add(voice)} disabled={!canManage || adding !== null} className="mlp-btn-outline h-9 px-3 text-xs" title={canManage ? "Add to the MLP voices" : "Only content managers can add voices to the account"}>
                {adding === voice.id ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Instant voice cloning from recordings — free of narration credits, uses a voice slot. */
function VoiceCloner({ canManage, canClone, provider, onCloned, onNotice }: { canManage: boolean; canClone: boolean; provider: string; onCloned: (voice: VoiceOption) => void; onNotice: (notice: { tone: "info" | "success" | "warning" | "error"; text: string } | null) => void }) {
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
      onNotice({ tone: "success", text: `"${data.voice.name}" is ready. Choose it in the Voices tab to narrate this lesson with it.` });
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
      <h2 className="text-lg font-extrabold text-[#243447]">Clone a voice</h2>
      <p className="mt-1 text-sm text-[#6b7c8f]">
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

function Slider({ label, hint, value, min, max, step, onChange }: { label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
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
      <span className="block text-xs text-[#6b7c8f]">{hint}</span>
    </label>
  );
}
