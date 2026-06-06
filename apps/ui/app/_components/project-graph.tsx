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
import type { TlxComponentNode, TlxGraphEdge, TlxGraphResponse, TlxPageNode } from "@tlx/contracts";
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
  rawId: string;
}

type TlxFlowNode = Node<TlxNodeData, "tlx">;

const NODE_TYPES = { tlx: TlxFlowNodeCard };

export function ProjectGraph({ graph, selectedNodeId, issueRoutes = new Set(), affectedRoutes = new Set(), search = "", scope = "all", compact = false, onSelect }: ProjectGraphProps) {
  const { nodes, edges } = useMemo(() => createFlowElements(graph, { issueRoutes, affectedRoutes, search, scope }), [affectedRoutes, graph, issueRoutes, scope, search]);
  const visibleNodes = useMemo(() => nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId || node.data.rawId === selectedNodeId })), [nodes, selectedNodeId]);

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
        onNodeClick={(_, node) => onSelect(node.data.rawId)}
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

  const api = graph.apis.find((endpoint) => apiGraphId(endpoint) === id || endpoint === id);
  if (api) return { kind: "api", id: apiGraphId(api), title: api, subtitle: "endpoint", raw: { endpoint: api } };

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
  const components = uniqueComponents(graph);
  const componentById = new Map(components.map((component) => [component.id, component]));
  const pageById = new Map(graph.pages.map((page) => [page.id, page]));
  const apiById = new Map(graph.apis.map((api) => [apiGraphId(api), api]));
  const outgoing = groupEdges(graph.edges, "source");
  const visiblePages: TlxPageNode[] = [];
  const visibleApiIds = new Set<string>();

  for (const page of graph.pages) {
    const connectedIds = collectConnectedIds(page.id, outgoing);
    const connectedValues = [...connectedIds].flatMap((id) => {
      const component = componentById.get(id);
      const api = apiById.get(id);
      const linkedPage = pageById.get(id);
      return [component?.name, component?.filePath, api, linkedPage?.route].filter(Boolean) as string[];
    });
    const matches = !search || matchesSearch(search, [page.route, page.name, page.filePath, page.framework, ...connectedValues]);
    const changed = options.affectedRoutes.has(page.route);
    const hasApi = page.apis.length > 0 || [...connectedIds].some((id) => apiById.has(id));
    const pageVisible = matches && (options.scope === "all" || (options.scope === "changed" && changed) || (options.scope === "apis" && hasApi));

    if (!pageVisible) continue;
    visiblePages.push(page);
    for (const id of connectedIds) {
      if (apiById.has(id)) {
        visibleApiIds.add(id);
      }
    }
  }

  if (search) {
    for (const [id, api] of apiById) {
      if (matchesSearch(search, [api])) {
        visibleApiIds.add(id);
      }
    }
  }

  const nodes: TlxFlowNode[] = [];
  const edges: Edge[] = [];
  const displayIdByPage = new Map<string, Map<string, string>>();
  let nextY = 0;

  for (const page of visiblePages) {
    const lane = createPageLane(page, graph.edges, componentById, apiById, nextY, options);
    nodes.push(...lane.nodes);
    edges.push(...lane.edges);
    displayIdByPage.set(page.id, lane.displayIds);
    nextY += lane.height + 42;
  }

  const visiblePageIds = new Set(visiblePages.map((page) => page.id));
  for (const edge of graph.edges) {
    if (edge.type !== "page_links_page" || !visiblePageIds.has(edge.source) || !visiblePageIds.has(edge.target)) continue;
    edges.push(createEdge(edge.id, edge.source, edge.target, edge.label, edge.type));
  }

  const orphanApis = graph.apis.filter((api) => {
    const id = apiGraphId(api);
    return (options.scope !== "changed" || visibleApiIds.has(id)) && ![...displayIdByPage.values()].some((ids) => ids.has(id));
  });

  orphanApis.forEach((api, index) => {
    const rawId = apiGraphId(api);
    nodes.push({
      id: `api-registry:${rawId}`,
      type: "tlx",
      position: { x: 360, y: nextY + index * 92 },
      data: { title: api, subtitle: "api route", kind: "api", tone: "muted", rawId },
    });
  });

  return { nodes, edges };
}

