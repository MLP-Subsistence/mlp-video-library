import Link from "next/link";
import { Eye, FileText, Link2, ListChecks, Save } from "lucide-react";
import { upsertVideoAction } from "@/app/admin/actions";
import { Notice } from "@/components/admin-shell";
import { RegionAudienceFields, SelectField, TextArea, TextField } from "@/components/admin-form";
import { YouTubeVideoFields } from "@/components/youtube-url-helper";
import { SmartImage } from "@/components/smart-image";
import { prisma } from "@/lib/prisma";
import { PROGRAM_NAME, resourceFormats, resourceImage, resourceTypes } from "@/lib/resource-taxonomy";

export default async function VideoFormPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; success?: string }> }) {
  const params = await searchParams;
  const [languages, edit] = await Promise.all([
    prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    params.edit ? prisma.video.findUnique({ where: { id: params.edit }, include: { language: true } }) : null
  ]);
  return (
    <div>
      <form action={upsertVideoAction}>
        <input type="hidden" name="id" value={edit?.id ?? ""} />
        <input type="hidden" name="program" value={PROGRAM_NAME} />
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
          <div>
            <div className="mb-2 text-xs font-bold text-[#6b7c8f]">Manage Resources / <span className="text-[#a64026]">{edit ? "Edit Resource" : "Add New Resource"}</span></div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{edit ? "Edit Resource" : "Add New Resource"}</h1>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:flex">
            <Link href="/admin/videos" className="mlp-btn-outline">Cancel</Link>
            <button name="visibility" value="Draft" className="mlp-btn-outline">Save as Draft</button>
            <button name="visibility" value="Published" className="mlp-btn-primary"><Save className="size-4" /> Publish Resource</button>
          </div>
        </div>
        <Notice success={params.success} error={params.error} />
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] sm:p-6 lg:p-8">
          <FormSection icon={<Link2 className="size-4" />} title="Resource Source" helper="Paste a YouTube link if this resource is a video. Documents, prompts, and scripts can be saved without a video link.">
            <YouTubeVideoFields defaultUrl={edit?.youtubeUrl} defaultThumbnail={edit?.thumbnailUrl} />
          </FormSection>

          <FormSection icon={<FileText className="size-4" />} title="Resource Details">
            <TextField label="Resource Title" name="resourceTitle" defaultValue={edit?.resourceTitle || edit?.title} required />
            <TextArea label="Description / Facilitator Notes" name="description" defaultValue={edit?.description} />
            <TextArea label="Transcript / Script" name="transcript" defaultValue={edit?.transcript} />
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label="Language" name="languageId" defaultValue={edit?.languageId} required>
                <option value="">Select Language</option>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectField>
              <SelectField label="Resource Type" name="resourceType" defaultValue={edit?.resourceType ?? "Video"}>
                {resourceTypes.map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
              <SelectField label="Resource Format" name="resourceFormat" defaultValue={edit?.resourceFormat ?? "Doodle"}>
                {resourceFormats.map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
              <TextField label="Duration" name="duration" defaultValue={edit?.duration} />
            </div>
          </FormSection>

          <FormSection icon={<ListChecks className="size-4" />} title="Organization">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Display Order" name="orderIndex" defaultValue={edit?.orderIndex ?? 0} type="number" />
              <RegionAudienceFields region={edit?.region} audience={edit?.audience} />
              <TextField label="Tags" name="tags" defaultValue={edit?.tags} />
            </div>
          </FormSection>

          <FormSection icon={<Eye className="size-4" />} title="Visuals & Status">
            <div className="grid gap-6 md:grid-cols-[260px_1fr]">
              <div>
                <div className="relative aspect-video overflow-hidden rounded-lg bg-[#f2f4f7] ring-1 ring-[#edf0f3]">
                  {edit && <SmartImage src={resourceImage(edit)} alt="" fill className="h-full w-full object-cover" />}
                </div>
                <p className="mt-2 text-xs text-[#6b7c8f]">If no custom thumbnail is added, the app uses the selected language thumbnail.</p>
              </div>
              <div className="grid content-between gap-5">
                <div>
                  <div className="mb-3 text-sm font-bold">Status</div>
                  <div className="flex flex-wrap gap-5 text-sm font-semibold">
                    <label><input type="radio" name="visibility" value="Published" defaultChecked={edit?.visibility === "Published" || !edit} className="mr-2 accent-[#a64026]" /> Published</label>
                    <label><input type="radio" name="visibility" value="Draft" defaultChecked={edit?.visibility === "Draft"} className="mr-2 accent-[#a64026]" /> Draft</label>
                    <label><input type="radio" name="visibility" value="Hidden" defaultChecked={edit?.visibility === "Hidden"} className="mr-2 accent-[#a64026]" /> Hidden</label>
                  </div>
                </div>
                <input name="thumbnailFile" type="file" accept="image/*" className="mlp-input h-auto py-2" />
              </div>
            </div>
          </FormSection>
          <div className="mt-8 grid gap-3 border-t border-[#edf0f3] pt-6 sm:flex sm:justify-end sm:gap-4 sm:pt-8"><Link href="/admin/videos" className="mlp-btn-outline">Cancel</Link><button className="mlp-btn-primary">Save Changes</button></div>
        </div>
      </form>
    </div>
  );
}

function FormSection({ icon, title, helper, children }: { icon: React.ReactNode; title: string; helper?: string; children: React.ReactNode }) {
  return <section className="mb-9"><h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold text-[#243447]"><span className="text-[#a64026]">{icon}</span>{title}</h2>{helper && <p className="mb-5 text-sm text-[#6b7c8f]">{helper}</p>}<div className="grid gap-4">{children}</div></section>;
}
