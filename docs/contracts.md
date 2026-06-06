# TLX CLI ↔ Dashboard Contracts

This document describes the HTTP contracts between the TLX local CLI/worker and the dashboard UI.

Base URL defaults to `http://localhost:6532`. All API endpoints are mounted under `/api`. JSON request bodies use `Content-Type: application/json`.

## Endpoint Summary

| Method | Path | Request | Response | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/api/status` | none | `TlxStatusResponse` | Runtime status and current project binding. |
| `GET` | `/api/project` | none | `TlxProjectResponse` | Detected project metadata. |
| `GET` | `/api/graph` | none | `TlxGraphResponse` | Page/component/API graph for dashboard map. |
| `GET` | `/api/cache/diff` | none | `TlxCacheDiffResponse` | Current file hash diff and affected routes. |
| `GET` | `/api/report/latest` | none | `TlxScanReport` or empty state | Latest scan report from `.tlx/latest-report.json`. |
| `POST` | `/api/actions/scan` | `TlxScanActionRequest` | `TlxScanResultResponse` | Trigger a UI/API/crawler scan. |

Static screenshots are served from `/.tlx/screenshots/...` by mapping to the target project folder `.tlx/screenshots`.

## Shared Types

```ts
export type TlxScanScope = 'changed' | 'all' | 'route';

