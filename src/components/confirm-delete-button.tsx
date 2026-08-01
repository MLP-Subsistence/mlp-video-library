"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

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

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-disabled={pending}
      className={compact ? "inline-flex size-8 items-center justify-center rounded-md text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60" : "mlp-btn-outline border-red-200 text-red-700"}
      title={label}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : compact ? <Trash2 className="size-4" /> : label}
    </button>
  );
}
