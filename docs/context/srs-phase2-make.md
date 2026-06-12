# SRS Phase 2 Make - Local Testing Suite

Date: 2026-06-04

## Status

Phase 2 implementation completed for local-first testing, scoped scan, UI/UX scanner, local report storage, API endpoints, and dashboard views.

## Completed Gates

### Gate 2.1 - Storage + Config Foundation

- Added project-local storage service for `.tlx/hash.json`, `.tlx/latest-report.json`, and `.tlx/screenshots/`.
- Root `tlx.yaml` is treated as the primary user config; `.tlx/tlx.yaml` remains legacy override/compat.
- Added Phase 2 scan config defaults for scope, ignored paths, viewports, contrast ratio, crawler, and API contract checks.
- Source hash snapshot uses SHA-256 and ignores generated/dependency folders.
- Cache/report write failures return report warnings instead of crashing scan flow.

### Gate 2.2 - Diff + Scoped Scan

- Added diff buckets: `changed`, `unchanged`, `unknown`, `deleted`.
- Added affected route resolution from page/component graph ownership.
- `changed` scope skips Playwright when no route is affected.
- `all` and `route` scopes resolve deterministic route targets.
- Successful scans update hash cache and latest report.

### Gate 2.3 - UI/UX Scanner V2

- Split scanner into pure analyzer and Playwright runner.
- Detects `overlap`, `overflow`, and WCAG contrast issues with structured metadata.
- Issues include selector, route, URL, severity, bounding box, and screenshot path.
- Screenshots are saved under `.tlx/screenshots/<reportId>/` and referenced by relative path.
- UI/UX Playwright fixture tests cover overlap, overflow, contrast, clean page, and screenshot existence.

### Gate 2.4 - Safe Crawler + API Contract

- Added localhost/project-origin-safe crawler checks.
- Crawler fills safe text/email/password/search/textarea fields with mock data.
- External navigation attempts are reported as crawler issues.
- API contract v1 checks detected local API strings with safe GET/OPTIONS behavior and reports contract failures.

### Gate 2.5 - Dashboard Phase 2

- `apps/ui` now renders a local testing dashboard instead of placeholder content.
- Dashboard fetches `/api/status`, `/api/project`, `/api/graph`, `/api/cache/diff`, and `/api/report/latest`.
- Views added: Project Overview, Project Map, Cache Diff, Test Controls, Latest Report, Inspector, and Visual Bug Viewer.
- Test Controls call `POST /api/actions/scan` for `changed`, `all`, and `route` scopes.
- Worker serves built `apps/ui/out` when present and serves `.tlx/screenshots` for visual report images.

## API / Contract Changes

- Added `TlxScanScope`, `TlxScanIssue`, `TlxScanReport`, `TlxCacheDiffResponse`, and `TlxScanActionRequest`.
- `POST /api/actions/scan` accepts `{ scope, route? }`, defaulting to `changed`.
- Scan response keeps backward fields: `success`, `totalElementsScanned`, `bugsFound`, `timestamp`.
- Scan response adds `report` for structured Phase 2 data.
- Added `GET /api/cache/diff` and `GET /api/report/latest`.

## Tests Added

- Contract schema tests for scan report, cache diff, and scan action body.
- Storage/diff tests for `.tlx` creation, hash snapshot, config loading, first-run unknown, changed, deleted, affected routes, and changed-scope skip.
- Controller tests for cache diff, latest report empty state, and default changed scan skip path.
- Analyzer unit tests for AABB overlap, overflow, contrast ratio, and structured issue output.
- Playwright UI/UX tests for overlap, overflow, low contrast, clean page pass, and screenshot capture.

## Verification

- `rtk go test ./...` - pass.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/contracts typecheck` - pass.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/contracts test` - pass.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/worker-node typecheck` - pass.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/worker-node test` - pass.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/worker-node test:uiux` - pass.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/ui typecheck` - pass.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/ui build` - pass.
- `rtk /home/tawn/.bun/bin/bun run build:host` - pass.

## Environment Notes

- Bun commands may print `fnm_multishells` read-only symlink warnings in this sandbox while still exiting 0.
- Playwright Chromium was installed with `bunx playwright install chromium` to run UI/UX tests.
- Playwright UI/UX tests and Next build required running outside the filesystem sandbox because browser/process creation is restricted there.

## Remaining Risks

- Crawler/API contract v1 is intentionally safe and shallow; deeper DAST/fuzzing stays opt-in and can be expanded later.
- Dashboard uses a lightweight custom SVG/DOM map instead of React Flow to avoid extra dependency during Phase 2.
- Phase 3 remains separate: no global DB, production agent, auth, metric sync, or DevOps storage added here.
