"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Languages } from "lucide-react";
import { LanguagePicker, RegionPicker, suggestedCountries, type LanguageChoice } from "@/components/studio/language-picker";
import { Field, InlineNotice, Modal, Spinner, inputClass, textareaClass } from "@/components/studio/ui";
import { api } from "@/lib/studio/client";
import { studioAudiences, studioLanguages, studioRegisters } from "@/lib/studio/languages";
import type { ProjectDto } from "@/lib/studio/types";

/** Target language, language context and glossary that shape every AI translation for this project. */
export function TranslationSettingsModal({ open, onClose, project, onSave }: { open: boolean; onClose: () => void; project: ProjectDto; onSave: (patch: Record<string, unknown>) => Promise<unknown> }) {
  if (!open) return null;
  return <TranslationSettingsDialog onClose={onClose} project={project} onSave={onSave} />;
}

function TranslationSettingsDialog({ onClose, project, onSave }: { onClose: () => void; project: ProjectDto; onSave: (patch: Record<string, unknown>) => Promise<unknown> }) {
  const router = useRouter();
  const [language, setLanguage] = useState<{ code: string; name: string }>({ code: project.targetLanguageCode, name: project.targetLanguageName });
  const [region, setRegion] = useState(project.region ?? "");
  const [variety, setVariety] = useState(project.variety ?? "");
  const [audience, setAudience] = useState(project.audience ?? "");
  const [register, setRegister] = useState(project.register ?? "");
  const [glossary, setGlossary] = useState(project.glossary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const languageChanged = language.code !== project.targetLanguageCode || language.name !== project.targetLanguageName;
  const segmentsWithWork = project.segments.filter((segment) => segment.translation.trim() || segment.narration.status !== "missing").length;
  const startsNewLocalization = languageChanged && segmentsWithWork > 0;
  const varieties = studioLanguages.find((entry) => entry.code === language.code)?.varieties ?? [];

  const chooseLanguage = (choice: LanguageChoice) => {
    const previousSuggestions = suggestedCountries(language).map((country) => country.name);
    setLanguage({ code: choice.code, name: choice.name });
    if (!region || previousSuggestions.includes(region)) setRegion(suggestedCountries(choice)[0]?.name ?? "");
    setVariety("");
  };

  const settings = { region: region || null, variety: variety || null, audience: audience || null, register: register || null };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (startsNewLocalization) {
        const result = await api<{ id: string }>("/api/studio/projects", {
          method: "POST",
          json: { templateId: project.template.id, languageCode: language.code, languageName: language.name, ...settings }
        });
        router.push(`/studio/projects/${result.id}`);
        return;
      }
      await onSave({ ...(languageChanged ? { targetLanguageCode: language.code, targetLanguageName: language.name } : {}), ...settings, glossary });
      if (languageChanged) router.refresh();
      onClose();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Translation settings"
      description="Which language this lesson is translated into, and how it should sound. Changes apply to segments you translate or regenerate from now on."
      footer={
        <>
          <button type="button" onClick={onClose} className="mlp-btn-outline">Cancel</button>
          <button type="button" onClick={save} disabled={busy || !language.name.trim()} className="mlp-btn-primary">
            {busy ? <Spinner /> : startsNewLocalization ? <Languages className="size-4" /> : <Check className="size-4" />}
            {startsNewLocalization ? `Start ${language.name} localization` : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="mb-4"><InlineNotice tone="error">{error}</InlineNotice></div>}
      <Field label="Translate into">
        <LanguagePicker value={language} onChange={chooseLanguage} />
      </Field>
      {startsNewLocalization && (
        <div className="mt-3">
          <InlineNotice tone="warning">
            {segmentsWithWork} segment{segmentsWithWork === 1 ? " already has" : "s already have"} {project.targetLanguageName} translation or narration, so this localization stays in {project.targetLanguageName}. Pressing <strong>Start {language.name} localization</strong> opens a separate {language.name} version of this lesson with the same visuals — nothing here is lost.
          </InlineNotice>
        </div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Region / country">
          <RegionPicker value={region} onChange={setRegion} language={language} />
        </Field>
        <Field label="Variety / dialect">
          <input list="translation-varieties" value={variety} onChange={(event) => setVariety(event.target.value)} className={inputClass} placeholder={varieties[0] ? `e.g. ${varieties[0]} (optional)` : "Optional"} />
          <datalist id="translation-varieties">{varieties.map((entry) => <option key={entry} value={entry} />)}</datalist>
        </Field>
        <Field label="Audience">
          <select value={audience} onChange={(event) => setAudience(event.target.value)} className={inputClass}>
            <option value="">Not specified</option>
            {studioAudiences.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </Field>
        <Field label="Register">
          <select value={register} onChange={(event) => setRegister(event.target.value)} className={inputClass}>
            <option value="">Simple spoken educational language</option>
            {studioRegisters.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </Field>
      </div>
      {!startsNewLocalization && (
        <div className="mt-4">
          <Field label="Glossary" hint={`One term per line. Write "term = preferred ${language.name} word" to fix a translation, or just the term to keep it consistent. The MLP shared glossary is applied as well.`}>
            <textarea value={glossary} onChange={(event) => setGlossary(event.target.value)} rows={8} className={textareaClass} />
          </Field>
        </div>
      )}
    </Modal>
  );
}
