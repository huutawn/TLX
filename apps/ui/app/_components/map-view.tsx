"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useDashboardData } from "../_lib/dashboard-data";
import { compactPath } from "../_lib/format";
import { findGraphNode, type GraphScope, ProjectGraph } from "./project-graph";
import { CommandButton, EmptyState, KeyValue, Panel, StatusPill } from "./ui";

export function MapView() {
  const { graph, diff, report, selectedNodeId, setSelectedNodeId } = useDashboardData();
  const [scope, setScope] = useState<GraphScope>("all");
  const [search, setSearch] = useState("");
  const selectedNode = findGraphNode(graph, selectedNodeId);
  const issueRoutes = useMemo(() => new Set(report?.issues.map((issue) => issue.route) ?? []), [report?.issues]);
  const affectedRoutes = useMemo(() => new Set(diff.affectedRoutes), [diff.affectedRoutes]);

  return (
    <div className="map-layout">
      <aside className="space-y-4">
        <Panel title="Scope">
          <div className="grid gap-2">
            <CommandButton active={scope === "all"} onClick={() => setScope("all")}>All graph</CommandButton>
            <CommandButton active={scope === "changed"} onClick={() => setScope("changed")}>Changed impact</CommandButton>
            <CommandButton active={scope === "apis"} onClick={() => setScope("apis")}>API endpoints</CommandButton>
          </div>
        </Panel>

        <Panel title="Search">
          <div className="search-box w-full">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="route, component, endpoint" />
          </div>
        </Panel>

        <Panel title="Zoom controls">
          <p className="text-[15px] leading-7 text-slate-400">Mouse wheel phóng to/nhỏ, drag canvas để pan, hoặc dùng controls trên graph.</p>
        </Panel>

        <Panel title="Legend">
          <div className="flex flex-wrap gap-2">
            <StatusPill label="page" tone="good" />
            <StatusPill label="component" tone="info" />
            <StatusPill label="endpoint" tone="muted" />
            <StatusPill label="changed" tone="warn" />
            <StatusPill label="issue" tone="bad" />
          </div>
        </Panel>
      </aside>

      <section className="map-canvas-panel">
        <ProjectGraph graph={graph} selectedNodeId={selectedNodeId} issueRoutes={issueRoutes} affectedRoutes={affectedRoutes} search={search} scope={scope} onSelect={setSelectedNodeId} />
      </section>

      <aside className="space-y-4">
        <Panel title="Node detail">
          {selectedNode ? (
            <div className="space-y-3">
              <h2 className="text-[22px] font-black tracking-normal text-slate-100">{selectedNode.title}</h2>
              <p className="text-[14px] text-slate-400">{selectedNode.kind} · {selectedNode.subtitle}</p>
              {selectedNode.filePath ? <KeyValue label="File" value={compactPath(selectedNode.filePath)} /> : null}
              <div className="flex flex-wrap gap-2">
                <StatusPill label={selectedNode.kind} tone={selectedNode.kind === "page" ? "good" : selectedNode.kind === "component" ? "info" : "muted"} />
                {selectedNode.kind === "page" && affectedRoutes.has(selectedNode.title) ? <StatusPill label="impacted" tone="warn" /> : null}
                {selectedNode.kind === "page" && issueRoutes.has(selectedNode.title) ? <StatusPill label="issue" tone="bad" /> : null}
              </div>
            </div>
          ) : (
            <EmptyState title="Pick a node" detail="Click page, component, or endpoint to inspect it." />
          )}
        </Panel>

        <Panel title="Impact path">
          <pre className="code-box">{selectedNode ? `${selectedNode.title} -> ${selectedNode.kind}` : "No node selected"}</pre>
        </Panel>

        <Panel title="Edges">
          <KeyValue label="page_uses_component" value={graph.edges.filter((edge) => edge.type === "page_uses_component").length || graph.pages.reduce((sum, page) => sum + page.components.length, 0)} />
          <KeyValue label="component_uses_component" value={graph.edges.filter((edge) => edge.type === "component_uses_component").length} />
          <KeyValue label="page_calls_api" value={graph.edges.filter((edge) => edge.type === "page_calls_api").length || graph.pages.reduce((sum, page) => sum + page.apis.length, 0)} />
          <KeyValue label="page_links_page" value={graph.edges.filter((edge) => edge.type === "page_links_page").length} />
        </Panel>
      </aside>
    </div>
  );
}
