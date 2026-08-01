import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { ResourceFormatPlayer } from "@/components/resource-format-player";
import { prisma } from "@/lib/prisma";
import { normalizeResourceFormat, resourceFormatFromSlug, resourceImage } from "@/lib/resource-taxonomy";

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

  const formatHref = `/resources/${language.code}/${formatSlug}`;
  const clipResources = resources.map((resource) => ({
    id: resource.id,
    title: resource.title,
    resourceTitle: resource.resourceTitle,
    resourceType: resource.resourceType,
    resourceFormat: resource.resourceFormat,
    description: resource.description,
    duration: resource.duration,
    category: resource.category,
    thumbnailSrc: resourceImage(resource),
    youtubeVideoId: resource.youtubeVideoId
  }));

  return (
    <main className="mlp-page">
      <PublicHeader />
      <section className="border-b border-[#e5e7eb] bg-white">
        <div className="mlp-container py-6 sm:py-8">
          <Link href={`/resources/${language.code}`} className="mlp-btn-outline w-full sm:w-auto">
            <ArrowLeft className="size-4" /> Back to Resource Formats
          </Link>
          <p className="mt-4 text-sm font-bold uppercase tracking-wide text-[#a64026]">{language.name} / {format}</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
            {baseResources.length} published clip{baseResources.length === 1 ? "" : "s"}
          </h1>
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

        <ResourceFormatPlayer
          resources={clipResources}
          initialResourceId={query.resource}
          languageName={language.name}
          format={format}
          searchTerm={searchTerm}
        />
      </section>
      <PublicFooter />
    </main>
  );
}
