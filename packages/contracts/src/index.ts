export interface TlxStatusResponse {
  status: string;
  engine: string;
  platform: string;
  uptime: number;
  dashboardPort: number;
  projectUrl: string;
  framework: string;
  rootDir: string;
  startedAt: string;
}

export interface TlxProjectResponse {
  framework: string;
  port: number;
  rootDir: string;
  projectUrl: string;
  dashboardPort: number;
}

export interface TlxComponentNode {
  id: string;
  type: 'component';
  name: string;
  filePath: string;
  importedFrom?: string;
  parentId?: string;
  parentIds?: string[];
}

export interface TlxPageNode {
  id: string;
  type: 'page';
  name: string;
  route: string;
  filePath: string;
  framework: string;
  components: TlxComponentNode[];
  apis: string[];
  links: string[];
}

export type TlxGraphEdgeType = 'page_uses_component' | 'component_uses_component' | 'page_calls_api' | 'page_links_page';

export interface TlxGraphEdge {
  id: string;
  type: TlxGraphEdgeType;
  source: string;
  target: string;
  label?: string;
}

export interface TlxGraphResponse {
  pages: TlxPageNode[];
  components: TlxComponentNode[];
  apis: string[];
  edges: TlxGraphEdge[];
}

export type TlxScanScope = 'changed' | 'all' | 'route';

export interface TlxBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TlxScanIssueKind = 'overlap' | 'overflow' | 'contrast' | 'crawler' | 'api';
export type TlxScanIssueSeverity = 'info' | 'warning' | 'error';

export interface TlxScanIssue {
  id: string;
  kind: TlxScanIssueKind;
  severity: TlxScanIssueSeverity;
  message: string;
  route: string;
  url: string;
  selector: string;
  boundingBox: TlxBoundingBox;
  screenshotPath?: string;
  metadata: Record<string, unknown>;
}

export interface TlxScanReportSummary {
  routesScanned: number;
  elementsScanned: number;
  issuesFound: number;
  screenshotsCaptured: number;
}

export interface TlxScanReport {
  id: string;
  scope: TlxScanScope;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  summary: TlxScanReportSummary;
  issues: TlxScanIssue[];
  screenshots: string[];
  warnings: string[];
}

export interface TlxCacheEntry {
  path: string;
  hash?: string;
  route?: string;
}

export interface TlxCacheDiffResponse {
  changed: TlxCacheEntry[];
  unchanged: TlxCacheEntry[];
  unknown: TlxCacheEntry[];
  deleted: TlxCacheEntry[];
  affectedRoutes: string[];
}

export interface TlxScanActionRequest {
  scope?: TlxScanScope;
  route?: string;
}

export interface TlxScanResultResponse {
  success: boolean;
  totalElementsScanned: number;
  bugsFound: string[];
  timestamp: string;
  report: TlxScanReport;
}
