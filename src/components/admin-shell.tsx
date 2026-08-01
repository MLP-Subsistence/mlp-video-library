"use client";

/* eslint-disable @next/next/no-html-link-for-pages */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Clapperboard, DownloadCloud, ExternalLink, Globe2, Grid2X2, Home, LayoutDashboard, LogOut, Menu, PlaySquare, Settings, X } from "lucide-react";

const links = [
  ["/admin", "Dashboard", LayoutDashboard],
  ["/admin/videos", "Manage Resources", Clapperboard],
  ["/admin/languages", "Languages", Globe2],
  ["/admin/homepage", "Homepage Sections", Grid2X2],
  ["/admin/import", "Import from YouTube", DownloadCloud],
  ["/admin/settings", "Settings", Settings]
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = links.find(([href]) => href === "/admin" ? pathname === href : pathname.startsWith(href));
  const currentLabel = current?.[1] ?? "Admin";
  const isActive = (href: string) => href === "/admin" ? pathname === href : pathname.startsWith(href);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  return (
    <div className="admin-shell">
      <header className="fixed inset-x-0 top-0 z-40 h-14 border-b border-white/10 bg-[#0d1a2b] px-3 text-white shadow-sm sm:px-5">
        <div className="flex h-full items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMenuOpen(true)} className="grid size-10 place-items-center rounded-lg border border-white/15 bg-white/5 lg:hidden" aria-label="Open admin menu">
              <Menu className="size-5" />
            </button>
            <a href="/admin" className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-md border border-cyan-400/50 text-cyan-300"><PlaySquare className="size-4" /></span>
              <span className="text-sm font-extrabold sm:text-base">MLP Video Library</span>
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-[#d8532c] text-xs font-extrabold">AD</span>
            <span className="hidden text-sm font-bold sm:inline">Admin User</span>
          </div>
        </div>
      </header>
      <aside className="fixed bottom-0 left-0 top-14 hidden w-[230px] border-r border-[#e5e7eb] bg-white px-5 py-6 lg:block">
        <a href="/admin" className="mb-10 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg bg-[#a64026] text-white shadow-sm"><Home className="size-5" /></span>
          <span className="text-lg font-extrabold">MLP Admin</span>
        </a>
        <div className="mb-3 text-[10px] font-extrabold uppercase tracking-wide text-[#6b7c8f]">Main Menu</div>
        <nav className="space-y-2">
          {links.filter(([href]) => href !== "/admin/settings").map(([href, label, Icon]) => (
            <a key={href} href={href} className={`admin-sidebar-link ${isActive(href) ? "is-active" : ""}`}>
              <Icon className="size-4" /> {label}
            </a>
          ))}
        </nav>
        <div className="absolute bottom-6 left-5 right-5 space-y-2 border-t border-[#e5e7eb] pt-5">
          <a href="/admin/settings" className={`admin-sidebar-link ${isActive("/admin/settings") ? "is-active" : ""}`}><Settings className="size-4" /> Settings</a>
          <a href="/admin/logout" className="admin-sidebar-link"><LogOut className="size-4" /> Logout</a>
        </div>
      </aside>
      <div className="pt-14 lg:pl-[230px]">
        <div className="sticky top-14 z-30 border-b border-[#e5e7eb] bg-white/95 px-3 py-3 backdrop-blur sm:px-4 lg:px-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => window.history.back()} className="mlp-btn-outline h-10 px-3" title="Go back">
                <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back</span>
              </button>
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">MLP Admin</div>
                <div className="text-lg font-extrabold text-[#243447]">{currentLabel}</div>
              </div>
            </div>
            <a href="/resources" className="mlp-btn-outline h-10 px-3">
              <ExternalLink className="size-4" /> <span className="hidden sm:inline">Public Library</span>
            </a>
          </div>
          {menuOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button type="button" aria-label="Close admin menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-[#243447]/35" />
              <aside className="absolute inset-y-0 left-0 w-[min(88vw,320px)] overflow-y-auto bg-white p-5 shadow-2xl">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <a href="/admin" className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-[#a64026] text-white"><Home className="size-4" /></span>
                    <span className="font-extrabold">MLP Admin</span>
                  </a>
                  <button type="button" onClick={() => setMenuOpen(false)} className="mlp-btn-outline h-10 px-3" aria-label="Close admin menu"><X className="size-4" /></button>
                </div>
                <nav className="grid gap-2">
                  {links.map(([href, label, Icon]) => (
                    <a key={href} href={href} className={`admin-sidebar-link min-h-12 ${isActive(href) ? "is-active" : ""}`}>
                      <Icon className="size-4" /> {label}
                    </a>
                  ))}
                  <a href="/resources" className="admin-sidebar-link min-h-12"><Globe2 className="size-4" /> Public Library</a>
                  <a href="/admin/logout" className="admin-sidebar-link min-h-12"><LogOut className="size-4" /> Logout</a>
                </nav>
              </aside>
            </div>
          )}
        </div>
        <main className="min-h-screen px-3 py-5 sm:px-5 sm:py-7 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function Notice({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <div className={`mb-5 rounded-lg border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>
      {error || success}
    </div>
  );
}
