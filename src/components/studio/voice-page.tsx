"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AudioLines, Check, Coins, Play, RefreshCw, Sparkles } from "lucide-react";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { Field, InlineNotice, Spinner, StatusPill, inputClass } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import { formatSeconds } from "@/lib/studio/timing";
import type { ProjectDto, VoiceOption, VoiceSettings } from "@/lib/studio/types";

type VoicesResponse = { provider: string; model: string; voices: VoiceOption[]; credits: { limit: number; used: number; remaining: number } };

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

  useEffect(() => {
    api<VoicesResponse>("/api/studio/voice/voices")
      .then(setVoices)
      .catch((caught) => setVoiceError((caught as Error).message));
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

  const preview = (voice: VoiceOption) => {
    if (!voice.previewUrl) return;
    setPreviewing(voice.id);
    const audio = new Audio(voice.previewUrl);
    audio.onended = () => setPreviewing(null);
    audio.onerror = () => setPreviewing(null);
    void audio.play().catch(() => setPreviewing(null));
  };

  const credits = voices?.credits ?? project.credits;

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

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold text-[#243447]">Project voice</h2>
                {project.defaultVoiceName && <StatusPill tone="accent">{project.defaultVoiceName}</StatusPill>}
              </div>
              <p className="mt-1 text-sm text-[#6b7c8f]">Every AI-narrated segment uses this voice unless a segment overrides it below.</p>
              {voiceError ? (
                <div className="mt-4"><InlineNotice tone="warning">{voiceError}</InlineNotice></div>
              ) : !voices ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-[#6b7c8f]"><Spinner /> Loading voices…</div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {voices.voices.map((voice) => {
                    const selected = voice.id === project.defaultVoiceId;
                    return (
                      <div key={voice.id} className={`flex items-center gap-3 rounded-xl border p-3 ${selected ? "border-[#a64026] bg-[#fbeaea]/60 ring-2 ring-[#a64026]/15" : "border-[#d8dde5]"}`}>
                        <button type="button" onClick={() => preview(voice)} disabled={!voice.previewUrl} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f4f7] text-[#243447] disabled:opacity-40" aria-label={`Preview ${voice.name}`}>
                          {previewing === voice.id ? <Spinner /> : <Play className="size-4" />}
                        </button>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-extrabold text-[#243447]">{voice.name}</span>
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
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#243447]"><Coins className="size-5 text-[#a64026]" /> AI Voice Credits</h2>
              <div className="mt-3 text-3xl font-extrabold text-[#243447]">{credits.remaining.toLocaleString()} <span className="text-base font-bold text-[#6b7c8f]">remaining</span></div>
              <div className="mt-1 text-sm text-[#6b7c8f]">{credits.used.toLocaleString()} used of {credits.limit.toLocaleString()}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f2f4f7]"><div className="h-full bg-[#a64026]" style={{ width: `${credits.limit ? Math.min(100, Math.round((credits.used / credits.limit) * 100)) : 0}%` }} /></div>
              <p className="mt-3 text-xs text-[#6b7c8f]">One credit per character of text narrated. Generating all missing narration now would use about {estimate.toLocaleString()} credits.</p>
              {credits.remaining < estimate && <div className="mt-3"><InlineNotice tone="warning">Not enough credits for everything. Ask the MLP administrator to increase your allowance.</InlineNotice></div>}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
              <h2 className="text-lg font-extrabold text-[#243447]">Voice settings</h2>
              <p className="mt-1 text-xs text-[#6b7c8f]">Applies to narration generated from now on. Defaults suit most lessons.</p>
              <div className="mt-4 space-y-4">
                <Slider label="Stability" hint="Higher = steadier, lower = more expressive" value={settings.stability ?? 0.5} min={0} max={1} step={0.05} onChange={(value) => saveSettings({ ...settings, stability: value })} />
                <Slider label="Similarity" hint="How closely to match the chosen voice" value={settings.similarity ?? 0.75} min={0} max={1} step={0.05} onChange={(value) => saveSettings({ ...settings, similarity: value })} />
                <Slider label="Style" hint="Extra expressiveness; keep low for teaching" value={settings.style ?? 0} min={0} max={1} step={0.05} onChange={(value) => saveSettings({ ...settings, style: value })} />
                <Slider label="Speed" hint="Speaking pace" value={settings.speed ?? 1} min={0.7} max={1.2} step={0.05} onChange={(value) => saveSettings({ ...settings, speed: value })} />
              </div>
              {voices && <p className="mt-4 text-xs text-[#8b9bad]">Provider: {voices.provider === "mock" ? "placeholder voice (development)" : "ElevenLabs"} · Model: {voices.model}</p>}
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
