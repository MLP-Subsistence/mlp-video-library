import type { Metadata } from "next";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for the MLP Video Library."
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fa] text-[#243447]">
      <PublicHeader />
      <section className="mlp-container py-10 sm:py-14">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#e5e7eb] sm:p-10">
          <p className="text-sm font-extrabold uppercase tracking-wide text-[#a64026]">Marketplace Literacy Project</p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[#526579]">Effective date: September 12, 2026</p>

          <div className="mt-8 grid gap-8 text-base leading-relaxed text-[#526579]">
            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">What This App Does</h2>
              <p className="mt-3">
                MLP Video Library is an educator and facilitator resource library for Marketplace Literacy Project training content. The app stores resource titles, descriptions, categories, language labels, resource formats, thumbnails, transcripts or facilitator notes when provided, and YouTube links.
              </p>
              <p className="mt-3">
                The app does not download, reupload, sell, or host YouTube video files. Videos play through embedded YouTube players or open on YouTube.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Information We May Store</h2>
              <p className="mt-3">
                Public visitors can browse resources without creating an account. For authorized administrators whose access is provisioned by Marketplace Literacy Project, the app stores account information such as name, email address, role, password hash, and basic session information needed to authenticate the administrator and keep the admin area secure. The app does not offer public account registration.
              </p>
              <p className="mt-3">
                Hosting, database, and security services may keep standard technical logs such as IP address, browser type, requested pages, and timestamps for reliability and security.
              </p>
              <p className="mt-3">
                Administrators may choose to upload resource thumbnails and submit resource titles, descriptions, transcripts, notes, and other library metadata. Public visitors may optionally submit search terms when using the library search feature.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">How Information Is Used</h2>
              <p className="mt-3">
                We use information to operate the resource library, protect the admin area, organize learning resources, troubleshoot errors, and improve the reliability of the app.
              </p>
              <p className="mt-3">
                We do not sell personal information and we do not use the app for targeted advertising.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">YouTube Content</h2>
              <p className="mt-3">
                Embedded YouTube videos are provided by Google&apos;s YouTube service. Loading or playing an embedded video may send device, browser, page, and playback-interaction information to YouTube so it can render the player, determine playability, prevent abuse, personalize the experience where permitted, and measure or serve advertising. Embedded videos may display YouTube ads according to the video and channel settings. Marketplace Literacy Project does not include a separate advertising SDK in the Android app.
              </p>
              <p className="mt-3">
                You can avoid loading the embedded player by not opening or playing a video, or use the Open on YouTube option and review Google&apos;s privacy controls for your YouTube account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Service Providers And Sharing</h2>
              <p className="mt-3">
                We use contracted hosting, database, and security providers to operate the library. Those providers process information on our behalf under their service terms. YouTube processes information as a separate third-party service when its embedded player is loaded or used. We may also disclose information when required by law or when reasonably necessary to protect the security, rights, or safety of users, Marketplace Literacy Project, or others.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Retention And Deletion Requests</h2>
              <p className="mt-3">
                We retain administrator account information while access is authorized and retain uploaded library content until it is replaced or removed. Technical and security logs are retained only as long as reasonably needed for reliability, security, legal, and operational purposes, subject to provider retention practices.
              </p>
              <p className="mt-3">
                To request access to, correction of, or deletion of personal information associated with this app, email <a className="font-bold text-[#a64026]" href="mailto:admin@marketplaceliteracy.org?subject=Marketplace%20Literacy%20App%20data%20deletion%20request">admin@marketplaceliteracy.org</a> with the subject “Marketplace Literacy App data deletion request.” We may need to verify the requester&apos;s identity and may retain limited information when required for security, legal, or recordkeeping obligations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Children And Learners</h2>
              <p className="mt-3">
                The app is intended as a resource library for educators, facilitators, and learning programs. Public browsing does not require account creation. If your organization uses these resources with learners, please follow your local safeguarding and consent practices.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-extrabold text-[#243447]">Contact</h2>
              <p className="mt-3">
                For privacy questions, contact Marketplace Literacy Project at <a className="font-bold text-[#a64026]" href="mailto:admin@marketplaceliteracy.org">admin@marketplaceliteracy.org</a>.
              </p>
            </section>
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
