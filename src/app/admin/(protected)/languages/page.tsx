import Link from "next/link";
import { CheckCircle2, ImageIcon, Layers3, MoreVertical, Pencil, Plus, Search, XCircle } from "lucide-react";
import {
  deleteLanguageAction,
  deleteResourceFormatAction,
  deleteResourceSubmenuAction,
  upsertLanguageAction,
  upsertResourceFormatAction,
  upsertResourceSubmenuAction
} from "@/app/admin/actions";
import { Notice } from "@/components/admin-shell";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { FormActions, PageTitle, TextField } from "@/components/admin-form";
import { prisma } from "@/lib/prisma";
import { languageThumbnail } from "@/lib/resource-taxonomy";
import { getResourceFormatOptions } from "@/lib/resource-format-options";
import { SmartImage } from "@/components/smart-image";

export default async function LanguagesPage({ searchParams }: { searchParams: Promise<{ edit?: string; success?: string; error?: string }> }) {
  const params = await searchParams;
  const [languages, edit, formatOptions] = await Promise.all([
    prisma.language.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { videos: true } } } }),
    params.edit && params.edit !== "new" ? prisma.language.findUnique({ where: { id: params.edit } }) : null,
    getResourceFormatOptions(true)
  ]);
  const showForm = params.edit === "new" || Boolean(edit);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <PageTitle title="Languages" description="Manage library languages and their local thumbnails." />
        <Link href="/admin/languages?edit=new" className="mlp-btn-primary"><Plus className="size-4" /> Add Language</Link>
      </div>
      <Notice success={params.success} error={params.error} />

      {showForm && (
        <form action={upsertLanguageAction} className="mb-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
          <input type="hidden" name="id" value={edit?.id ?? ""} />
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold">{edit ? "Edit Language" : "Add Language"}</h2>
              <p className="mt-1 text-sm text-[#6b7c8f]">Use local thumbnail paths such as /thumbnails/languages/english-b4g.jpg.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <TextField label="Name" name="name" defaultValue={edit?.name} required />
            <TextField label="Display name" name="displayName" defaultValue={edit?.displayName} required />
            <TextField label="Code" name="code" defaultValue={edit?.code} required />
            <TextField label="Badge color" name="color" defaultValue={edit?.color ?? "#a64026"} type="color" />
            <TextField label="Sort order" name="sortOrder" defaultValue={edit?.sortOrder ?? 0} type="number" />
            <label className="flex items-center gap-2 pt-7 text-sm font-bold">
              <input type="checkbox" name="isActive" defaultChecked={edit?.isActive ?? true} className="accent-[#a64026]" /> Active
            </label>
            <div className="md:col-span-3 xl:col-span-6">
              <TextField label="Thumbnail path" name="thumbnailPath" defaultValue={edit?.thumbnailPath ?? ""} />
            </div>
            <div className="md:col-span-3 xl:col-span-6">
              <FormActions submitLabel={edit ? "Save Language" : "Add Language"} cancelHref="/admin/languages" />
            </div>
          </div>
        </form>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
        <div className="mb-7 grid gap-4 md:grid-cols-[1fr_170px]">
          <label className="flex h-12 items-center overflow-hidden rounded-lg border border-[#d8dde5] bg-white focus-within:border-[#a64026] focus-within:ring-4 focus-within:ring-[#a64026]/10">
            <span className="grid h-full w-12 shrink-0 place-items-center border-r border-[#edf0f3] text-[#8b9bad]"><Search className="size-4" /></span>
            <input placeholder="Search languages..." className="h-full min-w-0 flex-1 px-3 text-[#243447] outline-none" />
          </label>
          <select className="mlp-input h-12"><option>Sort by Order</option></select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead className="border-b border-[#edf0f3] text-[11px] uppercase tracking-wide text-[#526579]">
              <tr>
                <th className="px-4 py-4">Language</th>
                <th className="px-4 py-4">Code</th>
                <th className="px-4 py-4">Resources</th>
                <th className="px-4 py-4">Thumbnail</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0f3]">
              {languages.map((language, index) => {
                const thumbnail = language.thumbnailPath || languageThumbnail(language.code);
                const hasCustomThumbnail = Boolean(language.thumbnailPath);
                return (
                  <tr key={language.id}>
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-4">
                        <div className="grid size-10 place-items-center rounded-md bg-[#fbeaea] text-sm font-extrabold text-[#a64026]">{language.code.toUpperCase()}</div>
                        <div>
                          <div className="flex items-center gap-2 font-extrabold">
                            {language.name}
                            {index === 0 && <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">Default</span>}
                          </div>
                          <div className="mt-1 text-sm text-[#6b7c8f]">{language.displayName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-sm font-semibold text-[#526579]">{language.code}</td>
                    <td className="px-4 py-5 text-sm font-semibold text-[#526579]">{language._count.videos}</td>
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-3">
                        {hasCustomThumbnail ? (
                          <CheckCircle2 className="size-5 text-green-600" />
                        ) : (
                          <ImageIcon className="size-5 text-[#8b9bad]" />
                        )}
                        <span className={hasCustomThumbnail ? "text-sm font-semibold text-[#526579]" : "text-sm font-semibold text-amber-700"}>
                          {hasCustomThumbnail ? "Assigned" : "Fallback"}
                        </span>
                        <div className="relative h-12 w-20 overflow-hidden rounded-md bg-[#f2f4f7] ring-1 ring-[#edf0f3]">
                          <SmartImage src={thumbnail} alt="" fill className="h-full w-full object-cover" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${language.isActive ? "bg-green-50 text-green-700" : "bg-orange-50 text-[#a64026]"}`}>
                        {language.isActive ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />} {language.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex justify-end gap-4">
                        <Link href={`/admin/languages?edit=${language.id}`} className="text-[#a64026]" title="Edit language"><Pencil className="size-4" /></Link>
                        <button type="button" className="text-[#526579]" title="More actions"><MoreVertical className="size-4" /></button>
                        <form action={deleteLanguageAction}>
                          <input type="hidden" name="id" value={language.id} />
                          <ConfirmDeleteButton compact label="Delete language" message={`Delete "${language.name}"? Existing resources will keep their data but lose this language label.`} />
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex justify-between text-sm text-[#526579]">
          <span>Showing 1 to {languages.length} of {languages.length} languages</span>
          <Link href="/admin/videos" className="font-bold text-[#a64026]">Manage Resources</Link>
        </div>
      </div>

      <section id="resource-formats" className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-[#a64026]">
              <Layers3 className="size-4" /> Resource formats
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">Format Cards and Submenus</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#6b7c8f]">
              Add, edit, or delete the format cards learners see after choosing a language. Add submenus under a format when staff need a specific destination such as Online Image Diaries.
            </p>
          </div>
          <Link href="/resources" className="mlp-btn-outline">Preview Public Library</Link>
        </div>

        <form action={upsertResourceFormatAction} className="mb-7 rounded-xl border border-[#edf0f3] bg-[#fbfcfd] p-4">
          <h3 className="mb-4 text-lg font-extrabold">Add Resource Format</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_120px_auto] xl:items-end">
            <TextField label="Format name" name="name" required />
            <TextField label="Description" name="description" />
            <TextField label="Icon path" name="iconPath" />
            <TextField label="Sort order" name="sortOrder" defaultValue={formatOptions.length + 1} type="number" />
            <label className="flex h-11 items-center gap-2 text-sm font-bold">
              <input type="checkbox" name="isActive" defaultChecked className="accent-[#a64026]" /> Active
            </label>
          </div>
          <button className="mlp-btn-primary mt-4"><Plus className="size-4" /> Add Format</button>
        </form>

        <div className="grid gap-5">
          {formatOptions.map((format) => (
            <article key={format.id ?? format.name} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <form action={upsertResourceFormatAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_120px_auto] xl:items-end">
                  <input type="hidden" name="id" value={format.id ?? ""} />
                  <TextField label="Format name" name="name" defaultValue={format.name} required />
                  <TextField label="Description" name="description" defaultValue={format.description ?? ""} />
                  <TextField label="Icon path" name="iconPath" defaultValue={format.iconPath ?? ""} />
                  <TextField label="Sort order" name="sortOrder" defaultValue={format.sortOrder} type="number" />
                  <label className="flex h-11 items-center gap-2 text-sm font-bold">
                    <input type="checkbox" name="isActive" defaultChecked={format.isActive} className="accent-[#a64026]" /> Active
                  </label>
                  <button className="mlp-btn-outline md:w-fit">Save Format</button>
                </form>
                {format.id && (
                  <form action={deleteResourceFormatAction} className="lg:pt-7">
                    <input type="hidden" name="id" value={format.id} />
                    <ConfirmDeleteButton
                      compact
                      label="Delete format"
                      message={`Delete "${format.name}"? You can only delete formats that are not used by any resources.`}
                    />
                  </form>
                )}
              </div>

              <div className="mt-5 rounded-xl bg-[#fbfcfd] p-4 ring-1 ring-[#edf0f3]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-extrabold">Submenus under {format.name}</h4>
                    <p className="mt-1 text-sm text-[#6b7c8f]">Use these only when a format needs smaller staff-created groups.</p>
                  </div>
                  <span className="mlp-soft-badge">{format.submenus.length} submenu{format.submenus.length === 1 ? "" : "s"}</span>
                </div>

                {format.submenus.length > 0 && (
                  <div className="mb-5 grid gap-3">
                    {format.submenus.map((submenu) => (
                      <div key={submenu.id ?? submenu.name} className="grid gap-3 rounded-xl border border-[#e5e7eb] bg-white p-3 xl:grid-cols-[1fr_auto] xl:items-start">
                        <form action={upsertResourceSubmenuAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_120px_auto] xl:items-end">
                          <input type="hidden" name="id" value={submenu.id ?? ""} />
                          <input type="hidden" name="resourceFormatId" value={format.id ?? ""} />
                          <TextField label="Submenu name" name="name" defaultValue={submenu.name} required />
                          <TextField label="Description" name="description" defaultValue={submenu.description ?? ""} />
                          <TextField label="Sort order" name="sortOrder" defaultValue={submenu.sortOrder} type="number" />
                          <label className="flex h-11 items-center gap-2 text-sm font-bold">
                            <input type="checkbox" name="isActive" defaultChecked={submenu.isActive} className="accent-[#a64026]" /> Active
                          </label>
                          <button className="mlp-btn-outline md:w-fit">Save Submenu</button>
                        </form>
                        {submenu.id && (
                          <form action={deleteResourceSubmenuAction} className="xl:pt-7">
                            <input type="hidden" name="id" value={submenu.id} />
                            <ConfirmDeleteButton
                              label="Delete submenu"
                              message={`Delete "${submenu.name}"? Resources already assigned to this submenu will stay in the app but will return to the main ${format.name} group.`}
                            />
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {format.id ? (
                  <form action={upsertResourceSubmenuAction} className="grid gap-3 rounded-xl border border-dashed border-[#d8dde5] bg-white p-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_120px_auto] xl:items-end">
                    <input type="hidden" name="resourceFormatId" value={format.id} />
                    <TextField label={`Add submenu under ${format.name}`} name="name" />
                    <TextField label="Description" name="description" />
                    <TextField label="Sort order" name="sortOrder" defaultValue={format.submenus.length + 1} type="number" />
                    <label className="flex h-11 items-center gap-2 text-sm font-bold">
                      <input type="checkbox" name="isActive" defaultChecked className="accent-[#a64026]" /> Active
                    </label>
                    <button className="mlp-btn-primary md:w-fit"><Plus className="size-4" /> Add Submenu</button>
                  </form>
                ) : (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                    Save this format once before adding submenus.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
