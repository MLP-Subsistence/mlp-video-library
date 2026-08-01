import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Eye, MoreVertical, Pencil, Plus, Search } from "lucide-react";
import { bulkManageVideosAction, deleteVideoAction } from "@/app/admin/actions";
import { Notice } from "@/components/admin-shell";
import { BulkResourceSelector } from "@/components/bulk-resource-selector";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SmartImage } from "@/components/smart-image";
import { SelectField, TextField } from "@/components/admin-form";
import { audiences, regions, visibilities } from "@/lib/options";
import { prisma } from "@/lib/prisma";
import { getResourceFormatOptions, type ResourceFormatOption } from "@/lib/resource-format-options";
import { normalizeResourceFormat, normalizeResourceSubmenu, resourceFormatAliases, resourceImage, resourceTypes } from "@/lib/resource-taxonomy";

export default async function VideosPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; q?: string; page?: string; pageSize?: string; languageId?: string; format?: string; submenu?: string; status?: string }> }) {
  const params = await searchParams;
  const pageSize = [10, 30, 50].includes(Number(params.pageSize)) ? Number(params.pageSize) : 10;
  const currentPage = Math.max(1, Number(params.page || 1) || 1);
  const formatOptions = await getResourceFormatOptions();
  const formatAliases = params.format
    ? Array.from(new Set([...resourceFormatAliases(params.format), normalizeResourceFormat(params.format), params.format]))
    : [];
  const submenuFilter = normalizeResourceSubmenu(params.submenu);
  const submenuWhere: Prisma.VideoWhereInput | null = submenuFilter
    ? submenuFilter === "__none"
      ? { OR: [{ resourceSubmenu: null }, { resourceSubmenu: "" }] }
      : { resourceSubmenu: submenuFilter }
    : null;
  const where: Prisma.VideoWhereInput = params.q
    ? {
        AND: [
          {
            OR: [
              { title: { contains: params.q } },
              { resourceTitle: { contains: params.q } },
              { resourceFormat: { contains: params.q } },
              { resourceSubmenu: { contains: params.q } },
              { tags: { contains: params.q } }
            ]
          },
          ...(params.languageId ? [{ languageId: params.languageId }] : []),
          ...(params.format ? [{ resourceFormat: { in: formatAliases } }] : []),
          ...(submenuWhere ? [submenuWhere] : []),
          ...(params.status ? [{ visibility: params.status }] : [])
        ]
      }
    : {
        ...(params.languageId ? { languageId: params.languageId } : {}),
        ...(params.format ? { resourceFormat: { in: formatAliases } } : {}),
        ...(submenuWhere ?? {}),
        ...(params.status ? { visibility: params.status } : {})
      };
  const [resources, languages, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: { language: true },
      skip: (currentPage - 1) * pageSize,
      take: pageSize
    }),
    prisma.language.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.video.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageHref = (page: number, size = pageSize) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.languageId) query.set("languageId", params.languageId);
    if (params.format) query.set("format", params.format);
    if (params.submenu) query.set("submenu", params.submenu);
    if (params.status) query.set("status", params.status);
    query.set("page", String(page));
    query.set("pageSize", String(size));
    return `/admin/videos?${query.toString()}`;
  };
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Manage Resources</h1>
          <p className="mt-2 text-sm text-[#6b7c8f]">Total {total} resources across {languages.length} languages</p>
        </div>
        <Link href="/admin/videos/new" className="mlp-btn-primary w-full sm:w-auto"><Plus className="size-4" /> Add New Resource</Link>
      </div>
      <Notice success={params.success} error={params.error} />
      <form className="mb-5 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] md:grid-cols-2 md:gap-4 xl:grid-cols-[1fr_160px_160px_180px_140px_130px_92px_92px]">
        <label className="flex h-[42px] items-center overflow-hidden rounded-md border border-[#d8dde5] bg-white focus-within:border-[#a64026] focus-within:ring-4 focus-within:ring-[#a64026]/10">
          <span className="grid h-full w-11 shrink-0 place-items-center border-r border-[#edf0f3] text-[#8b9bad]"><Search className="size-4" /></span>
          <input name="q" defaultValue={params.q ?? ""} placeholder="Search resources..." className="h-full min-w-0 flex-1 px-3 text-[#243447] outline-none" />
          <input type="hidden" name="page" value="1" />
        </label>
        <select name="languageId" defaultValue={params.languageId ?? ""} className="mlp-input w-full"><option value="">All Languages</option>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="format" defaultValue={params.format ?? ""} className="mlp-input w-full"><option value="">All Formats</option>{formatOptions.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>
        <ResourceSubmenuFilter formats={formatOptions} defaultValue={params.submenu} />
        <select name="status" defaultValue={params.status ?? ""} className="mlp-input w-full"><option value="">All Statuses</option>{visibilities.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select name="pageSize" defaultValue={pageSize} className="mlp-input w-full" aria-label="Resources per page">
          <option value="10">10 per page</option>
          <option value="30">30 per page</option>
          <option value="50">50 per page</option>
        </select>
        <PendingSubmitButton className="h-[42px] rounded-lg bg-[#a64026] px-4 font-bold text-white transition hover:bg-[#8e351f]" pendingLabel="Applying...">Apply</PendingSubmitButton>
        <Link href="/admin/videos" className="mlp-btn-outline h-[42px]">Reset</Link>
      </form>
      <details className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] sm:p-5">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <input type="checkbox" className="size-4 rounded border-[#d8dde5] accent-[#a64026]" aria-hidden="true" />
            <span className="font-extrabold">Bulk actions</span>
            <span className="text-sm text-[#6b7c8f]">Select resources below, then open this panel.</span>
          </div>
          <BulkResourceSelector />
        </summary>
        <form id="bulk-resource-form" action={bulkManageVideosAction} className="mt-5 border-t border-[#edf0f3] pt-5">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            <SelectField label="Action" name="bulkAction" defaultValue="update">
              <option value="update">Update selected</option>
              <option value="delete">Delete selected</option>
            </SelectField>
            <SelectField label="Visibility" name="bulkVisibility">
              <option value="">Leave unchanged</option>
              {visibilities.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
            <SelectField label="Resource format" name="bulkResourceFormat">
              <option value="">Leave unchanged</option>
              {formatOptions.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </SelectField>
            <SelectField label="Resource submenu" name="bulkResourceSubmenu">
              <option value="">Leave unchanged</option>
              <option value="__clear">Clear submenu</option>
              {formatOptions.filter((format) => format.submenus.length > 0).map((format) => (
                <optgroup key={format.name} label={format.name}>
                  {format.submenus.map((submenu) => <option key={`${format.name}-${submenu.name}`} value={submenu.name}>{submenu.name}</option>)}
                </optgroup>
              ))}
            </SelectField>
            <SelectField label="Language" name="bulkLanguageId">
              <option value="">Leave unchanged</option>
              {languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </SelectField>
            <SelectField label="Resource type" name="bulkResourceType">
              <option value="">Leave unchanged</option>
              {resourceTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
            <SelectField label="Region" name="bulkRegion">
              <option value="">Leave unchanged</option>
              {regions.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
            <SelectField label="Audience" name="bulkAudience">
              <option value="">Leave unchanged</option>
              {audiences.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
            <TextField label="Replace tags optional" name="bulkTags" />
            <div className="flex items-end">
              <PendingSubmitButton className="h-11 w-full rounded-lg bg-[#a64026] px-5 font-bold text-white transition hover:bg-[#8e351f]" pendingLabel="Updating selected...">Apply to selected</PendingSubmitButton>
            </div>
          </div>
        </form>
      </details>
      <div className="grid gap-3 xl:hidden">
        {resources.length > 0 ? resources.map((resource) => (
          <article key={resource.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3]">
            <div className="flex items-start gap-3">
              <input form="bulk-resource-form" type="checkbox" name="videoIds" value={resource.id} className="mt-1 size-5 rounded border-[#d8dde5] accent-[#a64026]" aria-label={`Select ${resource.resourceTitle || resource.title}`} />
              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-[#f2f4f7]">
                <SmartImage src={resourceImage(resource)} alt="" fill className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 font-extrabold">{resource.resourceTitle || resource.title}</h2>
                <p className="mt-1 text-xs font-semibold text-[#6b7c8f]">
                  {resource.language?.name ?? "No language"} - {resource.resourceFormat}
                  {resource.resourceSubmenu ? ` / ${resource.resourceSubmenu}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="mlp-soft-badge">{resource.resourceFormat}</span>
                  {resource.resourceSubmenu && <span className="mlp-soft-badge">{resource.resourceSubmenu}</span>}
                  <StatusBadge status={resource.visibility} />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Link href={`/videos/${resource.id}`} className="mlp-btn-outline px-2 text-sm"><Eye className="size-4" /> View</Link>
              <Link href={`/admin/videos/new?edit=${resource.id}`} className="mlp-btn-outline px-2 text-sm"><Pencil className="size-4" /> Edit</Link>
              <form action={deleteVideoAction}><input type="hidden" name="id" value={resource.id} /><ConfirmDeleteButton compact label="Delete resource" message={`Delete "${resource.resourceTitle || resource.title}"? This cannot be undone.`} /></form>
            </div>
          </article>
        )) : (
          <div className="rounded-2xl bg-white p-8 text-center text-[#6b7c8f] shadow-sm ring-1 ring-[#edf0f3]">No resources found. Add a new resource when you are ready.</div>
        )}
      </div>
      <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-[#edf0f3] xl:block">
        <table className="w-full min-w-[880px] text-left">
          <thead className="bg-[#fbfcfd] text-[11px] uppercase tracking-wide text-[#526579]">
            <tr>
              <th className="px-6 py-4">Select</th>
              <th className="px-6 py-4">Resource Title</th>
              <th className="px-6 py-4">Language</th>
              <th className="px-6 py-4">Format</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Updated</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f3]">
            {resources.length > 0 ? resources.map((resource) => (
              <tr key={resource.id}>
                <td className="px-6 py-4 align-middle">
                  <input form="bulk-resource-form" type="checkbox" name="videoIds" value={resource.id} className="size-4 rounded border-[#d8dde5] accent-[#a64026]" aria-label={`Select ${resource.resourceTitle || resource.title}`} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="relative h-14 w-24 overflow-hidden rounded-md bg-[#f2f4f7]">
                      <SmartImage src={resourceImage(resource)} alt="" fill className="h-full w-full object-cover" />
                    </div>
                    <div>
                      <div className="font-extrabold">{resource.resourceTitle || resource.title}</div>
                      <div className="mt-1 text-xs font-semibold text-[#6b7c8f]">{resource.resourceType}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-bold text-[#526579]">{resource.language?.name ?? "No language"}</td>
                <td className="px-6 py-4 text-sm font-bold text-[#526579]">
                  <div>{resource.resourceFormat}</div>
                  {resource.resourceSubmenu && <div className="mt-1 text-xs font-semibold text-[#8b9bad]">{resource.resourceSubmenu}</div>}
                </td>
                <td className="px-6 py-4"><StatusBadge status={resource.visibility} /></td>
                <td className="px-6 py-4 text-sm text-[#526579]">{resource.updatedAt.toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-4">
                    <Link href={`/videos/${resource.id}`} className="text-[#526579]" title="Preview"><Eye className="size-4" /></Link>
                    <Link href={`/admin/videos/new?edit=${resource.id}`} className="text-[#a64026]" title="Edit"><Pencil className="size-4" /></Link>
                    <button type="button" className="text-[#526579]" title="More actions"><MoreVertical className="size-4" /></button>
                    <form action={deleteVideoAction}><input type="hidden" name="id" value={resource.id} /><ConfirmDeleteButton compact label="Delete resource" message={`Delete "${resource.resourceTitle || resource.title}"? This cannot be undone.`} /></form>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-[#6b7c8f]">No resources found. Add a new resource when you are ready.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-6 grid gap-4 text-sm text-[#526579] sm:flex sm:items-center sm:justify-between">
        <span>Showing {(safePage - 1) * pageSize + (resources.length ? 1 : 0)}-{Math.min(safePage * pageSize, total)} of {total} resources</span>
        <div className="flex flex-wrap items-center gap-2">
          {safePage > 1 ? <Link href={pageHref(safePage - 1)} className="mlp-btn-outline">Previous</Link> : <span className="mlp-btn-outline opacity-50">Previous</span>}
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNumber = i + 1;
            if (totalPages > 7 && safePage > 4) pageNumber = Math.min(totalPages - 6 + i, safePage - 3 + i);
            return pageNumber;
          }).filter((value, index, list) => list.indexOf(value) === index).map((pageNumber) => (
            <Link key={pageNumber} href={pageHref(pageNumber)} className={pageNumber === safePage ? "grid size-10 place-items-center rounded-lg bg-[#a64026] font-bold text-white" : "mlp-btn-outline min-w-10 px-3"}>{pageNumber}</Link>
          ))}
          {safePage < totalPages ? <Link href={pageHref(safePage + 1)} className="mlp-btn-outline">Next</Link> : <span className="mlp-btn-outline opacity-50">Next</span>}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = status === "Published" ? "bg-green-50 text-green-700 border-green-200" : status === "Hidden" ? "bg-stone-100 text-stone-700 border-stone-300" : "bg-amber-50 text-amber-700 border-amber-200";
  return <span className={`inline-flex min-w-24 justify-center rounded border px-3 py-1 text-xs font-bold ${colors}`}>{status}</span>;
}

function ResourceSubmenuFilter({
  formats,
  defaultValue
}: {
  formats: ResourceFormatOption[];
  defaultValue?: string;
}) {
  const formatsWithSubmenus = formats.filter((format) => format.submenus.length > 0);
  return (
    <select name="submenu" defaultValue={defaultValue ?? ""} className="mlp-input w-full" aria-label="Resource submenu">
      <option value="">All Submenus</option>
      <option value="__none">No submenu</option>
      {formatsWithSubmenus.map((format) => (
        <optgroup key={format.name} label={format.name}>
          {format.submenus.map((submenu) => (
            <option key={`${format.name}-${submenu.name}`} value={submenu.name}>
              {submenu.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
