import Link from "next/link";
import { FileText, PlayCircle } from "lucide-react";
import { SmartImage } from "@/components/smart-image";
import { normalizeResourceFormat, resourceImage, slugify } from "@/lib/resource-taxonomy";

type ResourceCardResource = {
  id: string;
  title: string;
  resourceTitle?: string | null;
  resourceType: string;
  resourceFormat: string;
  description?: string | null;
  duration?: string | null;
  category: string;
  uploadedThumbnailPath?: string | null;
  thumbnailUrl?: string | null;
  language?: { name: string; code: string; thumbnailPath?: string | null } | null;
};

export function ResourceCard({ resource }: { resource: ResourceCardResource }) {
  const languageCode = resource.language?.code ?? "en";
  const href = `/resources/${languageCode}/${slugify(normalizeResourceFormat(resource.resourceFormat))}?resource=${resource.id}`;
  return (
    <article className="resource-card overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#edf0f3] transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={href} className="block">
        <div className="relative aspect-video overflow-hidden bg-[#f2f4f7]">
          <SmartImage src={resourceImage(resource)} alt="" fill className="h-full w-full object-cover" sizes="(max-width: 768px) 100vw, 280px" />
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[11px] font-extrabold text-white">
            {resource.resourceType === "Video" ? <PlayCircle className="size-3" /> : <FileText className="size-3" />}
            {resource.duration || resource.resourceType}
          </span>
        </div>
      </Link>
      <div className="flex min-h-[210px] flex-col p-4 sm:min-h-56">
        <div className="flex flex-wrap gap-2">
          <span className="mlp-badge">{resource.language?.name ?? "Language"}</span>
          <span className="mlp-soft-badge">{resource.resourceFormat}</span>
        </div>
        <h3 className="mt-3 line-clamp-2 text-lg font-extrabold text-[#243447] sm:text-[19px]">{resource.resourceTitle || resource.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#6b7c8f]">{resource.description}</p>
        <div className="mt-auto pt-4">
          <Link href={href} className="mlp-btn-dark min-h-11 w-full">Open Resource</Link>
        </div>
      </div>
    </article>
  );
}
