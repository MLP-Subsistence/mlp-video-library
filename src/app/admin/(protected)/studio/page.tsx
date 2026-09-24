import Link from "next/link";
import { AlertTriangle, Clapperboard, Coins, Users } from "lucide-react";
import { createStudioUserAction, deleteStudioUserAction, retryStudioJobAction, updateStudioSettingsAction, updateStudioUserAction } from "@/app/admin/studio-actions";
import { PageTitle, SaveButton, SelectField, TextArea, TextField } from "@/components/admin-form";
import { Notice } from "@/components/admin-shell";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { isAdminRole, getCurrentUser, roleLabel } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudioSettings } from "@/lib/studio/settings";
import { openAiConfigured } from "@/lib/studio/services/openai";
import { getVoiceProvider } from "@/lib/studio/services/voice-providers";

export const dynamic = "force-dynamic";

const tabs = [
  ["users", "Users & Credits", Users],
  ["settings", "Providers & Glossary", Coins],
  ["jobs", "Jobs & Usage", Clapperboard]
] as const;

export default async function AdminStudioPage({ searchParams }: { searchParams: Promise<{ tab?: string; success?: string; error?: string }> }) {
  const params = await searchParams;
  const tab = tabs.some(([key]) => key === params.tab) ? (params.tab as (typeof tabs)[number][0]) : "users";
  const me = await getCurrentUser();
  const admin = isAdminRole(me?.role);
  const [users, usage, settings, jobs, projects, ledger, playlists] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.studioVoiceUsage.groupBy({ by: ["userId"], _sum: { credits: true }, where: { status: { in: ["reserved", "charged"] } } }),
    getStudioSettings(),
    prisma.studioJob.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { project: { select: { title: true, targetLanguageName: true } }, createdBy: { select: { name: true } } } }),
    prisma.studioProject.count(),
    prisma.studioVoiceUsage.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { name: true } }, project: { select: { title: true } } } }),
    prisma.playlist.findMany({ where: { videos: { some: {} } }, include: { language: true }, orderBy: [{ language: { sortOrder: "asc" } }, { title: "asc" }] })
  ]);
  const usedByUser = new Map(usage.map((row) => [row.userId, row._sum.credits ?? 0]));
  const globalUsed = usage.reduce((sum, row) => sum + (row._sum.credits ?? 0), 0);
  const provider = getVoiceProvider(settings.voiceProvider);

  return (
    <div>
      <PageTitle title="Educator Studio" description={`${projects} localization project${projects === 1 ? "" : "s"} · manage educators, AI Voice allowances, providers and render jobs.`} />
      <Notice success={params.success} error={params.error} />
      {!admin && <Notice error="You can view this page, but only administrators can change users and settings." />}
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map(([key, label, Icon]) => (
          <Link key={key} href={`/admin/studio?tab=${key}`} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-bold ${tab === key ? "border-[#e5ccd0] bg-[#fbeaea] text-[#a64026]" : "border-[#d8dde5] bg-white text-[#526579]"}`}>
            <Icon className="size-4" /> {label}
          </Link>
        ))}
        <Link href="/studio" className="ml-auto mlp-btn-outline h-10">Open Educator Studio</Link>
      </div>

      {tab === "users" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Educators" value={users.filter((user) => user.role === "educator").length} />
            <Stat label="Content managers" value={users.filter((user) => user.role !== "admin" && user.role !== "educator").length} />
            <Stat label="Credits used (all users)" value={globalUsed.toLocaleString()} note={settings.globalCreditPool ? `of ${settings.globalCreditPool.toLocaleString()} global pool` : "no global cap"} />
          </div>
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-7">
            <h2 className="text-xl font-extrabold">Add a user</h2>
            <p className="mt-1 text-sm text-[#6b7c8f]">Educators use Educator Studio only. Content managers also build master templates and use /admin. Administrators manage everything.</p>
            <form action={createStudioUserAction} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <TextField label="Name" name="name" required />
              <TextField label="Email" name="email" type="email" required />
              <TextField label="Temporary password" name="password" type="password" required />
              <SelectField label="Role" name="role" defaultValue="educator">
                <option value="educator">Educator</option>
                <option value="editor">Content Manager</option>
                <option value="admin">Administrator</option>
              </SelectField>
              <TextField label="AI Voice credits" name="aiVoiceCreditLimit" type="number" defaultValue={20000} />
              <div className="md:col-span-2 xl:col-span-5"><SaveButton label="Create user" disabled={!admin} /></div>
            </form>
          </section>
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-7">
            <h2 className="mb-4 text-xl font-extrabold">Users</h2>
            <div className="space-y-3">
              {users.map((user) => {
                const used = usedByUser.get(user.id) ?? 0;
                return (
                  <div key={user.id} className="rounded-xl border border-[#edf0f3] p-4">
                  <form action={updateStudioUserAction} className="grid gap-3 md:grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_auto] md:items-end">
                    <input type="hidden" name="id" value={user.id} />
                    <TextField label="Name" name="name" defaultValue={user.name} />
                    <label className="block"><span className="mb-1 block font-semibold">Email</span><input readOnly value={user.email} className="h-11 w-full rounded-lg border border-[#d8dde5] bg-[#f7f8fa] px-3 text-[#526579]" /></label>
                    <SelectField label="Role" name="role" defaultValue={user.role === "admin" ? "admin" : user.role === "educator" ? "educator" : "editor"}>
                      <option value="educator">Educator</option>
                      <option value="editor">Content Manager</option>
                      <option value="admin">Administrator</option>
                    </SelectField>
                    <label className="block">
                      <span className="mb-1 block font-semibold">AI Voice credits</span>
                      <input name="aiVoiceCreditLimit" type="number" defaultValue={user.aiVoiceCreditLimit} className="h-11 w-full rounded-lg border border-[#d8dde5] bg-white px-3 shadow-sm" />
                      <span className="mt-1 block text-xs text-[#6b7c8f]">{used.toLocaleString()} used · {Math.max(0, user.aiVoiceCreditLimit - used).toLocaleString()} left</span>
                    </label>
                    <TextField label="New password (optional)" name="password" type="password" />
                    <div className="flex items-end gap-2">
                      <PendingSubmitButton disabled={!admin} className="mlp-btn-primary h-11 px-4" pendingLabel="Saving...">Save</PendingSubmitButton>
                    </div>
                  </form>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-[#8b9bad]">{roleLabel(user.role)} · joined {user.createdAt.toLocaleDateString()}</p>
                    {admin && user.id !== me?.id && (
                      <form action={deleteStudioUserAction}><input type="hidden" name="id" value={user.id} /><ConfirmDeleteButton compact message={`Remove ${user.name}? They will no longer be able to sign in.`} /></form>
                    )}
                  </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Translation (OpenAI)" value={openAiConfigured() ? "Configured" : "Missing key"} note="OPENAI_API_KEY on the server" warn={!openAiConfigured()} />
            <Stat label="AI Voice provider" value={provider.id === "mock" ? "Placeholder" : "ElevenLabs"} note={provider.configured() ? "ready" : "ELEVENLABS_API_KEY missing"} warn={!provider.configured()} />
            <Stat label="Alignment (transcription)" value={openAiConfigured() ? settings.transcriptionModel : "Proportional only"} note="runs in the worker" warn={!openAiConfigured()} />
          </div>
          <form action={updateStudioSettingsAction} className="grid gap-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-7 md:grid-cols-2">
            <SelectField label="AI Voice provider" name="voiceProvider" defaultValue={settings.voiceProvider}>
              <option value="mock">Placeholder voice (development / no billing)</option>
              <option value="elevenlabs">ElevenLabs (requires ELEVENLABS_API_KEY)</option>
            </SelectField>
            <TextField label="Voice model" name="voiceModel" defaultValue={settings.voiceModel} />
            <TextField label="Translation model (gpt-4.1 recommended; the old default gpt-4.1-mini is upgraded to it automatically)" name="translationModel" defaultValue={settings.translationModel} />
            <TextField label="Transcription model (full narration alignment)" name="transcriptionModel" defaultValue={settings.transcriptionModel} />
            <TextField label="Global AI Voice credit pool (0 = no cap)" name="globalCreditPool" type="number" defaultValue={settings.globalCreditPool} />
            <SelectField label="Main lesson playlist (shown first in New Localization)" name="defaultPlaylistId" defaultValue={settings.defaultPlaylistId ?? ""}>
              <option value="">No default</option>
              {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.title}{playlist.language ? ` (${playlist.language.name})` : ""}</option>)}
            </SelectField>
            <TextArea label="Shared glossary — one term per line, optionally 'term = preferred translation'" name="glossary" defaultValue={settings.glossary} />
            <div className="md:col-span-2"><SaveButton label="Save studio settings" disabled={!admin} /></div>
          </form>
          <p className="text-xs text-[#6b7c8f]">Provider keys are never stored in the database. Set OPENAI_API_KEY, ELEVENLABS_API_KEY and storage variables in the hosting environment (see docs/educator-studio/DEPLOYMENT.md).</p>
        </div>
      )}

      {tab === "jobs" && (
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-7">
            <h2 className="text-xl font-extrabold">Recent jobs</h2>
            <p className="mt-1 text-sm text-[#6b7c8f]">Render and alignment jobs run in the studio worker. Technical details are only shown here.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-[#edf0f3] text-[11px] uppercase tracking-wide text-[#526579]"><tr><th className="py-2 pr-3">Job</th><th className="py-2 pr-3">Project</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Stage</th><th className="py-2 pr-3">By</th><th className="py-2 pr-3">Created</th><th className="py-2" /></tr></thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b border-[#f2f4f7] align-top">
                      <td className="py-2 pr-3 font-bold">{job.type}<div className="text-[11px] font-normal text-[#8b9bad]">{job.id.slice(0, 10)}</div></td>
                      <td className="py-2 pr-3">{job.project.title}<div className="text-xs text-[#6b7c8f]">{job.project.targetLanguageName}</div></td>
                      <td className="py-2 pr-3"><span className={`rounded px-2 py-0.5 text-[11px] font-extrabold uppercase ${job.status === "complete" ? "bg-green-50 text-green-700" : job.status === "failed" ? "bg-red-50 text-red-700" : "bg-[#f2f4f7] text-[#526579]"}`}>{job.status}</span><div className="text-xs text-[#6b7c8f]">{job.progress}%</div></td>
                      <td className="py-2 pr-3 text-xs text-[#526579]">{job.stage}{job.errorDetail && <details className="mt-1"><summary className="cursor-pointer font-bold text-red-700">Technical details</summary><pre className="mt-1 max-h-40 max-w-md overflow-auto whitespace-pre-wrap rounded bg-[#f7f8fa] p-2 text-[11px]">{job.errorDetail}</pre></details>}</td>
                      <td className="py-2 pr-3 text-xs">{job.createdBy?.name ?? "—"}{job.lockedBy && <div className="text-[#8b9bad]">worker {job.lockedBy}</div>}</td>
                      <td className="py-2 pr-3 text-xs text-[#6b7c8f]">{job.createdAt.toLocaleString()}</td>
                      <td className="py-2 text-right">{(job.status === "failed" || job.status === "cancelled") && admin && (
                        <form action={retryStudioJobAction}><input type="hidden" name="id" value={job.id} /><PendingSubmitButton className="mlp-btn-outline h-9 px-3 text-xs" pendingLabel="Queuing...">Retry</PendingSubmitButton></form>
                      )}</td>
                    </tr>
                  ))}
                  {jobs.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-sm text-[#6b7c8f]">No jobs yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3] sm:p-7">
            <h2 className="text-xl font-extrabold">AI Voice usage ledger</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-[#edf0f3] text-[11px] uppercase tracking-wide text-[#526579]"><tr><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Educator</th><th className="py-2 pr-3">Project</th><th className="py-2 pr-3">Language</th><th className="py-2 pr-3">Voice / model</th><th className="py-2 pr-3 text-right">Characters</th><th className="py-2 pr-3 text-right">Credits</th><th className="py-2">Status</th></tr></thead>
                <tbody>
                  {ledger.map((row) => (
                    <tr key={row.id} className="border-b border-[#f2f4f7]">
                      <td className="py-2 pr-3 text-xs text-[#6b7c8f]">{row.createdAt.toLocaleString()}</td>
                      <td className="py-2 pr-3">{row.user.name}</td>
                      <td className="py-2 pr-3">{row.project.title}</td>
                      <td className="py-2 pr-3">{row.languageCode}</td>
                      <td className="py-2 pr-3 text-xs">{row.voiceId}<div className="text-[#8b9bad]">{row.provider} · {row.model}{row.isRetry ? " · retry" : ""}</div></td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.characters.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.credits.toLocaleString()}</td>
                      <td className="py-2 text-xs font-bold">{row.status}</td>
                    </tr>
                  ))}
                  {ledger.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-sm text-[#6b7c8f]">No AI Voice usage yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, note, warn }: { label: string; value: string | number; note?: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#edf0f3]">
      <div className="flex items-center gap-2 text-sm font-bold text-[#526579]">{warn && <AlertTriangle className="size-4 text-amber-600" />}{label}</div>
      <div className="mt-2 text-2xl font-extrabold">{value}</div>
      {note && <div className="mt-1 text-xs text-[#6b7c8f]">{note}</div>}
    </div>
  );
}
