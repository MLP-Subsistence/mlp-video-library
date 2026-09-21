"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Clapperboard, GraduationCap, Home, Menu, Search, X } from "lucide-react";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/resources", label: "Browse Resources", icon: GraduationCap },
  { href: "/search", label: "Search Library", icon: Search }
];

export function PublicMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isResourceRoute = pathname.startsWith("/resources/") || pathname.startsWith("/videos/");

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-11 place-items-center rounded-lg border border-[#d8dde5] bg-white text-[#243447]"
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 top-16 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-[#243447]/45"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-[calc(100vh-64px)] w-[min(86vw,340px)] overflow-y-auto bg-white shadow-2xl ring-1 ring-[#d8dde5]">
            <div className="sticky top-0 border-b border-[#edf0f3] bg-white p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#a64026] text-white">
                    <GraduationCap className="size-5" />
                  </span>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-[#a64026]">MLP Video Library</p>
                    <p className="text-xl font-extrabold text-[#243447]">Menu</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid size-10 place-items-center rounded-lg border border-[#d8dde5] text-[#243447]"
                  aria-label="Close navigation menu"
                >
                  <X className="size-5" />
                </button>
              </div>
              <p className="text-sm leading-relaxed text-[#6b7c8f]">
                Browse by language and resource format, then open a resource.
              </p>
            </div>

            <div className="space-y-4 p-5">
              {isResourceRoute && (
                <button type="button" onClick={() => window.history.back()} className="mlp-drawer-link w-full">
                  <ArrowLeft className="size-5" /> Back to previous level
                </button>
              )}

              <div className="space-y-2">
                <p className="px-1 text-xs font-extrabold uppercase tracking-wide text-[#8b9bad]">Navigation</p>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href === "/resources" && pathname.startsWith("/resources"));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`mlp-drawer-link ${active ? "is-active" : ""}`}
                    >
                      <Icon className="size-5" /> {item.label}
                    </Link>
                  );
                })}
              </div>

              <div className="rounded-xl bg-[#f7f8fa] p-4 ring-1 ring-[#edf0f3]">
                <p className="text-sm font-extrabold text-[#243447]">For educators</p>
                <p className="mt-1 text-sm leading-relaxed text-[#6b7c8f]">Create and manage localized Marketplace Literacy lessons in your language.</p>
                <Link href="/studio" onClick={() => setOpen(false)} className="mlp-btn-primary mt-4 w-full">
                  <Clapperboard className="size-4" /> Educator Studio
                </Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
