import Link from "next/link";
import { audiences, regions, visibilities } from "@/lib/options";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function PageTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#6b7c8f] sm:text-base">{description}</p>
    </div>
  );
}

export function TextField({ label, name, defaultValue, required, type = "text" }: { label: string; name: string; defaultValue?: string | number | null; required?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} className="h-11 w-full rounded-lg border border-[#d8dde5] bg-white px-3 text-[#243447] shadow-sm outline-none focus:border-[#a64026] focus:ring-4 focus:ring-[#a64026]/10" />
    </label>
  );
}

export function TextArea({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string | null }) {
  return (
    <label className="block md:col-span-2">
      <span className="mb-1 block font-semibold">{label}</span>
      <textarea name={name} defaultValue={defaultValue ?? ""} rows={4} className="w-full rounded-lg border border-[#d8dde5] bg-white px-3 py-2 text-[#243447] shadow-sm outline-none focus:border-[#a64026] focus:ring-4 focus:ring-[#a64026]/10" />
    </label>
  );
}

export function SelectField({ label, name, defaultValue, children, required }: { label: string; name: string; defaultValue?: string | null; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} required={required} className="h-11 w-full rounded-lg border border-[#d8dde5] bg-white px-3 text-[#243447] shadow-sm outline-none focus:border-[#a64026] focus:ring-4 focus:ring-[#a64026]/10">
        {children}
      </select>
    </label>
  );
}

export function RegionAudienceFields({ region, audience }: { region?: string; audience?: string }) {
  return (
    <>
      <SelectField label="Region" name="region" defaultValue={region ?? "Global"}>
        {regions.map((item) => <option key={item} value={item}>{item}</option>)}
      </SelectField>
      <SelectField label="Audience" name="audience" defaultValue={audience ?? "General"}>
        {audiences.map((item) => <option key={item} value={item}>{item}</option>)}
      </SelectField>
    </>
  );
}

export function VisibilityField({ value }: { value?: string }) {
  return (
    <SelectField label="Visibility" name="visibility" defaultValue={value ?? "Draft"}>
      {visibilities.map((item) => <option key={item} value={item}>{item}</option>)}
    </SelectField>
  );
}

export function SaveButton({ label = "Save", disabled = false, pendingLabel }: { label?: string; disabled?: boolean; pendingLabel?: string }) {
  return (
    <PendingSubmitButton
      disabled={disabled}
      pendingLabel={pendingLabel ?? "Saving..."}
      className="h-11 rounded-lg bg-[#a64026] px-5 font-bold text-white shadow-sm transition hover:bg-[#8e351f] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </PendingSubmitButton>
  );
}

export function FormActions({
  submitLabel = "Save",
  pendingLabel,
  cancelHref,
  disabled = false,
  hideReset = false
}: {
  submitLabel?: string;
  pendingLabel?: string;
  cancelHref: string;
  disabled?: boolean;
  hideReset?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">
      <SaveButton label={submitLabel} pendingLabel={pendingLabel} disabled={disabled} />
      <Link href={cancelHref} className="mlp-btn-outline">Cancel</Link>
      {!hideReset && <button type="reset" className="mlp-btn-outline">Clear form</button>}
    </div>
  );
}
