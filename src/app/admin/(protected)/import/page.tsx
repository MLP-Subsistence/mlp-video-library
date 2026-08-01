import Link from "next/link";
import { AlertTriangle, ArrowRight, CloudDownload, ExternalLink, Info, ListVideo, Plus } from "lucide-react";
import {
  bulkImportVideosAction,
  importYouTubePlaylistAction,
  updateImportedPlaylistFormatAction,
  upsertVideoAction
} from "@/app/admin/actions";
import { Notice } from "@/components/admin-shell";
import { FormActions, RegionAudienceFields, SelectField, TextArea, TextField, VisibilityField } from "@/components/admin-form";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getResourceFormatOptions, type ResourceFormatOption } from "@/lib/resource-format-options";
import { prisma } from "@/lib/prisma";
import { normalizeResourceFormat, normalizeResourceSubmenu, resourceTypes, slugify } from "@/lib/resource-taxonomy";

type ImportTab = "single" | "bulk" | "playlist" | "imported";

export default async function ImportPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab: ImportTab =
    params.tab === "bulk" || params.tab === "playlist" || params.tab === "imported" ? params.tab : "single";
  const [languages, formatOptions, importedResources] = await Promise.all([
    prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getResourceFormatOptions(),
    activeTab === "imported"
      ? prisma.video.findMany({
          where: { sourcePlaylistId: { not: null } },
          include: { language: true },
          orderBy: [{ updatedAt: "desc" }]
        })
      : Promise.resolve([])
  ]);
  const formatNames = formatOptions.map((format) => format.name);
  const apiKey = Boolean(process.env.YOUTUBE_API_KEY);
  const importedPlaylistMap = new Map<string, {
    key: string;
    sourcePlaylistId: string;
    sourcePlaylistUrl: string;
    title: string;
    languageId: string | null;
    languageName: string;
    languageCode: string | null;
    resourceFormat: string;
    resourceSubmenu: string | null;
    resourceType: string;
    count: number;
    published: number;
    draft: number;
    hidden: number;
    updatedAt: Date;
    sampleTitles: string[];
  }>();

  for (const resource of importedResources) {
    const sourcePlaylistId = resource.sourcePlaylistId ?? "";
    if (!sourcePlaylistId) continue;
    const resourceFormat = normalizeResourceFormat(resource.resourceFormat);
    const resourceSubmenu = normalizeResourceSubmenu(resource.resourceSubmenu);
    const key = `${sourcePlaylistId}:${resource.languageId ?? "none"}:${resourceFormat}:${resourceSubmenu ?? "none"}`;
    const title = resource.tags?.split(",")[0]?.trim() || `YouTube playlist ${sourcePlaylistId}`;
    const existing = importedPlaylistMap.get(key);
    if (existing) {
      existing.count++;
      existing.published += resource.visibility === "Published" ? 1 : 0;
      existing.draft += resource.visibility === "Draft" ? 1 : 0;
      existing.hidden += resource.visibility === "Hidden" ? 1 : 0;
      existing.updatedAt = resource.updatedAt > existing.updatedAt ? resource.updatedAt : existing.updatedAt;
      if (existing.sampleTitles.length < 3) existing.sampleTitles.push(resource.resourceTitle || resource.title);
      continue;
    }
    importedPlaylistMap.set(key, {
      key,
      sourcePlaylistId,
      sourcePlaylistUrl: resource.sourcePlaylistUrl || `https://www.youtube.com/playlist?list=${sourcePlaylistId}`,
      title,
      languageId: resource.languageId,
      languageName: resource.language?.name ?? "No language",
      languageCode: resource.language?.code ?? null,
      resourceFormat,
      resourceSubmenu,
      resourceType: resource.resourceType,
      count: 1,
      published: resource.visibility === "Published" ? 1 : 0,
      draft: resource.visibility === "Draft" ? 1 : 0,
      hidden: resource.visibility === "Hidden" ? 1 : 0,
      updatedAt: resource.updatedAt,
      sampleTitles: [resource.resourceTitle || resource.title]
    });
  }
  const importedPlaylists = Array.from(importedPlaylistMap.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Import from YouTube</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6b7c8f]">
            Add YouTube videos to your library by linking to them. Videos are not uploaded or hosted.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="mlp-btn-outline"><ExternalLink className="size-4" /> Public Library</Link>
          <Link href="/admin/videos/new" className="mlp-btn-primary"><Plus className="size-4" /> New Resource</Link>
        </div>
      </div>
      <Notice success={params.success} error={params.error} />

      <div className="mb-5 flex flex-wrap overflow-hidden rounded-xl border border-[#d8dde5] bg-white shadow-sm sm:inline-flex">
        <TabLink href="/admin/import?tab=single" active={activeTab === "single"}>Single Video</TabLink>
        <TabLink href="/admin/import?tab=bulk" active={activeTab === "bulk"}>Bulk Links</TabLink>
        <TabLink href="/admin/import?tab=playlist" active={activeTab === "playlist"}>Playlist</TabLink>
        <TabLink href="/admin/import?tab=imported" active={activeTab === "imported"}>Imported Playlists</TabLink>
      </div>

      <div className="mb-6 flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
        <Info className="mt-0.5 size-5 shrink-0" />
        <div>
          <strong>YouTube links are stored only.</strong> Videos are not uploaded or hosted on our servers.
          {activeTab === "imported" ? (
            <span> Imported playlists are grouped here so staff can quickly review the resources created from each YouTube playlist.</span>
          ) : activeTab !== "bulk" ? (
            <span> Need to import multiple videos? Switch to the <Link className="font-bold underline" href="/admin/import?tab=bulk">Bulk Links</Link> tab.</span>
          ) : null}
        </div>
      </div>

      {activeTab === "single" && (
        <form action={upsertVideoAction} className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            <h2 className="mb-6 text-xl font-extrabold">Video Details</h2>
            <div className="grid gap-5">
              <TextField label="YouTube URL" name="youtubeUrl" required />
              <TextField label="Resource Title" name="resourceTitle" required />
              <TextArea label="Description" name="description" />
              <details className="rounded-xl border border-[#edf0f3] bg-[#fbfcfd] p-4">
                <summary className="cursor-pointer font-bold">Advanced options</summary>
                <div className="mt-4 grid gap-4">
                  <TextField label="Tags" name="tags" />
                  <TextField label="Transcript or script URL/path" name="transcript" />
                  <TextField label="Custom thumbnail URL/path" name="thumbnailUrl" />
                  <TextField label="Duration optional" name="duration" />
                </div>
              </details>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            <h2 className="mb-6 text-xl font-extrabold">Import Settings</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              <SelectField label="Language" name="languageId" required>
                <option value="">Choose language</option>
                {languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectField>
              <SelectField label="Resource Format" name="resourceFormat" defaultValue="Doodle" required>
                {formatNames.map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
              <ResourceSubmenuSelect formats={formatOptions} />
              <SelectField label="Resource Type" name="resourceType" defaultValue="Video">
                {resourceTypes.map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
              <RegionAudienceFields audience="Trainers" />
              <input type="hidden" name="visibility" value="Draft" />
              <div className="sm:col-span-2 lg:col-span-1">
                <FormActions submitLabel="Create Draft" pendingLabel="Creating draft..." cancelHref="/admin" hideReset />
              </div>
            </div>
          </section>
        </form>
      )}

      {activeTab === "bulk" && (
        <form action={bulkImportVideosAction} className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            <h2 className="mb-6 text-xl font-extrabold">Bulk Links</h2>
            <TextArea label="YouTube URLs, one per line" name="urls" />
            <p className="mt-2 text-sm text-[#6b7c8f]">Each valid YouTube link will become a draft resource using the shared settings on the right.</p>
          </section>
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            <h2 className="mb-6 text-xl font-extrabold">Shared Settings</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              <SelectField label="Language" name="languageId" required><option value="">Choose language</option>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
              <SelectField label="Resource Format" name="resourceFormat" defaultValue="Doodle">{formatNames.map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
              <ResourceSubmenuSelect formats={formatOptions} />
              <SelectField label="Resource Type" name="resourceType" defaultValue="Video">{resourceTypes.map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
              <VisibilityField value="Draft" />
              <RegionAudienceFields audience="Trainers" />
              <TextField label="Tags" name="tags" />
              <div className="sm:col-span-2 lg:col-span-1">
                <FormActions submitLabel="Create Draft Resources" pendingLabel="Creating resources..." cancelHref="/admin/import" hideReset />
              </div>
            </div>
          </section>
        </form>
      )}

      {activeTab === "playlist" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
          <form action={importYouTubePlaylistAction} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            <h2 className="mb-2 text-xl font-extrabold">Import Playlist</h2>
            <p className="mb-6 text-sm leading-relaxed text-[#6b7c8f]">
              Import every video from a YouTube playlist into the selected resource format or submenu. No resource files are downloaded or hosted.
            </p>
            {!apiKey && (
              <div className="mb-6 flex gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm text-[#a64026]">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <strong>Full playlist import requires a YouTube API key. Manual imports are still available.</strong>
              </div>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              <TextField label="Playlist URL" name="playlistUrl" required />
              <TextField label="Fallback Thumbnail URL optional" name="thumbnailUrl" />
              <SelectField label="Language" name="languageId" required><option value="">Choose language</option>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
              <SelectField label="Resource Format" name="resourceFormat" defaultValue="Doodle" required>{formatNames.map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
              <ResourceSubmenuSelect formats={formatOptions} />
              <SelectField label="Resource Type" name="resourceType" defaultValue="Video">{resourceTypes.map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
              <VisibilityField value="Published" />
              <RegionAudienceFields audience="Trainers" />
              <div className="md:col-span-2">
                <FormActions submitLabel="Import Playlist" pendingLabel="Importing playlist..." cancelHref="/admin/import" disabled={!apiKey} hideReset />
              </div>
            </div>
          </form>

          <aside className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            <h2 className="mb-6 text-xl font-extrabold">Playlist Import Summary</h2>
            <ul className="space-y-3 text-sm text-[#526579]">
              <li className="flex gap-3"><CloudDownload className="size-5 text-green-600" /> Videos will be saved as YouTube links only</li>
              <li className="flex gap-3"><CloudDownload className="size-5 text-green-600" /> Imported clips appear under the selected format or submenu</li>
              <li className="flex gap-3"><CloudDownload className="size-5 text-green-600" /> You can review, edit, or switch visibility after import</li>
            </ul>
            <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Actual video count and titles will be shown in the import result after YouTube confirms the playlist.
            </div>
          </aside>
        </div>
      )}

      {activeTab === "imported" && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
          <div className="mb-6 grid gap-4 sm:flex sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold">Imported Playlists</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6b7c8f]">
                Review imported YouTube playlists and move them to another language, format, or submenu when needed.
              </p>
            </div>
            <Link href="/admin/import?tab=playlist" className="mlp-btn-primary w-full sm:w-auto">
              <CloudDownload className="size-4" />
              Import Another Playlist
            </Link>
          </div>

          {importedPlaylists.length > 0 ? (
            <div className="grid gap-4">
              {importedPlaylists.map((playlist) => {
                const publicQuery = new URLSearchParams();
                if (playlist.resourceSubmenu) publicQuery.set("submenu", slugify(playlist.resourceSubmenu));
                const publicHref = playlist.languageCode
                  ? `/resources/${playlist.languageCode}/${slugify(playlist.resourceFormat)}${publicQuery.toString() ? `?${publicQuery.toString()}` : ""}`
                  : "/resources";
                const manageQuery = new URLSearchParams();
                if (playlist.languageId) manageQuery.set("languageId", playlist.languageId);
                manageQuery.set("format", playlist.resourceFormat);
                if (playlist.resourceSubmenu) manageQuery.set("submenu", playlist.resourceSubmenu);
                const manageHref = `/admin/videos?${manageQuery.toString()}`;
                return (
                  <article key={playlist.key} className="rounded-2xl border border-[#e5e7eb] bg-[#fbfcfd] p-4 transition hover:border-[#e2c8c2] hover:bg-white hover:shadow-sm sm:p-5">
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                      <div className="flex gap-4">
                        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#fbeaea] text-[#a64026]">
                          <ListVideo className="size-6" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-lg font-extrabold text-[#243447]">{playlist.title}</h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="mlp-badge">{playlist.languageName}</span>
                            <span className="mlp-soft-badge">{playlist.resourceFormat}</span>
                            {playlist.resourceSubmenu && <span className="mlp-soft-badge">{playlist.resourceSubmenu}</span>}
                            <span className="mlp-soft-badge">{playlist.resourceType}</span>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#526579]">
                        <div><strong className="text-[#243447]">{playlist.count}</strong> resources</div>
                        <div className="mt-1">Updated {playlist.updatedAt.toLocaleDateString()}</div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                      <div>
                        <div className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">Sample resources</div>
                        <ul className="mt-2 space-y-1 text-sm text-[#526579]">
                          {playlist.sampleTitles.map((title, index) => <li key={`${title}-${index}`} className="line-clamp-1">- {title}</li>)}
                        </ul>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">{playlist.published} Published</span>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{playlist.draft} Draft</span>
                        {playlist.hidden > 0 && <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700">{playlist.hidden} Hidden</span>}
                      </div>
                    </div>

                    <details className="mt-5 rounded-xl border border-[#e5e7eb] bg-white p-4">
                      <summary className="cursor-pointer list-none font-extrabold text-[#243447] [&::-webkit-details-marker]:hidden">
                        Edit playlist placement
                      </summary>
                      <form action={updateImportedPlaylistFormatAction} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <input type="hidden" name="sourcePlaylistId" value={playlist.sourcePlaylistId} />
                        <SelectField label="Language" name="languageId" defaultValue={playlist.languageId} required>
                          <option value="">Choose language</option>
                          {languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </SelectField>
                        <SelectField label="Resource Format" name="resourceFormat" defaultValue={playlist.resourceFormat} required>
                          {formatNames.map((item) => <option key={item} value={item}>{item}</option>)}
                        </SelectField>
                        <ResourceSubmenuSelect formats={formatOptions} defaultValue={playlist.resourceSubmenu} />
                        <SelectField label="Resource Type" name="resourceType" defaultValue={playlist.resourceType}>
                          {resourceTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                        </SelectField>
                        <div className="flex items-end">
                          <PendingSubmitButton className="h-11 w-full rounded-lg bg-[#a64026] px-4 font-bold text-white transition hover:bg-[#8e351f] disabled:cursor-not-allowed disabled:bg-[#d8dde5]" pendingLabel="Updating...">
                            Update Placement
                          </PendingSubmitButton>
                        </div>
                      </form>
                    </details>

                    <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
                      <Link href={manageHref} className="mlp-btn-outline w-full sm:w-auto">
                        Manage Resources
                        <ArrowRight className="size-4" />
                      </Link>
                      <Link href={publicHref} className="mlp-btn-outline w-full sm:w-auto">
                        View Public List
                        <ExternalLink className="size-4" />
                      </Link>
                      <a href={playlist.sourcePlaylistUrl} target="_blank" rel="noreferrer" className="mlp-btn-outline w-full sm:w-auto">
                        Open on YouTube
                        <ExternalLink className="size-4" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#d8dde5] bg-[#fbfcfd] p-8 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#fbeaea] text-[#a64026]">
                <ListVideo className="size-7" />
              </div>
              <h3 className="mt-4 text-xl font-extrabold">No imported playlists yet</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#6b7c8f]">
                After you import a YouTube playlist, it will appear here with its language, format, submenu, resource count, and review links.
              </p>
              <Link href="/admin/import?tab=playlist" className="mlp-btn-primary mt-5">
                Import Playlist
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`min-w-36 px-6 py-3 text-center text-sm font-extrabold transition active:scale-[0.98] ${
        active ? "bg-white text-[#a64026] shadow-[inset_0_-2px_0_#a64026]" : "bg-[#fbfcfd] text-[#526579] hover:text-[#243447]"
      }`}
    >
      {children}
    </Link>
  );
}

function ResourceSubmenuSelect({
  formats,
  defaultValue
}: {
  formats: ResourceFormatOption[];
  defaultValue?: string | null;
}) {
  const formatsWithSubmenus = formats.filter((format) => format.submenus.length > 0);
  return (
    <SelectField label="Submenu optional" name="resourceSubmenu" defaultValue={defaultValue ?? ""}>
      <option value="">No submenu</option>
      {formatsWithSubmenus.map((format) => (
        <optgroup key={format.name} label={format.name}>
          {format.submenus.map((submenu) => (
            <option key={`${format.name}-${submenu.name}`} value={submenu.name}>{submenu.name}</option>
          ))}
        </optgroup>
      ))}
    </SelectField>
  );
}
