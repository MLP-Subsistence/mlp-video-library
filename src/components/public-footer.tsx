import Link from "next/link";
import { Circle, Globe, GraduationCap, Play } from "lucide-react";
import { prisma } from "@/lib/prisma";

export async function PublicFooter() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return (
    <>
      {/* Grows to push the footer to the bottom of short pages; 3.5rem gap otherwise. */}
      <div aria-hidden className="min-h-14 flex-1" />
      <footer className="bg-[#624237] text-white">
        <div className="mlp-container grid gap-8 py-9 sm:py-10 md:grid-cols-[1.4fr_1fr_1fr] md:gap-10">
          <div>
            <div className="mb-4 flex items-center gap-2 text-lg font-extrabold">
              <GraduationCap className="size-5" />{" "}
              {settings?.siteTitle ?? "MLP Video Library"}
            </div>
            <p className="max-w-md text-[15px] leading-relaxed text-white/90 sm:text-base">
              {settings?.footerText ?? settings?.siteDescription}
            </p>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-extrabold">Resources</h3>
            <div className="grid gap-2 text-[15px] leading-relaxed text-white/90 sm:text-base">
              <Link
                href={
                  settings?.websiteUrl ?? "https://www.marketplaceliteracy.org"
                }
              >
                About MLP
              </Link>
              <Link href="/">Subsistence Marketplaces</Link>
              <Link
                href={`mailto:${settings?.contactEmail ?? "admin@marketplaceliteracy.org"}`}
              >
                Contact Us
              </Link>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-extrabold">Connect</h3>
            <div className="flex gap-4">
              <Link href="/" aria-label="Facebook">
                <Circle className="size-5 fill-white" />
              </Link>
              <Link
                href={settings?.youtubeChannelUrl ?? "https://www.youtube.com"}
                aria-label="YouTube"
              >
                <Play className="size-5 fill-white" />
              </Link>
              <Link
                href={
                  settings?.websiteUrl ?? "https://www.marketplaceliteracy.org"
                }
                aria-label="Website"
              >
                <Globe className="size-5" />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
