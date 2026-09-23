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
      <section className="flex flex-1 items-center py-10 sm:py-12 lg:py-14">
        <div className="mlp-container">
          <div className="mb-8 lg:mb-10">
            <p className="mb-3 flex items-center gap-2 font-extrabold uppercase tracking-wide text-[#a64026]"><Languages className="size-4" /> Public Library</p>
            <h1 className="text-3xl font-extrabold sm:text-4xl">Choose a Language</h1>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-flow-col xl:grid-cols-none xl:auto-cols-fr">
          {languages.map((language) => (
            <Link key={language.id} href={`/resources/${language.code}`} className="flex min-h-[19rem] flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#edf0f3] transition hover:-translate-y-0.5 hover:shadow-md xl:min-h-[21rem]">
              <div className="relative h-44 shrink-0 bg-[#f2f4f7] xl:h-48">
                <Image src={language.thumbnailPath || resourceImage({ language })} alt={`${language.name} thumbnail`} fill className="object-contain" />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <span className="mlp-badge">{language.displayName}</span>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <h2 className="text-xl font-extrabold 2xl:text-2xl">{language.name}</h2>
                  <ArrowRight className="size-5 text-[#a64026]" />
                </div>
                <p className="mt-auto pt-3 text-sm text-[#6b7c8f]">{resourceCountByLanguage.get(language.id) ?? 0} resources</p>
              </div>
            </Link>
          ))}
          </div>
        </div>
      </section>
      <PublicFooter pushToBottom={false} />
    </main>
  );
}
