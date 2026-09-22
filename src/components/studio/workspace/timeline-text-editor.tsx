"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { InlineNotice, Modal, Spinner, textareaClass } from "@/components/studio/ui";
import type { ProjectSegmentDto } from "@/lib/studio/types";

/** The Text track edits the same translated script shown in Script & Narration. */
export function TimelineTextEditor({ segment, onClose, onSave }: { segment: ProjectSegmentDto; onClose: () => void; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(segment.translation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (text === segment.translation) { onClose(); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave(text);
      onClose();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit text" description={`Segment ${segment.key} — ${segment.title}`} footer={<><button type="button" onClick={onClose} className="mlp-btn-outline">Cancel</button><button type="button" onClick={() => void save()} disabled={busy} className="mlp-btn-primary">{busy ? <Spinner /> : <Check className="size-4" />} Save text</button></>}>
      {error && <div className="mb-4"><InlineNotice tone="error">{error}</InlineNotice></div>}
      <p className="mb-3 text-sm text-[#6b7c8f]">Edit the translated text shown on the timeline and used for narration. The original script stays unchanged.</p>
      <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} rows={7} maxLength={6000} className={textareaClass} aria-label="Translated text" />
      <p className="mt-2 text-xs text-[#6b7c8f]">Saving a text change may mark existing narration as needing an update. Use Undo to restore the previous saved version.</p>
    </Modal>
  );
}
