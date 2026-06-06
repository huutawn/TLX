"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useDashboardData } from "../_lib/dashboard-data";
import { compactPath, formatUptime } from "../_lib/format";
import { findGraphNode, ProjectGraph } from "./project-graph";
import { CommandButton, CopyButton, EmptyState, KeyValue, MetricCard, Panel, StatusPill } from "./ui";

export function OverviewView() {
  const { status, project, graph, diff, report, selectedNodeId, setSelectedNodeId, runScan, scanning } = useDashboardData();
  const [search, setSearch] = useState("");
  const selectedNode = findGraphNode(graph, selectedNodeId);
  const issueRoutes = useMemo(() => new Set(report?.issues.map((issue) => issue.route) ?? []), [report?.issues]);
  const affectedRoutes = useMemo(() => new Set(diff.affectedRoutes), [diff.affectedRoutes]);

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
      <section className="space-y-4">
        <Panel title="Project context">
          <KeyValue label="Framework" value={project?.framework ?? status?.framework ?? "-"} />
          <KeyValue label="Project URL" value={project?.projectUrl ?? status?.projectUrl ?? "-"} />
          <KeyValue label="Dashboard" value={project?.dashboardPort ?? status?.dashboardPort ?? "-"} />
          <KeyValue label="Uptime" value={formatUptime(status?.uptime)} />
          <div className="mt-4 break-all rounded-md border border-slate-800 bg-slate-950/70 p-3 text-[13px] text-slate-400">{compactPath(project?.rootDir ?? status?.rootDir)}</div>
        </Panel>

        <Panel title="Quick actions">
          <div className="grid grid-cols-2 gap-2">
            <CommandButton active disabled={scanning} onClick={() => void runScan("changed")}>Run tests</CommandButton>
            <a className="command-btn" href="/map">Open map</a>
            <a className="command-btn" href="/bugs">Triage bugs</a>
            <span className="command-btn command-btn-disabled">DevOps</span>
          </div>
        </Panel>

        <Panel title="Local storage">
          <KeyValue label="Project cache" value=".tlx/hash.json" />
          <KeyValue label="Latest report" value=".tlx/latest-report.json" />
          <KeyValue label="Screenshots" value=".tlx/screenshots" />
          <KeyValue label="Global DB" value="planned" />
        </Panel>
      </section>

      <section className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="pages mapped" value={String(graph.pages.length).padStart(2, "0")} detail="routes" tone="good" />
          <MetricCard label="components" value={String(graph.components.length).padStart(2, "0")} detail="detected imports" tone="info" />
          <MetricCard label="changed files" value={String(diff.changed.length).padStart(2, "0")} detail={`${diff.unknown.length} unknown`} tone="warn" />
          <MetricCard label="visual issues" value={String(report?.summary.issuesFound ?? 0).padStart(2, "0")} detail={`${report?.summary.screenshotsCaptured ?? 0} screenshots`} tone={(report?.summary.issuesFound ?? 0) > 0 ? "bad" : "default"} />
        </div>

        <Panel
          title="Project Node Graph"
          action={
            <div className="search-box max-w-[320px]">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter node, route, endpoint..." />
            </div>
          }
          className="min-h-[520px]"
        >
          <ProjectGraph graph={graph} selectedNodeId={selectedNodeId} issueRoutes={issueRoutes} affectedRoutes={affectedRoutes} search={search} compact onSelect={setSelectedNodeId} />
        </Panel>
      </section>

      <section className="space-y-4">
        <Panel title="Inspector">
          {selectedNode ? (
            <div className="space-y-3">
              <div>
                <p className="text-[26px] font-black tracking-normal text-slate-100">{selectedNode.title}</p>
                <p className="mt-2 text-[14px] text-slate-400">{selectedNode.kind} · {selectedNode.subtitle}</p>
              </div>
              {selectedNode.filePath ? <KeyValue label="File" value={compactPath(selectedNode.filePath)} /> : null}
              <pre className="code-box">{JSON.stringify(selectedNode.raw, null, 2)}</pre>
            </div>
          ) : (
            <EmptyState title="Select a graph node" detail="Node detail, file path, and API metadata appear here." />
          )}
        </Panel>

        <Panel title="Worker contract">
          <pre className="code-box">GET /api/status{"\n"}GET /api/project{"\n"}GET /api/graph{"\n"}GET /api/cache/diff{"\n"}GET /api/report/latest{"\n"}POST /api/actions/scan</pre>
          <div className="mt-3"><CopyButton value="GET /api/status\nGET /api/project\nGET /api/graph\nGET /api/cache/diff\nGET /api/report/latest\nPOST /api/actions/scan" label="Copy contract" /></div>
        </Panel>

        <Panel title="Summary">
          <div className="flex flex-wrap gap-2">
            <StatusPill label={`${graph.apis.length} API calls`} tone="info" />
            <StatusPill label={`${diff.affectedRoutes.length} impacted routes`} tone={diff.affectedRoutes.length > 0 ? "warn" : "muted"} />
          </div>
          <p className="mt-4 text-[15px] leading-7 text-slate-400">Overview gom project context, graph chính và inspector. DevOps giữ planned vì backend agent chưa có trong phase hiện tại.</p>
        </Panel>
      </section>
    </div>
  );
}

