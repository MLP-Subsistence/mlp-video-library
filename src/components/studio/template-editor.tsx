"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Grid2X2, Languages, Music2, Plus, Trash2, X } from "lucide-react";
import { AssetLibrary } from "@/components/studio/asset-library";
import { LayoutEditor } from "@/components/studio/layout-editor";
import { MediaMatchesPanel } from "@/components/studio/media-matches";
import { StudioPageHeader } from "@/components/studio/studio-shell";
import { Field, InlineNotice, Spinner, StatusPill, inputClass, textareaClass } from "@/components/studio/ui";
import { CompositionPreview } from "@/components/studio/workspace/composition-preview";
import { api, debounce } from "@/lib/studio/client";
import { compositionHasVisual } from "@/lib/studio/layouts";
import type { TemplateDto, TemplateSegmentDto } from "@/lib/studio/templates";
import type { Composition, StudioAssetDto } from "@/lib/studio/types";

/**
 * Master Template editor (content managers): ordered segments with stable
 * keys, source scripts, default pauses and visual compositions. Localizations
 * inherit everything here; educators can override visuals per project.
 */
export function TemplateEditor({ initial }: { initial: TemplateDto }) {
  const router = useRouter();
  const [template, setTemplate] = useState(initial);
  const [activeId, setActiveId] = useState(initial.segments[0]?.id ?? "");
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "warning" | "error"; text: string } | null>(null);
  const active = template.segments.find((segment) => segment.id === activeId) ?? template.segments[0] ?? null;
  const patchTemplate = async (patch: Record<string, unknown>) => {
    const result = await api<{ template: TemplateDto }>(`/api/studio/templates/${template.id}`, { method: "PATCH", json: patch });
    setTemplate(result.template);
    return result.template;
  };
  const patchSegment = async (segmentId: string, patch: Record<string, unknown>) => {
    const result = await api<{ template: TemplateDto }>(`/api/studio/templates/${template.id}/segments/${segmentId}`, { method: "PATCH", json: patch });
    setTemplate(result.template);
    return result.template;
  };

  const autosave = useMemo(
    () =>
      debounce((segmentId: string, patch: Record<string, unknown>) => {
        patchSegment(segmentId, patch).catch((caught) => setNotice({ tone: "error", text: (caught as Error).message }));
      }, 800),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template.id]
  );

  const run = async (label: string, action: () => Promise<unknown>, success?: string) => {
    setBusy(label);
    setNotice(null);
    try {
      await action();
      if (success) setNotice({ tone: "success", text: success });
    } catch (caught) {
      setNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const addSegment = () =>
    run("add", async () => {
      const result = await api<{ template: TemplateDto }>(`/api/studio/templates/${template.id}/segments`, { method: "POST", json: { afterSegmentId: active?.id ?? null } });
      setTemplate(result.template);
      const index = active ? result.template.segments.findIndex((segment) => segment.id === active.id) + 1 : result.template.segments.length - 1;
      setActiveId(result.template.segments[index]?.id ?? result.template.segments[result.template.segments.length - 1].id);
    });

  const removeSegment = (segment: TemplateSegmentDto) => {
    if (!window.confirm(`Delete ${segment.key} "${segment.title}"?`)) return;
    void run("remove", async () => {
      const result = await api<{ template: TemplateDto }>(`/api/studio/templates/${template.id}/segments/${segment.id}`, { method: "DELETE" });
      setTemplate(result.template);
      setActiveId(result.template.segments[0]?.id ?? "");
    });
  };

  const move = (segment: TemplateSegmentDto, direction: -1 | 1) => {
    const order = template.segments.map((entry) => entry.id);
    const index = order.indexOf(segment.id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    void run("reorder", async () => {
      const result = await api<{ template: TemplateDto }>(`/api/studio/templates/${template.id}/segments`, { method: "PUT", json: { order } });
      setTemplate(result.template);
    });
  };

  const missingVisuals = template.segments.filter((segment) => !compositionHasVisual(segment.composition)).length;
  const missingScripts = template.segments.filter((segment) => !segment.sourceScript.trim()).length;
  const music = template.musicAssetId ? template.assets[template.musicAssetId] : null;

  return (
    <>
      <StudioPageHeader
        title={template.title}
        badge={<StatusPill tone={template.status === "ready" ? "ready" : "warning"}>{template.status === "ready" ? "Ready for localization" : "Draft"}</StatusPill>}
        subtitle={`${template.moduleName ?? "Marketplace Literacy"} · ${template.segments.length} segments${template.projects.length ? ` · ${template.projects.length} localization${template.projects.length === 1 ? "" : "s"}` : ""}`}
        actions={
          <>
            <Link href="/studio/templates" className="mlp-btn-outline h-10">All templates</Link>
            {template.status === "ready" ? (
              <button type="button" onClick={() => run("status", () => patchTemplate({ status: "draft" }))} disabled={busy !== null} className="mlp-btn-outline h-10">Mark as draft</button>
            ) : (
              <button type="button" onClick={() => run("status", () => patchTemplate({ status: "ready" }), "Template is ready. Educators can now start localizations.")} disabled={busy !== null || template.segments.length === 0} className="mlp-btn-primary h-10">
                <CheckCircle2 className="size-4" /> Mark ready
              </button>
            )}
          </>
        }
      />
      <main className="px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        {notice && <div className="mb-4"><InlineNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice></div>}
        {(missingVisuals > 0 || missingScripts > 0) && (
          <div className="mb-4">
            <InlineNotice tone="warning">
              {missingScripts ? `${missingScripts} segment${missingScripts === 1 ? " has" : "s have"} no script. ` : ""}
              {missingVisuals ? `${missingVisuals} segment${missingVisuals === 1 ? " has" : "s have"} no visual — educators can add visuals per project, but default visuals save everyone time.` : ""}
            </InlineNotice>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="rounded-2xl bg-white shadow-sm ring-1 ring-[#edf0f3]">
            <div className="flex items-center justify-between border-b border-[#edf0f3] px-4 py-3">
              <span className="text-xs font-extrabold uppercase tracking-wide text-[#243447]">Segments</span>
              <button type="button" onClick={addSegment} disabled={busy !== null} className="inline-flex items-center gap-1 text-xs font-bold text-[#a64026]"><Plus className="size-3.5" /> Add</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {template.segments.map((segment, index) => (
                <div key={segment.id} className={`group flex items-center gap-1 rounded-lg ${segment.id === active?.id ? "bg-[#fbeaea] ring-1 ring-[#e5ccd0]" : "hover:bg-[#f7f8fa]"}`}>
                  <button type="button" onClick={() => setActiveId(segment.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm">
                    <span className="w-6 shrink-0 text-xs tabular-nums text-[#8b9bad]">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`min-w-0 flex-1 truncate ${segment.id === active?.id ? "font-extrabold text-[#243447]" : "font-semibold text-[#526579]"}`}>{segment.title}</span>
                    {!compositionHasVisual(segment.composition) && <span className="size-2 shrink-0 rounded-full bg-amber-500" title="No visual" />}
                  </button>
                  <span className="hidden shrink-0 items-center pr-1 group-hover:flex">
                    <button type="button" onClick={() => move(segment, -1)} className="grid size-6 place-items-center text-[#6b7c8f]" aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                    <button type="button" onClick={() => move(segment, 1)} className="grid size-6 place-items-center text-[#6b7c8f]" aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                    <button type="button" onClick={() => removeSegment(segment)} className="grid size-6 place-items-center text-red-600" aria-label="Delete"><Trash2 className="size-3.5" /></button>
                  </span>
                </div>
              ))}
              {template.segments.length === 0 && <p className="p-3 text-sm text-[#6b7c8f]">No segments yet. Add the first one.</p>}
            </div>
            <div className="space-y-3 border-t border-[#edf0f3] p-4">
              <div className="text-xs font-extrabold uppercase tracking-wide text-[#243447]">Template settings</div>
              <Field label="Title">
                <input defaultValue={template.title} onBlur={(event) => event.target.value.trim() && event.target.value !== template.title && run("title", () => patchTemplate({ title: event.target.value }))} className={inputClass} />
              </Field>
              <div>
                <span className="mb-1 block text-sm font-bold text-[#243447]">Music / SFX bed</span>
                {music ? (
                  <div className="flex items-center gap-2 rounded-lg border border-[#d8dde5] p-2 text-xs">
                    <Music2 className="size-4 shrink-0 text-[#a64026]" />
                    <span className="min-w-0 flex-1 truncate font-bold text-[#243447]">{music.name}</span>
                    <input type="range" min={0} max={1} step={0.05} defaultValue={template.musicVolume} onMouseUp={(event) => run("volume", () => patchTemplate({ musicVolume: Number((event.target as HTMLInputElement).value) }))} className="w-16 accent-[#a64026]" aria-label="Music volume" />
                    <button type="button" onClick={() => run("music", () => patchTemplate({ musicAssetId: null }))} className="grid size-7 place-items-center text-red-600" aria-label="Remove music"><X className="size-3.5" /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setMusicOpen(true)} className="mlp-btn-outline h-10 w-full text-xs"><Music2 className="size-4" /> Add music bed (optional)</button>
                )}
              </div>
              {template.projects.length > 0 && (
                <div>
                  <span className="mb-1 block text-sm font-bold text-[#243447]">Localizations</span>
                  <ul className="space-y-1 text-xs">
                    {template.projects.map((project) => (
                      <li key={project.id}><Link href={`/studio/projects/${project.id}`} className="inline-flex items-center gap-1 font-bold text-[#a64026]"><Languages className="size-3" /> {project.targetLanguageName} <span className="text-[#8b9bad]">· {project.status.replace("_", " ")}</span></Link></li>
                    ))}
                  </ul>
                </div>
              )}
              <button type="button" onClick={() => { if (window.confirm("Delete this master template? Only possible when it has no localization projects.")) void run("delete", async () => { await api(`/api/studio/templates/${template.id}`, { method: "DELETE" }); router.push("/studio/templates"); }); }} className="text-xs font-bold text-red-600">Delete template</button>
            </div>
          </aside>

          {active ? (
            <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
              <div className="space-y-4">
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] sm:p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">{active.key}</span>
                    <span className="text-xs text-[#8b9bad]">Stable ID shared by every localization</span>
                  </div>
                  <CompositionPreview composition={active.composition} assets={template.assets} block={null} timeSec={0} playing={false} caption={`${active.key}: ${active.title}`} className="mt-3" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setLayoutOpen(true)} className="mlp-btn-outline h-10"><Grid2X2 className="size-4" /> Layout &amp; visuals</button>
                    {active.composition.slots.some((slot) => slot.items.length > 0) && (
                      <span className="inline-flex items-center text-xs text-[#6b7c8f]">{active.composition.slots.reduce((sum, slot) => sum + slot.items.length, 0)} visual{active.composition.slots.reduce((sum, slot) => sum + slot.items.length, 0) === 1 ? "" : "s"} · {active.composition.layout}</span>
                    )}
                  </div>
                </div>
                {template.masterAssetId && <MediaMatchesPanel key={active.id} templateId={template.id} segmentId={active.id} segmentKey={active.key} onTemplate={setTemplate} />}
              </div>
              <SegmentForm key={active.id} segment={active} sourceLanguageCode={template.sourceLanguageCode} autosave={autosave} />
            </section>
          ) : (
            <section className="rounded-2xl bg-white p-8 text-center text-sm text-[#6b7c8f] shadow-sm ring-1 ring-[#edf0f3]">Add a segment to begin.</section>
          )}
        </div>
      </main>
      {active && (
        <LayoutEditor
          open={layoutOpen}
          onClose={() => setLayoutOpen(false)}
          initial={active.composition}
          assets={template.assets}
          segmentLabel={`${active.key} — ${active.title}`}
          segmentDurationSec={8}
          preferredFolderId={template.id}
          onApply={async (composition: Composition) => {
            await run("layout", () => patchSegment(active.id, { composition }));
          }}
        />
      )}
      <AssetLibrary
        open={musicOpen}
        onClose={() => setMusicOpen(false)}
        kinds={["audio"]}
        title="Music / SFX"
        description="Choose a language-independent music bed. It is mixed quietly under every localization."
        onSelect={(asset: StudioAssetDto) => {
          setMusicOpen(false);
          void run("music", () => patchTemplate({ musicAssetId: asset.id }));
        }}
      />
    </>
  );
}

/** Keyed by segment id so switching segments starts from that segment's saved values. */
function SegmentForm({ segment, sourceLanguageCode, autosave }: { segment: TemplateSegmentDto; sourceLanguageCode: string; autosave: ((segmentId: string, patch: Record<string, unknown>) => void) & { flush: (segmentId: string, patch: Record<string, unknown>) => void } }) {
  const [title, setTitle] = useState(segment.title);
  const [script, setScript] = useState(segment.sourceScript);
  const [pause, setPause] = useState(segment.pauseAfterSec);
  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] sm:p-5">
      <Field label="Segment title">
        <input value={title} onChange={(event) => { setTitle(event.target.value); autosave(segment.id, { title: event.target.value }); }} className={inputClass} />
      </Field>
      <Field label={`Source script (${sourceLanguageCode.toUpperCase()})`} hint="What the narrator says in this segment. Keep segments to one idea; they become the units educators translate and record.">
        <textarea value={script} onChange={(event) => { setScript(event.target.value); autosave(segment.id, { sourceScript: event.target.value }); }} rows={8} className={`${textareaClass} text-[15px] leading-relaxed`} />
      </Field>
      <Field label="Educational pause after narration (seconds)" hint="Added to every localization unless the educator changes it.">
        <input type="number" min={0} max={10} step={0.1} value={pause} onChange={(event) => { setPause(Number(event.target.value)); autosave(segment.id, { pauseAfterSec: Number(event.target.value) }); }} className={inputClass} />
      </Field>
      <Field label="Notes for educators (optional)">
        <textarea defaultValue={segment.notes ?? ""} onBlur={(event) => event.target.value !== (segment.notes ?? "") && autosave.flush(segment.id, { notes: event.target.value })} rows={2} className={textareaClass} />
      </Field>
    </div>
  );
}
