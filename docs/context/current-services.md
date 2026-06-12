# Current Services Context

Date: 2026-06-12

## Service Map

Directory: `apps/worker-node/src/services`

| Service | Responsibility |
| --- | --- |
| `detector.service.ts` | Detect target framework, build manifest, call strategy extractors, normalize graph. |
| `parser.service.ts` | Wrap web-tree-sitter and WASM language loading for TS/TSX/JS/Vue/PHP AST parsing. |
| `storage.service.ts` | Project-local `.tlx` storage, config, hash cache, latest report, screenshots, auth state paths. |
| `diff.service.ts` | Compare source hash snapshots and resolve affected routes by scan scope. |
| `engine.service.ts` | Orchestrate dashboard API actions: status, diff, latest report, auth, scan execution. |
| `runtime-context.service.ts` | Shared runtime context contract for server/controllers. |

## Detector Service

Current flow:

- Reads `package.json`, `composer.json`, known config markers, and bounded source markers.
- Selects first matching strategy from `apps/worker-node/src/strategies`.
- Uses `AstParserService` to extract pages and API endpoints.
- Builds graph edges for page-component, component-component, page-API, and page-page links.
- Unknown projects return framework `unknown`, port `0`, and empty graph so dashboard still boots.

Needs later:

- More route patterns for dynamic framework conventions.
- Better parse warning surfacing per file.
- SAST rules such as leaked key detection from raw SRS.

## Parser Service

Current flow:

- Supports `.ts`, `.tsx`, `.js`, `.jsx`, `.vue`, `.php`.
- Lazily initializes `web-tree-sitter` and loads language WASM on demand.
- Caches parsed files by absolute path during process lifetime.
- Provides `parseFile`, `parseToJson`, `findNodes`, and `supportsFile`.

Needs later:

- Clearer diagnostics for unsupported extension versus parse failure.
- Cache invalidation if long-lived worker parses a file that later changes.

## Storage Service

Current local files in target project:

```text
.tlx/
  hash.json
  latest-report.json
  screenshots/<reportId>/*.png
  auth/<profile>.json
```

Config:

- Root `tlx.yaml` is primary.
- `.tlx/tlx.yaml` remains legacy compatibility override.
- Parser currently accepts flat `key: value` lines, comments, and comma-separated path lists.
- Supported config covers scan scope, ignored paths, contrast, color harmony, visual quality thresholds, crawler, API checks, and auth.

Needs later:

- Full YAML parser if nested config becomes required.
- Report retention/cleanup policy for old screenshots.
- Safer validation errors instead of silent fallback for malformed values.

## Diff Service

Current behavior:

- Builds `changed`, `unchanged`, `unknown`, and `deleted` buckets.
- Uses graph route ownership to derive affected routes.
- First-run unknown snapshot affects all graph pages.
- `changed` scope skips Playwright when no routes are affected.
- `all` scope scans graph pages.
- `route` scope scans provided route only.

Needs later:

- Dynamic route parameter samples.
- More precise component dependency impact beyond direct page-owned components.

## Engine Service

Current behavior:

- Returns status and project-local state to API controllers.
- Starts manual auth capture with headed Chromium and saves Playwright storage state.
- Runs scan pipeline: read config, create snapshot, diff, resolve routes, run Playwright scanner, write hash/report.
- Converts structured report to legacy response fields for backward compatibility.

Needs later:

- Better scanner failure classification for dashboard display.
- Cancellation/progress events for long scans.
- Report history rather than latest-only.
