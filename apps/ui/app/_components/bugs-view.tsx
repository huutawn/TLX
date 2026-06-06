"use client";

import { Filter } from "lucide-react";
import { useMemo, useState } from "react";
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
  const filteredIssues = issues.filter((issue) => (kindFilter === "all" || issue.kind === kindFilter) && (viewportFilter === "all" || issueViewport(issue) === viewportFilter));
  const activeIssue = selectedIssue && filteredIssues.some((issue) => issue.id === selectedIssue.id) ? selectedIssue : filteredIssues[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[284px_minmax(0,1fr)_360px]">
      <aside className="space-y-4">
        <Panel title="Issues">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="filter-select">
              <Filter size={14} />
              <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                <option value="all">All kinds</option>
                {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
              </select>
            </label>
            <label className="filter-select">
              <Filter size={14} />
              <select value={viewportFilter} onChange={(event) => setViewportFilter(event.target.value)}>
                <option value="all">All viewports</option>
                {viewports.map((viewport) => <option key={viewport} value={viewport}>{viewport}</option>)}
              </select>
            </label>
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
