import Link from "next/link";
import { Clapperboard, GraduationCap } from "lucide-react";
import { PublicMobileNav } from "@/components/public-mobile-nav";
import { prisma } from "@/lib/prisma";

export async function PublicHeader() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return (
    <header className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white">
      <div className="mlp-container flex h-16 items-center justify-between gap-3 md:h-[76px] md:gap-6">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[#a64026] text-white md:size-11">
            <GraduationCap className="size-5" />
          </span>
          <span className="truncate text-lg font-extrabold tracking-tight text-[#243447] sm:text-[22px]">{settings?.siteTitle ?? "MLP Video Library"}</span>
        </Link>
        <nav className="hidden items-center gap-12 text-sm font-bold text-[#a64026] md:flex">
          <Link href="/">Home</Link>
          <Link href="/resources">Resources</Link>
          <Link href="/search">Search</Link>
        </nav>
        <div className="hidden items-center gap-4 md:flex">
          <div className="h-8 w-px bg-[#e5e7eb]" />
          <Link href="/studio" className="inline-flex h-[76px] items-center gap-2 rounded-b-lg border-x border-[#d8dde5] px-7 text-sm font-bold text-[#243447]">
            <Clapperboard className="size-4" /> Educator Studio
          </Link>
        </div>
        <PublicMobileNav />
      </div>
    </header>
  );
}
