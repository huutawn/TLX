"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { TlxComponentNode, TlxGraphResponse } from "@tlx/contracts";
import { compactPath } from "../_lib/format";

export type GraphScope = "all" | "changed" | "apis";

interface ProjectGraphProps {
  graph: TlxGraphResponse;
  selectedNodeId?: string;
  issueRoutes?: Set<string>;
  affectedRoutes?: Set<string>;
  search?: string;
  scope?: GraphScope;
  compact?: boolean;
  onSelect(id: string): void;
}

interface TlxNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  kind: "page" | "component" | "api";
  tone: "good" | "warn" | "bad" | "info" | "muted";
}

type TlxFlowNode = Node<TlxNodeData, "tlx">;

const NODE_TYPES = { tlx: TlxFlowNodeCard };

export function ProjectGraph({ graph, selectedNodeId, issueRoutes = new Set(), affectedRoutes = new Set(), search = "", scope = "all", compact = false, onSelect }: ProjectGraphProps) {
  const { nodes, edges } = useMemo(() => createFlowElements(graph, { issueRoutes, affectedRoutes, search, scope }), [affectedRoutes, graph, issueRoutes, scope, search]);
  const visibleNodes = useMemo(() => nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId })), [nodes, selectedNodeId]);

  if (nodes.length === 0) {
    return (
      <div className="graph-empty">
        <p className="text-[15px] font-semibold text-slate-200">No graph nodes</p>
        <p className="mt-1 text-[14px] text-slate-500">Run TLX from a supported project to populate pages, components, and API endpoints.</p>
      </div>
    );
  }

  return (
    <div className={`graph-shell ${compact ? "graph-compact" : ""}`}>
      <ReactFlow
        nodes={visibleNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.2}
        maxZoom={2.4}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        nodesDraggable={false}
        elementsSelectable
        onNodeClick={(_, node) => onSelect(node.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#243244" gap={28} size={1} />
        <Controls position="top-left" />
        {!compact ? <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={3} /> : null}
      </ReactFlow>
    </div>
  );
}

export function findGraphNode(graph: TlxGraphResponse, id?: string): GraphNodeDetail | undefined {
  if (!id) return undefined;
  const page = graph.pages.find((node) => node.id === id);
  if (page) return { kind: "page", id: page.id, title: page.route, subtitle: page.name, filePath: page.filePath, raw: page };

  const component = graph.components.find((node) => node.id === id) ?? graph.pages.flatMap((pageNode) => pageNode.components).find((node) => node.id === id);
  if (component) return { kind: "component", id: component.id, title: component.name, subtitle: compactPath(component.filePath), filePath: component.filePath, raw: component };

  const api = graph.apis.find((endpoint) => apiNodeId(endpoint) === id || endpoint === id);
  if (api) return { kind: "api", id: apiNodeId(api), title: api, subtitle: "endpoint", raw: { endpoint: api } };

  return undefined;
}

export interface GraphNodeDetail {
  kind: "page" | "component" | "api";
  id: string;
  title: string;
  subtitle: string;
  filePath?: string;
  raw: unknown;
}

function createFlowElements(
  graph: TlxGraphResponse,
  options: { issueRoutes: Set<string>; affectedRoutes: Set<string>; search: string; scope: GraphScope },
): { nodes: TlxFlowNode[]; edges: Edge[] } {
  const search = options.search.trim().toLowerCase();
  const visiblePageIds = new Set<string>();
  const visibleComponentIds = new Set<string>();
  const visibleApiIds = new Set<string>();

  for (const page of graph.pages) {
    const pageMatches = matchesSearch(search, [page.route, page.name, page.filePath, page.framework]);
    const changed = options.affectedRoutes.has(page.route);
    const hasApi = page.apis.length > 0;
    const pageVisible =
      (!search || pageMatches || page.components.some((component) => matchesSearch(search, [component.name, component.filePath])) || page.apis.some((api) => matchesSearch(search, [api]))) &&
      (options.scope === "all" || (options.scope === "changed" && changed) || (options.scope === "apis" && hasApi));

    if (!pageVisible) continue;
    visiblePageIds.add(page.id);

    for (const component of page.components) {
      if (options.scope !== "apis" && (!search || pageMatches || matchesSearch(search, [component.name, component.filePath]))) {
        visibleComponentIds.add(component.id);
      }
    }

    for (const api of page.apis) {
      if (!search || pageMatches || matchesSearch(search, [api])) {
        visibleApiIds.add(apiNodeId(api));
      }
    }
  }

  const components = uniqueComponents(graph);
  const nodes: TlxFlowNode[] = [];

  graph.pages.forEach((page, index) => {
    if (!visiblePageIds.has(page.id)) return;
    nodes.push({
      id: page.id,
      type: "tlx",
      position: { x: 0, y: index * 180 },
      data: {
        title: page.route,
        subtitle: `${page.framework} / ${compactPath(page.filePath)}`,
        kind: "page",
        tone: options.issueRoutes.has(page.route) ? "bad" : options.affectedRoutes.has(page.route) ? "warn" : "good",
      },
    });
  });

  components.forEach((component, index) => {
    if (!visibleComponentIds.has(component.id)) return;
    nodes.push({
      id: component.id,
      type: "tlx",
      position: { x: 350, y: index * 118 + 24 },
      data: { title: component.name, subtitle: compactPath(component.filePath), kind: "component", tone: "info" },
    });
  });

  graph.apis.forEach((api, index) => {
    const id = apiNodeId(api);
    if (!visibleApiIds.has(id)) return;
    nodes.push({ id, type: "tlx", position: { x: 710, y: index * 132 + 42 }, data: { title: api, subtitle: "endpoint", kind: "api", tone: "muted" } });
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: Edge[] = [];
  for (const page of graph.pages) {
    if (!nodeIds.has(page.id)) continue;
    for (const component of page.components) {
      if (nodeIds.has(component.id)) {
        edges.push(createEdge(`${page.id}->${component.id}`, page.id, component.id, "page_uses_component"));
      }
    }
    for (const api of page.apis) {
      const target = apiNodeId(api);
      if (nodeIds.has(target)) {
        edges.push(createEdge(`${page.id}->${target}`, page.id, target, "page_calls_api"));
      }
    }
  }

  return { nodes, edges };
}

function TlxFlowNodeCard({ data, selected }: NodeProps<TlxFlowNode>) {
  return (
    <div className={`flow-node flow-${data.tone} ${selected ? "flow-selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-current" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold text-slate-100">{data.title}</span>
          <span className="mt-1 block truncate text-[12px] text-slate-400">{data.subtitle}</span>
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}

function createEdge(id: string, source: string, target: string, label: string): Edge {
  return {
    id,
    source,
    target,
    label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#38bdf8" },
    style: { stroke: "#38bdf8", strokeWidth: 2 },
    labelStyle: { fill: "#94a3b8", fontSize: 11, fontWeight: 700 },
    labelBgStyle: { fill: "#0f172a", fillOpacity: 0.9 },
  };
}

function uniqueComponents(graph: TlxGraphResponse): TlxComponentNode[] {
  const byId = new Map<string, TlxComponentNode>();
  for (const component of graph.components) byId.set(component.id, component);
  for (const page of graph.pages) {
    for (const component of page.components) byId.set(component.id, component);
  }
  return [...byId.values()];
}

function matchesSearch(search: string, values: string[]) {
  return !search || values.some((value) => value.toLowerCase().includes(search));
}

function apiNodeId(endpoint: string) {
  return `api:${endpoint}`;
}
