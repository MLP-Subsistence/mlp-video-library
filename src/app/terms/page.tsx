import type { Metadata } from "next";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for the MLP Video Library."
};

export default function TermsPage() {
  return (
    <main className="mlp-page">
      <PublicHeader />
      <section className="mlp-container max-w-5xl py-10 sm:py-14">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#e5e7eb] sm:p-10">
          <p className="text-sm font-extrabold uppercase tracking-wide text-[#a64026]">Marketplace Literacy Project</p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-5xl">Terms of Service</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[#526579]">Effective date: August 2, 2026</p>

          <div className="mt-8 grid gap-8 text-base leading-relaxed text-[#526579]">
            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Purpose</h2>
              <p className="mt-3">
                MLP Video Library provides organized Marketplace Literacy Project resources for educators, facilitators, and learning programs. The public library can be used to browse resources by language and resource format.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">YouTube Links And Embedded Videos</h2>
              <p className="mt-3">
                The app stores and displays links, metadata, thumbnails, transcripts, and notes. It does not download, reupload, sell, or host YouTube video files. Video playback is provided through YouTube embeds or links that open on YouTube.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Administrator Access</h2>
              <p className="mt-3">
                The admin area is only for authorized Marketplace Literacy Project staff or approved partners. Administrators are responsible for keeping login details secure, using accurate resource information, and only publishing content they are authorized to manage.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Content Accuracy</h2>
              <p className="mt-3">
                We work to keep the library organized and useful, but resource titles, descriptions, links, or availability may change over time. YouTube videos may become unavailable if the original YouTube content changes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Acceptable Use</h2>
              <p className="mt-3">
                Do not misuse the app, attempt to access the admin area without permission, interfere with the app&apos;s operation, or use the resources in a way that violates applicable law or third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Contact</h2>
              <p className="mt-3">
                For questions about these terms, contact Marketplace Literacy Project at <a className="font-bold text-[#a64026]" href="mailto:admin@marketplaceliteracy.org">admin@marketplaceliteracy.org</a>.
              </p>
            </section>
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