function createPageLane(
  page: TlxPageNode,
  graphEdges: TlxGraphEdge[],
  componentById: Map<string, TlxComponentNode>,
  apiById: Map<string, string>,
  y: number,
  options: { issueRoutes: Set<string>; affectedRoutes: Set<string> },
): { nodes: TlxFlowNode[]; edges: Edge[]; displayIds: Map<string, string>; height: number } {
  const displayIds = new Map<string, string>([[page.id, page.id]]);
  const componentDepths = computeLaneComponentDepths(page.id, graphEdges);
  const componentIds = [...componentDepths.keys()].filter((id) => componentById.has(id));
  const apiEdges = graphEdges.filter((edge) => edge.type === "page_calls_api" && edge.source === page.id && apiById.has(edge.target));
  const depthSlots = new Map<string | number, number>();
  const maxDepth = Math.max(1, ...componentIds.map((id) => componentDepths.get(id) ?? 1));
  const apiX = 360 + maxDepth * 290;
  const maxLaneItems = Math.max(1, apiEdges.length, ...[...componentDepths.values()].map((depth) => [...componentDepths.values()].filter((value) => value === depth).length));
  const height = Math.max(150, 44 + maxLaneItems * 88);
  const nodes: TlxFlowNode[] = [
    {
      id: page.id,
      type: "tlx",
      position: { x: 0, y: y + 34 },
      data: {
        title: page.route,
        subtitle: `${page.framework} / ${page.components.length} components / ${page.apis.length} apis`,
        kind: "page",
        tone: options.issueRoutes.has(page.route) ? "bad" : options.affectedRoutes.has(page.route) ? "warn" : "good",
        rawId: page.id,
      },
    },
  ];
  const edges: Edge[] = [];

  for (const componentId of componentIds) {
    const component = componentById.get(componentId);
    if (!component) continue;
    const depth = componentDepths.get(componentId) ?? 1;
    const slot = nextSlot(depthSlots, depth);
    const displayId = laneDisplayId(page.id, componentId);
    displayIds.set(componentId, displayId);
    nodes.push({
      id: displayId,
      type: "tlx",
      position: { x: 360 + (depth - 1) * 290, y: y + slot * 88 + 20 },
      data: { title: component.name, subtitle: compactPath(component.filePath), kind: "component", tone: "info", rawId: component.id },
    });
  }

  apiEdges.forEach((edge, index) => {
    const api = apiById.get(edge.target);
    if (!api) return;
    const displayId = laneDisplayId(page.id, edge.target);
    displayIds.set(edge.target, displayId);
    nodes.push({
      id: displayId,
      type: "tlx",
      position: { x: apiX, y: y + index * 88 + 20 },
      data: { title: api, subtitle: "endpoint", kind: "api", tone: "muted", rawId: edge.target },
    });
  });

  for (const edge of graphEdges) {
    if (edge.type === "page_links_page") continue;
    const source = displayIds.get(edge.source);
    const target = displayIds.get(edge.target);
    if (!source || !target) continue;
    edges.push(createEdge(`${page.id}:${edge.id}`, source, target, undefined, edge.type));
  }

  return { nodes, edges, displayIds, height };
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

function createEdge(id: string, source: string, target: string, label: string | undefined, type: TlxGraphEdge["type"]): Edge {
  const stroke = type === "page_links_page" ? "#31d18d" : type === "component_uses_component" ? "#a78bfa" : type === "page_calls_api" ? "#22d3ee" : "#38bdf8";
  return {
    id,
    source,
    target,
    label: label ? compactEdgeLabel(label) : undefined,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
    style: { stroke, strokeWidth: type === "page_links_page" ? 2.5 : 2 },
    labelStyle: { fill: "#94a3b8", fontSize: 11, fontWeight: 700 },
    labelBgStyle: { fill: "#0f172a", fillOpacity: 0.9 },
  };
}

function compactEdgeLabel(label: string) {
  return label.length > 28 ? `${label.slice(0, 25)}...` : label;
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

function groupEdges(edges: TlxGraphEdge[], key: "source" | "target") {
  const groups = new Map<string, TlxGraphEdge[]>();
  for (const edge of edges) {
    const id = edge[key];
    const group = groups.get(id) ?? [];
    group.push(edge);
    groups.set(id, group);
  }
  return groups;
}

function collectConnectedIds(source: string, outgoing: Map<string, TlxGraphEdge[]>) {
  const ids = new Set<string>();
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const edge of outgoing.get(current) ?? []) {
      if (ids.has(edge.target)) continue;
      ids.add(edge.target);
      if (edge.type === "page_uses_component" || edge.type === "component_uses_component") {
        queue.push(edge.target);
      }
    }
  }
  return ids;
}

function computeLaneComponentDepths(pageId: string, edges: TlxGraphEdge[]) {
  const depths = new Map<string, number>();
  let changed = true;
  let passes = 0;
  while (changed && passes < edges.length + 1) {
    passes += 1;
    changed = false;
    for (const edge of edges) {
      if (edge.type !== "page_uses_component" && edge.type !== "component_uses_component") continue;
      if (edge.type === "component_uses_component" && !depths.has(edge.source)) continue;
      if (edge.type === "page_uses_component" && edge.source !== pageId) continue;
      const depth = edge.type === "page_uses_component" ? 1 : (depths.get(edge.source) ?? 1) + 1;
      if ((depths.get(edge.target) ?? 0) < depth) {
        depths.set(edge.target, depth);
        changed = true;
      }
    }
  }
  return depths;
}

function nextSlot(slots: Map<string | number, number>, key: string | number) {
  const slot = slots.get(key) ?? 0;
  slots.set(key, slot + 1);
  return slot;
}

function laneDisplayId(pageId: string, nodeId: string) {
  return `${pageId}::${nodeId}`;
}

function apiGraphId(endpoint: string) {
  return createGraphId("api", endpoint);
}

function createGraphId(prefix: string, value: string): string {
  const normalized = value
    .replace(/\\/g, "/")
    .toLowerCase()
    .replace(/[^a-z0-9:_./-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${prefix}:${normalized || "root"}`;
}
