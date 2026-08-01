import Link from "next/link";
import { AlertTriangle, Clapperboard, DownloadCloud, ExternalLink, FileText, Globe2, MoreVertical, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { resourceImage } from "@/lib/resource-taxonomy";
import { SmartImage } from "@/components/smart-image";

export default async function AdminDashboard() {
  const [resources, languages, drafts, recentResources, missingThumbs] = await Promise.all([
    prisma.video.count(),
    prisma.language.count({ where: { isActive: true } }),
    prisma.video.count({ where: { visibility: { not: "Published" } } }),
    prisma.video.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { language: true, module: true } }),
    prisma.video.count({ where: { AND: [{ thumbnailUrl: null }, { uploadedThumbnailPath: null }] } })
  ]);

  const stats = [
    ["Total Resources", resources, `Across ${languages} languages`, Clapperboard, "bg-[#fbeaea] text-[#a64026]"],
    ["Languages", languages, "Active languages", Globe2, "bg-green-50 text-green-700"],
    ["Drafts", drafts, drafts > 0 ? "Need review" : "All clear", FileText, "bg-orange-50 text-[#f18701]"],
    ["Needs Review", missingThumbs, missingThumbs > 0 ? "Missing thumbnails" : "All clear", AlertTriangle, "bg-amber-50 text-amber-700"]
  ] as const;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Dashboard</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6b7c8f] sm:text-base">Overview of your video library and content at a glance.</p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:flex">
          <Link href="/admin/videos/new" className="mlp-btn-primary"><Plus className="size-4" /> Add Resource</Link>
          <Link href="/resources" className="mlp-btn-outline"><ExternalLink className="size-4" /> Public Library</Link>
          <Link href="/admin/import?tab=playlist" className="mlp-btn-outline"><Clapperboard className="size-4" /> Import Playlist</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
        {stats.map(([label, value, note, Icon, tone]) => (
          <div key={label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-7">
            <div className="flex items-start gap-4">
              <span className={`grid size-12 place-items-center rounded-full ${tone}`}><Icon className="size-5" /></span>
              <div>
                <div className="text-sm font-bold text-[#526579]">{label}</div>
                <div className="mt-3 text-3xl font-extrabold">{value}</div>
                <div className="mt-3 text-sm text-[#6b7c8f]">{note}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_320px] xl:gap-8">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-7">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-extrabold">Recently Added Resources</h2>
            <Link href="/admin/videos" className="text-sm font-bold text-[#a64026]">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead className="border-b border-[#edf0f3] text-[11px] uppercase tracking-wide text-[#526579]">
                <tr>
                  <th className="py-3 pr-4">Title</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">Added on</th>
                  <th className="py-3 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f3]">
                {recentResources.map((resource) => (
                  <tr key={resource.id}>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-[#f2f4f7]">
                          <SmartImage src={resourceImage(resource)} alt="" fill className="h-full w-full object-cover" />
                        </div>
                        <div>
                          <div className="font-extrabold">{resource.resourceTitle || resource.title}</div>
                          <div className="mt-1 text-xs font-semibold text-[#6b7c8f]">{resource.language?.name ?? "No language"} - {resource.resourceFormat}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold">{resource.language?.name ?? "No language"}</td>
                    <td className="px-4 py-4 text-sm font-semibold">{resource.resourceFormat}</td>
                    <td className="px-4 py-4 text-sm text-[#526579]">{resource.createdAt.toLocaleDateString()}</td>
                    <td className="py-4 pl-4 text-right">
                      <Link href={`/admin/videos/new?edit=${resource.id}`} className="inline-grid size-9 place-items-center rounded-lg border border-[#d8dde5]" title="Edit resource">
                        <MoreVertical className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 text-[#a64026]">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><AlertTriangle className="size-4" /> Needs Review</h2>
            <p className="mt-4 text-sm leading-relaxed">
              {missingThumbs} resources are missing thumbnails. Add thumbnails to keep your library complete and professional.
            </p>
            <Link href="/admin/videos" className="mlp-btn-outline mt-5 w-full bg-white">Review Resources</Link>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#edf0f3]">
            <h2 className="mb-5 text-lg font-extrabold">Quick Actions</h2>
            <div className="grid gap-3">
              <Link className="mlp-btn-outline w-full justify-start" href="/admin/videos/new"><Plus className="size-4" /> Add Resource</Link>
              <Link className="mlp-btn-outline w-full justify-start" href="/admin/videos"><Clapperboard className="size-4" /> Manage Resources</Link>
              <Link className="mlp-btn-outline w-full justify-start" href="/admin/import"><DownloadCloud className="size-4" /> Import from YouTube</Link>
              <Link className="mlp-btn-outline w-full justify-start" href="/resources"><ExternalLink className="size-4" /> Public Library</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
