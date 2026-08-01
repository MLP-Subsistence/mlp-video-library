import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Layers3 } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { prisma } from "@/lib/prisma";
import { normalizeResourceFormat, resourceFormatIcon, resourceImage, slugify, visibleResourceFormats } from "@/lib/resource-taxonomy";

export const dynamic = "force-dynamic";

export default async function LanguageFormatsPage({ params }: { params: Promise<{ language: string }> }) {
  const { language: code } = await params;
  const language = await prisma.language.findUnique({ where: { code } });
  if (!language || !language.isActive) notFound();

  const resources = await prisma.video.findMany({
    where: { languageId: language.id, visibility: "Published", isPublished: true },
    select: { resourceFormat: true }
  });
  const countMap = new Map<string, number>();
  for (const resource of resources) {
    const format = normalizeResourceFormat(resource.resourceFormat);
    countMap.set(format, (countMap.get(format) ?? 0) + 1);
  }

  return (
    <main className="mlp-page">
      <PublicHeader />
      <section className="border-b border-[#e5e7eb] bg-white">
        <div className="mlp-container py-6 sm:py-8">
          <Link href="/resources" className="mlp-btn-outline mb-5 w-full sm:mb-6 sm:w-auto">
            <ArrowLeft className="size-4" /> Back to Languages
          </Link>
          <div className="grid gap-5 md:grid-cols-[260px_1fr] lg:grid-cols-[360px_1fr] lg:items-center">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-[#f2f4f7] shadow-sm ring-1 ring-[#edf0f3]">
              <Image src={language.thumbnailPath || resourceImage({ language })} alt={`${language.name} thumbnail`} fill className="object-cover" />
            </div>
            <div>
              <p className="mb-3 flex items-center gap-2 font-extrabold uppercase tracking-wide text-[#a64026]">
                <Layers3 className="size-4" /> Select Resource Format
              </p>
              <h1 className="text-3xl font-extrabold sm:text-4xl">{language.name} Resources</h1>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#6b7c8f] sm:text-lg">
                Choose a resource format to view the matching Marketplace Literacy resources directly.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="mlp-container py-10 sm:py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleResourceFormats.map((format) => {
            const count = countMap.get(format) ?? 0;
            return (
              <Link
                key={format}
                href={`/resources/${language.code}/${slugify(format)}`}
                className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"
              >
                <span className={count > 0 ? "mlp-badge" : "mlp-soft-badge"}>{count > 0 ? `${count} Resources` : "Coming Soon"}</span>
                <Image src={resourceFormatIcon(format)} alt="" width={84} height={84} className="mt-5 size-20 object-contain" />
                <div className="mt-5 flex items-center justify-between gap-4">
                  <h2 className="text-xl font-extrabold sm:text-2xl">{format}</h2>
                  <ArrowRight className="size-5 text-[#a64026]" />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#6b7c8f]">
                  View {format} videos and resources in {language.name}.
                </p>
              </Link>
            );
          })}
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
