import Link from "next/link";
import { ArrowLeft, BookOpen, ExternalLink, LifeBuoy, MonitorPlay, ShieldCheck } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";

const helpItems = [
  {
    title: "Browse the library",
    icon: BookOpen,
    text: "Choose a language, choose a resource format, then open the matching clips and facilitator resources."
  },
  {
    title: "Watch YouTube clips",
    icon: MonitorPlay,
    text: "Videos are embedded from YouTube. The app stores links and metadata only, so no video files are downloaded or hosted here."
  },
  {
    title: "Admin access",
    icon: ShieldCheck,
    text: "MLP staff can sign in from the admin area to import playlists, manage resources, and update library settings."
  },
  {
    title: "Desktop help",
    icon: LifeBuoy,
    text: "If the desktop app opens the offline screen, retry from the help panel. For YouTube playlist import, place an mlp.env file beside the app with a server-side YouTube API key."
  }
];

export default function HelpPage() {
  return (
    <main className="mlp-page">
      <PublicHeader />
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 shadow-sm transition hover:border-[#a64026]/30 hover:text-[#a64026]"
        >
          <ArrowLeft className="size-4" /> Back to Library
        </Link>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#a64026]">MLP Video Library</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-5xl">Help and Offline Support</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
            This resource library is built for educators, facilitators, and Marketplace Literacy programs. Use this page
            when you need a quick orientation or when the Windows app cannot reach the local library server.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {helpItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-[#fbeaea] text-[#a64026]">
                    <Icon className="size-5" />
                  </div>
                  <h2 className="text-xl font-black text-slate-900">{item.title}</h2>
                  <p className="mt-2 leading-7 text-slate-600">{item.text}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/resources"
              className="inline-flex items-center justify-center rounded-xl bg-[#a64026] px-5 py-3 font-extrabold text-white shadow-sm transition hover:bg-[#87341f]"
            >
              Browse Resources
            </Link>
            <a
              href="https://marketplaceliteracyapp.org"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-extrabold text-slate-800 shadow-sm transition hover:border-[#a64026]/30 hover:text-[#a64026]"
            >
              Open Public Website <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
