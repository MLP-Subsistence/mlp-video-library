import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ListVideo, Search } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { ResourceFormatPlayer } from "@/components/resource-format-player";
import { prisma } from "@/lib/prisma";
import { getResourceFormatOptions } from "@/lib/resource-format-options";
import {
  normalizeResourceFormat,
  normalizeResourceSubmenu,
  resourceFormatFromSlug,
  resourceImage,
  resourceSubmenuFromSlug,
  slugify
} from "@/lib/resource-taxonomy";

export const dynamic = "force-dynamic";

export default async function ResourceFormatPage({
  params,
  searchParams
}: {
  params: Promise<{ language: string; format: string }>;
  searchParams: Promise<{ q?: string; resource?: string; submenu?: string }>;
}) {
  const [{ language: languageSlug, format: formatSlug }, query] = await Promise.all([params, searchParams]);
  const [languages, formatOptions] = await Promise.all([
    prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getResourceFormatOptions()
  ]);
  const requestedLanguage = languageSlug.toLowerCase();
  const language = languages.find(
    (item) =>
      item.code.toLowerCase() === requestedLanguage ||
      slugify(item.name) === requestedLanguage ||
      slugify(item.displayName) === requestedLanguage
  );
  const formatOption = formatOptions.find((item) => slugify(item.name) === formatSlug);
  const format = formatOption?.name ?? resourceFormatFromSlug(formatSlug);
  if (!language || !format) notFound();
  const formatSubmenus = formatOption?.submenus ?? [];

  const allResources = await prisma.video.findMany({
    where: { languageId: language.id, visibility: "Published", isPublished: true },
    include: { language: true },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
  });

  const baseResources = allResources.filter((resource) => normalizeResourceFormat(resource.resourceFormat) === format);
  const submenuSlug = query.submenu?.trim();
  const isGeneralSubmenu = submenuSlug === "general";
  const selectedSubmenu = isGeneralSubmenu
    ? null
    : submenuSlug
      ? resourceSubmenuFromSlug(submenuSlug, formatSubmenus.map((submenu) => submenu.name))
      : null;

  if (submenuSlug && !isGeneralSubmenu && !selectedSubmenu) notFound();

  const hasSubmenuChooser = formatSubmenus.length > 0 && !submenuSlug;
  const resourcesForCurrentSelection = submenuSlug
    ? baseResources.filter((resource) => {
        const resourceSubmenu = normalizeResourceSubmenu(resource.resourceSubmenu);
        return isGeneralSubmenu ? !resourceSubmenu : resourceSubmenu === selectedSubmenu;
      })
    : baseResources;

  if (hasSubmenuChooser) {
    const countMap = new Map<string, number>();
    let generalCount = 0;
    for (const resource of baseResources) {
      const submenu = normalizeResourceSubmenu(resource.resourceSubmenu);
      if (submenu) countMap.set(submenu, (countMap.get(submenu) ?? 0) + 1);
      else generalCount++;
    }

    return (
      <main className="mlp-page">
        <PublicHeader />
        <section className="border-b border-[#e5e7eb] bg-white">
          <div className="mlp-container py-6 sm:py-8">
            <Link href={`/resources/${language.code}`} className="mlp-btn-outline w-full sm:w-auto">
              <ArrowLeft className="size-4" /> Back to Resource Formats
            </Link>
            <p className="mt-5 text-sm font-extrabold uppercase tracking-wide text-[#a64026]">{language.name} / {format}</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Choose a Submenu</h1>
            <p className="mt-2 max-w-3xl text-[#6b7c8f]">
              Select the resource group you want to view. Each group opens directly into playable clips.
            </p>
          </div>
        </section>

        <section className="mlp-container py-8 sm:py-10">
          <div className="mlp-card-grid">
            {formatSubmenus.map((submenu) => {
              const count = countMap.get(submenu.name) ?? 0;
              return (
                <Link
                  key={submenu.name}
                  href={`/resources/${language.code}/${formatSlug}?submenu=${slugify(submenu.name)}`}
                  className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"
                >
                  <span className={count > 0 ? "mlp-badge" : "mlp-soft-badge"}>{count > 0 ? `${count} Clips` : "Coming Soon"}</span>
                  <div className="mt-5 flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-extrabold sm:text-2xl">{submenu.name}</h2>
                      {submenu.description && <p className="mt-3 text-sm leading-relaxed text-[#6b7c8f]">{submenu.description}</p>}
                    </div>
                    <ArrowRight className="size-5 shrink-0 text-[#a64026]" />
                  </div>
                </Link>
              );
            })}
            {generalCount > 0 && (
              <Link
                href={`/resources/${language.code}/${formatSlug}?submenu=general`}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"
              >
                <span className="mlp-badge">{generalCount} Clips</span>
                <div className="mt-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-extrabold sm:text-2xl">General {format}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-[#6b7c8f]">
                      Clips that have not been assigned to a submenu yet.
                    </p>
                  </div>
                  <ArrowRight className="size-5 shrink-0 text-[#a64026]" />
                </div>
              </Link>
            )}
          </div>
        </section>
        <PublicFooter />
      </main>
    );
  }

  const searchTerm = query.q?.trim().toLowerCase() ?? "";
  const resources = resourcesForCurrentSelection.filter((resource) => {
    const haystack = [
      resource.resourceTitle,
      resource.title,
      resource.description,
      resource.tags,
      resource.resourceType,
      resource.resourceFormat,
      resource.resourceSubmenu
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return !searchTerm || haystack.includes(searchTerm);
  });

  const formatHref = `/resources/${language.code}/${formatSlug}`;
  const selectedHref = submenuSlug ? `${formatHref}?submenu=${encodeURIComponent(submenuSlug)}` : formatHref;
  const currentLabel = selectedSubmenu ?? (isGeneralSubmenu ? `General ${format}` : format);
  const clipResources = resources.map((resource) => ({
    id: resource.id,
    title: resource.title,
    resourceTitle: resource.resourceTitle,
    resourceType: resource.resourceType,
    resourceFormat: resource.resourceFormat,
    description: resource.description,
    duration: resource.duration,
    category: resource.category,
    resourceSubmenu: resource.resourceSubmenu,
    thumbnailSrc: resourceImage(resource),
    youtubeVideoId: resource.youtubeVideoId,
    videoUrl: !resource.youtubeVideoId && /^https?:\/\//.test(resource.embedUrl) && !resource.embedUrl.includes("youtube") ? resource.embedUrl : null
  }));

  return (
    <main className="mlp-page">
      <PublicHeader />
      <section className="border-b border-[#e5e7eb] bg-white">
        <div className="mlp-container py-6 sm:py-8">
          <Link href={submenuSlug ? formatHref : `/resources/${language.code}`} className="mlp-btn-outline w-full sm:w-auto">
            <ArrowLeft className="size-4" /> {submenuSlug ? `Back to ${format}` : "Back to Resource Formats"}
          </Link>
          <p className="mt-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#a64026]">
            <ListVideo className="size-4" /> {language.name} / {format}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{currentLabel}</h1>
          <p className="mt-2 text-[#6b7c8f]">
            {resourcesForCurrentSelection.length} published clip{resourcesForCurrentSelection.length === 1 ? "" : "s"}
            {submenuSlug ? " from this imported playlist group appear directly below the player." : " available for this resource format."}
          </p>
        </div>
      </section>

      <section className="mlp-container py-8 sm:py-10">
        <form className="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] md:grid-cols-[1fr_auto_auto]">
          {submenuSlug && <input type="hidden" name="submenu" value={submenuSlug} />}
          <label className="flex h-12 items-center overflow-hidden rounded-lg border border-[#d8dde5] bg-white focus-within:border-[#a64026] focus-within:ring-4 focus-within:ring-[#a64026]/10">
            <span className="grid h-full w-12 shrink-0 place-items-center border-r border-[#edf0f3] text-[#8b9bad]"><Search className="size-4" /></span>
            <input name="q" defaultValue={query.q ?? ""} placeholder="Search by title, format, type, or tags..." className="h-full min-w-0 flex-1 px-3 text-[#243447] outline-none" />
          </label>
          <button className="mlp-btn-primary h-12 w-full sm:w-auto">Search</button>
          {searchTerm && (
            <Link href={selectedHref} className="mlp-btn-outline h-12 w-full sm:w-auto">Reset</Link>
          )}
        </form>

        <ResourceFormatPlayer
          resources={clipResources}
          initialResourceId={query.resource}
          languageName={language.name}
          format={currentLabel}
          searchTerm={searchTerm}
        />
      </section>
      <PublicFooter />
    </main>
  );
}
