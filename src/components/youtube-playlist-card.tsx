import Link from "next/link";
import { ListVideo } from "lucide-react";
import { SmartImage } from "@/components/smart-image";
import { resourceImage } from "@/lib/resource-taxonomy";

type PlaylistCardData = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  uploadedThumbnailPath?: string | null;
  visibility: string;
  language?: { name: string; code: string; thumbnailPath?: string | null } | null;
  videos?: Array<{ video?: { visibility?: string | null } }>;
  _count?: { videos: number };
};

function visibleVideoCount(videos: PlaylistCardData["videos"]) {
  return videos?.filter((item) => item.video?.visibility !== "Hidden").length;
}

export function YouTubePlaylistCard({ playlist }: { playlist: PlaylistCardData }) {
  const count = visibleVideoCount(playlist.videos) ?? playlist._count?.videos ?? 0;
  const thumbnail = playlist.uploadedThumbnailPath || playlist.thumbnailUrl || resourceImage({ language: playlist.language });
  return (
    <article className="min-w-[250px] max-w-[280px] overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-[#e5e7eb] transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/playlists/${playlist.id}`} className="block">
        <div className="relative aspect-video overflow-hidden bg-[#f2f4f7]">
          <SmartImage src={thumbnail} alt="" fill className="h-full w-full object-cover" sizes="280px" />
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/80 px-2 py-1 text-[11px] font-extrabold text-white">
            <ListVideo className="size-3" /> {count} videos
          </span>
        </div>
      </Link>
      <div className="p-4">
        <div className="mb-2 flex flex-wrap gap-2">
          <span className="rounded bg-[#f2f4f7] px-2 py-1 text-[11px] font-extrabold uppercase text-[#526579]">Resource</span>
          <span className="rounded bg-[#fbeaea] px-2 py-1 text-[11px] font-extrabold uppercase text-[#a64026]">{playlist.visibility || "Published"}</span>
        </div>
        <h3 className="line-clamp-2 min-h-[48px] text-base font-extrabold leading-snug text-[#243447]">{playlist.title}</h3>
        <Link href={`/playlists/${playlist.id}`} className="mt-4 inline-flex text-sm font-extrabold text-[#a64026]">
          Open resource
        </Link>
      </div>
    </article>
  );
}
