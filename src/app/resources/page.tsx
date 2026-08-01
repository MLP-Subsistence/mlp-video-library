import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Languages } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { prisma } from "@/lib/prisma";
import { resourceImage } from "@/lib/resource-taxonomy";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const [languages, resourceCounts] = await Promise.all([
    prisma.language.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" }
    }),
    prisma.video.groupBy({
      by: ["languageId"],
      where: { visibility: "Published", isPublished: true },
      _count: { _all: true }
    })
  ]);
  const resourceCountByLanguage = new Map(resourceCounts.map((item) => [item.languageId, item._count._all]));

  return (
    <main className="mlp-page">
      <PublicHeader />
      <section className="mlp-container py-8 sm:py-12">
        <p className="mb-3 flex items-center gap-2 font-extrabold uppercase tracking-wide text-[#a64026]"><Languages className="size-4" /> Public Library</p>
        <h1 className="text-3xl font-extrabold sm:text-4xl">Choose a Language</h1>
      </section>
      <section className="mlp-container pb-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {languages.map((language) => (
            <Link key={language.id} href={`/resources/${language.code}`} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#edf0f3] transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="relative aspect-video bg-[#f2f4f7]">
                <Image src={language.thumbnailPath || resourceImage({ language })} alt={`${language.name} thumbnail`} fill className="object-cover" />
              </div>
              <div className="p-5">
                <span className="mlp-badge">{language.displayName}</span>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <h2 className="text-xl font-extrabold sm:text-2xl">{language.name}</h2>
                  <ArrowRight className="size-5 text-[#a64026]" />
                </div>
                <p className="mt-2 text-sm text-[#6b7c8f]">{resourceCountByLanguage.get(language.id) ?? 0} resources</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
