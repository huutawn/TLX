"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  TlxCacheDiffResponse,
  TlxGraphResponse,
  TlxProjectResponse,
  TlxScanIssue,
  TlxScanReport,
  TlxScanScope,
  TlxStatusResponse,
} from "@tlx/contracts";

type LatestReportResponse = TlxScanReport | { empty: true; issues: [] };

interface DashboardDataContextValue {
  status?: TlxStatusResponse;
  project?: TlxProjectResponse;
  graph: TlxGraphResponse;
  diff: TlxCacheDiffResponse;
  report?: TlxScanReport;
  error?: string;
  loading: boolean;
  scanning: boolean;
  selectedRoute: string;
  setSelectedRoute(route: string): void;
  selectedNodeId?: string;
  setSelectedNodeId(id?: string): void;
  selectedIssue?: TlxScanIssue;
  setSelectedIssue(issue?: TlxScanIssue): void;
  refresh(): Promise<void>;
  runScan(scope: TlxScanScope): Promise<void>;
}

const EMPTY_GRAPH: TlxGraphResponse = { pages: [], components: [], apis: [], edges: [] };
const EMPTY_DIFF: TlxCacheDiffResponse = { changed: [], unchanged: [], unknown: [], deleted: [], affectedRoutes: [] };
const API_BASE = typeof window === "undefined" ? "" : window.location.origin;

const DashboardDataContext = createContext<DashboardDataContextValue | undefined>(undefined);

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<TlxStatusResponse | undefined>();
  const [project, setProject] = useState<TlxProjectResponse | undefined>();
  const [graph, setGraph] = useState<TlxGraphResponse>(EMPTY_GRAPH);
  const [diff, setDiff] = useState<TlxCacheDiffResponse>(EMPTY_DIFF);
  const [report, setReport] = useState<TlxScanReport | undefined>();
  const [selectedRoute, setSelectedRoute] = useState("/");
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selectedIssue, setSelectedIssue] = useState<TlxScanIssue | undefined>();
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    setError(undefined);
    setLoading(true);
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
      const latestReport = "empty" in reportResponse ? undefined : reportResponse;
      setReport(latestReport);
      setSelectedRoute((current) => current || graphResponse.pages[0]?.route || "/");
      setSelectedNodeId((current) => current ?? graphResponse.pages[0]?.id);
      setSelectedIssue((current) => current ?? latestReport?.issues[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const runScan = useCallback(
    async (scope: TlxScanScope) => {
      setScanning(true);
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
        setScanning(false);
      }
    },
    [selectedRoute],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const value = useMemo(
    () => ({
      status,
      project,
      graph,
      diff,
      report,
      error,
      loading,
      scanning,
      selectedRoute,
      setSelectedRoute,
      selectedNodeId,
      setSelectedNodeId,
      selectedIssue,
      setSelectedIssue,
      refresh,
      runScan,
    }),
    [status, project, graph, diff, report, error, loading, scanning, selectedRoute, selectedNodeId, selectedIssue, refresh, runScan],
  );

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext);
  if (!context) {
    throw new Error("useDashboardData must be used inside DashboardDataProvider");
  }
  return context;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
