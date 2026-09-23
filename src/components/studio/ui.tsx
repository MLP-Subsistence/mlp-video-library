"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, Trash2, X } from "lucide-react";

/** Small presentational pieces shared across Educator Studio, styled with the MLP tokens. */

type ConfirmRequest = { title: string; message?: ReactNode; confirmLabel?: string };

/**
 * Styled replacement for window.confirm(). Render `dialog` once in the
 * component, then `if (!(await confirm({...}))) return;`.
 */
export function useConfirm() {
  const [request, setRequest] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((next: ConfirmRequest) => new Promise<boolean>((resolve) => setRequest({ ...next, resolve })), []);
  const settle = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };
  const dialog = request ? <ConfirmDialog title={request.title} message={request.message} confirmLabel={request.confirmLabel} onSettle={settle} /> : null;
  return [confirm, dialog] as const;
}

function ConfirmDialog({ title, message, confirmLabel = "Delete", onSettle }: ConfirmRequest & { onSettle: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const settleRef = useRef(onSettle);
  useEffect(() => {
    settleRef.current = onSettle;
  });
  useEffect(() => {
    cancelRef.current?.focus();
    // Capture phase + stopPropagation so Escape closes only this dialog, not a drawer or modal underneath it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      settleRef.current(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Cancel" onClick={() => onSettle(false)} className="absolute inset-0 bg-[#243447]/45" />
      <div role="alertdialog" aria-modal="true" aria-labelledby="mlp-confirm-title" className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-[#e5e7eb]">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600"><Trash2 className="size-5" /></span>
          <div className="min-w-0">
            <h2 id="mlp-confirm-title" className="text-lg font-extrabold text-[#243447]">{title}</h2>
            {message && <p className="mt-1 text-sm text-[#6b7c8f]">{message}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={() => onSettle(false)} className="mlp-btn-outline">Cancel</button>
          <button type="button" onClick={() => onSettle(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-600 px-5 font-extrabold text-white hover:bg-red-700">
            <Trash2 className="size-4" /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, wide }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-[#243447]/45" />
      <div role="dialog" aria-modal="true" className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-[#e5e7eb] sm:rounded-2xl ${wide ? "sm:max-w-5xl" : "sm:max-w-2xl"}`}>
        <div className="flex items-start justify-between gap-4 border-b border-[#edf0f3] px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <h2 className="text-xl font-extrabold text-[#243447] sm:text-2xl">{title}</h2>
            {description && <p className="mt-1 text-sm text-[#6b7c8f]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-lg border border-[#d8dde5] text-[#243447]" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7 sm:py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#edf0f3] bg-[#fbfcfd] px-5 py-4 sm:px-7">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <button type="button" aria-label="Close panel" onClick={onClose} className="absolute inset-0 bg-[#243447]/45" />
      <aside role="dialog" aria-modal="true" className="absolute inset-y-0 right-0 flex w-[min(100vw,720px)] flex-col bg-white shadow-2xl ring-1 ring-[#e5e7eb]">
        <div className="flex items-start justify-between gap-4 border-b border-[#edf0f3] px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <h2 className="text-xl font-extrabold text-[#243447] sm:text-2xl">{title}</h2>
            {description && <p className="mt-1 text-sm text-[#6b7c8f]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-lg border border-[#d8dde5] text-[#243447]" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7 sm:py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#edf0f3] bg-[#fbfcfd] px-5 py-4 sm:px-7">{footer}</div>}
      </aside>
    </div>
  );
}

export function InlineNotice({ tone = "info", children, onDismiss }: { tone?: "info" | "success" | "warning" | "error"; children: ReactNode; onDismiss?: () => void }) {
  const styles = {
    info: "border-[#d8dde5] bg-[#f7f8fa] text-[#243447]",
    success: "border-green-200 bg-green-50 text-green-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-800"
  }[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${styles}`} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="-mr-1 grid size-6 place-items-center rounded" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * A small "…more" menu for actions that would otherwise crowd a toolbar.
 * `<details>` keeps it keyboard accessible without a popover library; it
 * closes on outside click, on Escape and after any item is chosen.
 */
export function ActionMenu({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    const close = (event: Event) => {
      const element = ref.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.type === "pointerdown" && element.contains(event.target as Node)) return;
      element.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className={`relative ${className}`}>
      <summary className="mlp-btn-outline h-10 cursor-pointer list-none [&::-webkit-details-marker]:hidden" aria-label={label}>
        {label} <ChevronDown className="size-4" />
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-lg" onClick={() => { if (ref.current) ref.current.open = false; }}>
        {children}
      </div>
    </details>
  );
}

export function MenuItem({ icon: Icon, children, onClick, href, disabled, hint }: { icon?: typeof Info; children: ReactNode; onClick?: () => void; href?: string; disabled?: boolean; hint?: string }) {
  const className = "flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-[#243447] hover:bg-[#f7f8fa] disabled:opacity-40";
  const body = (
    <>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-[#6b7c8f]" />}
      <span className="min-w-0">
        <span className="block">{children}</span>
        {hint && <span className="block text-xs font-semibold text-[#6b7c8f]">{hint}</span>}
      </span>
    </>
  );
  if (href) return <a href={href} className={className}>{body}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} className={className}>{body}</button>;
}

export function StatusPill({ tone, children }: { tone: "ready" | "warning" | "muted" | "accent" | "error"; children: ReactNode }) {
  const styles = {
    ready: "border-green-200 bg-green-50 text-green-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    muted: "border-[#d8dde5] bg-[#f2f4f7] text-[#536579]",
    accent: "border-[#e5ccd0] bg-[#fbeaea] text-[#a64026]",
    error: "border-red-200 bg-red-50 text-red-700"
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide ${styles}`}>{children}</span>;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-[#243447]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#6b7c8f]">{hint}</span>}
    </label>
  );
}

export const inputClass = "h-11 w-full rounded-lg border border-[#d8dde5] bg-white px-3 text-[#243447] shadow-sm outline-none focus:border-[#a64026] focus:ring-4 focus:ring-[#a64026]/10";
export const textareaClass = "w-full rounded-lg border border-[#d8dde5] bg-white px-3 py-2 text-[#243447] shadow-sm outline-none focus:border-[#a64026] focus:ring-4 focus:ring-[#a64026]/10";

export function EmptyState({ icon: Icon, title, children, action }: { icon: typeof Info; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-[#edf0f3] sm:p-10">
      <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[#fbeaea] text-[#a64026]"><Icon className="size-6" /></span>
      <h2 className="text-xl font-extrabold text-[#243447]">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[#6b7c8f]">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
