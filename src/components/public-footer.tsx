import Link from "next/link";
import { Circle, Globe, GraduationCap, Play } from "lucide-react";
import { prisma } from "@/lib/prisma";

export async function PublicFooter() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return (
    <footer className="mt-14 bg-[#624237] text-white">
      <div className="mlp-container grid gap-8 py-9 sm:py-10 md:grid-cols-[1.4fr_1fr_1fr] md:gap-10">
        <div>
          <div className="mb-4 flex items-center gap-2 font-extrabold">
            <GraduationCap className="size-5" /> {settings?.siteTitle ?? "MLP Video Library"}
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-white/80">{settings?.footerText ?? settings?.siteDescription}</p>
        </div>
        <div>
          <h3 className="mb-4 font-extrabold">Resources</h3>
          <div className="grid gap-2 text-sm text-white/85">
            <Link href={settings?.websiteUrl ?? "https://www.marketplaceliteracy.org"}>About MLP</Link>
            <Link href="/">Subsistence Marketplaces</Link>
            <Link href={`mailto:${settings?.contactEmail ?? "admin@marketplaceliteracy.org"}`}>Contact Us</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
          </div>
        </div>
        <div>
          <h3 className="mb-4 font-extrabold">Connect</h3>
          <div className="flex gap-4">
            <Link href="/" aria-label="Facebook"><Circle className="size-5 fill-white" /></Link>
            <Link href={settings?.youtubeChannelUrl ?? "https://www.youtube.com"} aria-label="YouTube"><Play className="size-5 fill-white" /></Link>
            <Link href={settings?.websiteUrl ?? "https://www.marketplaceliteracy.org"} aria-label="Website"><Globe className="size-5" /></Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
