"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { TlxCacheDiffResponse, TlxGraphResponse, TlxProjectResponse, TlxScanIssue, TlxScanReport, TlxScanScope, TlxStatusResponse } from "@tlx/contracts";

type LatestReportResponse = TlxScanReport | { empty: true; issues: [] };

const API_BASE = typeof window === "undefined" ? "" : window.location.origin;

export default function Home() {
  const [status, setStatus] = useState<TlxStatusResponse | undefined>();
  const [project, setProject] = useState<TlxProjectResponse | undefined>();
  const [graph, setGraph] = useState<TlxGraphResponse>({ pages: [], components: [], apis: [], edges: [] });
  const [diff, setDiff] = useState<TlxCacheDiffResponse>({ changed: [], unchanged: [], unknown: [], deleted: [], affectedRoutes: [] });
  const [report, setReport] = useState<TlxScanReport | undefined>();
  const [selectedRoute, setSelectedRoute] = useState<string>("/");
  const [selectedIssue, setSelectedIssue] = useState<TlxScanIssue | undefined>();
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    void refresh();
  }, []);

  const selectedNode = useMemo(() => {
    return graph.pages.find((node) => node.id === selectedNodeId) ?? graph.components.find((node) => node.id === selectedNodeId);
  }, [graph, selectedNodeId]);

  const issueImage = selectedIssue?.screenshotPath ? `/${selectedIssue.screenshotPath.replace(/^\.\//, "")}` : undefined;

  async function refresh() {
    setError(undefined);
    try {
      const [statusResponse, projectResponse, graphResponse, diffResponse, reportResponse] = await Promise.all([
        fetchJson<TlxStatusResponse>("/api/status"),
        fetchJson<TlxProjectResponse>("/api/project"),
        fetchJson<TlxGraphResponse>("/api/graph"),
        fetchJson<TlxCacheDiffResponse>("/api/cache/diff"),
        fetchJson<LatestReportResponse>("/api/report/latest"),
      ]);
      setStatus(statusResponse);
      setProject(projectResponse);
      setGraph(graphResponse);
      setDiff(diffResponse);
      setReport("empty" in reportResponse ? undefined : reportResponse);
      setSelectedRoute(graphResponse.pages[0]?.route ?? "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function runScan(scope: TlxScanScope) {
    setLoading(true);
    setError(undefined);
    try {
      const body = scope === "route" ? { scope, route: selectedRoute } : { scope };
      const response = await fetchJson<{ report: TlxScanReport }>("/api/actions/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setReport(response.report);
      setSelectedIssue(response.report.issues[0]);
      setDiff(await fetchJson<TlxCacheDiffResponse>("/api/cache/diff"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <section className="space-y-4">
          <Panel title="Overview">
            <Metric label="Framework" value={project?.framework ?? "-"} />
            <Metric label="Project URL" value={project?.projectUrl ?? status?.projectUrl ?? "-"} />
            <Metric label="Root" value={project?.rootDir ?? status?.rootDir ?? "-"} compact />
            <Metric label="Pages" value={String(graph.pages.length)} />
          </Panel>

          <Panel title="Cache Diff">
            <DiffRow label="Changed" value={diff.changed.length} tone="text-amber-300" />
            <DiffRow label="Unknown" value={diff.unknown.length} tone="text-sky-300" />
            <DiffRow label="Deleted" value={diff.deleted.length} tone="text-rose-300" />
            <DiffRow label="Unchanged" value={diff.unchanged.length} tone="text-emerald-300" />
            <div className="mt-3 flex flex-wrap gap-2">
              {diff.affectedRoutes.length === 0 ? <span className="text-sm text-zinc-500">No affected routes</span> : diff.affectedRoutes.map((route) => <RouteChip key={route} route={route} active={route === selectedRoute} onClick={() => setSelectedRoute(route)} />)}
            </div>
          </Panel>

          <Panel title="Test Controls">
            <div className="grid gap-2">
              <button className="command" disabled={loading} onClick={() => runScan("changed")}>Changed</button>
              <button className="command" disabled={loading} onClick={() => runScan("all")}>All Pages</button>
              <select className="field" value={selectedRoute} onChange={(event) => setSelectedRoute(event.target.value)}>
                {(graph.pages.length ? graph.pages : [{ route: "/", id: "root" }]).map((page) => <option key={page.id} value={page.route}>{page.route}</option>)}
              </select>
              <button className="command" disabled={loading} onClick={() => runScan("route")}>Single Route</button>
            </div>
          </Panel>
        </section>

        <section className="space-y-4">
          {error ? <div className="rounded border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-sm text-rose-100">{error}</div> : null}
          <Panel title="Project Map">
            <ProjectMap graph={graph} selectedNodeId={selectedNodeId} issueRoutes={new Set(report?.issues.map((issue) => issue.route) ?? [])} affectedRoutes={new Set(diff.affectedRoutes)} onSelect={setSelectedNodeId} />
          </Panel>
          <Panel title="Latest Report">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Routes" value={String(report?.summary.routesScanned ?? 0)} />
              <Metric label="Elements" value={String(report?.summary.elementsScanned ?? 0)} />
              <Metric label="Issues" value={String(report?.summary.issuesFound ?? 0)} />
              <Metric label="Screenshots" value={String(report?.summary.screenshotsCaptured ?? 0)} />
            </div>
            <div className="mt-4 max-h-72 overflow-auto border-t border-zinc-800 pt-3">
              {(report?.issues.length ?? 0) === 0 ? <p className="text-sm text-zinc-500">No issues in latest report</p> : report?.issues.map((issue) => (
                <button key={issue.id} className={`issue-row ${selectedIssue?.id === issue.id ? "issue-row-active" : ""}`} onClick={() => setSelectedIssue(issue)}>
                  <span className="font-medium">{issue.kind}</span>
                  <span className="text-zinc-400">{issue.route}</span>
                  <span className="truncate">{issue.message}</span>
                </button>
              ))}
            </div>
          </Panel>
        </section>

        <section className="space-y-4">
          <Panel title="Inspector">
            {selectedNode ? <pre className="whitespace-pre-wrap text-xs text-zinc-300">{JSON.stringify(selectedNode, null, 2)}</pre> : <p className="text-sm text-zinc-500">Select a graph node</p>}
          </Panel>
          <Panel title="Visual Bug Viewer">
            {selectedIssue && issueImage ? (
              <div className="relative overflow-hidden border border-zinc-800 bg-black">
                <img className="block w-full" src={issueImage} alt={selectedIssue.message} />
                <div
                  className="absolute border-2 border-rose-400 bg-rose-500/20"
                  style={{
                    left: `${selectedIssue.boundingBox.x / 12.8}%`,
                    top: `${selectedIssue.boundingBox.y / 8}%`,
                    width: `${Math.max(1, selectedIssue.boundingBox.width / 12.8)}%`,
                    height: `${Math.max(1, selectedIssue.boundingBox.height / 8)}%`,
                  }}
                />
              </div>
            ) : <p className="text-sm text-zinc-500">Select an issue with screenshot</p>}
            {selectedIssue ? <pre className="mt-3 whitespace-pre-wrap text-xs text-zinc-300">{JSON.stringify(selectedIssue, null, 2)}</pre> : null}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded border border-zinc-800 bg-zinc-900/70 p-3"><h2 className="mb-3 text-sm font-semibold text-zinc-200">{title}</h2>{children}</section>;
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div className="mb-2"><p className="text-xs text-zinc-500">{label}</p><p className={`${compact ? "break-all text-xs" : "text-sm"} text-zinc-100`}>{value}</p></div>;
}

function DiffRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="flex items-center justify-between text-sm"><span className="text-zinc-400">{label}</span><span className={tone}>{value}</span></div>;
}

function RouteChip({ route, active, onClick }: { route: string; active: boolean; onClick(): void }) {
  return <button className={`rounded border px-2 py-1 text-xs ${active ? "border-cyan-300 text-cyan-200" : "border-zinc-700 text-zinc-300"}`} onClick={onClick}>{route}</button>;
}

function ProjectMap({ graph, selectedNodeId, issueRoutes, affectedRoutes, onSelect }: { graph: TlxGraphResponse; selectedNodeId?: string; issueRoutes: Set<string>; affectedRoutes: Set<string>; onSelect(id: string): void }) {
  const pages = graph.pages.length ? graph.pages : [];
  return (
    <div className="min-h-80 overflow-auto">
      <svg className="h-[420px] min-w-[720px]" viewBox="0 0 900 420" role="img">
        {pages.map((page, index) => {
          const y = 50 + index * 110;
          const pageTone = issueRoutes.has(page.route) ? "#fb7185" : affectedRoutes.has(page.route) ? "#fbbf24" : "#34d399";
          return (
            <g key={page.id}>
              <Node x={40} y={y} width={180} label={page.route} color={pageTone} active={selectedNodeId === page.id} onClick={() => onSelect(page.id)} />
              {page.components.slice(0, 4).map((component, componentIndex) => (
                <g key={component.id}>
                  <line x1={220} y1={y + 22} x2={340} y2={y - 28 + componentIndex * 32} stroke="#3f3f46" />
                  <Node x={340} y={y - 50 + componentIndex * 32} width={170} label={component.name} color="#38bdf8" active={selectedNodeId === component.id} onClick={() => onSelect(component.id)} />
                </g>
              ))}
              {page.apis.slice(0, 4).map((api, apiIndex) => (
                <g key={`${page.id}-${api}`}>
                  <line x1={220} y1={y + 22} x2={620} y2={y - 28 + apiIndex * 32} stroke="#3f3f46" />
                  <rect x={620} y={y - 50 + apiIndex * 32} width={210} height={28} fill="#18181b" stroke="#a78bfa" />
                  <text x={632} y={y - 32 + apiIndex * 32} fill="#ddd6fe" fontSize="12">{api}</text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Node({ x, y, width, label, color, active, onClick }: { x: number; y: number; width: number; label: string; color: string; active: boolean; onClick(): void }) {
  return <g onClick={onClick} className="cursor-pointer"><rect x={x} y={y - 22} width={width} height={44} fill="#18181b" stroke={active ? "#f8fafc" : color} strokeWidth={active ? 2 : 1} /><circle cx={x + 16} cy={y} r={5} fill={color} /><text x={x + 30} y={y + 5} fill="#f4f4f5" fontSize="13">{label}</text></g>;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
