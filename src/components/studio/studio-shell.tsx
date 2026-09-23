"use client";

/* eslint-disable @next/next/no-html-link-for-pages */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AudioLines, CheckCircle2, Clapperboard, FolderKanban, Images, LayoutTemplate, Languages, Library, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useShellProject } from "@/components/studio/shell-project";

export type StudioShellUser = { name: string; roleLabel: string; canManageTemplates: boolean };

export type StudioShellProject = { id: string; title: string; language: string } | null;

type NavItem = { href: string; label: string; icon: typeof FolderKanban; exact?: boolean };

/**
 * Educator Studio chrome. Mirrors the admin shell (dark sidebar, brick
 * accent, white content) so the studio feels like another MLP module.
 */
/**
 * Desktop sidebar open/collapsed, remembered per browser. An external store
 * (not state-in-effect) so the server render and the first client render agree.
 */
const SIDEBAR_KEY = "mlp-studio-sidebar";
const sidebarListeners = new Set<() => void>();
function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}
function writeSidebarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
  } catch {
    /* private mode: stays for this page only */
  }
  for (const listener of sidebarListeners) listener();
}
function subscribeSidebar(listener: () => void) {
  sidebarListeners.add(listener);
  return () => sidebarListeners.delete(listener);
}

export function StudioShell({ user, children }: { user: StudioShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const project = useShellProject();
  const [menuOpen, setMenuOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const projectItems: NavItem[] = project
    ? [
        { href: `/studio/projects/${project.id}`, label: "Workspace", icon: Languages, exact: true },
        { href: `/studio/projects/${project.id}/voice`, label: "AI Voice", icon: AudioLines },
        { href: `/studio/projects/${project.id}/review`, label: "Review & Generate", icon: CheckCircle2 }
      ]
    : [];
  const managerItems: NavItem[] = user.canManageTemplates
    ? [
        { href: "/studio/templates", label: "Master Templates", icon: LayoutTemplate },
        { href: "/studio/assets", label: "Asset Library", icon: Images },
        { href: "/studio/voices", label: "Voice Library", icon: Library }
      ]
    : [];
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  const nav = (compact = false) => (
    <nav className="space-y-5">
      <div>
        <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[#6b7c8f]">Educator Studio</div>
        <Link href="/studio" className={`admin-sidebar-link ${compact ? "min-h-12" : ""} ${pathname === "/studio" ? "is-active" : ""}`}>
          <FolderKanban className="size-4" /> Projects
        </Link>
      </div>
      {project && (
        <div>
          <div className="mb-2 truncate text-[10px] font-extrabold uppercase tracking-wide text-[#6b7c8f]" title={project.title}>
            {project.title}
          </div>
          <div className="space-y-1">
            {projectItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={`admin-sidebar-link ${compact ? "min-h-12" : ""} ${isActive(item) ? "is-active" : ""}`}>
                  <Icon className="size-4" /> {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {managerItems.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[#6b7c8f]">Content Management</div>
          <div className="space-y-1">
            {managerItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={`admin-sidebar-link ${compact ? "min-h-12" : ""} ${isActive(item) ? "is-active" : ""}`}>
                  <Icon className="size-4" /> {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );

  return (
    <div className="admin-shell">
      <header className="fixed inset-x-0 top-0 z-40 h-14 border-b border-white/10 bg-[#0d1a2b] px-3 text-white shadow-sm sm:px-5">
        <div className="flex h-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? writeSidebarCollapsed(!collapsed) : setMenuOpen(true))}
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10"
              aria-label={collapsed ? "Show the studio menu" : "Hide the studio menu"}
              title={collapsed ? "Show menu" : "Hide menu (more room for the workspace)"}
            >
              {collapsed ? <PanelLeftOpen className="hidden size-5 lg:block" /> : <PanelLeftClose className="hidden size-5 lg:block" />}
              <Menu className="size-5 lg:hidden" />
            </button>
            <Link href="/studio" className="flex min-w-0 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#a64026] text-white"><Clapperboard className="size-4" /></span>
              <span className="truncate text-sm font-extrabold sm:text-base">Educator Studio</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-[#d8532c] text-xs font-extrabold" title={user.roleLabel}>{initials(user.name)}</span>
            <span className="hidden text-sm font-bold sm:inline">{user.name}</span>
          </div>
        </div>
      </header>

      {collapsed ? (
        <aside className="fixed bottom-0 left-0 top-14 hidden w-14 flex-col items-center gap-1 border-r border-[#e5e7eb] bg-white py-4 lg:flex" aria-label="Studio menu (collapsed)">
          <RailLink href="/studio" label="Projects" icon={FolderKanban} active={pathname === "/studio"} />
          {projectItems.length > 0 && <span className="my-2 h-px w-8 bg-[#e5e7eb]" />}
          {projectItems.map((item) => (
            <RailLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(item)} />
          ))}
          {managerItems.length > 0 && <span className="my-2 h-px w-8 bg-[#e5e7eb]" />}
          {managerItems.map((item) => (
            <RailLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(item)} />
          ))}
          <span className="flex-1" />
          <RailLink href="/resources" label="Public Library" icon={Images} plain />
          <RailLink href="/admin/logout" label="Logout" icon={LogOut} plain />
        </aside>
      ) : (
        <aside className="fixed bottom-0 left-0 top-14 hidden w-[230px] flex-col overflow-y-auto border-r border-[#e5e7eb] bg-white px-5 py-6 lg:flex">
          {nav()}
          <div className="mt-auto space-y-2 border-t border-[#e5e7eb] pt-5">
            <a href="/resources" className="admin-sidebar-link"><Images className="size-4" /> Public Library</a>
            <a href="/admin/logout" className="admin-sidebar-link"><LogOut className="size-4" /> Logout</a>
          </div>
        </aside>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close studio menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-[#243447]/35" />
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,320px)] overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-[#a64026] text-white"><Clapperboard className="size-4" /></span>
                <span className="font-extrabold">Educator Studio</span>
              </span>
              <button type="button" onClick={() => setMenuOpen(false)} className="mlp-btn-outline h-10 px-3" aria-label="Close studio menu"><X className="size-4" /></button>
            </div>
            {nav(true)}
            <div className="mt-5 space-y-2 border-t border-[#e5e7eb] pt-5">
              <a href="/resources" className="admin-sidebar-link min-h-12"><Images className="size-4" /> Public Library</a>
              <a href="/admin/logout" className="admin-sidebar-link min-h-12"><LogOut className="size-4" /> Logout</a>
            </div>
          </aside>
        </div>
      )}

      <div className={`pt-14 ${collapsed ? "lg:pl-14" : "lg:pl-[230px]"}`}>{children}</div>
    </div>
  );
}

/** Icon-only link for the collapsed sidebar; the label lives in the tooltip. */
function RailLink({ href, label, icon: Icon, active = false, plain = false }: { href: string; label: string; icon: NavItem["icon"]; active?: boolean; plain?: boolean }) {
  const className = `grid size-10 place-items-center rounded-lg ${active ? "bg-[#fbeaea] text-[#a64026]" : "text-[#526579] hover:bg-[#f2f4f7] hover:text-[#243447]"}`;
  return plain ? (
    <a href={href} className={className} title={label} aria-label={label}><Icon className="size-5" /></a>
  ) : (
    <Link href={href} className={className} title={label} aria-label={label} aria-current={active ? "page" : undefined}><Icon className="size-5" /></Link>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "ED";
}

export function StudioPageHeader({ title, subtitle, badge, actions, sticky = true }: { title: string; subtitle?: React.ReactNode; badge?: React.ReactNode; actions?: React.ReactNode; sticky?: boolean }) {
  return (
    <div className={`${sticky ? "sticky top-14" : "relative shrink-0"} z-30 border-b border-[#e5e7eb] bg-white/95 px-3 py-3 backdrop-blur sm:px-5 lg:px-8`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-extrabold text-[#243447] sm:text-xl">{title}</h1>
            {badge}
          </div>
          {subtitle && <div className="mt-0.5 text-sm text-[#6b7c8f]">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
