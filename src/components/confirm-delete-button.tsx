"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/studio/ui";

export function ConfirmDeleteButton({
  label = "Delete",
  compact = false,
  message = "Delete this item? This cannot be undone."
}: {
  label?: string;
  compact?: boolean;
  message?: string;
}) {
  const { pending } = useFormStatus();
  const [confirm, confirmDialog] = useConfirm();
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="submit"
        disabled={pending}
        aria-busy={pending}
        aria-disabled={pending}
        className={compact ? "inline-flex size-8 items-center justify-center rounded-md text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60" : "mlp-btn-outline border-red-200 text-red-700"}
        title={label}
        onClick={async (event) => {
          // Hold the submit, ask in the styled dialog, then submit with this button as the submitter
          // so its name/value (and the form's server action) are exactly what a plain click would send.
          event.preventDefault();
          if (pending) return;
          const button = buttonRef.current;
          const split = message.indexOf("? ");
          const title = split >= 0 ? message.slice(0, split + 1) : message;
          const detail = split >= 0 ? message.slice(split + 2) : undefined;
          if (button && (await confirm({ title, message: detail, confirmLabel: /^remove/i.test(message) ? "Remove" : "Delete" }))) button.form?.requestSubmit(button);
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : compact ? <Trash2 className="size-4" /> : label}
      </button>
      {confirmDialog}
    </>
  );
}
