"use client";

import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import type { TlxScanScope } from "@tlx/contracts";
import { useDashboardData } from "../_lib/dashboard-data";
import { issueArea } from "../_lib/format";
import { IssueList } from "./issues";
import { CommandButton, CopyButton, KeyValue, MetricCard, Panel, StatusPill } from "./ui";

const SCAN_SUITES = [
  { suite: "AABB overlap", target: "selected routes", status: "ready" },
  { suite: "Overflow + visual quality", target: "selected routes", status: "queued" },
  { suite: "WCAG + OKLCH + typography", target: "all changed", status: "ready" },
  { suite: "API fuzzing", target: "internal endpoints", status: "planned" },
];

export function TestsView() {
  const { project, graph, diff, report, scanning, selectedRoute, setSelectedRoute, selectedIssue, setSelectedIssue, runScan } = useDashboardData();
  const [selectedScope, setSelectedScope] = useState<TlxScanScope>("changed");
  const routes = graph.pages.length ? graph.pages.map((page) => page.route) : ["/"];
  const issues = report?.issues ?? [];
  const latestLog = useMemo(() => createRunnerLog(report, selectedScope, selectedRoute), [report, selectedRoute, selectedScope]);
  const scannedRoutes = report?.routes ?? [];

  function runSelectedScan() {
    return runScope(selectedScope);
  }

  function runScope(scope: TlxScanScope) {
    setSelectedScope(scope);
    return runScan(scope);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="space-y-4">
        <Panel title="Run scope">
          <div className="grid grid-cols-3 gap-2">
            <CommandButton active={selectedScope === "changed"} disabled={scanning} onClick={() => void runScope("changed")}>Changed</CommandButton>
            <CommandButton active={selectedScope === "all"} disabled={scanning} onClick={() => void runScope("all")}>All</CommandButton>
            <CommandButton active={selectedScope === "route"} disabled={scanning} onClick={() => void runScope("route")}>Route</CommandButton>
          </div>
        </Panel>

        <Panel title="Route target">
          <label className="field-label">Project URL</label>
          <input className="field" value={project?.projectUrl ?? ""} readOnly />
          <label className="field-label mt-3">Route</label>
          <select className="field" value={selectedRoute} onChange={(event) => setSelectedRoute(event.target.value)}>
            {routes.map((route) => <option key={route} value={route}>{route}</option>)}
          </select>
          <label className="field-label mt-3">Scanner</label>
          <select className="field" value="visual-quality" disabled>
            <option value="visual-quality">AABB + visual quality + WCAG + OKLCH</option>
          </select>
          <button className="primary-btn mt-4" disabled={scanning} onClick={() => void runSelectedScan()}>
            <Play size={16} />
            Run local test
          </button>
        </Panel>

        <Panel title="Cache diff">
          <div className="flex flex-wrap gap-2">
            <StatusPill label={`changed ${diff.changed.length}`} tone="warn" />
            <StatusPill label={`unknown ${diff.unknown.length}`} tone="info" />
            <StatusPill label={`deleted ${diff.deleted.length}`} tone={diff.deleted.length > 0 ? "bad" : "muted"} />
          </div>
        </Panel>
      </aside>

      <section className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="elements" value={String(report?.summary.elementsScanned ?? 0)} tone="info" />
          <MetricCard label="bugs" value={String(report?.summary.issuesFound ?? 0).padStart(2, "0")} tone={(report?.summary.issuesFound ?? 0) > 0 ? "bad" : "default"} />
          <MetricCard label="routes" value={String(report?.summary.routesScanned ?? 0)} tone="good" />
          <MetricCard label="screenshots" value={String(report?.summary.screenshotsCaptured ?? 0)} tone="warn" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Panel title="Execution queue">
            <div className="queue-progress"><span style={{ width: scanning ? "72%" : report ? "100%" : "18%" }} /></div>
            <div className="mt-4 grid gap-0">
              {SCAN_SUITES.map((item) => <QueueRow key={item.suite} {...item} />)}
            </div>
          </Panel>

          <Panel title="Latest report">
            <p className="text-[15px] leading-7 text-slate-400">Report ghi về <code>.tlx/latest-report.json</code>; screenshots nằm dưới <code>.tlx/screenshots/</code>.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill label={`pass ${Math.max(0, (report?.summary.routesScanned ?? 0) - (report?.summary.issuesFound ?? 0))}`} tone="good" />
              <StatusPill label={`fail ${report?.summary.issuesFound ?? 0}`} tone={(report?.summary.issuesFound ?? 0) > 0 ? "bad" : "muted"} />
            </div>
            <div className="mt-4"><CopyButton value={JSON.stringify({ summary: report?.summary ?? {}, routes: scannedRoutes }, null, 2)} label="Copy JSON summary" /></div>
          </Panel>
        </div>

        <Panel title="Runner log">
          <pre className="terminal-box">{latestLog}</pre>
        </Panel>
      </section>

      <aside className="space-y-4">
        <Panel title="Failure triage">
          <IssueList issues={issues.slice(0, 8)} selectedIssue={selectedIssue} onSelect={setSelectedIssue} />
        </Panel>
        <Panel title="Acceptance notes">
          <p className="text-[15px] leading-7 text-slate-400">Scanner giữ JSON sạch trên STDOUT; log/cảnh báo đi qua STDERR để Go host không vỡ IPC.</p>
        </Panel>
        <Panel title="Selected issue">
          {selectedIssue ? (
            <div className="space-y-2">
              <KeyValue label="Kind" value={selectedIssue.kind} />
              <KeyValue label="Route" value={selectedIssue.route} />
              <KeyValue label="Area" value={issueArea(selectedIssue)} />
            </div>
          ) : <p className="text-[15px] text-slate-500">No issue selected</p>}
        </Panel>
      </aside>
    </div>
  );
}

function QueueRow({ suite, target, status }: { suite: string; target: string; status: string }) {
  const tone = status === "ready" ? "text-emerald-300" : status === "queued" ? "text-amber-300" : "text-slate-500";
  return (
    <div className="queue-row">
      <span className="font-semibold text-slate-200">{suite}</span>
      <span className="text-slate-400">{target}</span>
      <span className={tone}>{status}</span>
    </div>
  );
}

function createRunnerLog(report: ReturnType<typeof useDashboardData>["report"], scope: TlxScanScope, route: string) {
  if (!report) return [`tlx worker waiting`, `scope: ${scope}`, `endpoint: POST /api/actions/scan`, `route: ${scope === "route" ? route : "n/a"}`].join("\n");
  return [
    "tlx worker complete",
    `report: ${report.id}`,
    `scope: ${report.scope}`,
    `routes: ${report.summary.routesScanned}`,
    `scanned: ${(report.routes ?? []).join(", ") || "none"}`,
    `elements: ${report.summary.elementsScanned}`,
    `issues: ${report.summary.issuesFound}`,
    `color score: ${report.colorAnalysis?.score ?? "n/a"}`,
    ...report.warnings.map((warning) => `warning: ${warning}`),
  ].join("\n");
}
