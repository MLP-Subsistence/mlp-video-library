"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Field, InlineNotice, Modal, Spinner, inputClass, textareaClass } from "@/components/studio/ui";
import { studioAudiences, studioRegisters } from "@/lib/studio/languages";
import type { ProjectDto } from "@/lib/studio/types";

/** Language context and glossary that shape every AI translation for this project. */
export function TranslationSettingsModal({ open, onClose, project, onSave }: { open: boolean; onClose: () => void; project: ProjectDto; onSave: (patch: Record<string, unknown>) => Promise<unknown> }) {
  if (!open) return null;
  return <TranslationSettingsDialog onClose={onClose} project={project} onSave={onSave} />;
}

function TranslationSettingsDialog({ onClose, project, onSave }: { onClose: () => void; project: ProjectDto; onSave: (patch: Record<string, unknown>) => Promise<unknown> }) {
  const [region, setRegion] = useState(project.region ?? "");
  const [variety, setVariety] = useState(project.variety ?? "");
  const [audience, setAudience] = useState(project.audience ?? "");
  const [register, setRegister] = useState(project.register ?? "");
  const [glossary, setGlossary] = useState(project.glossary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ region: region || null, variety: variety || null, audience: audience || null, register: register || null, glossary });
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
      description={`How ${project.targetLanguageName} translations should sound. Changes apply to segments you translate or regenerate from now on.`}
      footer={
        <>
          <button type="button" onClick={onClose} className="mlp-btn-outline">Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="mlp-btn-primary">{busy ? <Spinner /> : <Check className="size-4" />} Save</button>
        </>
      }
    >
      {error && <div className="mb-4"><InlineNotice tone="error">{error}</InlineNotice></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Region / country"><input value={region} onChange={(event) => setRegion(event.target.value)} className={inputClass} placeholder="Optional" /></Field>
        <Field label="Variety / dialect"><input value={variety} onChange={(event) => setVariety(event.target.value)} className={inputClass} placeholder="Optional" /></Field>
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
      <div className="mt-4">
        <Field label="Glossary" hint={`One term per line. Write "term = preferred ${project.targetLanguageName} word" to fix a translation, or just the term to keep it consistent. The MLP shared glossary is applied as well.`}>
          <textarea value={glossary} onChange={(event) => setGlossary(event.target.value)} rows={8} className={textareaClass} />
        </Field>
      </div>
    </Modal>
  );
}
