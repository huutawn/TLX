"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bug, FlaskConical, LayoutDashboard, Map, Menu, PanelLeftClose, PanelLeftOpen, RefreshCw, Server } from "lucide-react";
import { useMemo, useState } from "react";
import { useDashboardData } from "../_lib/dashboard-data";
import { StatusPill } from "./ui";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview", short: "OVR", icon: LayoutDashboard },
  { href: "/map", label: "Node Pages", short: "MAP", icon: Map },
  { href: "/tests", label: "Tests", short: "TST", icon: FlaskConical },
  { href: "/bugs", label: "Bugs", short: "BUG", icon: Bug },
  { href: "#", label: "DevOps", short: "OPS", icon: Server, disabled: true },
];

const PAGE_META: Record<string, { title: string; eyebrow: string; subtitle: string }> = {
  overview: { title: "Main dashboard overview", eyebrow: "Current PR context", subtitle: "Project health, graph summary, local worker contract" },
  map: { title: "Node Pages", eyebrow: "Project map", subtitle: "Pages, components, API calls, impact heatmap" },
  tests: { title: "Test Runner", eyebrow: "Local testing suite", subtitle: "Changed-only, Playwright UI/UX, SAST va API contract" },
  bugs: { title: "Visual Bug Highlight", eyebrow: "Visual triage", subtitle: "Screenshot overlay, bounding box, contrast metadata" },
};

export function DashboardShell({ view, children }: { view: keyof typeof PAGE_META; children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, diff, report, error, loading, refresh } = useDashboardData();
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = (PAGE_META[view] ?? PAGE_META.overview)!;

  const statusPills = useMemo(() => {
    const issues = report?.summary.issuesFound ?? 0;
    return [
      <StatusPill key="engine" label={status?.status === "active" ? "Engine active" : loading ? "Loading engine" : "Engine unknown"} tone={status?.status === "active" ? "good" : "warn"} />,
      <StatusPill key="checks" label={`${diff.changed.length + diff.unknown.length} queued checks`} tone="warn" />,
      <StatusPill key="issues" label={`${issues} visual issues`} tone={issues > 0 ? "bad" : "muted"} />,
    ];
  }, [diff.changed.length, diff.unknown.length, loading, report?.summary.issuesFound, status?.status]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <aside className={`dashboard-sidebar ${expanded ? "sidebar-expanded" : "sidebar-collapsed"}`}>
        <SidebarContent expanded={expanded} pathname={pathname} onToggle={() => setExpanded((value) => !value)} />
      </aside>

      <div className="lg:hidden fixed left-3 top-3 z-40">
        <button className="icon-btn" title="Open navigation" onClick={() => setMobileOpen(true)}>
          <Menu size={20} />
        </button>
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-[284px] border-r border-slate-800 bg-slate-950 p-3" onClick={(event) => event.stopPropagation()}>
            <SidebarContent expanded pathname={pathname} onToggle={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <section className={`dashboard-content ${expanded ? "content-expanded" : "content-collapsed"}`}>
        <header className="dashboard-header">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-500">{meta.eyebrow}</p>
            <h1 className="mt-1 max-w-[680px] text-2xl font-black leading-tight tracking-normal text-slate-100 md:text-[32px]">{meta.title}</h1>
            <p className="mt-1 text-[15px] text-slate-400">{meta.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {statusPills}
            <button className="icon-btn" title="Refresh dashboard" onClick={() => void refresh()}>
              <RefreshCw size={18} />
            </button>
          </div>
        </header>
        {error ? <div className="mx-4 mt-4 rounded-md border border-rose-500/50 bg-rose-950/60 px-4 py-3 text-[15px] text-rose-100 md:mx-6">{error}</div> : null}
        <div className="p-4 md:p-6">{children}</div>
      </section>
    </main>
  );
}

function SidebarContent({ expanded, pathname, onToggle }: { expanded: boolean; pathname: string; onToggle: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/overview" className="brand-mark" title="TLX Dashboard">
          TLX
        </Link>
        {expanded ? <span className="min-w-0 flex-1 text-[15px] font-bold text-slate-200">TLX Dashboard</span> : null}
        <button className="icon-btn hidden lg:inline-flex" title={expanded ? "Collapse sidebar" : "Expand sidebar"} onClick={onToggle}>
          {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      <nav className="grid gap-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = !item.disabled && (pathname === item.href || (pathname === "/" && item.href === "/overview"));
          const content = (
            <>
              <Icon size={20} />
              {expanded ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
              {!expanded ? <span className="nav-short">{item.short}</span> : null}
            </>
          );

          if (item.disabled) {
            return (
              <span key={item.label} className="nav-item nav-disabled" title="Planned">
                {content}
              </span>
            );
          }

          return (
            <Link key={item.href} href={item.href} className={`nav-item ${active ? "nav-active" : ""}`} title={item.label}>
              {content}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-md border border-slate-800 bg-slate-900/50 p-3 text-[12px] text-slate-500">
        {expanded ? "Local-first dashboard" : "LOC"}
      </div>
    </div>
  );
}
