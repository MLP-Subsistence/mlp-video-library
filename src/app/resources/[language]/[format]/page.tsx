import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, PlayCircle, Search, Sparkles } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { SmartImage } from "@/components/smart-image";
import { prisma } from "@/lib/prisma";
import { normalizeResourceFormat, resourceFormatFromSlug, resourceFormatIcon, resourceImage } from "@/lib/resource-taxonomy";
import { youtubeWatchUrl } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export default async function ResourceFormatPage({
  params,
  searchParams
}: {
  params: Promise<{ language: string; format: string }>;
  searchParams: Promise<{ q?: string; resource?: string }>;
}) {
  const [{ language: code, format: formatSlug }, query] = await Promise.all([params, searchParams]);
  const [language, format] = await Promise.all([
    prisma.language.findUnique({ where: { code } }),
    Promise.resolve(resourceFormatFromSlug(formatSlug))
  ]);
  if (!language || !language.isActive || !format) notFound();

  const allResources = await prisma.video.findMany({
    where: { languageId: language.id, visibility: "Published", isPublished: true },
    include: { language: true },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
  });

  const baseResources = allResources.filter((resource) => normalizeResourceFormat(resource.resourceFormat) === format);
  const searchTerm = query.q?.trim().toLowerCase() ?? "";
  const resources = baseResources.filter((resource) => {
    const haystack = [
      resource.resourceTitle,
      resource.title,
      resource.description,
      resource.tags,
      resource.resourceType,
      resource.resourceFormat
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return !searchTerm || haystack.includes(searchTerm);
  });

  const selected = resources.find((resource) => resource.id === query.resource) ?? resources[0] ?? null;
  const selectedIndex = selected ? resources.findIndex((resource) => resource.id === selected.id) : -1;
  const previous = selectedIndex > 0 ? resources[selectedIndex - 1] : null;
  const next = selectedIndex >= 0 && selectedIndex < resources.length - 1 ? resources[selectedIndex + 1] : null;
  const formatHref = `/resources/${language.code}/${formatSlug}`;

  return (
    <main className="mlp-page">
      <PublicHeader />
      <section className="border-b border-[#e5e7eb] bg-white">
        <div className="mlp-container py-6 sm:py-8">
          <Link href={`/resources/${language.code}`} className="mlp-btn-outline mb-5 w-full sm:mb-6 sm:w-auto">
            <ArrowLeft className="size-4" /> Back to Resource Formats
          </Link>
          <div className="grid gap-5 md:grid-cols-[180px_1fr] lg:grid-cols-[220px_1fr] lg:items-center">
            <div className="grid aspect-square place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-[#edf0f3]">
              <Image src={resourceFormatIcon(format)} alt="" width={150} height={150} className="size-32 object-contain sm:size-36" priority />
            </div>
            <div>
              <p className="mb-3 flex items-center gap-2 font-extrabold uppercase tracking-wide text-[#a64026]">
                <PlayCircle className="size-4" /> {language.name} Resources
              </p>
              <h1 className="text-3xl font-extrabold sm:text-4xl">{format}</h1>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#6b7c8f] sm:text-lg">
                {baseResources.length} published {format} resource{baseResources.length === 1 ? "" : "s"} available in {language.name}.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mlp-container py-8 sm:py-10">
        <form className="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] md:grid-cols-[1fr_auto_auto]">
          <label className="flex h-12 items-center overflow-hidden rounded-lg border border-[#d8dde5] bg-white focus-within:border-[#a64026] focus-within:ring-4 focus-within:ring-[#a64026]/10">
            <span className="grid h-full w-12 shrink-0 place-items-center border-r border-[#edf0f3] text-[#8b9bad]"><Search className="size-4" /></span>
            <input name="q" defaultValue={query.q ?? ""} placeholder="Search by title, format, type, or tags..." className="h-full min-w-0 flex-1 px-3 text-[#243447] outline-none" />
          </label>
          <button className="mlp-btn-primary h-12 w-full sm:w-auto">Search</button>
          {searchTerm && (
            <Link href={formatHref} className="mlp-btn-outline h-12 w-full sm:w-auto">Reset</Link>
          )}
        </form>

        {resources.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
            <div className="space-y-6">
              {selected && (
                <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#edf0f3]">
                  <div className="relative aspect-video overflow-hidden bg-black">
                    {selected.youtubeVideoId ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${selected.youtubeVideoId}`}
                        title={selected.resourceTitle || selected.title}
                        className="absolute inset-0 h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : (
                      <SmartImage src={resourceImage(selected)} alt="" fill className="h-full w-full object-cover" sizes="100vw" />
                    )}
                  </div>
                  <div className="p-5 sm:p-6">
                    <div className="mb-4 flex flex-wrap gap-2">
                      <span className="mlp-badge">{language.name}</span>
                      <span className="mlp-soft-badge">{format}</span>
                      <span className="mlp-soft-badge">{selected.resourceType}</span>
                    </div>
                    <h2 className="text-2xl font-extrabold sm:text-3xl">{selected.resourceTitle || selected.title}</h2>
                    {selected.description && <p className="mt-3 leading-relaxed text-[#526579]">{selected.description}</p>}
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      {previous && <Link href={`${formatHref}?resource=${previous.id}`} className="mlp-btn-outline"><ArrowLeft className="size-4" /> Previous</Link>}
                      {next && <Link href={`${formatHref}?resource=${next.id}`} className="mlp-btn-primary">Next Resource</Link>}
                      {selected.youtubeVideoId && (
                        <a href={youtubeWatchUrl(selected.youtubeVideoId)} target="_blank" rel="noreferrer" className="mlp-btn-outline">
                          <ExternalLink className="size-4" /> Open on YouTube
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              )}
            </div>
            <aside className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] lg:sticky lg:top-24 lg:self-start">
              <h2 className="mb-1 text-xl font-extrabold">{format} Resources</h2>
              <p className="mb-4 text-sm text-[#6b7c8f]">
                {resources.length} video{resources.length === 1 ? "" : "s"} available in {language.name}
              </p>
              <div className="max-h-[540px] space-y-2 overflow-auto pr-1">
                {resources.map((resource, index) => (
                  <Link
                    key={resource.id}
                    href={`${formatHref}?resource=${resource.id}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`}
                    className={`block rounded-xl p-2 text-sm transition ${resource.id === selected?.id ? "bg-[#fbeaea] text-[#a64026]" : "hover:bg-[#f7f8fa]"}`}
                  >
                    <span className="flex gap-3">
                      <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[#f2f4f7] ring-1 ring-[#edf0f3]">
                        <SmartImage src={resourceImage(resource)} alt="" fill className="object-cover" sizes="96px" />
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span className="line-clamp-2 font-extrabold leading-snug">
                          {index + 1}. {resource.resourceTitle || resource.title}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-[#6b7c8f]">{resource.resourceType}</span>
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-[#edf0f3]">
            <Sparkles className="mx-auto mb-4 size-10 text-[#a64026]" />
            <h2 className="text-2xl font-extrabold">Future Resources / Coming Soon</h2>
            <p className="mx-auto mt-3 max-w-xl text-[#6b7c8f]">
              No published resources match this language and resource format yet. Try resetting the search or check back later.
            </p>
          </div>
        )}
      </section>
      <PublicFooter />
    </main>
  );
}
