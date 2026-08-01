import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, LayoutGrid, PlaySquare, Settings } from "lucide-react";

export default function HomepageAdminPage() {
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#6b7c8f]">MLP Admin</p>
          <h1 className="mt-2 text-3xl font-extrabold">Homepage</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6b7c8f]">
            The public homepage is now generated from published languages, resource formats, and resources. Use the resource manager to control what visitors see.
          </p>
        </div>
        <Link href="/resources" className="mlp-btn-outline">
          <ExternalLink className="size-4" /> Public Library
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ActionCard
          href="/admin/videos"
          icon={<PlaySquare className="size-6" />}
          title="Manage Resources"
          description="Add, edit, publish, hide, and reorder the resources shown in the public library."
        />
        <ActionCard
          href="/admin/languages"
          icon={<LayoutGrid className="size-6" />}
          title="Manage Languages"
          description="Update language labels, thumbnails, display order, and active status."
        />
        <ActionCard
          href="/admin/settings"
          icon={<Settings className="size-6" />}
          title="Library Settings"
          description="Edit the site title, footer text, contact links, and public branding details."
        />
      </div>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#edf0f3] sm:p-8">
        <h2 className="text-xl font-extrabold">Public Display Rules</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Rule number="1" title="Language" text="Visitors start by choosing a language." />
          <Rule number="2" title="Resource Format" text="They then choose the style or format of resource they need." />
          <Rule number="3" title="Resource" text="Published resources appear directly for watching or opening." />
        </div>
      </section>
    </div>
  );
}

function ActionCard({ href, icon, title, description }: { href: string; icon: ReactNode; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#edf0f3] transition hover:-translate-y-0.5 hover:shadow-md">
      <span className="grid size-12 place-items-center rounded-xl bg-[#fbeaea] text-[#a64026]">{icon}</span>
      <h2 className="mt-5 text-xl font-extrabold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#6b7c8f]">{description}</p>
    </Link>
  );
}

function Rule({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-[#edf0f3] bg-[#fbfcfd] p-5">
      <div className="grid size-9 place-items-center rounded-full bg-[#a64026] text-sm font-extrabold text-white">{number}</div>
      <h3 className="mt-4 font-extrabold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#6b7c8f]">{text}</p>
    </div>
  );
}
