import Link from "next/link";
import { Prisma } from "@prisma/client";
import { ChevronRight, Search, X } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { ResourceCard } from "@/components/resource-card";
import { prisma } from "@/lib/prisma";
import { getResourceFormatOptions } from "@/lib/resource-format-options";
import { resourceFormatAliases } from "@/lib/resource-taxonomy";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; language?: string; format?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || "";
  const formatAliases = params.format ? resourceFormatAliases(params.format) : [];
  const where: Prisma.VideoWhereInput = {
    visibility: "Published",
    isPublished: true,
    ...(params.language ? { languageId: params.language } : {}),
    ...(params.format ? { resourceFormat: { in: formatAliases } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { resourceTitle: { contains: q } },
            { description: { contains: q } },
            { resourceFormat: { contains: q } },
            { resourceSubmenu: { contains: q } },
            { resourceType: { contains: q } },
            { tags: { contains: q } },
            { language: { name: { contains: q } } }
          ]
        }
      : {})
  };
  const [resources, languages, formatOptions] = await Promise.all([
    prisma.video.findMany({ where, include: { language: true }, orderBy: [{ language: { sortOrder: "asc" } }, { resourceFormat: "asc" }, { orderIndex: "asc" }], take: 48 }),
    prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getResourceFormatOptions()
  ]);

  return (
    <main className="mlp-page">
      <PublicHeader />
      <section className="border-b border-[#e5e7eb] bg-[#f2f4f7] py-7">
        <div className="mlp-container">
          <form className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-[1fr_180px_190px_140px]">
            <label className="flex h-[42px] items-center overflow-hidden rounded-md border border-[#d8dde5] bg-white focus-within:border-[#a64026] focus-within:ring-4 focus-within:ring-[#a64026]/10">
              <span className="grid h-full w-11 shrink-0 place-items-center border-r border-[#edf0f3] text-[#8b9bad]"><Search className="size-4" /></span>
              <input name="q" defaultValue={q} placeholder="Search resources..." className="h-full min-w-0 flex-1 px-3 text-[#243447] outline-none" />
            </label>
            <details className="rounded-lg border border-[#d8dde5] bg-white p-3 md:hidden">
              <summary className="cursor-pointer list-none font-extrabold text-[#243447] md:hidden [&::-webkit-details-marker]:hidden">Filters</summary>
              <div className="mt-3 grid gap-3">
                <select name="language" defaultValue={params.language ?? ""} className="mlp-input bg-white"><option value="">All Languages</option>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <select name="format" defaultValue={params.format ?? ""} className="mlp-input bg-white"><option value="">All Formats</option>{formatOptions.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>
              </div>
            </details>
            <select name="language" defaultValue={params.language ?? ""} className="mlp-input hidden bg-white md:block"><option value="">All Languages</option>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select name="format" defaultValue={params.format ?? ""} className="mlp-input hidden bg-white md:block"><option value="">All Formats</option>{formatOptions.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>
            <button className="mlp-btn-primary">Search</button>
          </form>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
            <strong>Showing {resources.length} resources{q ? ` for "${q}"` : ""}</strong>
            {(params.language || params.format || q) && <Link href="/search" className="flex items-center gap-1 text-[#a64026]"><X className="size-3" /> Clear All</Link>}
          </div>
        </div>
      </section>
      <section className="mlp-container py-10">
        {resources.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {resources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-[#edf0f3]">
            <h1 className="text-2xl font-extrabold">No matching resources found</h1>
            <p className="mt-3 text-[#6b7c8f]">Try another language, resource format, or title.</p>
            <Link href="/resources" className="mlp-btn-primary mt-5">Browse Resources <ChevronRight className="size-4" /></Link>
          </div>
        )}
      </section>
      <PublicFooter />
    </main>
  );
}
