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
  pid: number;
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

export type TlxScanIssueKind = 'overlap' | 'overflow' | 'contrast' | 'color_harmony' | 'alignment' | 'spacing' | 'typography' | 'orphan' | 'hit_area' | 'tap_target_spacing' | 'text_clipping' | 'line_height_collision' | 'local_scroll' | 'fixed_occlusion' | 'accessible_name' | 'broken_image' | 'crawler' | 'api' | 'auth_required' | 'auth_failed';
export type TlxScanIssueSeverity = 'info' | 'warning' | 'error';

export const TLX_VISUAL_SCAN_ISSUE_KINDS = [
  'overlap',
  'overflow',
  'contrast',
  'color_harmony',
  'alignment',
  'spacing',
  'typography',
  'orphan',
  'hit_area',
  'tap_target_spacing',
  'text_clipping',
  'line_height_collision',
  'local_scroll',
  'fixed_occlusion',
  'accessible_name',
  'broken_image',
] as const satisfies readonly TlxScanIssueKind[];

export type TlxVisualScanIssueKind = (typeof TLX_VISUAL_SCAN_ISSUE_KINDS)[number];

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

const TLX_VISUAL_SCAN_ISSUE_KIND_SET: ReadonlySet<TlxScanIssueKind> = new Set(TLX_VISUAL_SCAN_ISSUE_KINDS);

export function isTlxVisualScanIssueKind(kind: TlxScanIssueKind): kind is TlxVisualScanIssueKind {
  return TLX_VISUAL_SCAN_ISSUE_KIND_SET.has(kind);
}

export function isTlxVisualScanIssue(issue: Pick<TlxScanIssue, 'kind'>): issue is TlxScanIssue & { kind: TlxVisualScanIssueKind } {
  return isTlxVisualScanIssueKind(issue.kind);
}

export interface TlxScanReportSummary {
  routesScanned: number;
  elementsScanned: number;
  issuesFound: number;
  screenshotsCaptured: number;
}

export interface TlxOklchColor {
  lightness: number;
  chroma: number;
  hue: number | null;
}

export interface TlxColorPaletteEntry {
  role: string;
  color: string;
  oklch: TlxOklchColor;
  weight: number;
}

export interface TlxRouteColorAnalysis {
  route: string;
  viewport: string;
  score: number;
  dominantHue: number | null;
  strongHueFamilies: number;
  hueSpread: number;
  highChromaAreaRatio: number;
  palette: TlxColorPaletteEntry[];
}

export interface TlxColorAnalysisThresholds {
  maxStrongHueFamilies: number;
  maxRouteHueDrift: number;
  maxHighChromaAreaRatio: number;
  maxHueSpread: number;
}

export interface TlxColorAnalysis {
  enabled: boolean;
  score: number;
  dominantHue: number | null;
  thresholds: TlxColorAnalysisThresholds;
  routes: TlxRouteColorAnalysis[];
}

export interface TlxScanReport {
  id: string;
  scope: TlxScanScope;
  routes: string[];
  startedAt: string;
  finishedAt: string;
  success: boolean;
  summary: TlxScanReportSummary;
  issues: TlxScanIssue[];
  screenshots: string[];
  warnings: string[];
  colorAnalysis?: TlxColorAnalysis;
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

export interface TlxAuthStartRequest {
  profile?: string;
  loginUrl?: string;
  timeoutMs?: number;
}

export interface TlxAuthStatusResponse {
  mode: 'none' | 'manual';
  profile: string;
  authenticated: boolean;
  storageStatePath?: string;
  savedAt?: string;
  origins: string[];
}

export interface TlxAuthActionResponse extends TlxAuthStatusResponse {
  success: boolean;
  message?: string;
}

export interface TlxScanResultResponse {
  success: boolean;
  totalElementsScanned: number;
  bugsFound: string[];
  timestamp: string;
  report: TlxScanReport;
}
