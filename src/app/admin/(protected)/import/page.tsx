import Link from "next/link";
import { AlertTriangle, CloudDownload, ExternalLink, Info, Plus } from "lucide-react";
import { bulkImportVideosAction, importYouTubePlaylistAction, upsertVideoAction } from "@/app/admin/actions";
import { Notice } from "@/components/admin-shell";
import { FormActions, RegionAudienceFields, SelectField, TextArea, TextField, VisibilityField } from "@/components/admin-form";
import { prisma } from "@/lib/prisma";
import { resourceFormats, resourceTypes } from "@/lib/resource-taxonomy";

type ImportTab = "single" | "bulk" | "playlist";

export default async function ImportPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab: ImportTab = params.tab === "bulk" || params.tab === "playlist" ? params.tab : "single";
  const languages = await prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const apiKey = Boolean(process.env.YOUTUBE_API_KEY);

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

      <div className="mb-5 inline-flex overflow-hidden rounded-xl border border-[#d8dde5] bg-white shadow-sm">
        <TabLink href="/admin/import?tab=single" active={activeTab === "single"}>Single Video</TabLink>
        <TabLink href="/admin/import?tab=bulk" active={activeTab === "bulk"}>Bulk Links</TabLink>
        <TabLink href="/admin/import?tab=playlist" active={activeTab === "playlist"}>Playlist</TabLink>
      </div>

      <div className="mb-6 flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
        <Info className="mt-0.5 size-5 shrink-0" />
        <div>
          <strong>YouTube links are stored only.</strong> Videos are not uploaded or hosted on our servers.
          {activeTab !== "bulk" && <span> Need to import multiple videos? Switch to the <Link className="font-bold underline" href="/admin/import?tab=bulk">Bulk Links</Link> tab.</span>}
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
                {resourceFormats.map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
              <SelectField label="Resource Type" name="resourceType" defaultValue="Video">
                {resourceTypes.map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
              <RegionAudienceFields audience="Trainers" />
              <input type="hidden" name="visibility" value="Draft" />
              <div className="sm:col-span-2 lg:col-span-1">
                <FormActions submitLabel="Create Draft" cancelHref="/admin" hideReset />
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
              <SelectField label="Resource Format" name="resourceFormat" defaultValue="Doodle">{resourceFormats.map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
              <SelectField label="Resource Type" name="resourceType" defaultValue="Video">{resourceTypes.map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
              <VisibilityField value="Draft" />
              <RegionAudienceFields audience="Trainers" />
              <TextField label="Tags" name="tags" />
              <div className="sm:col-span-2 lg:col-span-1">
                <FormActions submitLabel="Create Draft Resources" cancelHref="/admin/import" hideReset />
              </div>
            </div>
          </section>
        </form>
      )}

      {activeTab === "playlist" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
          <form action={importYouTubePlaylistAction} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            <h2 className="mb-2 text-xl font-extrabold">Import Playlist</h2>
            <p className="mb-6 text-sm leading-relaxed text-[#6b7c8f]">Import every video from a YouTube playlist into the selected language and resource format.</p>
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
              <SelectField label="Resource Format" name="resourceFormat" defaultValue="Doodle" required>{resourceFormats.map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
              <SelectField label="Resource Type" name="resourceType" defaultValue="Video">{resourceTypes.map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
              <VisibilityField value="Draft" />
              <RegionAudienceFields audience="Trainers" />
              <div className="md:col-span-2">
                <FormActions submitLabel="Import as Draft" cancelHref="/admin/import" disabled={!apiKey} hideReset />
              </div>
            </div>
          </form>

          <aside className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-6">
            <h2 className="mb-6 text-xl font-extrabold">Playlist Import Summary</h2>
            <ul className="space-y-3 text-sm text-[#526579]">
              <li className="flex gap-3"><CloudDownload className="size-5 text-green-600" /> Videos will be saved as YouTube links only</li>
              <li className="flex gap-3"><CloudDownload className="size-5 text-green-600" /> Resources can be created as Draft</li>
              <li className="flex gap-3"><CloudDownload className="size-5 text-green-600" /> You can review and edit after import</li>
            </ul>
            <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Actual video count and titles will be shown in the import result after YouTube confirms the playlist.
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`min-w-36 px-6 py-3 text-center text-sm font-extrabold transition ${
        active ? "bg-white text-[#a64026] shadow-[inset_0_-2px_0_#a64026]" : "bg-[#fbfcfd] text-[#526579] hover:text-[#243447]"
      }`}
    >
      {children}
    </Link>
  );
}
