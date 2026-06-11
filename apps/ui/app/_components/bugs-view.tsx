"use client";

import { Check, ChevronDown, Filter } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDashboardData } from "../_lib/dashboard-data";
import { issueViewport, screenshotUrl } from "../_lib/format";
import { IssueInspector, IssueList, ScreenshotViewer } from "./issues";
import { EmptyState, KeyValue, Panel, StatusPill } from "./ui";

export function BugsView() {
  const { report, selectedIssue, setSelectedIssue } = useDashboardData();
  const [kindFilter, setKindFilter] = useState("all");
  const [viewportFilter, setViewportFilter] = useState("all");
  const issues = useMemo(() => report?.issues ?? [], [report?.issues]);
  const viewports = useMemo(() => [...new Set(issues.map(issueViewport))], [issues]);
  const kinds = useMemo(() => [...new Set(issues.map((issue) => issue.kind))], [issues]);
  const kindOptions = useMemo(() => [{ value: "all", label: "All kinds" }, ...kinds.map((kind) => ({ value: kind, label: kind }))], [kinds]);
  const viewportOptions = useMemo(() => [{ value: "all", label: "All viewports" }, ...viewports.map((viewport) => ({ value: viewport, label: viewport }))], [viewports]);
  const filteredIssues = issues.filter((issue) => (kindFilter === "all" || issue.kind === kindFilter) && (viewportFilter === "all" || issueViewport(issue) === viewportFilter));
  const activeIssue = (selectedIssue ? filteredIssues.find((issue) => issue.id === selectedIssue.id) : undefined) ?? filteredIssues[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[284px_minmax(0,1fr)_360px]">
      <aside className="space-y-4">
        <Panel title="Issues">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <FilterDropdown ariaLabel="Filter issue kind" value={kindFilter} options={kindOptions} onChange={setKindFilter} />
            <FilterDropdown ariaLabel="Filter issue viewport" value={viewportFilter} options={viewportOptions} onChange={setViewportFilter} />
          </div>
          <IssueList issues={filteredIssues} selectedIssue={activeIssue} onSelect={setSelectedIssue} />
        </Panel>

        <Panel title="Screenshot source">
          {activeIssue ? (
            <div className="space-y-3">
              <StatusPill label={screenshotUrl(activeIssue) ? "screenshot ready" : "no screenshot"} tone={screenshotUrl(activeIssue) ? "good" : "warn"} />
              <p className="break-all text-[14px] leading-6 text-slate-400">{activeIssue.screenshotPath ?? ".tlx/screenshots"}</p>
            </div>
          ) : (
            <EmptyState title="No screenshot" detail="Run scan to create report screenshots." />
          )}
        </Panel>
      </aside>

      <section className="space-y-4">
        <Panel title="Screenshot overlay" className="min-h-[640px]">
          <ScreenshotViewer issue={activeIssue} />
        </Panel>
      </section>

      <aside>
        <IssueInspector issue={activeIssue} />
        {activeIssue ? (
          <section className="panel mt-4">
            <h3 className="mb-3 text-[15px] font-bold text-slate-100">Quick fields</h3>
            <KeyValue label="Route" value={activeIssue.route} />
            <KeyValue label="Viewport" value={issueViewport(activeIssue)} />
            <KeyValue label="Severity" value={activeIssue.severity} />
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function FilterDropdown({ ariaLabel, value, options, onChange }: { ariaLabel: string; value: string; options: { value: string; label: string }[]; onChange(value: string): void }) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    function closeFromDocument(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeFromDocument);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromDocument);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <div className="filter-dropdown" ref={rootRef}>
      <button className="filter-dropdown-button" type="button" aria-label={ariaLabel} aria-expanded={open} aria-controls={listboxId} aria-haspopup="listbox" onClick={() => setOpen((current) => !current)}>
        <Filter size={14} />
        <span className="min-w-0 flex-1 truncate text-left">{selectedOption?.label}</span>
        <ChevronDown className={open ? "rotate-180" : ""} size={14} />
      </button>
      {open ? (
        <div className="filter-dropdown-menu" id={listboxId} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button key={option.value} className={`filter-dropdown-option ${selected ? "filter-dropdown-option-active" : ""}`} type="button" role="option" aria-selected={selected} onClick={() => { onChange(option.value); setOpen(false); }}>
                <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                {selected ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
