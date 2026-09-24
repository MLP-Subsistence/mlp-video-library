"use client";

import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Languages, PencilLine } from "lucide-react";
import { meaningFor, meaningsVersion, rememberMeaning, rememberMeanings, subscribeMeanings } from "@/components/studio/workspace/meaning-cache";
import { Spinner, textareaClass } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import type { ProjectDto, ProjectSegmentDto } from "@/lib/studio/types";

/**
 * For educators working in a language they don't read: what the narration
 * says in plain English (checked against the original), and a way to change
 * it by writing the wording in English and letting it be translated.
 */
export function MeaningCheck({ project, segment, text, disabled, onBeforeRewrite, onProject }: { project: ProjectDto; segment: ProjectSegmentDto; text: string; disabled?: boolean; onBeforeRewrite: () => void; onProject: (project: ProjectDto, translation: string) => void }) {
  useSyncExternalStore(subscribeMeanings, meaningsVersion, () => 0);
  const meaning = meaningFor(segment.id, text);
  const [busy, setBusy] = useState<"check" | "rewrite" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [english, setEnglish] = useState("");

  const check = async () => {
    setBusy("check");
    setError(null);
    try {
      const result = await api<{ text: string; english: string; matchesOriginal: boolean; differences: string }>(`/api/studio/projects/${project.id}/back-translate`, { method: "POST", json: { segmentId: segment.id, text } });
      rememberMeaning(segment.id, result);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const rewrite = async () => {
    setBusy("rewrite");
    setError(null);
    onBeforeRewrite();
    try {
      const result = await api<{ project: ProjectDto; backTranslations?: Record<string, { text: string; english: string }> }>(`/api/studio/projects/${project.id}/translate`, {
        method: "POST",
        json: { segmentIds: [segment.id], mode: "regenerate", englishOverride: english }
      });
      rememberMeanings(result.backTranslations);
      onProject(result.project, result.project.segments.find((entry) => entry.id === segment.id)?.translation ?? "");
      setRewriting(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!text.trim() && !rewriting) {
    return (
      <button type="button" onClick={() => { setEnglish(segment.sourceScript); setRewriting(true); }} disabled={disabled} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#a64026]">
        <PencilLine className="size-3.5" /> Write it in English and translate
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {meaning ? (
        <div className={`rounded-lg border px-3 py-2 text-sm ${meaning.matchesOriginal === false ? "border-amber-200 bg-amber-50" : "border-[#d8dde5] bg-[#f7f8fa]"}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#6b7c8f]">
            <Languages className="size-3.5" /> In English
            {meaning.matchesOriginal === true && <span className="ml-1 inline-flex items-center gap-1 normal-case tracking-normal text-emerald-700"><CheckCircle2 className="size-3.5" /> matches the original</span>}
            {meaning.matchesOriginal === false && <span className="ml-1 inline-flex items-center gap-1 normal-case tracking-normal text-amber-700"><AlertTriangle className="size-3.5" /> differs from the original</span>}
          </div>
          <p className="mt-1 leading-relaxed text-[#243447]">{meaning.english}</p>
          {meaning.matchesOriginal === false && meaning.differences && <p className="mt-1 text-xs text-amber-800">{meaning.differences}</p>}
        </div>
      ) : null}

      {rewriting ? (
        <div className="rounded-lg border border-[#d8dde5] bg-white p-3">
          <label className="text-xs font-bold text-[#243447]" htmlFor={`rewrite-${segment.id}`}>
            Say it in English — it will be translated into {project.targetLanguageName}
          </label>
          <textarea id={`rewrite-${segment.id}`} value={english} onChange={(event) => setEnglish(event.target.value)} rows={3} className={`${textareaClass} mt-1 text-sm`} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void rewrite()} disabled={busy !== null || !english.trim()} className="mlp-btn-primary h-9 px-3 text-xs">
              {busy === "rewrite" ? <Spinner className="size-3.5" /> : <Languages className="size-3.5" />} Translate my English
            </button>
            <button type="button" onClick={() => setRewriting(false)} className="text-xs font-bold text-[#6b7c8f]">Cancel</button>
            <span className="text-xs text-[#8b9bad]">Replaces the {project.targetLanguageName} text above.</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {!meaning && (
            <button type="button" onClick={() => void check()} disabled={disabled || busy !== null} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#a64026]">
              {busy === "check" ? <Spinner className="size-3.5" /> : <Languages className="size-3.5" />} Check what this says in English
            </button>
          )}
          <button type="button" onClick={() => { setEnglish(meaning?.english || segment.sourceScript); setRewriting(true); }} disabled={disabled || busy !== null} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6b7c8f] hover:text-[#a64026]">
            <PencilLine className="size-3.5" /> Change it in English
          </button>
        </div>
      )}
      {error && <p className="text-xs font-bold text-red-700">{error}</p>}
    </div>
  );
}