export interface TlxBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TlxScanIssueKind = 'overlap' | 'overflow' | 'contrast' | 'crawler' | 'api';
export type TlxScanIssueSeverity = 'info' | 'warning' | 'error';
```

## `GET /api/status`

Returns engine and runtime status.

```ts
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
```

Example:

```json
{
  "status": "active",
  "engine": "TLX engine",
  "platform": "linux",
  "uptime": 123456,
  "dashboardPort": 6532,
  "projectUrl": "http://localhost:3000",
  "framework": "next",
  "rootDir": "/home/tawn/code/app",
  "startedAt": "2026-06-06T10:00:00.000Z"
}
```

Error response:

```json
{ "error": "Failed to get system status" }
```

## `GET /api/project`

Returns detected project metadata.

```ts
export interface TlxProjectResponse {
  framework: string;
  port: number;
  rootDir: string;
  projectUrl: string;
  dashboardPort: number;
}
```

Example:

```json
{
  "framework": "next",
  "port": 3000,
  "rootDir": "/home/tawn/code/app",
  "projectUrl": "http://localhost:3000",
  "dashboardPort": 6532
}
```

## `GET /api/graph`

Returns page/component/API graph used by the dashboard map.

```ts
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
```

Example:

```json
{
  "pages": [
    {
      "id": "page-app-page-tsx",
      "type": "page",
      "name": "Home",
      "route": "/",
      "filePath": "/home/tawn/code/app/app/page.tsx",
      "framework": "next",
      "components": [
        {
          "id": "component-hero-card",
          "type": "component",
          "name": "HeroCard",
          "filePath": "/home/tawn/code/app/components/HeroCard.tsx",
          "parentIds": ["page-app-page-tsx"]
        }
      ],
      "apis": ["/api/stats"],
      "links": ["/campaigns"]
    }
  ],
  "components": [],
  "apis": ["/api/stats"],
  "edges": [
    {
      "id": "edge-page-app-page-tsx-component-hero-card",
      "type": "page_uses_component",
      "source": "page-app-page-tsx",
      "target": "component-hero-card"
    }
  ]
}
```

## `GET /api/cache/diff`

Returns hash diff between latest saved cache and current source snapshot.

```ts
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
```

Example:

```json
{
  "changed": [
    {
      "path": "components/HeroCard.tsx",
      "hash": "a7d40f...",
      "route": "/"
    }
  ],
  "unchanged": [],
  "unknown": [],
  "deleted": [],
  "affectedRoutes": ["/"]
}
```

Error response:

```json
{ "error": "Failed to get cache diff" }
```

## `GET /api/report/latest`

Returns latest scan report, or an empty state before the first scan.

Empty response:

```json
{
  "empty": true,
  "issues": []
}
```

Report response uses `TlxScanReport`:

```ts
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
```

Example issue metadata keys used by the dashboard:

```json
{
  "tagName": "BUTTON",
  "text": "Save",
  "elementText": "Save",
  "areaLabel": "Hero",
  "areaSelector": "section",
  "viewport": "desktop",
  "viewportWidth": 1280,
  "viewportHeight": 800,
  "evidence": "geometry+hit-test",
  "otherSelector": "p:nth-of-type(1)",
  "otherTagName": "P",
  "otherText": "Description",
  "overlapRatio": 0.35,
  "fixHint": "Inspect both selectors in the named area and check position, z-index, flex/grid gaps, and responsive wrapping."
}
```

Error response:

```json
{ "error": "Failed to get latest report" }
```

## `POST /api/actions/scan`

Triggers a scan. Dashboard uses this endpoint for `Changed`, `All Pages`, and `Single Route` actions.

Request:

```ts
export interface TlxScanActionRequest {
  scope?: TlxScanScope;
  route?: string;
}
```

Rules:

- Missing `scope` falls back to project config default scope.
- `scope: "changed"` scans affected routes from cache diff.
- `scope: "all"` scans graph routes and discovers linked internal routes at runtime.
- `scope: "route"` scans only `route`; `route` should be provided.

Request examples:

```json
{ "scope": "changed" }
```

```json
{ "scope": "all" }
```

```json
{ "scope": "route", "route": "/about" }
```

Response:

```ts
export interface TlxScanResultResponse {
  success: boolean;
  totalElementsScanned: number;
  bugsFound: string[];
  timestamp: string;
  report: TlxScanReport;
}
```

Example:

```json
{
  "success": false,
  "totalElementsScanned": 184,
  "bugsFound": [
    "button #save \"Save\" visually overlaps p #description \"Description\". Fix: add spacing, remove conflicting absolute positioning, or adjust z-index only if layering is intended."
  ],
  "timestamp": "2026-06-06T10:01:00.000Z",
  "report": {
    "id": "scan-2026-06-06T10-00-58-000Z",
    "scope": "all",
    "startedAt": "2026-06-06T10:00:58.000Z",
    "finishedAt": "2026-06-06T10:01:00.000Z",
    "success": false,
    "summary": {
      "routesScanned": 13,
      "elementsScanned": 184,
      "issuesFound": 1,
      "screenshotsCaptured": 1
    },
    "issues": [
      {
        "id": "scan-2026-06-06T10-00-58-000Z-home-desktop-overlap-0",
        "kind": "overlap",
        "severity": "error",
        "message": "button #save \"Save\" visually overlaps p #description \"Description\". Fix: add spacing, remove conflicting absolute positioning, or adjust z-index only if layering is intended.",
        "route": "/",
        "url": "http://localhost:3000/",
        "selector": "#save",
        "boundingBox": { "x": 20, "y": 20, "width": 80, "height": 24 },
        "screenshotPath": ".tlx/screenshots/scan-2026-06-06T10-00-58-000Z/home-desktop.png",
        "metadata": {
          "tagName": "BUTTON",
          "text": "Save",
          "viewport": "desktop",
          "viewportWidth": 1280,
          "viewportHeight": 800,
          "areaLabel": "Hero",
          "areaSelector": "section",
          "evidence": "geometry+hit-test",
          "otherSelector": "#description",
          "otherTagName": "P",
          "otherText": "Description",
          "overlapRatio": 0.35,
          "fixHint": "Inspect both selectors in the named area and check position, z-index, flex/grid gaps, and responsive wrapping."
        }
      }
    ],
    "screenshots": [
      ".tlx/screenshots/scan-2026-06-06T10-00-58-000Z/home-desktop.png"
    ],
    "warnings": []
  }
}
```

Error response:

```json
{ "error": "Failed to trigger project scan" }
```

## Screenshot Static Contract

When an issue has `screenshotPath`, dashboard should request it as a path relative to the dashboard host:

```ts
const imageUrl = `/${issue.screenshotPath.replace(/^\.\//, '')}`;
```

Example:

```txt
issue.screenshotPath = ".tlx/screenshots/scan-2026-06-06T10-00-58-000Z/home-desktop.png"
image URL = "/.tlx/screenshots/scan-2026-06-06T10-00-58-000Z/home-desktop.png"
```

## Issue Metadata Notes

`metadata` is intentionally open-ended. Current scanner may include:

| Key | Type | Meaning |
| --- | --- | --- |
| `viewport` | `string` | Viewport name, e.g. `desktop`. |
| `viewportWidth` | `number` | Browser viewport width used for scan. |
| `viewportHeight` | `number` | Browser viewport height used for scan. |
| `tagName` | `string` | Primary element tag name. |
| `text` / `elementText` | `string` | Primary element text snippet. |
| `areaLabel` | `string` | Nearest section/landmark label or heading. |
| `areaSelector` | `string` | Nearest section/landmark selector. |
| `evidence` | `string` | Evidence type, e.g. `geometry+hit-test`, `horizontal-scroll`, `element-outside-viewport`. |
| `fixHint` | `string` | Human-readable suggested fix direction. |
| `otherSelector` | `string` | Secondary element selector for overlap. |
| `otherTagName` | `string` | Secondary element tag name for overlap. |
| `otherText` | `string` | Secondary element text snippet for overlap. |
| `overlapRatio` | `number` | Intersection area divided by smaller element area. |
| `overflowX` | `number` | Horizontal overflow amount in pixels. |
| `ratio` | `number` | Contrast ratio for contrast issues. |
| `color` | `string` | Foreground CSS color for contrast issues. |
| `backgroundColor` | `string` | Effective background CSS color for contrast issues. |
| `endpoint` | `string` | API endpoint checked for API issues. |
| `status` | `number` | HTTP status for crawler/API issues. |
| `errors` | `string[]` | Console/page errors collected for a route. |

## JSON Schema Files

Canonical schema files live in `packages/contracts/schemas`:

- `status.schema.json`
- `project.schema.json`
- `graph.schema.json`
- `cache-diff.schema.json`
- `scan-action.schema.json`
- `scan-result.schema.json`
